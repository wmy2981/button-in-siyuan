import {Dialog} from "siyuan";
import {confirmDanger} from "./confirmDanger";
import type {IContext} from "../core/context";
import {createLogger} from "../core/logger";

const log = createLogger("discardChanges");

/**
 * 「放弃未保存的修改」确认窗口：与三处删除确认共用 `confirmDanger`，确认按钮是红色的
 * `b3-button--remove`；关掉窗口（取消、Esc、点遮罩）都算保留原窗口。
 *
 * `tip` 只在编辑顶栏快捷操作时换一句：那时候写回的是文件而不是按钮块。
 */
export const confirmDiscard = (context: IContext, onConfirm: () => void, tip = context.i18n.discardChangesTip) =>
    confirmDanger(context, {
        title: context.i18n.discardChangesTitle,
        tip,
        confirm: context.i18n.discardChangesConfirm,
    }, onConfirm);

/**
 * 给对话框装上「改了东西就别直接关」的拦截：取消、× 图标、`Esc`、点遮罩四条路都要先问一次。
 *
 * 实现不是逐条拦，而是把实例上的 `dialog.destroy` 换成自己的函数：宿主的四条路最后都调用它
 * （scrim/close 监听在 `app/src/dialog/index.ts`，`Esc` 在 `boot/globalEvent/keydown.ts` 里直接调
 * `dialogs[last].destroy()`）。注意 **`disableClose` 只挡遮罩与 × 图标，挡不住 `Esc`**。
 * `isDirty()` 由调用方判断（两边各自比较自己的表单/编辑器快照），`detail` 只进日志。
 */
export const guardUnsavedChanges = (context: IContext, dialog: Dialog, detail: Record<string, unknown>,
                                    isDirty: () => boolean, tip?: string) => {
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
        }, tip);
    };
};
