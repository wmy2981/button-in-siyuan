import {Dialog, showMessage} from "siyuan";
import {createCodeEditor} from "./codeEditor";
import type {IContext} from "./context";
import {guardUnsavedChanges} from "./discardChanges";
import {createLogger} from "./logger";
import {readWorkspaceFile, writeWorkspaceFile} from "./scriptFile";
import {openScriptDocs} from "./scriptDocs";

const log = createLogger("scriptFileDialog");

/**
 * 编辑 assets/ 下的 JavaScript 文件。
 *
 * 编辑器和「JavaScript」操作里那个是同一个（`createCodeEditor`）：同样的行号、语法高亮、
 * 跟随思源代码高亮主题的配色、同样的文档入口与右下角拖拽改高；区别只是保存走内核的文件接口。
 */
export const openScriptFileEditor = async (context: IContext, options: {
    path: string,
}) => {
    const {i18n} = context;
    let content: string;
    try {
        content = await readWorkspaceFile(options.path);
    } catch (error) {
        log.error("failed to read the script file", {path: options.path, error});
        showMessage(error instanceof Error && error.message ? error.message : i18n.scriptFileFailed);
        return;
    }
    log.info("opened the script file editor", {path: options.path, chars: content.length});
    const dialog = new Dialog({
        title: options.path,
        // 比原来的 640px 宽一圈、并给一个默认高度：编辑区会填满正文剩下的空间（见 src/codeEditor.ts）。
        // 两个 min() 一起保证窗口不会顶出屏幕
        width: "min(880px, 92vw)",
        height: "min(84vh, 720px)",
        content: `<div class="b3-dialog__content" data-bis="editor-body">
    <div data-bis="file-editor"></div>
    <div class="fn__hr--small"></div>
    <button type="button" class="bis-docs-link" data-bis="docs">${i18n.scriptDocs}</button>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="cancel">${i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-bis="save">${i18n.save}</button>
</div>`,
    });
    const field = <T extends HTMLElement>(type: string) => dialog.element.querySelector<T>(`[data-bis="${type}"]`);
    const editor = createCodeEditor({
        value: content,
        placeholder: i18n.scriptCodePlaceholder,
        codeWrap: context.getSettings().codeWrap,
    });
    field<HTMLElement>("file-editor")?.append(editor.element);
    // 与「编辑按钮块」一样：改了内容还没保存时，关窗前先问一次（取消、×、Esc、点遮罩都拦）
    const openedWith = content;
    let saved = false;
    guardUnsavedChanges(context, dialog, {path: options.path}, () => !saved && editor.getValue() !== openedWith);
    field<HTMLButtonElement>("cancel")?.addEventListener("click", () => {
        log.debug("cancelled the script file editor", {path: options.path});
        dialog.destroy();
    });
    // 与内联脚本一样可以从文档里载入示例，只是这里改的是文件内容，保存后才落盘
    field<HTMLButtonElement>("docs")?.addEventListener("click", () => void openScriptDocs(context, {
        onLoad: (code) => {
            editor.setValue(code);
            editor.focus();
        },
    }));
    field<HTMLButtonElement>("save")?.addEventListener("click", async () => {
        const next = editor.getValue();
        try {
            await writeWorkspaceFile(options.path, next);
        } catch (error) {
            log.error("failed to save the script file", {path: options.path, error});
            showMessage(error instanceof Error && error.message ? error.message : i18n.scriptFileFailed);
            return;
        }
        log.info("saved the script file", {path: options.path, chars: next.length});
        // 已经落盘了，关窗时不必再问一次
        saved = true;
        dialog.destroy();
    });
    // 打开窗口时不聚焦编辑区：焦点留在宿主的对话框容器上，要写代码用户自己点（「载入示例」之后才聚焦）
};
