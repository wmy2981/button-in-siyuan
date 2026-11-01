import {describe, expect, it, vi} from "vitest";
import {createScriptPlugin} from "../src/scriptStorage";

/** 一个最小的插件替身：三个存储方法都记下调用。 */
const makePlugin = () => ({
    name: "button-in-siyuan",
    i18n: {hello: "world"},
    loadData: vi.fn(),
    saveData: vi.fn(),
    removeData: vi.fn(),
    openSetting: vi.fn(function (this: unknown) {
        return this;
    }),
});

describe("createScriptPlugin", () => {
    it("forwards everything except the three storage methods", () => {
        const plugin = makePlugin();
        const proxy = createScriptPlugin(plugin as never);
        expect(proxy.name).toBe("button-in-siyuan");
        expect(proxy.i18n).toEqual({hello: "world"});
        expect(proxy.loadData).not.toBe(plugin.loadData);
    });

    it("binds forwarded methods back to the real plugin instance", () => {
        const plugin = makePlugin();
        const proxy = createScriptPlugin(plugin as never);
        expect(proxy.openSetting()).toBe(plugin);
        expect(plugin.openSetting).toHaveBeenCalledTimes(1);
    });

    describe("loadData", () => {
        it("reads from the storage/ subdirectory", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValue(7);
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.loadData("count")).resolves.toBe(7);
            expect(plugin.loadData).toHaveBeenCalledTimes(1);
            expect(plugin.loadData).toHaveBeenCalledWith("storage/count");
        });

        it("does not double the prefix when the script writes the full name", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValue(1);
            const proxy = createScriptPlugin(plugin as never);
            await proxy.loadData("storage/count");
            expect(plugin.loadData).toHaveBeenCalledWith("storage/count");
        });

        it("trims leading slashes", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValue(1);
            const proxy = createScriptPlugin(plugin as never);
            await proxy.loadData("/count");
            expect(plugin.loadData).toHaveBeenCalledWith("storage/count");
        });

        it("passes the plugin's own settings file through untouched", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValue({});
            const proxy = createScriptPlugin(plugin as never);
            await proxy.loadData("settings");
            expect(plugin.loadData).toHaveBeenCalledWith("settings");
        });

        it("passes an empty name through untouched", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValue(undefined);
            const proxy = createScriptPlugin(plugin as never);
            await proxy.loadData("   ");
            expect(plugin.loadData).toHaveBeenCalledWith("   ");
        });

        it("returns the empty new value when neither location has data", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValueOnce("");
            plugin.loadData.mockResolvedValueOnce(undefined);
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.loadData("count")).resolves.toBe("");
            expect(plugin.loadData.mock.calls).toEqual([["storage/count"], ["count"]]);
            expect(plugin.saveData).not.toHaveBeenCalled();
        });

        it("migrates a legacy file into storage/ and removes the old one", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValueOnce("");
            plugin.loadData.mockResolvedValueOnce(3);
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.loadData("count")).resolves.toBe(3);
            expect(plugin.saveData).toHaveBeenCalledWith("storage/count", 3);
            expect(plugin.removeData).toHaveBeenCalledWith("count");
        });

        it("still returns the legacy value when the migration cannot be written", async () => {
            const plugin = makePlugin();
            plugin.loadData.mockResolvedValueOnce("");
            plugin.loadData.mockResolvedValueOnce(3);
            plugin.saveData.mockRejectedValue(new Error("read-only"));
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.loadData("count")).resolves.toBe(3);
            expect(plugin.removeData).not.toHaveBeenCalled();
        });
    });

    describe("saveData", () => {
        it("writes into storage/ and clears the legacy file", async () => {
            const plugin = makePlugin();
            plugin.saveData.mockResolvedValue("ok");
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.saveData("count", 4)).resolves.toBe("ok");
            expect(plugin.saveData).toHaveBeenCalledWith("storage/count", 4);
            expect(plugin.removeData).toHaveBeenCalledWith("count");
        });

        it("does not fail the save when the legacy file cannot be removed", async () => {
            const plugin = makePlugin();
            plugin.saveData.mockResolvedValue("ok");
            plugin.removeData.mockRejectedValue(new Error("read-only"));
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.saveData("count", 4)).resolves.toBe("ok");
        });

        it("passes the plugin's own settings file through untouched", async () => {
            const plugin = makePlugin();
            plugin.saveData.mockResolvedValue(undefined);
            const proxy = createScriptPlugin(plugin as never);
            await proxy.saveData("settings", {debug: true});
            expect(plugin.saveData).toHaveBeenCalledWith("settings", {debug: true});
            expect(plugin.removeData).not.toHaveBeenCalled();
        });
    });

    describe("removeData", () => {
        it("removes both the new and the legacy file", async () => {
            const plugin = makePlugin();
            plugin.removeData.mockResolvedValue({code: 0});
            const proxy = createScriptPlugin(plugin as never);
            await proxy.removeData("count");
            expect(plugin.removeData.mock.calls).toEqual([["storage/count"], ["count"]]);
        });

        it("returns the result of the new location", async () => {
            const plugin = makePlugin();
            plugin.removeData.mockResolvedValueOnce({code: 0});
            plugin.removeData.mockResolvedValueOnce({code: 404});
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.removeData("count")).resolves.toEqual({code: 0});
        });

        it("keeps going when the legacy removal rejects", async () => {
            const plugin = makePlugin();
            plugin.removeData.mockResolvedValueOnce({code: 0});
            plugin.removeData.mockRejectedValueOnce(new Error("read-only"));
            const proxy = createScriptPlugin(plugin as never);
            await expect(proxy.removeData("count")).resolves.toEqual({code: 0});
        });

        it("passes the plugin's own settings file through untouched", async () => {
            const plugin = makePlugin();
            plugin.removeData.mockResolvedValue({code: 0});
            const proxy = createScriptPlugin(plugin as never);
            await proxy.removeData("settings");
            expect(plugin.removeData).toHaveBeenCalledTimes(1);
            expect(plugin.removeData).toHaveBeenCalledWith("settings");
        });
    });
});
