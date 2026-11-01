import {describe, expect, it} from "vitest";
import {createDialog} from "../src/dialog";
import {Dialog} from "./mocks/siyuan";

describe("createDialog", () => {
    it("creates the host dialog and pre-warms its compositing layer", () => {
        const dialog = createDialog({content: "<div class=\"b3-dialog__content\"></div>"});
        expect(dialog).toBeInstanceOf(Dialog);
        // 图层预热靠这个类（index.scss 里给它挂 will-change），见 src/dialog.ts
        expect(dialog.element.classList.contains("bis-dialog-warm")).toBe(true);
        expect(dialog.element.querySelector(".b3-dialog__container")).not.toBeNull();
    });
});
