import {beforeEach, describe, expect, it, vi} from "vitest";
import ButtonInSiYuan from "../src/index";
import {serializeButtonConfig} from "../src/buttonBlock";
import {DEFAULT_SETTINGS} from "../src/settings";
import {makeI18n} from "./helpers";
import {
    Dialog,
    Menu,
    Setting,
    fetchSyncPost,
    getFrontend,
    saveExportFile,
    showMessage,
} from "./mocks/siyuan";

vi.mock("../src/editDialog", () => ({openButtonBlockEditor: vi.fn()}));

const APP = {plugins: []};

const makePlugin = (i18n = makeI18n()): any => {
    const plugin: any = new ButtonInSiYuan({
        app: APP as never,
        name: "button-in-siyuan",
        displayName: "Button in SiYuan",
        i18n: i18n as never,
    });
    const store = new Map<string, unknown>();
    plugin.loadData.mockImplementation(async (name: string) => store.get(name));
    plugin.saveData.mockImplementation(async (name: string, value: unknown) => {
        store.set(name, value);
    });
    return plugin;
};

const waitForSettings = (plugin: ButtonInSiYuan) => vi.waitFor(() => expect(plugin.setting).toBeDefined());

const customBlock = (options: {
    info?: string;
    blockID?: string;
    content?: string;
} = {}) => {
    const element = document.createElement("div");
    element.setAttribute("data-type", "NodeCustomBlock");
    element.setAttribute("data-info", options.info ?? "button-in-siyuan/button");
    element.setAttribute("data-node-id", options.blockID ?? "20240101000000-abcdefg");
    element.setAttribute("data-content", options.content ?? serializeButtonConfig({text: "Click", icon: ""}));
    return element;
};

const blockMenuEvent = (overrides: Record<string, unknown> = {}) => ({
    detail: {
        menu: new Menu(),
        protyle: {disabled: false},
        blockElements: [customBlock()],
        ...overrides,
    },
});

beforeEach(() => {
    getFrontend.mockReturnValue("desktop");
});

describe("plugin lifecycle", () => {
    it("registers the renderer, the block menu, the top bar and the slash item", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);

        expect(plugin.customBlockRenders.button.render).toEqual(expect.any(Function));
        expect(plugin.eventBus.on).toHaveBeenCalledWith("click-blockicon", expect.any(Function));
        expect(plugin.addTopBar).toHaveBeenCalledWith(expect.objectContaining({
            id: "button-in-siyuan-topbar",
            icon: "iconZap",
            title: "topBarTitle",
        }));
        expect(plugin.protyleSlash).toHaveLength(1);
        expect(plugin.protyleSlash[0].id).toBe("code");
        expect(plugin.protyleSlash[0].html).toContain("b3-list-item__first");
        expect(plugin.protyleSlash[0].filter).toContain("button");
    });

    it("loads the settings, installs the agent skill and syncs the asset references", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);

        expect(plugin.loadData).toHaveBeenCalledWith("settings");
        const urls = fetchSyncPost.mock.calls.map((call) => call[0]);
        expect(urls).toContain("/api/ai/agent/saveSkill");
        expect(urls).toContain("/api/file/putFile");
        const sql = fetchSyncPost.mock.calls.find((call) => call[0] === "/api/query/sql");
        expect((sql?.[1] as {stmt: string})?.stmt).toContain("LIMIT 1000");
        expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("registers the settings panel with one item per setting", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);

        const setting = Setting.instances.at(-1);
        expect(setting?.items).toHaveLength(7);
        expect(setting?.items.map((item) => item.title)).toEqual([
            "settingsOutputMode",
            "settingsDebugMode",
            "settingsCodeWrap",
            "settingsCodeLigatures",
            "settingsAgentSkill",
            "manageButtonBlocks",
            "settingsDownloadSkill",
        ]);
        const outputSelect = setting?.items[0].createActionElement() as HTMLSelectElement;
        expect(outputSelect.tagName).toBe("SELECT");
        expect(Array.from(outputSelect.options).map((option) => option.value)).toEqual([
            "always", "output", "console", "warn", "error", "never",
        ]);
        expect(outputSelect.value).toBe("output");
    });

    it("removes the listeners, the top bar entry and the agent skill on unload", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        fetchSyncPost.mockClear();

        await plugin.onunload();
        expect(plugin.eventBus.off).toHaveBeenCalledWith("click-blockicon", expect.any(Function));
        expect(plugin.removeTopBar).toHaveBeenCalledWith("button-in-siyuan-topbar");
        expect(fetchSyncPost).toHaveBeenCalledWith(
            "/api/ai/agent/removeSkill",
            {name: "button-block"},
            undefined,
            false,
        );
    });

    it("removes only the settings file on uninstall", async () => {
        const plugin = makePlugin();
        await plugin.uninstall();
        expect(plugin.removeData).toHaveBeenCalledWith("settings");
    });

    it("marks the context as mobile on the mobile frontend", async () => {
        getFrontend.mockReturnValue("mobile");
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        expect(plugin.isMobile).toBe(true);
        expect(plugin.protyleSlash[0].filter).toContain("按钮块");
    });
});

