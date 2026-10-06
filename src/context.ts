import type {App, Plugin} from "siyuan";
import type {IButtonConfig} from "./buttonBlock";
import type {II18n} from "./i18nKeys";
import type {ISettings} from "./settings";

/** 插件运行上下文，由插件入口构造后传给各模块。 */
export interface IContext {
    app: App;
    /** 插件实例，脚本运行环境里也会注入它（可以用 saveData 存状态等） */
    plugin: Plugin;
    i18n: II18n;
    isMobile: boolean;
    /**
     * 打开「编辑按钮块」窗口。由插件入口注入，这样渲染器不必直接依赖对话框模块
     * （对话框要写回块内容，两者互相引用会形成环）。
     *
     * `editable` 为 false 时只做预览：笔记锁定（或只读）时渲染器不允许写回块内容，
     * 窗口里的编辑控件全部禁用。块菜单那条入口在文档不可编辑时干脆不出现，所以缺省是 true。
     */
    openEditor: (blockID: string, config: IButtonConfig, editable?: boolean) => void;
    /**
     * 对齐按钮块的资源引用属性（脚本文件不该出现在「未引用的资源文件」里）。同样由插件入口注入，
     * 渲染器直接依赖 assetReference 会和它互相引用成环。
     */
    syncAssetReference: (element: HTMLElement, blockID: string, config: IButtonConfig) => void;
    /**
     * 当前设置。取值而不是给一个快照：渲染器与菜单项是在插件加载时注册的，
     * 设置面板里改完要立刻生效（例如输出弹窗策略）。
     */
    getSettings: () => ISettings;
}
