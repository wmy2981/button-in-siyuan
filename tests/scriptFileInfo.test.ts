import {describe, expect, it, vi} from "vitest";
import {openScriptFileInfo} from "../src/scriptFileInfo";
import {Dialog, fetchSyncPost, showMessage} from "./mocks/siyuan";
import {PLUGIN_SCRIPT_DIR} from "../src/pluginPaths";
import {makeContext, readFileText} from "./helpers";

const open = (options: Parameters<typeof openScriptFileInfo>[1], context = makeContext()) => {
    openScriptFileInfo(context, options);
    const dialog = Dialog.instances.at(-1);
    if (!dialog) {
        throw new Error("no dialog");
    }
    const field = <T extends HTMLElement>(type: string) => dialog.element.querySelector<T>(`[data-bis="${type}"]`) as T;
    return {dialog, name: field<HTMLInputElement>("name"), location: field<HTMLSelectElement>("location"), path: field<HTMLElement>("path"), save: field<HTMLButtonElement>("save")};
};

const typeName = (element: HTMLInputElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event("input"));
};

describe("openScriptFileInfo", () => {
    it("starts in the plugin scripts directory with the full path preview", () => {
        const {dialog, path, location} = open({mode: "create", onSaved: vi.fn()});
        expect(dialog.options.title).toBe("scriptFileCreateTitle");
        expect(location.value).toBe("plugin");
        expect(path.textContent).toBe(`${PLUGIN_SCRIPT_DIR}….js`);
    });

    it("updates the preview when the name or the location changes", () => {
        const {name, location, path} = open({mode: "create", onSaved: vi.fn()});
        typeName(name, "hello");
        expect(path.textContent).toBe(`${PLUGIN_SCRIPT_DIR}hello.js`);
        location.value = "assets";
        location.dispatchEvent(new Event("change"));
        expect(path.textContent).toBe("data/assets/hello.js");
    });

    it("creates an empty file and reports its path", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        const onSaved = vi.fn();
        const {name, location, save, dialog} = open({mode: "create", onSaved});
        typeName(name, "hello");
        location.value = "assets";
        location.dispatchEvent(new Event("change"));
        save.click();

        await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith("data/assets/hello.js"));
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/file/readDir", {path: "data/assets"}, undefined, false);
        const put = fetchSyncPost.mock.calls.find((call) => call[0] === "/api/file/putFile");
        expect(put).toBeDefined();
        const form = put?.[1] as FormData;
        expect(form.get("path")).toBe("data/assets/hello.js");
        expect(await readFileText(form.get("file") as File)).toBe("");
        expect(dialog.destroyed).toBe(true);
    });

    it("rejects an invalid file name without touching the kernel", () => {
        const {name, save, dialog} = open({mode: "create", onSaved: vi.fn()});
        typeName(name, "a/b");
        save.click();
        expect(showMessage).toHaveBeenCalledWith("scriptFileInvalidName");
        expect(document.activeElement).toBe(name);
        expect(fetchSyncPost).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(false);
    });

    it("refuses to overwrite an existing file", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "hello.js"}]});
        const onSaved = vi.fn();
        const {name, save, dialog} = open({mode: "create", onSaved});
        typeName(name, "hello");
        save.click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("scriptFileExists"));
        expect(onSaved).not.toHaveBeenCalled();
        expect(fetchSyncPost.mock.calls.some((call) => call[0] === "/api/file/putFile")).toBe(false);
        expect(dialog.destroyed).toBe(false);
    });

    it("closes without doing anything when the path did not change", () => {
        const onSaved = vi.fn();
        const {save, dialog} = open({mode: "edit", path: "data/assets/hello.js", onSaved});
        save.click();
        expect(onSaved).not.toHaveBeenCalled();
        expect(fetchSyncPost).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(true);
    });

    it("renames and moves an existing file", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        const onSaved = vi.fn();
        const {name, location, save} = open({mode: "edit", path: "data/assets/old.js", onSaved});
        expect(name.value).toBe("old");
        expect(location.value).toBe("assets");
        typeName(name, "new");
        save.click();

        await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith("data/assets/new.js"));
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/file/renameFile", {
            path: "data/assets/old.js",
            newPath: "data/assets/new.js",
        }, undefined, false);
    });

    it("saves from the Enter key", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        const onSaved = vi.fn();
        const {name} = open({mode: "create", onSaved});
        typeName(name, "hello");
        name.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
        await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(`${PLUGIN_SCRIPT_DIR}hello.js`));
    });

    it("ignores Enter while an input method is composing", () => {
        const onSaved = vi.fn();
        const {name} = open({mode: "create", onSaved});
        typeName(name, "hello");
        name.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", isComposing: true, bubbles: true}));
        expect(fetchSyncPost).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("shows the kernel message when the write fails", async () => {
        fetchSyncPost
            .mockResolvedValueOnce({code: 0, data: []})
            .mockResolvedValueOnce({code: -1, msg: "read only"});
        const onSaved = vi.fn();
        const {name, save, dialog} = open({mode: "create", onSaved});
        typeName(name, "hello");
        save.click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("read only"));
        expect(onSaved).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(false);
        expect(save.disabled).toBe(false);
    });

    it("uses a full-width dialog on mobile", () => {
        const {dialog} = open({mode: "create", onSaved: vi.fn()}, makeContext({isMobile: true}));
        expect(dialog.options.width).toBe("92vw");
    });

    it("closes from the cancel button", () => {
        const {dialog} = open({mode: "create", onSaved: vi.fn()});
        dialog.element.querySelector<HTMLElement>('[data-bis="cancel"]')?.click();
        expect(dialog.destroyed).toBe(true);
    });
});
