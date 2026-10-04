import {fetchSyncPost, getAllEditor, showMessage} from "siyuan";
import type {IProtyle, Plugin} from "siyuan";
import {DEFAULT_BUTTON_ICON, parseButtonAction, runAction} from "./buttonBlock";
import type {TButtonAction} from "./buttonBlock";
import type {IContext} from "./context";
import {createIconElement} from "./icon";
import {createLogger} from "./logger";

const log = createLogger("breadcrumbButton");

/**
 * 面包屑按钮的配置写在文档块的属性上，内容与按钮块的块内容是同一套 JSON 字段（见 buttonBlock.ts），
 * 只是没有文本与颜色。放在块属性里是为了跟随同步：思源同步的是笔记本数据（`.sy`），插件私有的
 * `data/storage/petal/…` 不走同步。
 */
export const BREADCRUMB_ATTR = "custom-button-in-siyuan-breadcrumb";

/**
 * 注册给宿主的按钮 id：宿主按 `<插件名>:<id>` 生成 `data-id`。
 * 这里只要一个按钮 —— 显示与否、显示什么图标由每个文档自己的属性决定（见 syncBreadcrumbButtons）。
 */
const BUTTON_ID = "breadcrumb";

/** 面包屑按钮配置：与按钮块同一套字段，但没有文本、颜色，也不支持 JavaScript 文件操作。 */
export interface IBreadcrumbConfig {
    icon: string;
    action?: TButtonAction;
    /**
     * 文档菜单里那个开关。关掉时属性照旧留着（图标与操作都还在），只是不在面包屑上显示按钮 ——
     * 所以属性在不在**不**代表开没开，开关只认这个字段。
     */
    enabled: boolean;
}

/** 存进块属性的内容。action 为 undefined 时 JSON 里不会出现这个键。 */
const serializeBreadcrumbConfig = (config: IBreadcrumbConfig) =>
    JSON.stringify({icon: config.icon, action: config.action, enabled: config.enabled});

/**
 * 解析块属性里的配置。不是本插件写入的内容（属性被用户改过、别的东西占用了这个名字）一律当成没有配置，
 * 既不会凭空显示一个按钮，也不会在保存时覆盖用户自己的属性值。
 */
