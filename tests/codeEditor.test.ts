import {describe, expect, it, vi} from "vitest";
import {createCodeEditor} from "../src/editor/codeEditor";
import {Constants} from "./mocks/siyuan";

/** 宿主 highlight.js 的替身：只把关键字包起来（issue #44 的着色来自它的类名）。 */
const fakeHighlight = () => {
    (window as any).hljs.highlight = (code: string) => ({
        value: code.replace(/\bconst\b/g, '<span class="hljs-keyword">const</span>'),
    });
};

describe("createCodeEditor", () => {
    it("creates an editor with the initial value and the SiYuan wrapper", () => {
        const editor = createCodeEditor({value: "const a = 1;", placeholder: "code"});
        expect(editor.element.classList.contains("bis-code")).toBe(true);
        expect(editor.element.querySelector(".cm-editor")).not.toBeNull();
        expect(editor.getValue()).toBe("const a = 1;");
    });

    it("colours the tokens with the classes the host highlighter emits", () => {
        fakeHighlight();
        const editor = createCodeEditor({value: "const a = 1;"});
        expect(editor.element.querySelector(".cm-content .hljs-keyword")?.textContent).toBe("const");
    });

    it("adds the token colours once the host highlighter arrives", async () => {
        vi.useFakeTimers();
        const instance = (window as any).hljs;
        delete (window as any).hljs;
        const editor = createCodeEditor({value: "const a = 1;"});
        // 编辑器要真的挂在文档里：宿主的高亮到得比编辑器晚时，只有还挂着的编辑器才补着色
        document.body.append(editor.element);
        expect(editor.element.querySelector(".cm-content .hljs-keyword")).toBeNull();
        (window as any).hljs = instance;
        fakeHighlight();
        await vi.advanceTimersByTimeAsync(100);
        expect(editor.element.querySelector(".cm-content .hljs-keyword")?.textContent).toBe("const");
        vi.useRealTimers();
    });

    it("waits for a pause in typing before re-colouring", async () => {
        vi.useFakeTimers();
        fakeHighlight();
        const editor = createCodeEditor({value: "a"});
        document.body.append(editor.element);
        editor.setValue("const b = 2;");
        // 打字期间不重算装饰：每个按键都换一段 DOM，输入法与快速连打会把字符吞掉
        expect(editor.element.querySelector(".cm-content .hljs-keyword")).toBeNull();
        await vi.advanceTimersByTimeAsync(300);
        expect(editor.element.querySelector(".cm-content .hljs-keyword")?.textContent).toBe("const");
        vi.useRealTimers();
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

    it("re-measures when its field becomes visible again", () => {
        const editor = createCodeEditor({value: "a"});
        // 字段在 display: none 里时量不到尺寸，切回可见要重新测量（见 ICodeEditor.refresh）
        expect(() => editor.refresh()).not.toThrow();
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
