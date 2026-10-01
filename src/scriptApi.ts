import {
    adaptHotkey,
    adjustEditorFontSize,
    confirm,
    Constants,
    Dialog,
    expandDocTree,
    fetchGet,
    fetchPost,
    fetchSyncPost,
    getActiveEditor,
    getActiveTab,
    getAllEditor,
    getAllModels,
    getAllTabs,
    getBackend,
    getFrontend,
    getModelByDockType,
    globalCommand,
    hideMessage,
    isBottomDockVisible,
    isLeftDockVisible,
    isRightDockVisible,
    Menu,
    openAssetPicker,
    openAttributePanel,
    openEmoji,
    openInputDialog,
    openMobileFileById,
    openSetting,
    openTab,
    openWindow,
    platformUtils,
    Plugin,
    Protyle,
    ProtyleMethod,
    saveExportFile,
    saveLayout,
    setEditorFontSize,
    Setting,
    showMessage,
    toggleBottomDock,
    toggleLeftDock,
    toggleRightDock,
} from "siyuan";
import type {App} from "siyuan";
import type {II18n} from "./i18nKeys";
import {createLogger} from "./logger";

const log = createLogger("scriptApi");

/**
 * 按钮的 JavaScript 操作能直接调用的思源接口。
 *
 * 注入的是插件 API（宿主 plugin/API.ts 里的 getAPI()）中除「退出思源」「锁屏」之外的全部能力，
 * 也就是思源允许插件使用的接口；插件之外的全局对象（document、window、window.siyuan、Lute 等）
 * 本来就是脚本所在页面的全局，脚本同样可以直接用。
 * 新增注入项时请同步 docs/javascript.md 里的清单。
 */
export interface IScriptScope {
    /** 注入的名字，按顺序对应 values，作为 new Function 的形参 */
    names: string[];
    values: unknown[];
}

export const createScriptScope = (options: {
    plugin: Plugin;
    app: App;
    i18n: II18n;
    isMobile: boolean;
    blockID: string;
    blockElement?: HTMLElement;
}): IScriptScope => {
    // 当前按钮块所在的编辑器实例：脚本可以借它插入块、读写选区、取文档信息
    const protyle = options.blockElement
        ? getAllEditor().find((item) => item.protyle?.element?.contains(options.blockElement as Node))
        : undefined;
    const scope = {
        // 宿主对象与内核接口
        app: options.app,
        plugin: options.plugin,
        siyuan: window.siyuan,
        Lute: window.Lute,
        Constants,
        platformUtils,
        Protyle,
        ProtyleMethod,
        Dialog,
        Menu,
        Setting,
        Plugin,
        fetchPost,
        fetchSyncPost,
        fetchGet,
        // 界面与页签
        showMessage,
        hideMessage,
        confirm,
        openInputDialog,
        openSetting,
        openTab,
        openWindow,
        openMobileFileById,
        openAssetPicker,
        openEmoji,
        openAttributePanel,
        getActiveEditor,
        getActiveTab,
        getAllEditor,
        getAllModels,
        getAllTabs,
        getModelByDockType,
        toggleLeftDock,
        toggleRightDock,
        toggleBottomDock,
        isLeftDockVisible,
        isRightDockVisible,
        isBottomDockVisible,
        globalCommand,
        adaptHotkey,
        saveExportFile,
        saveLayout,
        setEditorFontSize,
        adjustEditorFontSize,
        expandDocTree,
        // 运行平台
        getFrontend,
        getBackend,
        // 本次点击的上下文
        protyle,
        blockID: options.blockID,
        isMobile: options.isMobile,
        i18n: options.i18n,
    };
    log.debug("准备脚本运行环境", {
        blockID: options.blockID,
        names: Object.keys(scope).length,
        hasProtyle: Boolean(protyle),
        isMobile: options.isMobile,
    });
    return {names: Object.keys(scope), values: Object.values(scope)};
};
