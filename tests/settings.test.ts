import {afterEach, describe, expect, it, vi} from "vitest";
import {isDebugEnabled} from "../src/logger";
import {
    CODE_MODES,
    DEFAULT_SETTINGS,
    loadSettings,
    mergeSettings,
    OUTPUT_MODES,
    removeSettings,
    resolveCodeMode,
    saveSettings,
    SETTINGS_STORAGE,
} from "../src/settings";
import {Plugin} from "./mocks/siyuan";

const makePlugin = (): any => new Plugin();

afterEach(() => {
    vi.restoreAllMocks();
});

describe("mergeSettings", () => {
    it("falls back to the defaults when nothing was saved", () => {
        expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    it.each([null, "", 0, "settings", []])("ignores a saved value of %p", (saved) => {
        expect(mergeSettings(saved)).toEqual(DEFAULT_SETTINGS);
    });

    it("keeps every valid field", () => {
        const saved = {
            outputMode: "never",
            debug: true,
            codeWrap: "on",
            codeLigatures: "off",
            agentSkill: false,
        };
        expect(mergeSettings(saved)).toEqual(saved);
    });

    it("falls back field by field for invalid values", () => {
        expect(mergeSettings({
            outputMode: "sometimes",
            debug: "yes",
            codeWrap: "always",
            codeLigatures: 1,
            agentSkill: null,
        })).toEqual(DEFAULT_SETTINGS);
    });

    it("drops fields that are no longer part of the settings", () => {
        const merged = mergeSettings({outputMode: "error", removedField: true}) as unknown as Record<string, unknown>;
        expect(merged).not.toHaveProperty("removedField");
        expect(Object.keys(merged).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    });

    it("accepts every declared output mode and code mode", () => {
        OUTPUT_MODES.forEach((mode) => expect(mergeSettings({outputMode: mode}).outputMode).toBe(mode));
        CODE_MODES.forEach((mode) => {
            expect(mergeSettings({codeWrap: mode}).codeWrap).toBe(mode);
            expect(mergeSettings({codeLigatures: mode}).codeLigatures).toBe(mode);
        });
    });
});

describe("resolveCodeMode", () => {
    it("lets the explicit values win over the host setting", () => {
        expect(resolveCodeMode("on", false)).toBe(true);
        expect(resolveCodeMode("off", true)).toBe(false);
    });

    it("follows the host setting on auto", () => {
        expect(resolveCodeMode("auto", true)).toBe(true);
        expect(resolveCodeMode("auto", false)).toBe(false);
        expect(resolveCodeMode("auto", undefined)).toBe(false);
        expect(resolveCodeMode(undefined, "yes")).toBe(true);
    });
});

describe("loadSettings", () => {
    it("merges what was saved and applies the debug flag", async () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const plugin = makePlugin();
        plugin.loadData.mockResolvedValue({outputMode: "error", debug: true});
        const settings = await loadSettings(plugin);
        expect(plugin.loadData).toHaveBeenCalledWith(SETTINGS_STORAGE);
        expect(settings).toEqual({...DEFAULT_SETTINGS, outputMode: "error", debug: true});
        expect(isDebugEnabled()).toBe(true);
        expect(info).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalled();
    });

    it("uses the defaults when the file cannot be read", async () => {
        const plugin = makePlugin();
        plugin.loadData.mockRejectedValue(new Error("read-only"));
        await expect(loadSettings(plugin)).resolves.toEqual(DEFAULT_SETTINGS);
    });

    it("uses the defaults when the saved value is garbage", async () => {
        const plugin = makePlugin();
        plugin.loadData.mockResolvedValue("not an object");
        await expect(loadSettings(plugin)).resolves.toEqual(DEFAULT_SETTINGS);
    });
});

describe("saveSettings", () => {
    it("writes the settings and verifies the value that came back", async () => {
        const plugin = makePlugin();
        const next = {...DEFAULT_SETTINGS, outputMode: "console" as const};
        plugin.loadData.mockResolvedValue(next);
        await expect(saveSettings(plugin, next)).resolves.toBe(true);
        expect(plugin.saveData).toHaveBeenCalledWith(SETTINGS_STORAGE, next);
    });

    it("reports a failed write when the value did not survive", async () => {
        const plugin = makePlugin();
        plugin.loadData.mockResolvedValue({});
        await expect(saveSettings(plugin, {...DEFAULT_SETTINGS, debug: true})).resolves.toBe(false);
    });

    it("normalizes the value before comparing, so extra keys do not count as a mismatch", async () => {
        const plugin = makePlugin();
        const written = {...DEFAULT_SETTINGS, debug: true};
        plugin.loadData.mockResolvedValue({...written, removedField: 1});
        await expect(saveSettings(plugin, written)).resolves.toBe(true);
    });

    it("lets a rejected saveData bubble up to the caller", async () => {
        const plugin = makePlugin();
        plugin.saveData.mockRejectedValue(new Error("read-only"));
        await expect(saveSettings(plugin, DEFAULT_SETTINGS)).rejects.toThrow("read-only");
    });
});

describe("removeSettings", () => {
    it("removes only the settings file", async () => {
        const plugin = makePlugin();
        plugin.removeData.mockResolvedValue({code: 0});
        await expect(removeSettings(plugin)).resolves.toBeUndefined();
        expect(plugin.removeData).toHaveBeenCalledWith(SETTINGS_STORAGE);
        expect(plugin.removeData).toHaveBeenCalledTimes(1);
    });

    it("treats a missing settings file as success", async () => {
        const plugin = makePlugin();
        plugin.removeData.mockResolvedValue({code: 404, msg: "not found"});
        await expect(removeSettings(plugin)).resolves.toBeUndefined();
    });

    it("does not throw on an unexpected kernel error", async () => {
        const plugin = makePlugin();
        plugin.removeData.mockResolvedValue({code: 500, msg: "boom"});
        await expect(removeSettings(plugin)).resolves.toBeUndefined();
    });

    it("does not throw when removeData rejects", async () => {
        const plugin = makePlugin();
        plugin.removeData.mockRejectedValue(new Error("disposed"));
        await expect(removeSettings(plugin)).resolves.toBeUndefined();
    });
});
