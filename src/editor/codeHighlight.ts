import {ProtyleMethod} from "siyuan";
import {createLogger} from "../core/logger";

const log = createLogger("codeHighlight");

/**
 * 代码高亮（issue #44）：与思源的代码块用同一套实现，而不是自己另配一份配色。
 *
 * 思源渲染代码块时用宿主自己的 highlight.js 生成 `<span class="hljs-…">`，配色来自「设置 - 外观 - 代码高亮」
 * 选中的那份样式表（`app/src/protyle/render/highlightRender.ts`）。插件编辑器因此也只做两件事：
 * 用同一个 highlight.js 切出 token 类名，再把这些类名原样挂到 CodeMirror 的文本区间上 —— 颜色由那份
 * 样式表自己给，两边同一个 token 必然是同一个颜色，不会因为映射表写得不一样而漂移。
 */

/** 宿主加载的 highlight.js（`window.hljs`，思源渲染代码块用的就是它）。 */
interface IHighlighter {
    highlight: (code: string, options: {language: string; ignoreIllegals: boolean}) => {value: string};
    getLanguage: (language: string) => unknown;
}

const highlighter = () => (window as unknown as {hljs?: IHighlighter}).hljs;

/** 宿主的代码高亮脚本是否已经就绪（语言认不认得由 highlightTokens 自己判断）。 */
export const isHighlighterReady = () => Boolean(highlighter()?.highlight);

/** 等宿主把脚本加载完的上限与轮询间隔；本地内核的静态文件，正常几十毫秒就到。 */
const HIGHLIGHTER_TIMEOUT = 3000;
const HIGHLIGHTER_POLL = 50;

let pending: Promise<boolean> | undefined;

/**
 * 让宿主导入它自己的 highlight.js 与高亮主题样式表。
 *
 * 思源只在渲染代码块时才设置代码高亮样式表并加载 highlight.js（`highlightRender.ts` 开头的
 * `setCodeTheme` 与 `addScript`），所以在一个还没显示过代码块的窗口里 `window.hljs` 是不存在的。
 * 这里交给宿主的 `ProtyleMethod.highlightRender` 渲染一个离屏代码块，把两者一起带进来，就绪后再移除。
 * 拿不到时（离线、加载失败）只是没有 token 颜色，编辑器照常能用。
 */
export const ensureHighlighter = () => {
    if (isHighlighterReady()) {
        return Promise.resolve(true);
    }
    if (pending) {
        return pending;
    }
    // 与宿主渲染器的结构一致：.hljs 的前一个兄弟节点的第一个子元素是语言名，宿主靠它选高亮规则
    const host = document.createElement("div");
    host.className = "code-block";
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
    host.innerHTML = `<div class="protyle-action"><span class="protyle-action__language">javascript</span></div><div class="hljs"></div>`;
    document.body.append(host);
    pending = new Promise<boolean>((resolve) => {
        const started = Date.now();
        const wait = () => {
            if (isHighlighterReady()) {
                host.remove();
                // 只做并发去重：之后每次进来都由 isHighlighterReady 直接判掉
                pending = undefined;
                log.debug("the host highlighter is ready");
                resolve(true);
                return;
            }
            if (Date.now() - started > HIGHLIGHTER_TIMEOUT) {
                host.remove();
                // 失败同样不留缓存：下次打开编辑器时再试一次
                pending = undefined;
                log.warn("the host highlighter did not arrive in time");
                resolve(false);
                return;
            }
            window.setTimeout(wait, HIGHLIGHTER_POLL);
        };
        ProtyleMethod.highlightRender(host);
        window.setTimeout(wait, HIGHLIGHTER_POLL);
    });
    return pending;
};

/** 一段文本的着色区间；`classes` 是宿主 highlight.js 生成的 `hljs-…` 类名。 */
export interface ICodeToken {
    from: number;
    to: number;
    classes: string;
}

/**
 * 用宿主的 highlight.js 切出 token：把高亮结果解析成「字符区间 → 类名」，
 * 区间按正文顺序排列，偏移量与 CodeMirror 文档位置一致。
 */
export const highlightTokens = (text: string, language: string): ICodeToken[] => {
    const instance = highlighter();
    if (!text || !instance?.getLanguage(language)) {
        return [];
    }
    let value: string;
    try {
        value = instance.highlight(text, {language, ignoreIllegals: true}).value;
    } catch (error) {
        log.warn("the host highlighter failed, showing the code without token colours", {language, error});
        return [];
    }
    const holder = document.createElement("div");
    holder.innerHTML = value;
    const tokens: ICodeToken[] = [];
    let offset = 0;
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const content = node.nodeValue || "";
            if (!content) {
                return;
            }
            tokens.push({
                from: offset,
                to: offset + content.length,
                classes: node.parentElement?.getAttribute("class") || "",
            });
            offset += content.length;
            return;
        }
        node.childNodes.forEach(walk);
    };
    walk(holder);
    return tokens;
};
