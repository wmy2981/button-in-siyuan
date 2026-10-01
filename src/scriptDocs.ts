import {Dialog, ProtyleMethod, showMessage} from "siyuan";
import docsEn from "../docs/javascript.md";
import docsZh from "../docs/javascript.zh-CN.md";
import type {IContext} from "./context";
import {createLogger} from "./logger";

const log = createLogger("scriptDocs");

/** 中文界面看中文文档，其余语言看英文文档。 */
const pickMarkdown = () => {
    const lang = (window.siyuan?.config?.lang || "").toLowerCase();
    return lang.startsWith("zh") ? docsZh : docsEn;
};

/**
 * 在弹窗里显示内置的 JavaScript 文档。
 *
 * 文档在构建时由 webpack 作为字符串内嵌进 index.js（docs/*.md），所以离线也能看，不需要联网或读文件；
 * 渲染用思源自己的 markdown 渲染器：Lute.ProtylePreviewStr（思源的富文本预览、Agent 消息都是这一套），
 * 外面套 .b3-typography，排版与思源自己的预览一致。
 */
export const openScriptDocs = (context: IContext) => {
    const markdown = pickMarkdown();
    const lute = window.Lute?.New?.();
    const html = lute ? lute.ProtylePreviewStr("", markdown) : "";
    if (!html) {
        log.error("没有可用的 Lute，无法渲染内置文档", {chars: markdown.length});
        showMessage(context.i18n.scriptDocsFailed);
        return;
    }
    log.info("打开 JavaScript 文档", {chars: markdown.length, htmlChars: html.length});
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
        log.error("文档弹窗的节点缺失，关闭弹窗");
        dialog.destroy();
        return;
    }
    docsElement.innerHTML = html;
    // 代码块高亮交给思源自己：highlightRender 对 .b3-typography 走的是「预览」分支，
    // 按代码块的 data-language 用 hljs 上色，并从 /stage/protyle 载入代码主题（离线可用）。
    // 文档里的代码块语言统一写 javascript，就是这个 data-language。
    ProtyleMethod.highlightRender(docsElement);
    dialog.element.querySelector('[data-bis="close"]')?.addEventListener("click", () => dialog.destroy());
};
