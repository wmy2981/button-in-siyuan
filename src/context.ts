import type {App} from "siyuan";
import type {II18n} from "./i18nKeys";

/** 插件运行上下文，由插件入口构造后传给各模块。 */
export interface IContext {
    app: App;
    i18n: II18n;
    isMobile: boolean;
}
