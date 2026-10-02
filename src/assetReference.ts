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

/** SQL 里的 `ial` 列是 `名字="值"` 这样的属性串，属性已经写好时不必再写一次。 */
const hasReference = (ial: string, path: string | undefined) =>
    path ? ial.includes(`${ASSET_REFERENCE_ATTR}="${path}"`) : !ial.includes(ASSET_REFERENCE_ATTR);

/**
 * 补齐所有按钮块上的资源引用属性（插件加载时跑一次）。
 *
 * 用一条 SQL 找出「内容里提到 file」或「已经带这个属性」的自定义块，逐个解析块内容、与 `ial` 里的
 * 属性值比对，只在缺失或不一致时写回 —— 稳定状态下不产生任何写操作。这样不管块是编辑窗口改的、
 * 斜杠菜单插入的，还是 Agent 直接写 markdown 建的，都会补上；属性被用户删掉也会自己长回来。
 * 块内容里的 payload 是单行 JSON（`blocks.content` 对自定义块就是 `n.Tokens`）。
 */
export const syncAssetReferences = async (context: IContext) => {
    let rows: Array<{id?: string; content?: string; ial?: string}>;
    try {
        const response = await fetchSyncPost("/api/query/sql", {
            stmt: `SELECT id, content, ial FROM blocks WHERE type = 'custom' AND (content LIKE '%"file"%' OR ial LIKE '%${ASSET_REFERENCE_ATTR}%')`,
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