describe("settings panel", () => {
    it("saves the settings from the panel and applies the debug flag", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const setting = Setting.instances.at(-1);
        const outputSelect = setting?.items[0].createActionElement() as HTMLSelectElement;
        const debugSwitch = setting?.items[1].createActionElement() as HTMLInputElement;
        // 打开面板时宿主会为每个条目调用 createActionElement，这里照样初始化技能开关
        setting?.items[4].createActionElement();
        outputSelect.value = "error";
        debugSwitch.checked = true;
        setting?.options.confirmCallback();

        await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledWith("settings", {
            ...DEFAULT_SETTINGS,
            outputMode: "error",
            debug: true,
        }));
        await vi.waitFor(() => expect(plugin.settings).toEqual({
            ...DEFAULT_SETTINGS,
            outputMode: "error",
            debug: true,
        }));
    });

    it("keeps the previous settings and warns when the write fails", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        plugin.saveData.mockRejectedValue(new Error("read-only"));
        const setting = Setting.instances.at(-1);
        setting?.options.confirmCallback();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("settingsSaveFailed"));
        expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("removes the skill when the switch is turned off", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        fetchSyncPost.mockClear();
        const setting = Setting.instances.at(-1);
        const switchElement = setting?.items[4].createActionElement() as HTMLInputElement;
        switchElement.checked = false;
        setting?.options.confirmCallback();
        await vi.waitFor(() => expect(fetchSyncPost).toHaveBeenCalledWith(
            "/api/ai/agent/removeSkill",
            {name: "button-block"},
            undefined,
            false,
        ));
    });

    it("installs the skill when the switch is turned on again", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const setting = Setting.instances.at(-1);
        const switchElement = setting?.items[4].createActionElement() as HTMLInputElement;

        switchElement.checked = false;
        setting?.options.confirmCallback();
        await vi.waitFor(() => expect(fetchSyncPost.mock.calls.some((call) => call[0] === "/api/ai/agent/removeSkill")).toBe(true));

        fetchSyncPost.mockClear();
        switchElement.checked = true;
        setting?.options.confirmCallback();
        await vi.waitFor(() => expect(fetchSyncPost.mock.calls.some((call) => call[0] === "/api/ai/agent/saveSkill")).toBe(true));
    });

    it("downloads the skill from the panel", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const setting = Setting.instances.at(-1);
        const button = setting?.items[6].createActionElement() as HTMLButtonElement;
        button.click();
        await vi.waitFor(() => expect(saveExportFile).toHaveBeenCalledWith("/export/button-block.zip"));
    });

    it("warns when the skill download fails", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        fetchSyncPost.mockResolvedValue({code: -1, msg: "zip failed"});
        const setting = Setting.instances.at(-1);
        (setting?.items[6].createActionElement() as HTMLButtonElement).click();
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("downloadSkillFailed"));
    });

    it("opens the button manager from the panel", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const setting = Setting.instances.at(-1);
        (setting?.items[5].createActionElement() as HTMLButtonElement).click();
        expect(Dialog.instances.at(-1)?.options.title).toBe("manageButtonBlocks");
    });
});

