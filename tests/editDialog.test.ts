import {beforeEach, describe, expect, it, vi} from "vitest";
import {openButtonBlockEditor} from "../src/editDialog";
import {makeConfig, makeContext, makeSettings} from "./helpers";
import {Dialog, fetchSyncPost, showMessage} from "./mocks/siyuan";

const mocks = vi.hoisted(() => ({
    updateButtonContentAsync: vi.fn(),
    runAction: vi.fn(),
    setAssetReference: vi.fn(),
    downloadScriptToAssets: vi.fn(),
    removeWorkspaceFile: vi.fn(),
    openScriptDocs: vi.fn(),
    openScriptFileEditor: vi.fn(),
    openScriptFileInfo: vi.fn(),
    openIconPicker: vi.fn(),
    useBottomSheet: vi.fn(() => vi.fn()),
    createCodeEditor: vi.fn(),
}));

vi.mock("../src/buttonBlock", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/buttonBlock")>();
    return {...actual, runAction: mocks.runAction, updateButtonContentAsync: mocks.updateButtonContentAsync};
});
vi.mock("../src/assetReference", () => ({setAssetReference: mocks.setAssetReference}));
vi.mock("../src/scriptFile", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/scriptFile")>();
    return {
        ...actual,
        downloadScriptToAssets: mocks.downloadScriptToAssets,
        removeWorkspaceFile: mocks.removeWorkspaceFile,
    };
});
vi.mock("../src/scriptDocs", () => ({openScriptDocs: mocks.openScriptDocs}));
vi.mock("../src/scriptFileDialog", () => ({openScriptFileEditor: mocks.openScriptFileEditor}));
vi.mock("../src/scriptFileInfo", () => ({openScriptFileInfo: mocks.openScriptFileInfo}));
vi.mock("../src/icon", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/icon")>();
    return {...actual, openIconPicker: mocks.openIconPicker};
});
vi.mock("../src/codeEditor", () => ({createCodeEditor: mocks.createCodeEditor}));
vi.mock("../src/bottomSheet", () => ({useBottomSheet: mocks.useBottomSheet}));

