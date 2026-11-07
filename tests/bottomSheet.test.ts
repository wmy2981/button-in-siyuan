import {beforeEach, describe, expect, it, vi} from "vitest";
import {useBottomSheet} from "../src/bottomSheet";
import {Dialog} from "./mocks/siyuan";
import {flushPromises, touchEvent} from "./helpers";

/** jsdom 的 rAF 会在当前调用栈里同步执行，而真实浏览器是下一帧；测试里手动放行。 */
let frames: FrameRequestCallback[] = [];
const runFrames = () => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
};

beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

const makeDialog = (extra = "") => {
    const dialog = new Dialog({
        content: `<div class="b3-dialog__content"><div data-bis="body">${extra}</div></div>`,
    });
    const sheet = dialog.element.querySelector<HTMLElement>(".b3-dialog__container") as HTMLElement;
    return {dialog, sheet};
};

const openSheet = () => {
    const {dialog, sheet} = makeDialog();
    const cleanup = useBottomSheet(dialog as never);
    return {dialog, sheet, cleanup};
};

const startAt = (target: HTMLElement, x = 10, y = 100) =>
    target.dispatchEvent(touchEvent("touchstart", [{clientX: x, clientY: y}]));
const moveTo = (target: HTMLElement, x = 10, y = 300) =>
    target.dispatchEvent(touchEvent("touchmove", [{clientX: x, clientY: y}]));
const endAt = (target: HTMLElement, x = 10, y = 300) =>
    target.dispatchEvent(touchEvent("touchend", [], [{clientX: x, clientY: y}]));

