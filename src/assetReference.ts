import {fetchSyncPost} from "siyuan";
import type {IButtonConfig} from "./buttonBlock";
import {parseButtonConfig} from "./buttonBlock";
import type {IContext} from "./context";
import {createLogger} from "./logger";
import {isLocalScript} from "./scriptFile";

const log = createLogger("assetReference");

/**
 * 记下「这个按钮块在用哪个脚本文件」的块属性名。
 *
 * 脚本文件放在 assets/ 下，而「设置 - 资源 - 未引用的资源文件」列出的是没有被任何文档引用的资源，
 * 用户（或者那里的「清理未引用资源」）一删，按钮就点不动了 —— 按钮的引用关系写在块内容的 JSON 里，
 * 思源自己的引用扫描只看文档里的链接与块属性，看不到它。
 *
 * 思源为此留了块属性：扫描引用时会把所有以 `custom-data-assets` 开头的块属性值都算作资源引用
 * （kernel/model/assets.go 的 getAssetsLinkDests），资源改名或移动时也会跟着改
 * （kernel/model/asset_relink_references.go），所以这里用自己的属性名，不去动用户自己写的
 * `custom-data-assets`。一个按钮块只有一个脚本文件，一个属性就够。
 */
export const ASSET_REFERENCE_ATTR = "custom-data-assets-button-in-siyuan";

/** 按钮块配置里要记在属性上的资源路径：只有本地 assets/ 脚本文件才需要记（云端地址与别的操作都不需要）。 */
const assetPathOf = (config: IButtonConfig | undefined) => {
    const action = config?.action;
    return action?.type === "file" && isLocalScript(action.file) ? action.file : undefined;
};

/** 写入/清除块上的资源引用属性；path 为空表示清除（空值就是删除这个属性）。 */
const writeAssetReference = async (blockID: string, path: string | undefined) => {
    try {
        const response = await fetchSyncPost("/api/attr/setBlockAttrs", {
            id: blockID,
            attrs: {[ASSET_REFERENCE_ATTR]: path || ""},
        }, undefined, false);
        if (response.code !== 0) {
            log.warn("failed to update the asset reference attribute", {
                blockID,
                path: path || "none",
                code: response.code,
                msg: response.msg,
            });
            return false;
        }
        log.info("updated the asset reference attribute", {blockID, path: path || "none"});
        return true;
    } catch (error) {
        // 只读模式、内核不可用等：记日志就好，不能让插件加载或保存按钮块失败
        log.warn("cannot update the asset reference attribute", {blockID, path: path || "none", error});
        return false;
    }
};

/** 保存按钮块之后同步它的资源引用属性：本地脚本文件记上，换成链接/内联脚本/云端脚本时清掉。 */
export const setAssetReference = (blockID: string, config: IButtonConfig) =>
    writeAssetReference(blockID, assetPathOf(config));

/**
 * 渲染按钮块时对齐它的资源引用属性。
 *
 * 编辑窗口保存时会写一次、插件加载时会整库补一次，但这两次都盖不住「块不是插件建的」：Agent 用块接口写的
 * markdown、别的设备同步过来的文档、撤销重做都不经过编辑窗口，而整库补写要等到下次加载插件 —— 这中间用户
 * 就能在「设置 - 资源 - 未引用的资源文件」里看到这个脚本文件，顺手一清理按钮就点不动了。渲染器是这些时刻
 * 唯一能立刻拿到块 ID 与配置的地方，所以在这里对齐。
 *
 * 元素上的属性已经是目标值时不写（渲染器不该每次都打一次内核）；写入后宿主会把新属性同步回 DOM
 * （`app/src/protyle/wysiwyg/transaction.ts` 的 `updateAttrs`），不会来回触发。
 */
export const syncRenderedAssetReference = (element: HTMLElement, blockID: string, config: IButtonConfig) => {
    const path = assetPathOf(config);
    if ((element.getAttribute(ASSET_REFERENCE_ATTR) || "") === (path || "")) {
        return;
    }
    void writeAssetReference(blockID, path);
};

/** SQL 里的 `ial` 列是 `名字="值"` 这样的属性串，属性已经写好时不必再写一次。 */
const hasReference = (ial: string, path: string | undefined) =>
    path ? ial.includes(`${ASSET_REFERENCE_ATTR}="${path}"`) : !ial.includes(ASSET_REFERENCE_ATTR);

/**
 * 一次补写最多处理多少个块。
 *
 * 必须显式写 LIMIT：内核会给 `/api/query/sql` 套上用户设置的搜索条数上限（默认 64，`Conf.Search.Limit`，
 * 见 `kernel/sql/query_limit.go`），不写的话结果被静默截断，块多的库里排在后面的按钮块永远补不上；
 * 显式写了 LIMIT，内核就不再套自己的上限。
 */
const SYNC_BLOCK_LIMIT = 1000;

/**
 * 补齐所有按钮块上的资源引用属性（插件加载时跑一次）。
 *
 * 用一条 SQL 找出「内容里提到 file」或「已经带这个属性」的自定义块，逐个解析块内容、与 `ial` 里的
 * 属性值比对，只在缺失或不一致时写回 —— 稳定状态下不产生任何写操作。这样不管块是编辑窗口改的、
 * 斜杠菜单插入的，还是 Agent 直接写 markdown 建的，都会补上；属性被用户删掉也会自己长回来。
 * 块内容里的 payload 是单行 JSON（`blocks.content` 对自定义块就是 `n.Tokens`）。
 *
 * 块在插件加载之后才出现时这次补写赶不上，由渲染时的 `syncRenderedAssetReference` 兜住。
 */
export const syncAssetReferences = async (context: IContext) => {
    let rows: Array<{id?: string; content?: string; ial?: string}>;
    try {
        const response = await fetchSyncPost("/api/query/sql", {
            stmt: `SELECT id, content, ial FROM blocks WHERE type = 'custom' AND (content LIKE '%"file"%' OR ial LIKE '%${ASSET_REFERENCE_ATTR}%') LIMIT ${SYNC_BLOCK_LIMIT}`,
        }, undefined, false);
        if (response.code !== 0) {
            log.warn("cannot query the button blocks to check their asset references", {
                code: response.code,
                msg: response.msg,
            });
            return;
        }
        rows = (response.data || []) as Array<{id?: string; content?: string; ial?: string}>;
    } catch (error) {
        log.warn("cannot query the button blocks to check their asset references", {error});
        return;
    }
    let updated = 0;
    for (const row of rows) {
        const blockID = row.id || "";
        const path = assetPathOf(parseButtonConfig(row.content || "", context.i18n.defaultButtonText));
        if (!blockID || hasReference(row.ial || "", path)) {
            continue;
        }
        if (await writeAssetReference(blockID, path)) {
            updated++;
        }
    }
    log.info("checked the asset references of the button blocks", {blocks: rows.length, updated});
};
