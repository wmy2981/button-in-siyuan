import {describe, expect, it, vi} from "vitest";
import {confirmDiscard, guardUnsavedChanges} from "../src/discardChanges";
import {Dialog} from "./mocks/siyuan";
import {makeContext} from "./helpers";

describe("confirmDiscard", () => {
    it("shows the confirmation with the danger button", () => {
        confirmDiscard(makeContext(), vi.fn());
        const dialog = Dialog.instances.at(-1);
        expect(dialog?.options.title).toBe("discardChangesTitle");
        expect(dialog?.element.textContent).toContain("discardChangesTip");
        expect(dialog?.element.querySelector('[data-bis="confirm"]')?.classList.contains("b3-button--remove")).toBe(true);
    });

    it("keeps the original window when the user cancels", () => {
        const onConfirm = vi.fn();
        confirmDiscard(makeContext(), onConfirm);
        const dialog = Dialog.instances.at(-1);
        dialog?.element.querySelector<HTMLElement>('[data-bis="keep"]')?.click();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(dialog?.destroyed).toBe(true);
    });

    it("runs the confirmation and closes", () => {
        const onConfirm = vi.fn();
        confirmDiscard(makeContext(), onConfirm);
        const dialog = Dialog.instances.at(-1);
        dialog?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(dialog?.destroyed).toBe(true);
    });

    it("uses the mobile width", () => {
        confirmDiscard(makeContext({isMobile: true}), vi.fn());
        expect(Dialog.instances.at(-1)?.options.width).toBe("92vw");
    });

    it("takes a custom tip for the quick action editor", () => {
        confirmDiscard(makeContext(), vi.fn(), "topBarDiscardChangesTip");
        expect(Dialog.instances.at(-1)?.element.textContent).toContain("topBarDiscardChangesTip");
    });
});

describe("guardUnsavedChanges", () => {
    const makeDialog = () => {
        const dialog = new Dialog({content: ""});
        const destroy = vi.spyOn(dialog, "destroy");
        guardUnsavedChanges(makeContext(), dialog as never, {scope: "test"}, () => dirty);
        return {dialog, destroy};
    };
    let dirty = false;

    it("closes immediately when nothing changed", () => {
        dirty = false;
        const {dialog, destroy} = makeDialog();
        dialog.destroy();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(Dialog.instances).toHaveLength(1);
    });

    it("asks before closing when there are unsaved changes", () => {
        dirty = true;
        const {dialog, destroy} = makeDialog();
        dialog.destroy();
        expect(destroy).not.toHaveBeenCalled();
        expect(Dialog.instances).toHaveLength(2);
    });

    it("closes the original window after the discard is confirmed", () => {
        dirty = true;
        const {dialog, destroy} = makeDialog();
        dialog.destroy();
        const confirm = Dialog.instances.at(-1);
        confirm?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("keeps the original window when the discard is cancelled", () => {
        dirty = true;
        const {dialog, destroy} = makeDialog();
        dialog.destroy();
        const confirm = Dialog.instances.at(-1);
        confirm?.element.querySelector<HTMLElement>('[data-bis="keep"]')?.click();
        expect(destroy).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(false);
    });

    it("forwards the destroy options", () => {
        dirty = false;
        const {dialog, destroy} = makeDialog();
        dialog.destroy({restore: true});
        expect(destroy).toHaveBeenCalledWith({restore: true});
    });

    it("re-checks the dirty state on every close attempt", () => {
        dirty = true;
        const {dialog, destroy} = makeDialog();
        dialog.destroy();
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="keep"]')?.click();

        dirty = false;
        dialog.destroy();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
