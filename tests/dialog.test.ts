import {describe, expect, it, vi} from "vitest";
import {createDialog, hideWhileOpening, makeFullscreenDialog} from "../src/ui/dialog";
import {Dialog} from "./mocks/siyuan";

describe("createDialog", () => {
    it("creates the host dialog and pre-warms its compositing layer", () => {
        const dialog = createDialog({content: "<div class=\"b3-dialog__content\"></div>"});
        expect(dialog).toBeInstanceOf(Dialog);
        // 图层预热靠这个类（index.scss 里给容器与正文挂 will-change），见 src/ui/dialog.ts
        expect(dialog.element.classList.contains("bis-dialog-warm")).toBe(true);
        expect(dialog.element.querySelector(".b3-dialog__container")).not.toBeNull();
    });

    it("passes the host options through untouched", () => {
        createDialog({title: "编辑按钮块", width: "min(760px, 92vw)", content: "<div></div>"});
        expect(Dialog.instances.at(-1)?.options.title).toBe("编辑按钮块");
        expect(Dialog.instances.at(-1)?.options.width).toBe("min(760px, 92vw)");
    });

    it("turns a fullscreen page into a plain page", () => {
        const dialog = createDialog({content: "<div class=\"b3-dialog__content\"></div>"});
        makeFullscreenDialog(dialog);
        expect(dialog.element.querySelector(".b3-dialog__container")?.classList.contains("bis-dialog-fullscreen"))
            .toBe(true);
    });

    it("releases the layers of a fullscreen page after its entrance", () => {
        vi.useFakeTimers();
        try {
            const dialog = createDialog({content: "<div class=\"b3-dialog__content\"></div>"});
            makeFullscreenDialog(dialog);
            // 入场那一刻仍然预热，否则又会插一帧旧画面
            expect(dialog.element.classList.contains("bis-dialog-warm")).toBe(true);
            vi.advanceTimersByTime(399);
            expect(dialog.element.classList.contains("bis-dialog-warm")).toBe(true);
            // 满屏页面一直开着，常驻的整屏合成层叠上抽屉会让 App 卡死（issue #43）
            vi.advanceTimersByTime(1);
            expect(dialog.element.classList.contains("bis-dialog-warm")).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("hides the lower dialog while the next one opens", () => {
        const manager = createDialog({content: "<div class=\"b3-dialog__content\"></div>"});
        let hiddenDuringOpen = "";
        hideWhileOpening(manager.element, () => {
            hiddenDuringOpen = manager.element.style.display;
        });
        // 下层满屏窗口必须先离开渲染树，App 里压着它新建对话框会让 WebView 卡死（issue #43）
        expect(hiddenDuringOpen).toBe("none");
        manager.element.style.display = "";
        expect(manager.element.style.display).toBe("");
    });

    it("shows the lower dialog again when the next one cannot open", () => {
        const manager = createDialog({content: "<div class=\"b3-dialog__content\"></div>"});
        expect(() => hideWhileOpening(manager.element, () => {
            throw new Error("boom");
        })).toThrow("boom");
        expect(manager.element.style.display).toBe("");
    });
});