export const parseBreadcrumbConfig = (value: unknown): IBreadcrumbConfig | undefined => {
    if (typeof value !== "string" || !value.trim()) {
        return;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch (error) {
        log.warn("the block attribute is not valid JSON, ignoring it", {value, error});
        return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return;
    }
    const source = parsed as {icon?: unknown; action?: TButtonAction; enabled?: unknown};
    const action = parseButtonAction(source.action);
    // 至少要有一个本插件认识的字段，才当成面包屑按钮的配置
    if (typeof source.icon !== "string" && typeof source.enabled !== "boolean" && !action) {
        return;
    }
    return {
        // 图标是必填项：存量配置里图标为空（或不是字符串）时回落到默认图标
        icon: typeof source.icon === "string" && source.icon ? source.icon : DEFAULT_BUTTON_ICON,
        action: action?.type === "file" ? undefined : action,
        // 没有这个字段的旧配置按开启处理：那时属性在就等于开着
        enabled: source.enabled !== false,
    };
};

/** 写回文档属性；再打开窗口时按里面的 `enabled` 决定按钮显示不显示。 */
export const saveBreadcrumbConfig = async (blockID: string, config: IBreadcrumbConfig) => {
    try {
        const response = await fetchSyncPost("/api/attr/setBlockAttrs", {
            id: blockID,
            attrs: {[BREADCRUMB_ATTR]: serializeBreadcrumbConfig(config)},
        }, undefined, false);
        if (response.code !== 0) {
            log.warn("failed to save the breadcrumb button config", {
                blockID,
                code: response.code,
                msg: response.msg,
            });
            return false;
        }
        log.info("saved the breadcrumb button config", {
            blockID,
            enabled: config.enabled,
            icon: config.icon,
            action: config.action?.type || "none",
        });
        return true;
    } catch (error) {
        // 只读模式、发布服务、内核不可用
        log.warn("cannot save the breadcrumb button config", {blockID, error});
        return false;
    }
};

/**
 * 文档没打开时（文档树菜单）按块 ID 读它的属性。
 *
 * 读不到时返回 undefined 并提示用户重试 —— 与「这个文档还没配置过」（返回配置为空的 `{}`）必须区分开，
 * 否则一次读失败就会被当成没配置，用户在窗口里点确定就把原来的图标与操作冲掉了。
 */
export const loadBreadcrumbConfig = async (context: IContext, blockID: string): Promise<{config?: IBreadcrumbConfig} | undefined> => {
    try {
        const response = await fetchSyncPost("/api/attr/getBlockAttrs", {id: blockID}, undefined, false);
        if (response.code === 0) {
            return {config: parseBreadcrumbConfig((response.data || {})[BREADCRUMB_ATTR])};
        }
        log.warn("cannot read the document attributes", {blockID, code: response.code, msg: response.msg});
    } catch (error) {
        log.warn("cannot read the document attributes", {blockID, error});
    }
    showMessage(context.i18n.breadcrumbReadFailed);
    return;
};

/** 本插件注册在某个编辑器面包屑里的按钮；没有面包屑（嵌入块、预览等）时返回 undefined。 */
const findButton = (protyle: IProtyle, pluginName: string) => {
    const container = protyle.breadcrumb?.element?.parentElement;
    if (!container) {
        return;
    }
    return Array.from(container.querySelectorAll<HTMLButtonElement>(".protyle-breadcrumb__plugin > button"))
        .find((item) => item.getAttribute("data-plugin-name") === pluginName);
};

/**
 * 把配置画到按钮上：关着（或这个文档还没有配置）就清空内容 —— 空按钮在 index.scss 里不占位，
 * 未开启的文档上完全看不到它。图标元素与按钮块共用 `createIconElement`（`setAttributeNS` 拼 `#图标名`），
 * 属性被手改成别的字符串也注入不进 HTML。
 */
const render = (button: HTMLButtonElement, config: IBreadcrumbConfig | undefined) => {
    button.replaceChildren();
    if (config?.enabled) {
        button.append(createIconElement(config.icon));
    }
};

/**
 * 对齐所有已打开文档的面包屑按钮：显示与否、用什么图标都由每个文档自己的属性决定。
 *
 * 属性与文档 ID 直接读 `.protyle` 元素：思源的 `renderCustom` 会把文档的 `custom-*` 属性与
 * `data-node-id` 镜像到 `.protyle` 上（`app/src/protyle/wysiwyg/index.ts` 的 `renderCustom` 调
 * `app/src/protyle/util/syncRootAttributes.ts`），文档加载时会调一次，别的设备同步下来（`reloadSync`）、
 * 用接口改属性（`updateAttrs` 事务）之后也会再调一次。
 *
 * `justSaved` 是刚保存的那个文档（块 ID + 新配置）：内核把属性推回 DOM 是异步的，先按刚写下的值画一遍，
 * 用户点确定之后立刻就能看到新图标。
 */
export const syncBreadcrumbButtons = (context: IContext, justSaved?: {blockID: string; config?: IBreadcrumbConfig}) => {
    const pluginName = context.plugin.name;
    let synced = 0;
    getAllEditor().forEach((editor) => {
        // 编辑器实例可能还没初始化（搜索、自定义页签加载中），这种跳过
        const protyle = editor.protyle;
        if (!protyle) {
            return;
        }
        const button = findButton(protyle, pluginName);
        if (!button) {
            return;
        }
        const config = justSaved && protyle.block.rootID === justSaved.blockID
            ? justSaved.config
            : parseBreadcrumbConfig(protyle.element.getAttribute(BREADCRUMB_ATTR));
        render(button, config);
        synced++;
    });
    log.debug("synced the breadcrumb buttons", {editors: synced, justSaved: justSaved?.blockID || "none"});
};

/** 点击面包屑按钮：按这个文档的配置执行操作（与按钮块同一条执行路径）。 */
const runBreadcrumbAction = (context: IContext, event: MouseEvent, protyle: IProtyle) => {
    const config = parseBreadcrumbConfig(protyle.element.getAttribute(BREADCRUMB_ATTR));
    if (!config?.enabled) {
        log.warn("the document has no breadcrumb button, ignoring this click", {rootID: protyle.block.rootID});
        return;
    }
    log.info("the breadcrumb button was clicked", {
        rootID: protyle.block.rootID,
        icon: config.icon,
        action: config.action?.type || "none",
    });
    runAction(context, {
        blockID: protyle.block.rootID || "",
        // 脚本环境按元素找所属的编辑器实例（scriptApi.ts 的 protyle），文档按钮就用编辑器元素本身
        blockElement: protyle.element,
        config,
        event,
    });
};

/**
 * 注册面包屑按钮（插件设置里开着时才调用），返回注销函数。
 *
 * 宿主的 API 是「一个插件一个按钮，插进所有面包屑」：按钮随 `Breadcrumb` 构造插入
 * （`app/src/plugin/breadcrumbButton.ts` 的 `mountBreadcrumbButtons`，由
 * `app/src/protyle/breadcrumb/index.ts` 调用），没有按文档区分的能力。所以注册时给一个空图标，
 * 每个文档显示什么由 syncBreadcrumbButtons 决定。
 */
export const registerBreadcrumbButton = (context: IContext) => {
    const plugin: Plugin = context.plugin;
    plugin.addBreadcrumbButton({
        id: BUTTON_ID,
        // 同步之前那个按钮是空的，index.scss 按 :empty 把它藏掉，未开启的文档上不占位
        icon: "",
        title: context.i18n.breadcrumbButton,
        callback: (event, protyle) => runBreadcrumbAction(context, event, protyle),
    });
    const sync = () => syncBreadcrumbButtons(context);
    // 文档（连同面包屑）加载完成后同步一次；注册时已经打开的文档由下一行的同步兜住
    plugin.eventBus.on("loaded-protyle-static", sync);
    sync();
    log.info("registered the breadcrumb button");
    return () => {
        plugin.eventBus.off("loaded-protyle-static", sync);
        plugin.removeBreadcrumbButton(BUTTON_ID);
        log.info("unregistered the breadcrumb button");
    };
};
