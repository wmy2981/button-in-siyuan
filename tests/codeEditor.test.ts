import {describe, expect, it, vi} from "vitest";
import {createCodeEditor} from "../src/codeEditor";
import {Constants} from "./mocks/siyuan";

describe("createCodeEditor", () => {
    it("creates an editor with the initial value and the SiYuan wrapper", () => {
        const editor = createCodeEditor({value: "const a = 1;", placeholder: "code"});
        expect(editor.element.classList.contains("bis-code")).toBe(true);
        expect(editor.element.querySelector(".cm-editor")).not.toBeNull();
        expect(editor.getValue()).toBe("const a = 1;");
    });

    it("replaces the whole document and moves the cursor to the end", () => {
        const editor = createCodeEditor({value: "old"});
        editor.setValue("new();");
        expect(editor.getValue()).toBe("new();");
    });

    it("adds the resize corner pad only when editable", () => {
        const editable = createCodeEditor({value: ""});
        expect(editable.element.querySelector(".bis-code__corner")).not.toBeNull();
        const readonly = createCodeEditor({value: "", editable: false});
        expect(readonly.element.querySelector(".bis-code__corner")).toBeNull();
        expect(readonly.element.querySelector(".cm-editor")).not.toBeNull();
    });

    it("focuses the editor when asked to", () => {
        const editor = createCodeEditor({value: ""});
        expect(() => editor.focus()).not.toThrow();
    });

    it("opens the native text menu for a desktop right click", () => {
        const send = vi.fn();
        (window as any).require = () => ({ipcRenderer: {send}});
        (window as any).siyuan.languages = {undo: "Undo", copy: "Copy", paste: "Paste"};
        const editor = createCodeEditor({value: ""});
        const event = new MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX: 12, clientY: 34});
        const stop = vi.spyOn(event, "stopPropagation");
        editor.element.dispatchEvent(event);
        expect(send).toHaveBeenCalledWith(Constants.SIYUAN_CONTEXT_MENU, expect.objectContaining({
            x: 12,
            y: 34,
            items: expect.arrayContaining([
                expect.objectContaining({role: "undo", label: "Undo"}),
                expect.objectContaining({role: "copy", label: "Copy"}),
                expect.objectContaining({role: "paste", label: "Paste"}),
            ]),
        }));
        expect(stop).toHaveBeenCalled();
    });

    it("leaves shift + right click to the browser", () => {
        const send = vi.fn();
        (window as any).require = () => ({ipcRenderer: {send}});
        const editor = createCodeEditor({value: ""});
        const event = new MouseEvent("contextmenu", {bubbles: true, shiftKey: true});
        editor.element.dispatchEvent(event);
        expect(send).not.toHaveBeenCalled();
    });

    it("does nothing without an Electron ipcRenderer", () => {
        delete (window as any).require;
        const editor = createCodeEditor({value: ""});
        expect(() => editor.element.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true}))).not.toThrow();
    });

    it("resizes the editor with the corner pad", () => {
        const editor = createCodeEditor({value: ""});
        const pad = editor.element.querySelector<HTMLElement>(".bis-code__corner") as HTMLElement;
        const view = (editor.element.querySelector(".cm-editor") as HTMLElement);
        Object.defineProperty(view, "getBoundingClientRect", {
            configurable: true,
            value: () => ({height: 100, width: 100, top: 0, left: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({})}),
        });
        pad.setPointerCapture = vi.fn();
        pad.hasPointerCapture = vi.fn(() => true);
        pad.releasePointerCapture = vi.fn();
        const pointer = (type: string, clientY: number) => {
            const event = new MouseEvent(type, {bubbles: true, clientY});
            Object.defineProperty(event, "pointerId", {value: 1});
            return event as unknown as PointerEvent;
        };

        pad.dispatchEvent(pointer("pointerdown", 100));
        pad.dispatchEvent(pointer("pointermove", 150));
        expect((editor.element.querySelector(".cm-editor") as HTMLElement).style.height).toBe("150px");
        pad.dispatchEvent(pointer("pointerup", 150));
        expect(pad.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it("marks the wrapper when the browser fixes the height", async () => {
        const editor = createCodeEditor({value: ""});
        const view = editor.element.querySelector<HTMLElement>(".cm-editor") as HTMLElement;
        view.style.height = "240px";
        await vi.waitFor(() => expect(editor.element.classList.contains("bis-code--manual")).toBe(true));
    });
});