beforeEach(() => {
    mocks.updateButtonContentAsync.mockResolvedValue(true);
    mocks.downloadScriptToAssets.mockResolvedValue("data/assets/downloaded.js");
    mocks.removeWorkspaceFile.mockResolvedValue(undefined);
    mocks.useBottomSheet.mockReturnValue(vi.fn());
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

const open = (options: Record<string, unknown> = {}, context = makeContext()) => {
    openButtonBlockEditor(context, {
        blockID: "20240101000000-abcdefg",
        config: makeConfig({text: "Old"}),
        ...options,
    } as never);
    const dialog = Dialog.instances.at(-1);
    if (!dialog) {
        throw new Error("no dialog");
    }
    const field = <T extends HTMLElement>(type: string) => dialog.element.querySelector<T>(`[data-bis="${type}"]`) as T;
    return {dialog, field, context};
};

const saveAndWait = async (field: (type: string) => HTMLElement, call: ReturnType<typeof vi.fn>) => {
    field("save").click();
    await vi.waitFor(() => expect(call).toHaveBeenCalled());
};

describe("openButtonBlockEditor", () => {
    it("fills the form from the config", () => {
        const {field, dialog} = open({
            config: makeConfig({
                text: "Click",
                icon: "iconPlay",
                color: 3,
                action: {type: "link", link: "https://example.com"},
            }),
        });
        expect((field("text") as HTMLInputElement).value).toBe("Click");
        expect((field("action") as HTMLSelectElement).value).toBe("link");
        expect((field("link") as HTMLInputElement).value).toBe("https://example.com");
        expect(field("icon").textContent).toContain("iconPlay");
        expect(dialog.element.querySelectorAll(".color__square")).toHaveLength(12);
        expect(dialog.element.querySelector(".color__square--current")?.getAttribute("data-bis-color")).toBe("3");
        expect(field("save").classList.contains("fn__none")).toBe(false);
    });

    it("upgrades a legacy script path in the file field", () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "assets/a.js"}})});
        expect((field("file") as HTMLInputElement).value).toBe("data/assets/a.js");
    });

    it("words the fields for a button block", () => {
        const {dialog} = open();
        const labels = Array.from(dialog.element.querySelectorAll(".b3-dialog__content .ft__on-surface"))
            .map((element) => element.textContent);
        expect(labels).toContain("buttonText");
        expect(labels).toContain("buttonIcon");
        expect(labels).toContain("buttonAction");
    });

    it("words the fields for a quick action", () => {
        const {field, dialog} = open({quickAction: true});
        const labels = Array.from(dialog.element.querySelectorAll(".b3-dialog__content .ft__on-surface"))
            .map((element) => element.textContent);
        expect(labels).toContain("topBarTextLabel");
        expect(labels).toContain("topBarIconLabel");
        expect(labels).toContain("topBarActionLabel");
        expect((field("text") as HTMLInputElement).placeholder).toBe("topBarDefaultText");
    });

    it("saves the current form back to the block", async () => {
        const {field, dialog, context} = open();
        (field("text") as HTMLInputElement).value = "  New  ";
        await saveAndWait(field, mocks.updateButtonContentAsync);

        expect(mocks.updateButtonContentAsync).toHaveBeenCalledWith("20240101000000-abcdefg", {
            text: "New",
            icon: "",
            color: undefined,
            action: undefined,
        });
        expect(mocks.setAssetReference).toHaveBeenCalledWith("20240101000000-abcdefg", expect.objectContaining({text: "New"}));
        expect(dialog.destroyed).toBe(true);
        expect(context).toBeDefined();
    });

    it("uses the custom save outlet and skips the asset reference", async () => {
        const onSave = vi.fn(async () => true);
        const {field, dialog} = open({onSave});
        field("save").click();
        await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({text: "Old"})));
        expect(mocks.setAssetReference).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(true);
    });

    it("keeps the dialog open when the custom save fails", async () => {
        const onSave = vi.fn(async () => false);
        const {field, dialog} = open({onSave});
        field("save").click();
        await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
        // 顶栏快捷操作的保存出口自己会给出失败提示，这里不再补一条「按钮块不可编辑」
        expect(showMessage).not.toHaveBeenCalledWith("blockNotEditable");
        expect(dialog.destroyed).toBe(false);
    });

    it("keeps the dialog open when the block cannot be written", async () => {
        mocks.updateButtonContentAsync.mockResolvedValue(false);
        const {field, dialog} = open();
        field("save").click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("blockNotEditable"));
        expect(dialog.destroyed).toBe(false);
    });

    it("rejects an empty link", () => {
        const {field} = open({config: makeConfig({action: {type: "link", link: "x"}})});
        (field("link") as HTMLInputElement).value = "   ";
        field("save").click();
        expect(showMessage).toHaveBeenCalledWith("actionContentRequired");
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
    });

    it("rejects empty script code", () => {
        mocks.createCodeEditor.mockReturnValueOnce({
            element: document.createElement("div"),
            getValue: () => "   ",
            setValue: vi.fn(),
            focus: vi.fn(),
        });
        const {field} = open({config: makeConfig({action: {type: "script", script: "1;"}})});
        field("save").click();
        expect(showMessage).toHaveBeenCalledWith("actionContentRequired");
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
    });

    it("rejects an empty script file path", () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        (field("file") as HTMLInputElement).value = "";
        field("save").click();
        expect(showMessage).toHaveBeenCalledWith("scriptFileNeeded");
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
    });

    it("rejects a script file outside the managed directories", () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        (field("file") as HTMLInputElement).value = "data/elsewhere/a.js";
        field("save").click();
        expect(showMessage).toHaveBeenCalledWith("scriptFileNeeded");
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
    });

    it("normalizes a legacy path on save", async () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "assets/a.js"}})});
        await saveAndWait(field, mocks.updateButtonContentAsync);
        expect(mocks.updateButtonContentAsync).toHaveBeenCalledWith(
            "20240101000000-abcdefg",
            expect.objectContaining({action: {type: "file", file: "data/assets/a.js"}}),
        );
    });

    it("asks before using a remote script and can be cancelled", async () => {
        const {field, dialog} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        (field("file") as HTMLInputElement).value = "https://example.com/a.js";
        field("save").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(2));
        const warning = Dialog.instances.at(-1);
        expect(warning?.options.title).toBe("cloudWarningTitle");
        warning?.element.querySelector<HTMLElement>('[data-bis="cancel"]')?.click();
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(false);
    });

    it("uses a remote script as is", async () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        (field("file") as HTMLInputElement).value = "https://example.com/a.js";
        field("save").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(2));
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="remote"]')?.click();
        await vi.waitFor(() => expect(mocks.updateButtonContentAsync).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({action: {type: "file", file: "https://example.com/a.js"}}),
        ));
    });

    it("downloads a remote script into the asset directory", async () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        (field("file") as HTMLInputElement).value = "https://example.com/a.js";
        field("save").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(2));
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="local"]')?.click();
        await vi.waitFor(() => expect(mocks.updateButtonContentAsync).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({action: {type: "file", file: "data/assets/downloaded.js"}}),
        ));
        expect(showMessage).toHaveBeenCalledWith("cloudDownloaded data/assets/downloaded.js");
    });

    it("reports a failed remote download and stays open", async () => {
        mocks.downloadScriptToAssets.mockRejectedValue(new Error("offline"));
        const {field, dialog} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        (field("file") as HTMLInputElement).value = "https://example.com/a.js";
        field("save").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(2));
        const warning = Dialog.instances.at(-1);
        warning?.element.querySelector<HTMLElement>('[data-bis="local"]')?.click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("cloudDownloadFailed"));
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(false);
        expect(warning?.destroyed).toBe(false);
    });

    it("renders a read-only preview for a locked note", () => {
        const {field, dialog} = open({editable: false});
        expect((field("text") as HTMLInputElement).disabled).toBe(true);
        expect((field("action") as HTMLSelectElement).disabled).toBe(true);
        expect((field("link") as HTMLInputElement).disabled).toBe(true);
        expect((field("file") as HTMLInputElement).readOnly).toBe(true);
        expect(field("save").classList.contains("fn__none")).toBe(true);
        expect(field<HTMLButtonElement>("delete").disabled).toBe(true);
        expect(field<HTMLButtonElement>("run").disabled).toBe(false);
        expect(field<HTMLButtonElement>("file-create").disabled).toBe(true);
        expect(field<HTMLButtonElement>("file-edit").disabled).toBe(false);
        expect(field("readonly-tip").classList.contains("fn__none")).toBe(false);
        field("save").click();
        expect(mocks.updateButtonContentAsync).not.toHaveBeenCalled();
        void dialog;
    });

    it("saves the selected color", async () => {
        const {field, dialog} = open({config: makeConfig({color: 2})});
        const squares = Array.from(dialog.element.querySelectorAll<HTMLElement>(".color__square"));
        squares.find((square) => square.dataset.bisColor === "5")?.click();
        expect(dialog.element.querySelector(".color__square--current")?.getAttribute("data-bis-color")).toBe("5");
        await saveAndWait(field, mocks.updateButtonContentAsync);
        expect(mocks.updateButtonContentAsync).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({color: 5}),
        );
    });

    it("hides and drops the color for the top bar editor", async () => {
        const {field, dialog} = open({config: makeConfig({color: 3}), colorEditable: false});
        expect(field("color-field").classList.contains("fn__none")).toBe(true);
        await saveAndWait(field, mocks.updateButtonContentAsync);
        expect(mocks.updateButtonContentAsync).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({color: undefined}),
        );
        void dialog;
    });

    it("deletes the block after the confirmation", async () => {
        const {field, dialog} = open();
        field("delete").click();
        const confirmDialog = Dialog.instances.at(-1);
        expect(confirmDialog?.options.title).toBe("deleteButtonBlock");
        expect(confirmDialog?.element.querySelector<HTMLElement>('[data-bis="tip"]')?.textContent)
            .toBe("deleteButtonBlockTip");
        confirmDialog?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        await vi.waitFor(() => expect(fetchSyncPost).toHaveBeenCalledWith(
            "/api/block/deleteBlock",
            {id: "20240101000000-abcdefg"},
            undefined,
            false,
        ));
        expect(dialog.destroyed).toBe(true);
    });

    it("uses the custom delete outlet", async () => {
        const onDelete = vi.fn(async () => true);
        const {field, dialog} = open({onDelete});
        field("delete").click();
        const confirmDialog = Dialog.instances.at(-1);
        expect(confirmDialog?.options.title).toBe("deleteTopBarButton");
        expect(confirmDialog?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.textContent)
            .toBe("confirmDelete");
        confirmDialog?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
        expect(dialog.destroyed).toBe(true);
    });

    it("keeps the dialog open when the custom delete fails", async () => {
        const onDelete = vi.fn(async () => false);
        const {field, dialog} = open({onDelete});
        field("delete").click();
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("deleteTopBarButtonFailed"));
        expect(dialog.destroyed).toBe(false);
    });

    it("does not delete in the read-only preview", () => {
        const {field} = open({editable: false});
        field("delete").click();
        expect(Dialog.instances).toHaveLength(1);
    });

    it("runs the form through the custom outlet", () => {
        const onRun = vi.fn();
        const {field} = open({onRun, config: makeConfig({action: {type: "script", script: "run();"}})});
        field("run").click();
        expect(onRun).toHaveBeenCalledWith(expect.objectContaining({action: {type: "script", script: "run();"}}));
    });

    it("runs the form through runAction without a custom outlet", () => {
        const {field, context} = open();
        field("run").click();
        expect(mocks.runAction).toHaveBeenCalledWith(context, expect.objectContaining({
            blockID: "20240101000000-abcdefg",
        }));
    });

    it("asks before closing a changed form", async () => {
        const {field, dialog} = open();
        (field("text") as HTMLInputElement).value = "Changed";
        field("cancel").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(2));
        const confirmDialog = Dialog.instances.at(-1);
        expect(confirmDialog?.options.title).toBe("discardChangesTitle");
        confirmDialog?.element.querySelector<HTMLElement>('[data-bis="keep"]')?.click();
        expect(dialog.destroyed).toBe(false);

        field("cancel").click();
        await vi.waitFor(() => expect(Dialog.instances).toHaveLength(3));
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        expect(dialog.destroyed).toBe(true);
    });

    it("closes directly when nothing changed", () => {
        const {field, dialog} = open();
        field("cancel").click();
        expect(Dialog.instances).toHaveLength(1);
        expect(dialog.destroyed).toBe(true);
    });

    it("picks and clears the icon", () => {
        const {field, dialog} = open({config: makeConfig({icon: "iconPlay"})});
        field("icon").click();
        expect(mocks.openIconPicker).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({selected: "iconPlay"}));
        const {onSelect} = mocks.openIconPicker.mock.calls.at(-1)?.[1] as {onSelect: (icon: string) => void};
        onSelect("iconNew");
        expect(field("icon").textContent).toContain("iconNew");
        field("clear-icon").click();
        expect(field("icon").textContent).toContain("chooseIcon");
        expect(field<HTMLButtonElement>("clear-icon").disabled).toBe(true);
        void dialog;
    });

    it("shows the field of the selected action", () => {
        const {field, dialog} = open();
        const action = field("action") as HTMLSelectElement;
        action.value = "script";
        action.dispatchEvent(new Event("change"));
        expect(field("script-field").classList.contains("fn__none")).toBe(false);
        expect(field("link-field").classList.contains("fn__none")).toBe(true);
        expect(field("file-field").classList.contains("fn__none")).toBe(true);
        expect(dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.style.height)
            .toBe("min(84vh, 720px)");

        action.value = "link";
        action.dispatchEvent(new Event("change"));
        expect(field("link-field").classList.contains("fn__none")).toBe(false);
        expect(field("script-field").classList.contains("fn__none")).toBe(true);
        expect(dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.style.height).toBe("");
    });

    it("opens the create-file dialog and fills the field", () => {
        const {field} = open();
        field("file-create").click();
        expect(mocks.openScriptFileInfo).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({mode: "create"}));
        const {onSaved} = mocks.openScriptFileInfo.mock.calls.at(-1)?.[1] as {onSaved: (path: string) => void};
        onSaved("data/assets/new.js");
        expect((field("file") as HTMLInputElement).value).toBe("data/assets/new.js");
    });

    it("requires a local script before editing the file info", () => {
        const {field} = open();
        field("file-info").click();
        expect(showMessage).toHaveBeenCalledWith("scriptFileNeeded");
        expect(mocks.openScriptFileInfo).not.toHaveBeenCalled();
    });

    it("opens the file info dialog for a local script", () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        field("file-info").click();
        expect(mocks.openScriptFileInfo).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            mode: "edit",
            path: "data/assets/a.js",
        }));
    });

    it("opens the script file editor", () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        field("file-edit").click();
        expect(mocks.openScriptFileEditor).toHaveBeenCalledWith(expect.anything(), {
            path: "data/assets/a.js",
            editable: true,
        });
    });

    it("removes the script file after the confirmation", async () => {
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        field("file-remove").click();
        const confirmDialog = Dialog.instances.at(-1);
        expect(confirmDialog?.options.title).toBe("scriptFileRemoveConfirm");
        // 脚本路径是用户数据，走 textContent 写入
        expect(confirmDialog?.element.querySelector<HTMLElement>('[data-bis="tip"]')?.textContent)
            .toBe("data/assets/a.js");
        confirmDialog?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        await vi.waitFor(() => expect(mocks.removeWorkspaceFile).toHaveBeenCalledWith("data/assets/a.js"));
        expect((field("file") as HTMLInputElement).value).toBe("");
    });

    it("reports a failed script file removal", async () => {
        mocks.removeWorkspaceFile.mockRejectedValue(new Error("read only"));
        const {field} = open({config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        field("file-remove").click();
        Dialog.instances.at(-1)?.element.querySelector<HTMLElement>('[data-bis="confirm"]')?.click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("read only"));
    });

    it("opens the bundled docs and loads an example into the editor", () => {
        const {field} = open();
        field("docs").click();
        expect(mocks.openScriptDocs).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({editable: true}));
        const {onLoad} = mocks.openScriptDocs.mock.calls.at(-1)?.[1] as {onLoad: (code: string) => void};
        onLoad("example();");
        expect((field("action") as HTMLSelectElement).value).toBe("script");
        expect(field("script-field").classList.contains("fn__none")).toBe(false);
    });

    it("uses the bottom sheet on mobile", () => {
        open({}, makeContext({isMobile: true}));
        expect(mocks.useBottomSheet).toHaveBeenCalledTimes(1);
    });

    it("passes the editor settings to the code editor", () => {
        open({}, makeContext({getSettings: () => makeSettings({codeWrap: "on", codeLigatures: "off"})}));
        expect(mocks.createCodeEditor).toHaveBeenCalledWith(expect.objectContaining({
            codeWrap: "on",
            codeLigatures: "off",
            editable: true,
        }));
    });

    it("hides the delete button for a new top bar action", () => {
        const {field} = open({deletable: false});
        expect(field("delete").classList.contains("fn__none")).toBe(true);
    });
});
