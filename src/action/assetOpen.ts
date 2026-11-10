/**
 * 「资源文件打开方式」的解析：与宿主 `app/src/editor/assetOpen.ts` 同一套规则。
 *
 * 用户可以在 设置 - 编辑器 - 资源文件打开方式 里给四种手势（单击 / Ctrl / Alt / Shift）各配一个动作，
 * 插件读到的就是宿主的 `window.siyuan.config.editor.assetOpen`。解析分三步，顺序与宿主一致：
 * 先按手势取配置，再按「这个资源能不能用思源的资源页签渲染」回落，最后按「当前环境有没有本地文件系统」回落。
 */

/** 宿主支持的全部打开动作，取值与 kernel/conf/editor.go 里的常量一致。 */
export const ASSET_OPEN_ACTIONS = [
    "follow-tab",
    "current",
    "right",
    "bottom",
    "background",
    "new-window",
    "app",
    "folder",
] as const;

export type TAssetOpenAction = typeof ASSET_OPEN_ACTIONS[number];

/** 四种手势的配置项。配置来自磁盘，值可能是旧版本或手改过的，所以按字符串接、再逐个校验。 */
export interface IAssetOpenConfig {
    click?: string;
    ctrlClick?: string;
    altClick?: string;
    shiftClick?: string;
}

/** 与 kernel/conf/editor.go 的 NewAssetOpen 一致：配置缺失或非法时用的默认值。 */
export const DEFAULT_ASSET_OPEN: Record<keyof IAssetOpenConfig, TAssetOpenAction> = {
    click: "follow-tab",
    ctrlClick: "folder",
    altClick: "current",
    shiftClick: "app",
};

const normalizeAction = (action: string | undefined, fallback: TAssetOpenAction): TAssetOpenAction =>
    ASSET_OPEN_ACTIONS.find((value) => value === action) || fallback;

/**
 * 按点击时按下的修饰键取手势。与宿主一致：同时按下多个修饰键时不算手势，按普通单击处理；
 * Ctrl 与 macOS 的 Command 由调用方统一成 ctrlKey（宿主的 isOnlyMeta 就是这个意思）。
 */
export const resolveAssetOpenAction = (config: IAssetOpenConfig | undefined, event?: {
    altKey?: boolean;
    shiftKey?: boolean;
    ctrlKey?: boolean;
}): TAssetOpenAction => {
    const gestures = {
        click: normalizeAction(config?.click, DEFAULT_ASSET_OPEN.click),
        ctrlClick: normalizeAction(config?.ctrlClick, DEFAULT_ASSET_OPEN.ctrlClick),
        altClick: normalizeAction(config?.altClick, DEFAULT_ASSET_OPEN.altClick),
        shiftClick: normalizeAction(config?.shiftClick, DEFAULT_ASSET_OPEN.shiftClick),
    };
    const modifiers = Number(!!event?.altKey) + Number(!!event?.shiftKey) + Number(!!event?.ctrlKey);
    if (modifiers !== 1) {
        return gestures.click;
    }
    if (event?.altKey) {
        return gestures.altClick;
    }
    if (event?.shiftKey) {
        return gestures.shiftClick;
    }
    return gestures.ctrlClick;
};

/**
 * 动作能不能落地：资源页签渲染不了的资源只能交给系统（此时只有「在文件夹中显示」还讲得通）；
 * `follow-tab` 展开成「当前页签」还是「右侧」，取决于用户关没关「打开页签时不使用分屏」。
 */
export const resolveExecutableAssetOpenAction = (action: TAssetOpenAction, options: {
    previewable: boolean;
    noSplitScreen: boolean;
}): TAssetOpenAction => {
    if (!options.previewable) {
        return action === "folder" ? "folder" : "app";
    }
    if (action === "follow-tab") {
        return options.noSplitScreen ? "current" : "right";
    }
    return action;
};

/** 没有本地文件系统（浏览器前端、移动端）时「默认应用」「在文件夹中显示」都做不了，回落成当前页签。 */
export const resolveAvailableAssetOpenAction = (action: TAssetOpenAction, localFileSystem: boolean): TAssetOpenAction =>
    !localFileSystem && (action === "app" || action === "folder") ? "current" : action;
