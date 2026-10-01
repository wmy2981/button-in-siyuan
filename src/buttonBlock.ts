import {Constants, Dialog, openMobileFileById, openTab} from "siyuan";
import type {IContext} from "./context";
import {createIconElement} from "./icon";

/** 自定义块类型名；块信息由插件包名与它组成，例如 button-in-siyuan/button。 */
export const BUTTON_BLOCK_TYPE = "button";

/** 按钮操作，当前支持链接跳转与运行 JavaScript。 */
export type TButtonAction = {type: "link", link: string} | {type: "script", script: string};

/** 按钮块配置，序列化后存放在自定义块内容里。 */
export interface IButtonConfig {
    text: string;
    icon: string;
    action?: TButtonAction;
}

export const serializeButtonConfig = (config: IButtonConfig) => JSON.stringify(config);

/** 解析按钮操作；不是本插件支持的操作时返回 undefined。 */
const parseButtonAction = (value: TButtonAction | undefined): TButtonAction | undefined => {
    if (value?.type === "link" && typeof value.link === "string") {
        return {type: "link", link: value.link};
    }
    if (value?.type === "script" && typeof value.script === "string") {
        return {type: "script", script: value.script};
    }
    return;
};

/**
 * 解析自定义块内容：空内容按默认配置处理；内容不是本插件写入的配置时返回 undefined，
 * 由渲染器按思源原生方式展示原始内容，也不提供编辑入口，避免覆盖用户自己的数据。
 */
export const parseButtonConfig = (content: string, defaultText: string): IButtonConfig | undefined => {
    if (!content.trim()) {
        return {text: defaultText, icon: ""};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        console.warn("[button-in-siyuan] custom block content is not JSON:", error);
        return undefined;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return undefined;
    }
    const source = parsed as Partial<IButtonConfig>;
    const action = parseButtonAction(source.action);
    // 至少要有一个本插件认识的字段，才当成按钮配置
    if (typeof source.text !== "string" && typeof source.icon !== "string" && !action) {
        return undefined;
    }
    return {
        text: typeof source.text === "string" ? source.text : defaultText,
        icon: typeof source.icon === "string" ? source.icon : "",
        action,
    };
};

/**
 * 渲染器拿到的 setContent 由宿主实现：它会先做兜底、写回 data-content、提交事务，再强制重新渲染。
 * 这里按块 ID 记住它，供「编辑按钮块」写回；插件自己改 data-content 再提交事务不会触发重渲染。
 */
const contentSetters = new Map<string, (content: string) => boolean>();

/** 写回按钮块配置；该块当前不在渲染状态时返回 false。 */
export const updateButtonContent = (blockID: string, config: IButtonConfig) => {
    const setContent = contentSetters.get(blockID);
    return setContent ? setContent(serializeButtonConfig(config)) : false;
};

const formatValue = (value: unknown): string => {
    if (typeof value === "string") {
        return value;
    }
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
    }
    if (typeof value === "undefined") {
        return "undefined";
    }
    try {
        return JSON.stringify(value) || String(value);
    } catch (error) {
        return String(value);
    }
};

/** 取资源扩展名：去掉查询串与锚点后的小写后缀。 */
const getAssetExtension = (path: string) => {
    const clean = path.split("#", 1)[0].split("?", 1)[0];
    const index = clean.lastIndexOf(".");
    return index === -1 ? "" : clean.substring(index).toLowerCase();
};

/**
 * 判断资源能否交给思源的资源页签渲染。宿主的资源页签只支持图片、音视频与 PDF
 * （HEIF 还要求地址不带 download=true）；不满足前置条件时 openTab 会创建出空页签把布局搞坏，
 * 所以这里先按同样的条件判断，不满足的改由系统处理。
 */
const isAssetTabOpenable = (path: string) => {
    if (!Constants.SIYUAN_ASSETS_EXTS.includes(getAssetExtension(path))) {
        return false;
    }
    const query = path.split("#", 1)[0].split("?", 2)[1] || "";
    return !new URLSearchParams(query).getAll("download").some((value) => value.toLowerCase() === "true");
};

