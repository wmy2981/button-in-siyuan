import {Dialog, platformUtils, ProtyleMethod, showMessage} from "siyuan";
import docsEn from "../docs/javascript.md";
import docsZh from "../docs/javascript.zh-CN.md";
import type {IContext} from "./context";
import {createLogger} from "./logger";
import {fillSiyuanRef, resolveSiyuanRef} from "./siyuanRef";

const log = createLogger("scriptDocs");

/** 中文界面看中文文档，其余语言看英文文档。 */
const pickMarkdown = () => {
    const lang = (window.siyuan?.config?.lang || "").toLowerCase();
    return lang.startsWith("zh") ? docsZh : docsEn;
};

/**
 * 文档里示例代码块的选择器。Lute 的预览渲染器把围栏代码块输出成
 * `<pre class="code-block" data-language="javascript"><code class="hljs">…</code></pre>`
 * （Lute 的 renderCodeBlock 预览分支；思源的 highlightRender 预览分支也按这个结构取语言）。
 */
const CODE_BLOCK_SELECTOR = "pre.code-block[data-language='javascript']";

/**
 * 给每个 javascript 示例加「载入 / 复制」两个按钮（issue #10）：按钮用思源原生样式
 * （b3-button b3-button--text b3-button--small），悬浮或键盘聚焦时才出现，免得遮住代码；
 * 触屏没有悬浮，index.scss 里让它们常显。
 */
const decorateCodeBlocks = (context: IContext, container: HTMLElement, onLoad?: (code: string) => void) => {
    const {i18n} = context;
    const blocks = Array.from(container.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR));
    blocks.forEach((block) => {
        // 代码正文在高亮前后都是同一段文本（hljs 只是给它包了一层 span），去掉末尾那一个换行
        const code = (block.textContent || "").replace(/\n$/, "");
        const wrapper = document.createElement("div");
        wrapper.className = "bis-docs-code";
        const actions = document.createElement("div");
        actions.className = "bis-docs-code__actions";
        const addButton = (label: string, click: () => void) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "b3-button b3-button--text b3-button--small";
            button.textContent = label;
            button.addEventListener("click", click);
            actions.append(button);
        };
        if (onLoad) {
            addButton(i18n.docsLoad, () => {
                log.info("loaded a documentation example", {chars: code.length});
                onLoad(code);
            });
        }
        addButton(i18n.copy, () => {
            platformUtils.copyPlainText(code);
            log.info("copied a documentation example", {chars: code.length});
            showMessage(i18n.copied);
        });
        block.before(wrapper);
        wrapper.append(block, actions);
    });
    log.debug("decorated the documentation code blocks", {blocks: blocks.length, load: Boolean(onLoad)});
};

/**
 * 在弹窗里显示内置的 JavaScript 文档。
 *
 * 文档在构建时由 webpack 作为字符串内嵌进 index.js（docs/*.md），所以离线也能看，不需要联网或读文件；
 * 渲染用思源自己的 markdown 渲染器：Lute.ProtylePreviewStr（思源的富文本预览、Agent 消息都是这一套），
 * 外面套 .b3-typography，排版与思源自己的预览一致。
 *
 * 正文里的思源版本占位符（`{{siyuan-ref}}`）在这里换成实际标签，与写进技能目录的那份保持一致：
 * 文档里的官方 API 文档地址要指向本机思源版本。
 *
 * 传了 onLoad 时每个示例右上角多一个「载入」按钮：把示例交给调用方（编辑窗口里的代码编辑器），
 * 然后关掉文档弹窗 —— 找到示例后不用手动选中再复制。
 */
export const openScriptDocs = async (context: IContext, options: {
    onLoad?: (code: string) => void,
    /**
     * 调用方当前能不能改代码。笔记锁定时传 false：示例只留「复制」，不给「载入」——
     * 载进一个不可写的编辑区没有意义（见 issue #19）。默认 true。
     */
    editable?: boolean,
} = {}) => {
    const markdown = fillSiyuanRef(pickMarkdown(), await resolveSiyuanRef());
    const lute = window.Lute?.New?.();
    const html = lute ? lute.ProtylePreviewStr("", markdown) : "";
    if (!html) {
        log.error("no Lute available, cannot render the bundled documentation", {chars: markdown.length});
        showMessage(context.i18n.scriptDocsFailed);
        return;
    }
    log.info("opened the JavaScript documentation", {chars: markdown.length, htmlChars: html.length});
    const dialog = new Dialog({
        title: context.i18n.scriptDocs,
        width: "min(880px, 92vw)",
        content: `<div class="b3-dialog__content">
    <div class="bis-script-docs b3-typography" data-bis="docs"></div>
</div>
<div class="b3-dialog__action">
    <button type="button" class="b3-button b3-button--text" data-bis="close">${context.i18n.close}</button>
</div>`,
    });
    const docsElement = dialog.element.querySelector<HTMLElement>('[data-bis="docs"]');
    if (!docsElement) {
        log.error("the documentation dialog has missing nodes, closing it");
        dialog.destroy();
        return;
    }
    docsElement.innerHTML = html;
    // 代码块高亮交给思源自己：highlightRender 对 .b3-typography 走的是「预览」分支，
    // 按代码块的 data-language 用 hljs 上色，并从 /stage/protyle 载入代码主题（离线可用）。
    // 文档里的代码块语言统一写 javascript，就是这个 data-language。
    ProtyleMethod.highlightRender(docsElement);
    const onLoad = options.editable === false ? undefined : options.onLoad;
    decorateCodeBlocks(context, docsElement, onLoad ? (code) => {
        onLoad(code);
        dialog.destroy();
    } : undefined);
    dialog.element.querySelector('[data-bis="close"]')?.addEventListener("click", () => dialog.destroy());
};
