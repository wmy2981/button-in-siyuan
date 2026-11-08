import {describe, expect, it, vi} from "vitest";
import {commandLabel, listCommands, pluginCommandId, runCommand} from "../src/commands";
import {getActiveEditor, globalCommand} from "./mocks/siyuan";
import {makeContext} from "./helpers";

/** 宿主的快捷键设置：命令面板列出的内置命令就是这张表里的 general 条目（去掉几个纯快捷键）。 */
const setKeymap = (general: Record<string, {custom?: string; default?: string}>,
                   plugin: Record<string, Record<string, {custom?: string}>> = {}) => {
    (window as any).siyuan.config.keymap = {general, plugin};
};

const setLanguages = (languages: Record<string, string>) => {
    (window as any).siyuan.languages = languages;
};

const pluginHost = (plugins: unknown[]) => makeContext({app: {plugins} as never});

describe("listCommands", () => {
    it("lists the core commands in the order of the keymap", () => {
        setKeymap({
            globalSearch: {default: "⌘P", custom: "⌘⇧P"},
            dailyNote: {default: "⌃5", custom: ""},
        });
        setLanguages({globalSearch: "Global search", dailyNote: "Daily note"});
        expect(listCommands(makeContext())).toEqual([
            {id: "globalSearch", label: "Global search"},
            {id: "dailyNote", label: "Daily note"},
        ]);
    });

    it("skips the shortcuts that are not commands", () => {
        setKeymap({commandPanel: {}, openContextMenu: {}, agentChat: {}, agentSend: {}, config: {}});
        setLanguages({config: "Settings"});
        expect(listCommands(makeContext()).map((item) => item.id)).toEqual(["config"]);
    });

    it("falls back to the key when the host has no translation", () => {
        setKeymap({unknownCommand: {}});
        setLanguages({});
        expect(listCommands(makeContext())).toEqual([{id: "unknownCommand", label: "unknownCommand"}]);
    });

    it("lists the plugin commands after the core ones", () => {
        setKeymap({config: {}}, {demo: {openFile: {custom: "⌥F"}}});
        setLanguages({config: "Settings"});
        const context = pluginHost([{
            name: "demo",
            displayName: "Demo",
            i18n: {openFile: "Open a file"},
            commands: [{langKey: "openFile"}],
        }]);
        expect(listCommands(context)).toEqual([
            {id: "config", label: "Settings"},
            {id: pluginCommandId("demo", "openFile"), label: "Demo: Open a file"},
        ]);
    });

    it("prefers the command's own text and falls back to its key", () => {
        const context = pluginHost([{
            name: "demo",
            displayName: "Demo",
            commands: [{langKey: "titled", langText: "Titled"}, {langKey: "untranslated"}],
        }]);
        expect(listCommands(context).map((item) => item.label))
            .toEqual(["Demo: Titled", "Demo: untranslated"]);
    });

    it("returns nothing when the host exposes neither keymap nor plugins", () => {
        delete (window as any).siyuan.config.keymap;
        expect(listCommands(makeContext())).toEqual([]);
    });
});

describe("commandLabel", () => {
    it("uses the listed label", () => {
        setKeymap({config: {}});
        setLanguages({config: "Settings"});
        expect(commandLabel(makeContext(), "config")).toBe("Settings");
    });

    it("keeps the id of a command that is no longer registered", () => {
        setKeymap({});
        expect(commandLabel(makeContext(), "plugin/demo/gone")).toBe("plugin/demo/gone");
    });

    it("is empty when nothing is bound", () => {
        expect(commandLabel(makeContext(), "")).toBe("");
    });
});

describe("runCommand", () => {
    it("hands core commands to the host", () => {
        vi.mocked(globalCommand).mockReturnValue(true);
        const context = makeContext();
        expect(runCommand(context, "globalSearch")).toBe(true);
        expect(globalCommand).toHaveBeenCalledWith("globalSearch", context.app);
    });

    it("reports a core command the host did not handle", () => {
        vi.mocked(globalCommand).mockReturnValue(false);
        expect(runCommand(makeContext(), "search")).toBe(false);
    });

    it("runs a plugin command through its callback", () => {
        const callback = vi.fn();
        const context = pluginHost([{name: "demo", displayName: "Demo", commands: [{langKey: "open", callback}]}]);
        expect(runCommand(context, pluginCommandId("demo", "open"))).toBe(true);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0]).toMatchObject({source: "commandPanel", focus: "global"});
        expect(globalCommand).not.toHaveBeenCalled();
    });

    it("passes the active editor to an editor-only command", () => {
        const protyle = {element: document.createElement("div")};
        vi.mocked(getActiveEditor).mockReturnValue({protyle} as never);
        const editorCallback = vi.fn();
        const context = pluginHost([{name: "demo", displayName: "Demo",
            commands: [{langKey: "edit", editorCallback}]}]);
        expect(runCommand(context, pluginCommandId("demo", "edit"))).toBe(true);
        expect(editorCallback.mock.calls[0][0]).toBe(protyle);
        expect(editorCallback.mock.calls[0][1]).toMatchObject({focus: "editor", protyle});
    });

    it("runs a command that only provides execute", () => {
        const execute = vi.fn();
        const context = pluginHost([{name: "demo", displayName: "Demo", commands: [{langKey: "run", execute}]}]);
        expect(runCommand(context, pluginCommandId("demo", "run"))).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("reports a plugin command that is not registered right now", () => {
        expect(runCommand(pluginHost([]), pluginCommandId("demo", "open"))).toBe(false);
    });

    it("reports a plugin command with no callback at all", () => {
        const context = pluginHost([{name: "demo", displayName: "Demo", commands: [{langKey: "empty"}]}]);
        expect(runCommand(context, pluginCommandId("demo", "empty"))).toBe(false);
    });

    it("ignores an empty command", () => {
        expect(runCommand(makeContext(), "  ")).toBe(false);
        expect(globalCommand).not.toHaveBeenCalled();
    });
});
