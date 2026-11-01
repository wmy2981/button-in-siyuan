import {describe, expect, it, vi} from "vitest";
import {confirmDanger} from "../src/confirmDanger";
import {Dialog} from "./mocks/siyuan";
import {makeContext} from "./helpers";

const open = (tip = "the tip", context = makeContext()) => {
    const onConfirm = vi.fn();
    confirmDanger(context, {title: "the title", tip, confirm: "confirmDelete"}, onConfirm);
    const dialog = Dialog.instances.at(-1);
    if (!dialog) {
        throw new Error("no dialog");
    }
    return {dialog, onConfirm};
};

describe("confirmDanger", () => {
    it("renders the title, the text and the danger button", () => {
        const {dialog} = open();
        expect(dialog.options.title).toBe("the title");
        expect(dialog.element.querySelector<HTMLElement>('[data-bis="tip"]')?.textContent).toBe("the tip");
        const button = dialog.element.querySelector('[data-bis="confirm"]');
        expect(button?.textContent).toBe("confirmDelete");
        expect(button?.classList.contains("b3-button--remove")).toBe(true);
        expect(dialog.element.querySelector('[data-bis="keep"]')?.classList.contains("b3-button--cancel"))
            .toBe(true);
    });

    it("writes the tip as text, not as html", () => {
        const {dialog} = open("data/assets/<x>.js");
        expect(dialog.element.querySelector<HTMLElement>('[data-bis="tip"]')?.textContent)
            .toBe("data/assets/<x>.js");
        expect(dialog.element.querySelector<HTMLElement>('[data-bis="tip"]')?.children).toHaveLength(0);
    });

    it("focuses no button when it opens", () => {
        // 宿主的 confirm 会把焦点放到确认按钮上，而 b3-button--remove 的 :focus 与 :hover 同款，
        // 窗口一出现按钮就像在悬停。这个窗口不主动聚焦任何按钮，焦点留在宿主的容器上
        const {dialog} = open();
        expect(dialog.element.querySelector("button:focus")).toBeNull();
    });

    it("runs the confirmation and closes", () => {
        const {dialog, onConfirm} = open();
        dialog.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(dialog.destroyed).toBe(true);
    });

    it("keeps the window open when the user cancels", () => {
        const {dialog, onConfirm} = open();
        dialog.element.querySelector<HTMLElement>('[data-bis="keep"]')?.click();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(true);
    });

    it("uses the mobile width", () => {
        open("the tip", makeContext({isMobile: true}));
        expect(Dialog.instances.at(-1)?.options.width).toBe("92vw");
    });
});
