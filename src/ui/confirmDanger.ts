import {createDialog} from "./dialog";
import type {IContext} from "../core/context";
import {createLogger} from "../core/logger";

const log = createLogger("confirmDanger");

export interface IConfirmDangerOptions {
    title: string;
    /** 正文：这次操作会造成什么后果。走 textContent 写入，脚本路径这类用户数据不会当 HTML 解析。 */
    tip: string;
    /** 确认按钮的文案 */
    confirm: string;
}

/**
 * 危险操作的确认窗口：确认按钮用思源自己的危险操作样式 `b3-button--remove`（红色线框，见
 * `app/src/assets/scss/component/_button.scss`），「放弃修改」与三处删除共用这一个窗口。
 *
 * 不用宿主的 `confirm(…, isDelete)`：它在打开时会把焦点放到确认按钮上
 * （`app/src/dialog/confirmDialog.ts` 末尾的 `focus()`），而宿主的 `.b3-button--remove` 把
 * `:hover` 与 `:focus` 写成同一套样式，于是窗口一出现确认按钮就已经是「悬停」外观。
 * 这里不主动聚焦任何按钮，宿主的 `Dialog` 只聚焦容器，Tab 与 `Esc` 照常。
 */
export const confirmDanger = (context: IContext, options: IConfirmDangerOptions, onConfirm: () => void) => {
    const dialog = createDialog({
        title: options.title,
        width: context.isMobile ? "92vw" : "520px",
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword" data-bis="tip"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="keep">${context.i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--remove" data-bis="confirm">${options.confirm}</button>
</div>`,
    });
    // 正文可能是脚本路径这类用户数据，走 textContent 而不是拼进 HTML
    const tipElement = dialog.element.querySelector<HTMLElement>('[data-bis="tip"]');
    if (tipElement) {
        tipElement.textContent = options.tip;
    }
    dialog.element.querySelector('[data-bis="keep"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector('[data-bis="confirm"]')?.addEventListener("click", () => {
        log.info("confirmed the destructive action", {title: options.title});
        onConfirm();
        dialog.destroy();
    });
};
