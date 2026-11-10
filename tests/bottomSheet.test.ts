import {describe, expect, it, vi} from "vitest";
import {useBottomSheet} from "../src/ui/bottomSheet";
import {Dialog} from "./mocks/siyuan";
import {touchEvent} from "./helpers";

const makeDialog = (extra = "") => {
    const dialog = new Dialog({
        content: `<div class="b3-dialog__content"><div data-bis="body">${extra}</div></div>`,
    });
    const sheet = dialog.element.querySelector<HTMLElement>(".b3-dialog__container") as HTMLElement;
    return {dialog, sheet};
};

/** 等一帧：入场的展开与宿主一样压在 `requestAnimationFrame` 上（`waitForSheetViewport`）。 */
const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

/** 打开并等入场跑完：宿主加打开类之后，插件才放开 `visibility` / 过渡 / 位移。 */
const openSheet = async (extra = "") => {
    const {dialog, sheet} = makeDialog(extra);
    const cleanup = useBottomSheet(dialog as never);
    dialog.element.classList.add("b3-dialog--open");
    await nextFrame();
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
        const {dialog, sheet} = makeDialog();
        useBottomSheet(dialog as never);
        expect(dialog.element.classList.contains("mobile-bottom-sheet-dialog")).toBe(true);
        expect(sheet.classList.contains("mobile-bottom-sheet")).toBe(true);
        // 常驻的 will-change 由自己的类预热图层（样式在 index.scss）
        expect(sheet.classList.contains("bis-bottom-sheet")).toBe(true);
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

    it("starts off-screen with its own transition suspended", () => {
        const {dialog, sheet} = makeDialog();
        useBottomSheet(dialog as never);
        // 与宿主的 bindBottomSheetDialog 一致：先压到屏幕下方、藏起来，过渡留给展开那一刻
        expect(sheet.style.transition).toBe("none");
        expect(sheet.style.transform).toBe("translateY(100%)");
        expect(sheet.style.visibility).toBe("hidden");
    });

    it("keeps the off-screen panel untouched when the viewport changes before it opens", () => {
        const listeners = new Map<string, () => void>();
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: {
                offsetTop: 0,
                height: 400,
                addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
                removeEventListener: (type: string) => listeners.delete(type),
            },
        });
        try {
            const {dialog, sheet} = makeDialog();
            useBottomSheet(dialog as never);
            listeners.get("resize")?.();
            // 视口变化只作废「正在进行的下拉手势」，不能把还没展开的面板从屏幕外拉回来
            expect(sheet.style.transform).toBe("translateY(100%)");
            expect(sheet.style.visibility).toBe("hidden");
            expect(sheet.style.transition).toBe("none");
        } finally {
            delete (window as any).visualViewport;
        }
    });

    it("slides in with the host transition once the open class arrives", async () => {
        const {dialog, sheet} = makeDialog();
        useBottomSheet(dialog as never);
        const dialogElement = dialog.element.querySelector<HTMLElement>(".b3-dialog");
        // 打开之前不算布局，免得在入场过程中把整页重排一遍
        expect(dialogElement?.style.height).toBe("");

        dialog.element.classList.add("b3-dialog--open");
        await nextFrame();

        expect(sheet.style.visibility).toBe("");
        expect(sheet.style.transition).toBe("");
        expect(sheet.style.transform).toBe("");
        // 整屏可用时直接贴住布局底边，不写死高度
        expect(dialogElement?.style.top).toBe("0px");
        expect(dialogElement?.style.bottom).toBe("0px");
        expect(dialogElement?.style.height).toBe("auto");
    });

    it("follows the visible viewport when the keyboard shrinks it", async () => {
        const listeners = new Map<string, () => void>();
        // 视口只收窄了一点点（不到 100px），不算键盘弹起，直接展开
        const viewport = {offsetTop: 10, height: 700};
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: {
                get offsetTop() {
                    return viewport.offsetTop;
                },
                get height() {
                    return viewport.height;
                },
                addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
                removeEventListener: (type: string) => listeners.delete(type),
            },
        });
        try {
            const {dialog, sheet, cleanup} = await openSheet();
            const dialogElement = dialog.element.querySelector<HTMLElement>(".b3-dialog");
            expect(dialogElement?.style.top).toBe("10px");
            expect(dialogElement?.style.height).toBe("700px");
            expect(dialogElement?.style.bottom).toBe("auto");
            expect(listeners.has("resize")).toBe(true);

            // 视口真的变了才重算：键盘继续上抬，整层跟着缩小
            viewport.height = 620;
            viewport.offsetTop = 0;
            listeners.get("resize")?.();
            expect(dialogElement?.style.top).toBe("0px");
            expect(dialogElement?.style.height).toBe("620px");

            cleanup();
            expect(listeners.size).toBe(0);
            expect(sheet.style.transform).toBe("");
        } finally {
            delete (window as any).visualViewport;
        }
    });

    it("waits for the keyboard to settle before sliding in", async () => {
        // 真机上 `innerHeight` 就是整屏高度（Android 自己把 WebView 缩到键盘上方）
        (window.siyuan as any).mobile = {size: {isLandscape: false, portrait: {height1: window.innerHeight, height2: 400}}};
        const viewport = {offsetTop: 0, height: 400};
        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: {
                get offsetTop() {
                    return viewport.offsetTop;
                },
                get height() {
                    return viewport.height;
                },
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            },
        });
        try {
            const {dialog, sheet} = makeDialog();
            useBottomSheet(dialog as never);
            dialog.element.classList.add("b3-dialog--open");
            await nextFrame();
            await nextFrame();
            // 键盘还压着视口，面板继续藏在屏幕下方
            expect(sheet.style.visibility).toBe("hidden");
            expect(sheet.style.transform).toBe("translateY(100%)");

            viewport.height = window.innerHeight;
            for (let i = 0; i < 5; i++) {
                await nextFrame();
            }
            expect(sheet.style.visibility).toBe("");
            expect(sheet.style.transform).toBe("");
        } finally {
            delete (window as any).visualViewport;
        }
    });

    it("hands the exit over to the host transition when the dialog closes", async () => {
        const {dialog, sheet} = await openSheet();
        Object.defineProperty(sheet, "getBoundingClientRect", {
            configurable: true,
            value: () => ({x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 512}) as DOMRect,
        });
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 200);
        expect(sheet.style.transition).toBe("none");

        // 宿主开始销毁：先标 closing，再摘掉打开类（app/src/dialog/index.ts）
        dialog.element.dataset.dialogClosing = "true";
        dialog.element.classList.remove("b3-dialog--open");
        await Promise.resolve();

        // 清掉拖动留下的行内过渡与位移，高度冻在当前值：面板整块滑出屏幕，而不是被抽走
        expect(sheet.style.transition).toBe("");
        expect(sheet.style.transform).toBe("");
        expect(sheet.style.height).toBe("512px");
        expect(sheet.style.maxHeight).toBe("512px");
    });

    it("does not start a drag before the sheet has opened", () => {
        const {dialog, sheet} = makeDialog();
        useBottomSheet(dialog as never);
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 300);
        expect(sheet.style.transform).toBe("translateY(100%)");
        expect(dialog.destroyed).toBe(false);
    });

    it("closes after a long drag down", async () => {
        const {dialog, sheet} = await openSheet();
        Object.defineProperty(sheet, "clientHeight", {value: 600, configurable: true});
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 350);
        expect(sheet.style.transform).toBe("translateY(250px)");
        endAt(body, 10, 350);
        expect(dialog.destroyed).toBe(true);
    });

    it("snaps back after a short drag", async () => {
        const {dialog, sheet} = await openSheet();
        Object.defineProperty(sheet, "clientHeight", {value: 600, configurable: true});
        vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(1000);
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 150);
        endAt(body, 10, 150);
        expect(dialog.destroyed).toBe(false);
        expect(sheet.style.transform).toBe("");
    });

    it("ignores an upward drag", async () => {
        const {sheet} = await openSheet();
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 50);
        expect(sheet.style.transform).toBe("");
    });

    it("ignores a mostly-horizontal drag", async () => {
        const {sheet} = await openSheet();
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 200, 110);
        expect(sheet.style.transform).toBe("");
    });

    it("does not start from an input", async () => {
        const {dialog, sheet} = await openSheet(`<input data-bis="input">`);
        const input = sheet.querySelector<HTMLInputElement>('[data-bis="input"]') as HTMLInputElement;
        startAt(input);
        moveTo(input, 10, 300);
        endAt(input, 10, 300);
        expect(dialog.destroyed).toBe(false);
    });

    it("does not start inside a scrolled container", async () => {
        const {dialog, sheet} = await openSheet(`<div data-bis="scroller"><span data-bis="inner">x</span></div>`);
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

    it("resets the drag when a second finger appears", async () => {
        const {dialog, sheet} = await openSheet();
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

    it("swallows the click that follows a drag", async () => {
        const {sheet} = await openSheet();
        Object.defineProperty(sheet, "clientHeight", {value: 600, configurable: true});
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 150);
        endAt(body, 10, 150);
        const click = new MouseEvent("click", {bubbles: true, cancelable: true});
        sheet.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
    });

    it("cleans up its listeners and the handle", async () => {
        const {dialog, sheet, cleanup} = await openSheet();
        const handle = sheet.firstElementChild;
        cleanup();
        expect(handle?.isConnected).toBe(false);
        const body = sheet.querySelector<HTMLElement>('[data-bis="body"]') as HTMLElement;
        startAt(body);
        moveTo(body, 10, 300);
        endAt(body, 10, 300);
        expect(dialog.destroyed).toBe(false);
    });
});