describe("useBottomSheet", () => {
    it("leaves a dialog without a container untouched", () => {
        const dialog = {element: document.createElement("div"), destroy: vi.fn()} as unknown as Dialog;
        const cleanup = useBottomSheet(dialog as never);
        expect(() => cleanup()).not.toThrow();
    });

    it("adds the native sheet classes and the drag handle", () => {
        const {dialog, sheet} = openSheet();
        expect(dialog.element.classList.contains("mobile-bottom-sheet-dialog")).toBe(true);
        expect(sheet.classList.contains("mobile-bottom-sheet")).toBe(true);
        expect(sheet.firstElementChild?.classList.contains("b3-menu__title--root")).toBe(true);
        expect(sheet.style.width).toBe("100vw");
        expect(sheet.style.maxWidth).toBe("100vw");
        expect(dialog.element.querySelector(".b3-dialog__close")?.classList.contains("fn__none")).toBe(true);
    });

    it("removes the resize handles and the drag class of the header", () => {
        const {dialog, sheet} = makeDialog();
        const header = sheet.querySelector(".b3-dialog__header");
        header?.classList.add("resize__move");
        expect(sheet.querySelector(".resize__r")).not.toBeNull();
        useBottomSheet(dialog as never);
        expect(sheet.querySelector(".resize__r")).toBeNull();
        expect(header?.classList.contains("resize__move")).toBe(false);
    });

    it("starts off-screen and slides in when the host opens the dialog", async () => {
        const {dialog, sheet} = openSheet();
        expect(sheet.style.transform).toBe("translateY(100%)");
        expect(sheet.style.visibility).toBe("hidden");

        dialog.element.classList.add("b3-dialog--open");
        await flushPromises();
        runFrames();
        expect(sheet.style.transform).toBe("");
        expect(sheet.style.visibility).toBe("");
    });

    it("opens immediately when the dialog is already open", () => {
        const {dialog, sheet} = makeDialog();
        dialog.element.classList.add("b3-dialog--open");
        useBottomSheet(dialog as never);
        expect(frames).toHaveLength(1);
        runFrames();
        expect(sheet.style.visibility).toBe("");
        expect(sheet.style.transform).toBe("");
    });

    it("closes after a long drag down", () => {
        const {dialog, sheet} = openSheet();
        Object.defineProperty(sheet, "clientHeight", {value: 600, configurable: true});
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 350);
        expect(sheet.style.transform).toBe("translateY(250px)");
        endAt(body, 10, 350);
        expect(dialog.destroyed).toBe(true);
    });

    it("snaps back after a short drag", () => {
        const {dialog, sheet} = openSheet();
        Object.defineProperty(sheet, "clientHeight", {value: 600, configurable: true});
        vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(1000);
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 150);
        endAt(body, 10, 150);
        expect(dialog.destroyed).toBe(false);
        expect(sheet.style.transform).toBe("");
    });

    it("ignores an upward drag", () => {
        const {sheet} = openSheet();
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 50);
        expect(sheet.style.transform).toBe("");
    });

    it("ignores a mostly-horizontal drag", () => {
        const {sheet} = openSheet();
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 200, 110);
        expect(sheet.style.transform).toBe("");
    });

    it("does not start from an input", () => {
        const {dialog, sheet} = makeDialog(`<input data-bis="input">`);
        useBottomSheet(dialog as never);
        const input = sheet.querySelector<HTMLInputElement>('[data-bis="input"]') as HTMLInputElement;
        startAt(input);
        moveTo(input, 10, 300);
        endAt(input, 10, 300);
        expect(dialog.destroyed).toBe(false);
    });

    it("does not start inside a scrolled container", () => {
        const {dialog, sheet} = makeDialog(`<div data-bis="scroller"><span data-bis="inner">x</span></div>`);
        useBottomSheet(dialog as never);
        const scroller = sheet.querySelector<HTMLElement>('[data-bis="scroller"]') as HTMLElement;
        scroller.style.overflowY = "auto";
        Object.defineProperties(scroller, {
            scrollHeight: {value: 200, configurable: true},
            clientHeight: {value: 100, configurable: true},
            scrollTop: {value: 10, configurable: true},
        });
        const inner = sheet.querySelector<HTMLElement>('[data-bis="inner"]') as HTMLElement;
        startAt(inner);
        moveTo(inner, 10, 300);
        endAt(inner, 10, 300);
        expect(dialog.destroyed).toBe(false);
    });

    it("resets the drag when a second finger appears", () => {
        const {dialog, sheet} = openSheet();
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 200);
        sheet.dispatchEvent(touchEvent("touchmove", [
            {clientX: 10, clientY: 200},
            {clientX: 20, clientY: 210},
        ]));
        expect(sheet.style.transform).toBe("");
        endAt(body, 10, 200);
        expect(dialog.destroyed).toBe(false);
    });

    it("swallows the click that follows a drag", () => {
        const {sheet} = openSheet();
        Object.defineProperty(sheet, "clientHeight", {value: 600, configurable: true});
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 150);
        endAt(body, 10, 150);
        const click = new MouseEvent("click", {bubbles: true, cancelable: true});
        sheet.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
    });

    it("cleans up its listeners and the handle", () => {
        const {dialog, sheet, cleanup} = openSheet();
        const handle = sheet.firstElementChild;
        cleanup();
        expect(handle?.isConnected).toBe(false);
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 300);
        endAt(body, 10, 300);
        expect(dialog.destroyed).toBe(false);
    });

    it("follows the visual viewport when the keyboard opens", () => {
        const listeners = new Map<string, () => void>();
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: {
                offsetTop: 10,
                height: 500,
                addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
                removeEventListener: (type: string) => listeners.delete(type),
            },
        });
        try {
            const {dialog, cleanup} = openSheet();
            const dialogElement = dialog.element.querySelector<HTMLElement>(".b3-dialog");
            expect(dialogElement?.style.top).toBe("10px");
            expect(dialogElement?.style.height).toBe("500px");
            expect(listeners.has("resize")).toBe(true);
            cleanup();
            expect(listeners.size).toBe(0);
        } finally {
            delete (window as any).visualViewport;
        }
    });
});