describe("slash item", () => {
    it("inserts a button block at the cursor", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const element = document.createElement("div");
        const insert = vi.fn();
        const protyle = {
            protyle: {
                lute: {Md2BlockDOM: vi.fn(() => element)},
            },
            insert,
        };
        plugin.protyleSlash[0].callback(protyle as never, document.createElement("div"));
        expect(protyle.protyle.lute.Md2BlockDOM).toHaveBeenCalledWith(expect.stringContaining(";;;button-in-siyuan/button"));
        expect(insert).toHaveBeenCalledWith(element, true);
    });

    it("skips the insertion when the editor has no lute", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const insert = vi.fn();
        plugin.protyleSlash[0].callback({protyle: {}, insert} as never, document.createElement("div"));
        expect(insert).not.toHaveBeenCalled();
    });
});

describe("block icon menu", () => {
    const runMenu = async (event: unknown, plugin = makePlugin()) => {
        plugin.onload();
        await waitForSettings(plugin);
        (plugin as unknown as {blockIconMenu: (event: unknown) => void}).blockIconMenu(event);
        return plugin;
    };

    it("adds the edit entry for this plugin's button block", async () => {
        const event = blockMenuEvent();
        await runMenu(event);
        const menu = event.detail.menu as Menu;
        expect(menu.items).toHaveLength(1);
        expect(menu.items[0]).toEqual(expect.objectContaining({
            id: "button-in-siyuan-edit",
            icon: "iconEdit",
            label: "editButtonBlock",
        }));
    });

    it("adds nothing when the note is locked", async () => {
        const event = blockMenuEvent({protyle: {disabled: true}});
        await runMenu(event);
        expect((event.detail.menu as Menu).items).toHaveLength(0);
    });

    it("adds nothing for a block from another plugin", async () => {
        const event = blockMenuEvent({blockElements: [customBlock({info: "other/button"})]});
        await runMenu(event);
        expect((event.detail.menu as Menu).items).toHaveLength(0);
    });

    it("adds nothing for a non-custom block", async () => {
        const element = customBlock();
        element.setAttribute("data-type", "NodeParagraph");
        const event = blockMenuEvent({blockElements: [element]});
        await runMenu(event);
        expect((event.detail.menu as Menu).items).toHaveLength(0);
    });

    it("adds nothing when the content is not a button config", async () => {
        const event = blockMenuEvent({blockElements: [customBlock({content: "user data"})]});
        await runMenu(event);
        expect((event.detail.menu as Menu).items).toHaveLength(0);
    });

    it("opens the editor from the menu entry", async () => {
        const event = blockMenuEvent();
        await runMenu(event);
        const menu = event.detail.menu as Menu;
        menu.items[0].click();
        const {openButtonBlockEditor} = await import("../src/editDialog");
        expect(openButtonBlockEditor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            blockID: "20240101000000-abcdefg",
            config: expect.objectContaining({text: "Click"}),
        }));
    });
});

describe("top bar entry", () => {
    it("opens the quick action menu from the icon", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const options = plugin.addTopBar.mock.calls[0][0] as {callback: (event: unknown) => void};
        options.callback({currentTarget: document.createElement("div")});
        await vi.waitFor(() => expect(Menu.instances.length).toBeGreaterThan(0));
        expect(Menu.instances.at(-1)?.items[0]).toEqual(expect.objectContaining({label: "topBarEmpty", disabled: true}));
    });

    it("adds only the manage entry to the context menu", async () => {
        const plugin = makePlugin();
        plugin.onload();
        await waitForSettings(plugin);
        const options = plugin.addTopBar.mock.calls[0][0] as {contextMenu: (menu: Menu) => void};
        const menu = new Menu();
        options.contextMenu(menu);
        expect(menu.items).toHaveLength(1);
        expect(menu.items[0]).toEqual(expect.objectContaining({label: "topBarManage"}));
    });
});
