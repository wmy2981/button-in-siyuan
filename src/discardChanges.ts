import {Dialog} from "siyuan";
import type {IContext} from "./context";
import {createLogger} from "./logger";

const log = createLogger("discardChanges");

/**
 * 「放弃未保存的修改」确认窗口：确认按钮用思源自己的危险操作样式 `b3-button--remove`
 * （宿主的删除确认就是这个红色样式，见 `app/src/assets/scss/component/_button.scss`），
 * 确认后才执行 onConfirm；关掉窗口（取消、Esc、点遮罩）都算保留原窗口。
 */
export const confirmDiscard = (context: IContext, onConfirm: () => void) => {
    const {i18n} = context;
    const dialog = new Dialog({
        title: i18n.discardChangesTitle,
        width: context.isMobile ? "92vw" : "520px",
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">${i18n.discardChangesTip}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="keep">${i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--remove" data-bis="discard">${i18n.discardChangesConfirm}</button>
</div>`,
    });
    dialog.element.querySelector('[data-bis="keep"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector('[data-bis="discard"]')?.addEventListener("click", () => {
        onConfirm();
        dialog.destroy();
    });
};

/**
 * 给对话框装上「改了东西就别直接关」的拦截：取消、× 图标、`Esc`、点遮罩四条路都要先问一次。
 *
 * 实现不是逐条拦，而是把实例上的 `dialog.destroy` 换成自己的函数：宿主的四条路最后都调用它
 * （scrim/close 监听在 `app/src/dialog/index.ts`，`Esc` 在 `boot/globalEvent/keydown.ts` 里直接调
 * `dialogs[last].destroy()`）。注意 **`disableClose` 只挡遮罩与 × 图标，挡不住 `Esc`**。
 * `isDirty()` 由调用方判断（两边各自比较自己的表单/编辑器快照），`detail` 只进日志。
 */
export const guardUnsavedChanges = (context: IContext, dialog: Dialog, detail: Record<string, unknown>,
                                    isDirty: () => boolean) => {
    const destroyDialog = dialog.destroy.bind(dialog);
    dialog.destroy = (options?: Parameters<typeof destroyDialog>[0]) => {
        if (!isDirty()) {
            destroyDialog(options);
            return;
        }
        log.debug("close intercepted: there are unsaved changes", detail);
        confirmDiscard(context, () => {
            log.info("discarded the unsaved changes", detail);
            destroyDialog(options);
        });
    };
};
