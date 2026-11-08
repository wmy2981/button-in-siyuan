import {beforeEach, describe, expect, it, vi} from "vitest";
import {openScriptFileEditor} from "../src/scriptFileDialog";
import {Dialog, showMessage} from "./mocks/siyuan";
import {makeContext, makeSettings} from "./helpers";

const mocks = vi.hoisted(() => ({
    readWorkspaceFile: vi.fn(),
    writeWorkspaceFile: vi.fn(),
    openScriptDocs: vi.fn(),
    createCodeEditor: vi.fn(),
}));

vi.mock("../src/scriptFile", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/scriptFile")>();
    return {
        ...actual,
        readWorkspaceFile: mocks.readWorkspaceFile,
        writeWorkspaceFile: mocks.writeWorkspaceFile,
    };
});
vi.mock("../src/scriptDocs", () => ({openScriptDocs: mocks.openScriptDocs}));
vi.mock("../src/codeEditor", () => ({createCodeEditor: mocks.createCodeEditor}));

beforeEach(() => {
    mocks.readWorkspaceFile.mockResolvedValue("const a = 1;");
    mocks.writeWorkspaceFile.mockResolvedValue(undefined);
    mocks.createCodeEditor.mockImplementation((options: {value?: string}) => {
        let value = options.value || "";
        return {
            element: document.createElement("div"),
            getValue: () => value,
            setValue: (next: string) => {
                value = next;
            },
            focus: vi.fn(),
        };
    });
});

const open = async (options: Record<string, unknown> = {}, context = makeContext()) => {
    await openScriptFileEditor(context, {path: "data/assets/a.js", ...options} as never);
    const dialog = Dialog.instances.at(-1);
    if (!dialog) {
        throw new Error("no dialog");
    }
    const field = <T extends HTMLElement>(type: string) => dialog.element.querySelector<T>(`[data-bis="${type}"]`) as T;
    return {dialog, field};
};

describe("openScriptFileEditor", () => {
    it("loads the file into the shared code editor", async () => {
        const {dialog, field} = await open();
        expect(dialog.options.title).toBe("data/assets/a.js");
        expect(mocks.readWorkspaceFile).toHaveBeenCalledWith("data/assets/a.js");
        expect(mocks.createCodeEditor).toHaveBeenCalledWith(expect.objectContaining({value: "const a = 1;", editable: true}));
        expect(field("file-editor").children).toHaveLength(1);
        expect(field("save").classList.contains("fn__none")).toBe(false);
    });

    it("passes the editor settings through", async () => {
        await open({}, makeContext({getSettings: () => makeSettings({codeWrap: "on", codeLigatures: "off"})}));
        expect(mocks.createCodeEditor).toHaveBeenCalledWith(expect.objectContaining({
            codeWrap: "on",
            codeLigatures: "off",
        }));
    });

    it("hides the window below while it is open in safe mode", async () => {
        const below = document.createElement("div");
        document.body.append(below);
        const {dialog} = await open({hideBelow: below});
        expect(below.style.display).toBe("none");
        dialog.destroy();
        expect(below.style.display).toBe("");
    });

    it("shows the read error and opens nothing", async () => {
        mocks.readWorkspaceFile.mockRejectedValue(new Error("file not found"));
        await openScriptFileEditor(makeContext(), {path: "data/assets/a.js"});
        expect(showMessage).toHaveBeenCalledWith("file not found");
        expect(Dialog.instances).toHaveLength(0);
    });

    it("falls back to the localized message for a non-Error read failure", async () => {
        mocks.readWorkspaceFile.mockRejectedValue("nope");
        await openScriptFileEditor(makeContext(), {path: "data/assets/a.js"});
        expect(showMessage).toHaveBeenCalledWith("scriptFileFailed");
    });

    it("writes the editor content back to the file", async () => {
        const {field, dialog} = await open();
        const editor = mocks.createCodeEditor.mock.results[0].value;
        editor.setValue("changed();");
        field("save").click();
        await vi.waitFor(() => expect(mocks.writeWorkspaceFile).toHaveBeenCalledWith("data/assets/a.js", "changed();"));
        expect(dialog.destroyed).toBe(true);
    });

    it("keeps the dialog open when the write fails", async () => {
        mocks.writeWorkspaceFile.mockRejectedValue(new Error("read only"));
        const {field, dialog} = await open();
        field("save").click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("read only"));
        expect(dialog.destroyed).toBe(false);
    });

    it("renders a read-only preview", async () => {
        const {field, dialog} = await open({editable: false});
        expect(field("save").classList.contains("fn__none")).toBe(true);
        expect(field("readonly-tip").classList.contains("fn__none")).toBe(false);
        expect(mocks.createCodeEditor).toHaveBeenCalledWith(expect.objectContaining({editable: false}));
        field("save").click();
        expect(mocks.writeWorkspaceFile).not.toHaveBeenCalled();
        void dialog;
    });

    it("asks before closing a changed file", async () => {
        const {field, dialog} = await open();
        const editor = mocks.createCodeEditor.mock.results[0].value;
        editor.setValue("changed();");
        field("cancel").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(2));
        expect(Dialog.instances.at(-1)?.options.title).toBe("discardChangesTitle");
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="keep"]')?.click();
        expect(dialog.destroyed).toBe(false);

        field("cancel").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(3));
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        expect(dialog.destroyed).toBe(true);
    });

    it("closes directly when the content did not change", async () => {
        const {field, dialog} = await open();
        field("cancel").click();
        expect(Dialog.instances).toHaveLength(1);
        expect(dialog.destroyed).toBe(true);
    });

    it("loads an example from the documentation", async () => {
        const {field} = await open();
        field("docs").click();
        expect(mocks.openScriptDocs).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({editable: true}));
        const {onLoad} = mocks.openScriptDocs.mock.calls.at(-1)?.[1] as {onLoad: (code: string) => void};
        const editor = mocks.createCodeEditor.mock.results[0].value;
        onLoad("example();");
        expect(editor.getValue()).toBe("example();");
        expect(editor.focus).toHaveBeenCalled();
    });

    it("goes fullscreen on mobile", async () => {
        const {dialog} = await open({}, makeContext({isMobile: true}));
        expect(dialog.options.width).toBe("100%");
        expect(dialog.options.height).toBe("100%");
        expect(dialog.element.querySelector(".b3-dialog__container")?.classList.contains("bis-dialog-fullscreen")).toBe(true);
    });
});
