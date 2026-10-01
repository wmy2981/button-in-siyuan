import type {App, Plugin} from "siyuan";
import type {IButtonConfig} from "./buttonBlock";
import type {II18n} from "./i18nKeys";

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
     */
    openEditor: (blockID: string, config: IButtonConfig) => void;
}
