import {describe, expect, it, vi} from "vitest";
import {createScriptScope} from "../src/scriptApi";
import {
    fetchGet,
    fetchPost,
    fetchSyncPost,
    getAllEditor,
    platformUtils,
    showMessage,
} from "./mocks/siyuan";
import {makeI18n, textResponse} from "./helpers";

const makePlugin = () => ({
    name: "button-in-siyuan",
    loadData: vi.fn(async (_name: string) => undefined),
    saveData: vi.fn(async (_name: string, _value: unknown) => undefined),
    removeData: vi.fn(async (_name: string) => ({code: 0})),
    openSetting: vi.fn(function (this: unknown) {
        return this;
    }),
});

const makeScope = (overrides: Partial<Parameters<typeof createScriptScope>[0]> = {}) => createScriptScope({
    plugin: makePlugin() as never,
    app: {plugins: []} as never,
    i18n: makeI18n({copy: "Copy"}),
    isMobile: false,
    blockID: "20240101000000-abcdefg",
    ...overrides,
});

const valueOf = (scope: ReturnType<typeof createScriptScope>, name: string) => {
    const index = scope.names.indexOf(name);
    if (index < 0) {
        throw new Error(`missing injected name ${name}`);
    }
    return scope.values[index];
};

describe("createScriptScope", () => {
    it("returns one value per injected name, without duplicates", () => {
        const scope = makeScope();
        expect(scope.names).toHaveLength(scope.values.length);
        expect(new Set(scope.names).size).toBe(scope.names.length);
    });

    it("injects the host objects and the block context", () => {
        const scope = makeScope({isMobile: true});
        expect(scope.names).toEqual(expect.arrayContaining([
            "app", "plugin", "siyuan", "Lute", "Constants", "platformUtils", "Protyle", "ProtyleMethod",
            "Dialog", "Menu", "Setting", "Plugin", "fetchPost", "fetchSyncPost", "fetchGet",
            "showMessage", "hideMessage", "confirm", "openInputDialog", "openSetting", "openTab",
            "openWindow", "openMobileFileById", "openAssetPicker", "openEmoji", "openAttributePanel",
            "getActiveEditor", "getActiveTab", "getAllEditor", "getAllModels", "getAllTabs",
            "getModelByDockType", "toggleLeftDock", "toggleRightDock", "toggleBottomDock",
            "isLeftDockVisible", "isRightDockVisible", "isBottomDockVisible", "globalCommand",
            "adaptHotkey", "saveExportFile", "saveLayout", "setEditorFontSize", "adjustEditorFontSize",
            "expandDocTree", "getFrontend", "getBackend", "exitSiYuan", "lockScreen",
            "protyle", "blockID", "isMobile", "i18n",
        ]));
        expect(valueOf(scope, "isMobile")).toBe(true);
        expect(valueOf(scope, "blockID")).toBe("20240101000000-abcdefg");
        expect(valueOf(scope, "i18n")).toEqual({copy: "Copy"});
    });

    it("injects the current siyuan globals by reference", () => {
        const scope = makeScope();
        expect(valueOf(scope, "siyuan")).toBe(window.siyuan);
        expect(valueOf(scope, "Lute")).toBe(window.Lute);
    });

    it("wraps the plugin with the storage proxy", async () => {
        const plugin = makePlugin();
        const scope = makeScope({plugin: plugin as never});
        const injected = valueOf(scope, "plugin") as typeof plugin;
        expect(injected).not.toBe(plugin);
        expect(injected.name).toBe("button-in-siyuan");
        await injected.loadData("count");
        expect(plugin.loadData).toHaveBeenCalledWith("storage/count");
        expect(injected.openSetting()).toBe(plugin);
    });

    it("finds the protyle that contains the clicked block", () => {
        const element = document.createElement("div");
        const editor = {protyle: {element}};
        getAllEditor.mockReturnValue([{protyle: {element: document.body}}, editor]);
        const blockElement = document.createElement("div");
        element.append(blockElement);
        const scope = makeScope({blockElement});
        expect(valueOf(scope, "protyle")).toBe(editor);
    });

    it("leaves protyle undefined when the block is not in an editor", () => {
        getAllEditor.mockReturnValue([{protyle: {element: document.createElement("div")}}]);
        const scope = makeScope({blockElement: document.createElement("div")});
        expect(valueOf(scope, "protyle")).toBeUndefined();
    });

    it("does not look up the editor without a block element", () => {
        makeScope();
        expect(getAllEditor).not.toHaveBeenCalled();
    });

    it("injects the host helpers directly", () => {
        const scope = makeScope();
        expect(valueOf(scope, "showMessage")).toBe(showMessage);
        expect(valueOf(scope, "platformUtils")).toBe(platformUtils);
        expect(valueOf(scope, "fetchSyncPost")).toBe(fetchSyncPost);
    });

    it("forwards fetchPost with a callback to the host implementation", () => {
        const scope = makeScope();
        const callback = vi.fn();
        const headers = {"X-Test": "1"};
        fetchPost.mockImplementation(() => "host-result" as never);
        const result = (valueOf(scope, "fetchPost") as (...args: unknown[]) => unknown)(
            "/api/test", {a: 1}, callback, headers,
        );
        expect(result).toBe("host-result");
        expect(fetchPost).toHaveBeenCalledWith("/api/test", {a: 1}, callback, headers);
    });

    it("uses fetchSyncPost when fetchPost is called without a callback", () => {
        const scope = makeScope();
        fetchSyncPost.mockResolvedValue({code: 0, data: 1});
        const result = (valueOf(scope, "fetchPost") as (...args: unknown[]) => unknown)("/api/test", {a: 1});
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/test", {a: 1}, undefined);
        return expect(result).resolves.toEqual({code: 0, data: 1});
    });

    it("forwards fetchGet with a callback to the host implementation", () => {
        const scope = makeScope();
        const callback = vi.fn();
        (valueOf(scope, "fetchGet") as (...args: unknown[]) => unknown)("/api/test", callback);
        expect(fetchGet).toHaveBeenCalledWith("/api/test", callback);
    });

    it("fetches JSON directly when fetchGet is called without a callback", async () => {
        const scope = makeScope();
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({code: 0}), {
            status: 200,
            headers: {"content-type": "application/json; charset=utf-8"},
        }));
        const result = await (valueOf(scope, "fetchGet") as (url: string) => Promise<unknown>)("/api/test");
        expect(result).toEqual({code: 0});
        expect(fetch).toHaveBeenCalledWith("/api/test", {cache: "no-store"});
    });

    it("returns text when fetchGet gets a non-JSON response", async () => {
        const scope = makeScope();
        vi.mocked(fetch).mockResolvedValue(textResponse("plain"));
        await expect((valueOf(scope, "fetchGet") as (url: string) => Promise<unknown>)("/api/test"))
            .resolves.toBe("plain");
    });
});