/** 思源内部链接用原生接口打开，其余链接交给系统默认处理（与思源打开链接的行为一致）。 */
const openLink = (context: IContext, link: string) => {
    const address = link.trim();
    if (!address) {
        return;
    }
    const blockID = /^siyuan:\/\/blocks\/([^/?#]+)/.exec(address)?.[1];
    if (blockID) {
        if (context.isMobile) {
            openMobileFileById(context.app, blockID);
        } else {
            openTab({app: context.app, doc: {id: blockID}});
        }
        return;
    }
    if (address.startsWith("assets/")) {
        if (!context.isMobile && isAssetTabOpenable(address)) {
            openTab({app: context.app, asset: {path: address}});
        } else {
            // 移动端没有资源页签接口，思源也打不开的资源（如压缩包）同样交给系统，
            // 与宿主 iOS 分支一致，用绝对地址交给外部打开
            window.open(new URL(address, location.origin).href);
        }
        return;
    }
    window.open(address);
};

const showScriptOutput = (context: IContext, output: string[], result: unknown, failure: unknown) => {
    const lines = output.slice();
    if (typeof result !== "undefined") {
        lines.push(`${context.i18n.returnValue}: ${formatValue(result)}`);
    }
    if (typeof failure !== "undefined") {
        lines.push(`${context.i18n.errorValue}: ${formatValue(failure)}`);
    }
    // 弹窗结构照抄思源的「运行信息」弹窗（config/tabs/aboutTab.ts）
    const dialog = new Dialog({
        title: context.i18n.scriptOutput,
        width: "min(720px, 92vw)",
        content: `<div class="b3-dialog__content">
    <pre class="bis-script-output" tabindex="0" data-bis="output"></pre>
</div>
<div class="b3-dialog__action">
    <button type="button" class="b3-button b3-button--text" data-bis="close">${context.i18n.close}</button>
</div>`,
    });
    const outputElement = dialog.element.querySelector<HTMLElement>('[data-bis="output"]');
    if (outputElement) {
        outputElement.textContent = lines.join("\n") || context.i18n.noOutput;
    }
    dialog.element.querySelector('[data-bis="close"]')?.addEventListener("click", () => dialog.destroy());
};

/** 执行 JavaScript 操作：捕获 console 输出与返回值，连同错误一起显示在原生弹窗里。 */
const runScript = async (context: IContext, code: string) => {
    const output: string[] = [];
    const originals = {log: console.log, info: console.info, warn: console.warn, error: console.error};
    const capture = (level: string) => (...args: unknown[]) => {
        output.push(`${level}: ${args.map(formatValue).join(" ")}`);
    };
    console.log = capture("log");
    console.info = capture("info");
    console.warn = capture("warn");
    console.error = capture("error");
    let result: unknown;
    let failure: unknown;
    try {
        // 用 async 包装，代码里既可以直接 return，也可以使用 await
        result = await new Function(`return (async () => {\n${code}\n})()`)();
    } catch (error) {
        failure = error;
    } finally {
        console.log = originals.log;
        console.info = originals.info;
        console.warn = originals.warn;
        console.error = originals.error;
    }
    showScriptOutput(context, output, result, failure);
};

const runAction = (context: IContext, config: IButtonConfig) => {
    const action = config.action;
    if (!action) {
        return;
    }
    if (action.type === "link") {
        openLink(context, action.link);
        return;
    }
    void runScript(context, action.script);
};

/** 自定义块渲染器：内容变化时思源会重新调用，返回值用于清理事件监听器。 */
export const renderButtonBlock = (context: IContext, options: {
    element: HTMLElement,
    content: string,
    setContent: (content: string) => boolean,
}) => {
    const blockID = options.element.closest<HTMLElement>('[data-type="NodeCustomBlock"]')?.getAttribute("data-node-id") || "";
    const config = parseButtonConfig(options.content, context.i18n.defaultButtonText);
    if (!config) {
        const preElement = document.createElement("pre");
        preElement.textContent = options.content;
        options.element.append(preElement);
        return;
    }
    if (blockID) {
        contentSetters.set(blockID, options.setContent);
    }
    const button = document.createElement("button");
    button.type = "button";
    // 与思源原生按钮完全一致的类名（设置面板里的 b3-button b3-button--outline fn__size200）：
    // 宽度、字号、悬浮与按下效果全部由思源自己的 CSS 提供，插件不再自定义按钮外观
    button.className = "b3-button b3-button--outline fn__size200";
    button.textContent = config.text || context.i18n.defaultButtonText;
    if (config.icon) {
        button.prepend(createIconElement(config.icon));
    }
    const click = () => runAction(context, config);
    button.addEventListener("click", click);
    options.element.append(button);
    return () => {
        button.removeEventListener("click", click);
        if (blockID && contentSetters.get(blockID) === options.setContent) {
            contentSetters.delete(blockID);
        }
    };
};
