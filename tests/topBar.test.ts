import {describe, expect, it, vi} from "vitest";
import {TOPBAR_DIR, loadTopBarActions, openTopBarManager, openTopBarMenu, removeTopBarAction, writeTopBarAction} from "../src/topBar";
import {openButtonBlockEditor} from "../src/editDialog";
import {fetchSyncPost, Menu, platformUtils, showMessage} from "./mocks/siyuan";
import {makeConfig, makeContext, readFileText, textResponse} from "./helpers";

// 管理器只通过这个入口开编辑窗口，换成替身就能看到它拿到的初始表单值
vi.mock("../src/editDialog", () => ({openButtonBlockEditor: vi.fn()}));

const topBarPath = (name: string) => `${TOPBAR_DIR}/${name}`;

/** 让 getFile 按路径返回指定内容；`files` 里没有的路径返回 202。 */
const mockFiles = (files: Record<string, string>) => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (url !== "/api/file/getFile") {
            throw new Error(`unexpected fetch: ${String(url)}`);
        }
        const path = JSON.parse(String((init as RequestInit).body)).path as string;
        if (!(path in files)) {
            return new Response(JSON.stringify({code: -1, msg: "not found"}), {status: 202});
        }
        return textResponse(files[path]);
    });
};

const configJson = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    text: "Quick",
    icon: "iconZap",
    action: {type: "link", link: "https://example.com"},
    ...overrides,
});

describe("loadTopBarActions", () => {
    it("returns an empty list when the directory does not exist", async () => {
        fetchSyncPost.mockResolvedValue({code: 404, msg: "no such directory"});
        await expect(loadTopBarActions(makeContext())).resolves.toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("lists only json files, sorted by name, and parses each config", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [
                {name: "b.json", isDir: false},
                {name: "a.json", isDir: false},
                {name: "folder", isDir: true},
                {name: "notes.txt", isDir: false},
                {name: "", isDir: false},
            ],
        });
        mockFiles({
            [topBarPath("a.json")]: configJson({text: "A"}),
            [topBarPath("b.json")]: configJson({text: "B", icon: ""}),
        });
        const actions = await loadTopBarActions(makeContext());
        expect(actions.map((action) => action.fileName)).toEqual(["a.json", "b.json"]);
        expect(actions[0].config).toEqual({
            text: "A",
            icon: "iconZap",
            action: {type: "link", link: "https://example.com"},
        });
        expect(actions[1].config.text).toBe("B");
    });

    it("drops the color field: quick actions never override the button colors", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: configJson({color: 5})});
        const [action] = await loadTopBarActions(makeContext());
        expect(action.config).not.toHaveProperty("color");
    });

    it("skips a file that is not valid JSON", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: "not json"});
        await expect(loadTopBarActions(makeContext())).resolves.toEqual([]);
    });

    it("skips a JSON value that is not an object", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: "[]"});
        await expect(loadTopBarActions(makeContext())).resolves.toEqual([]);
    });

    it("skips an object with none of the known fields", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: JSON.stringify({foo: 1})});
        await expect(loadTopBarActions(makeContext())).resolves.toEqual([]);
    });

    it("falls back to the localized default text", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: JSON.stringify({icon: "iconZap"})});
        const [action] = await loadTopBarActions(makeContext());
        expect(action.config.text).toBe("topBarDefaultText");
    });

    it("skips a file that cannot be read", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}, {name: "b.json"}]});
        mockFiles({[topBarPath("b.json")]: configJson({text: "B"})});
        const actions = await loadTopBarActions(makeContext());
        expect(actions.map((action) => action.fileName)).toEqual(["b.json"]);
    });

    it("reads each file through the kernel file api", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: configJson()});
        await loadTopBarActions(makeContext());
        expect(fetch).toHaveBeenCalledWith("/api/file/getFile", {
            method: "POST",
            body: JSON.stringify({path: topBarPath("a.json")}),
        });
    });
});

describe("writeTopBarAction", () => {
    it("writes a pretty JSON payload without the color field", async () => {
        await writeTopBarAction("a.json", makeConfig({
            text: "Quick",
            icon: "iconZap",
            color: 4,
            action: {type: "link", link: "https://example.com"},
        }));
        expect(fetchSyncPost).toHaveBeenCalledTimes(1);
        const [url, form, , processMessage] = fetchSyncPost.mock.calls[0];
        expect(url).toBe("/api/file/putFile");
        expect(processMessage).toBe(false);
        expect((form as FormData).get("path")).toBe(topBarPath("a.json"));
        expect((form as FormData).get("isDir")).toBe("false");
        const file = (form as FormData).get("file") as File;
        expect(file.name).toBe("a.json");
        expect(JSON.parse(await readFileText(file))).toEqual({
            text: "Quick",
            icon: "iconZap",
            action: {type: "link", link: "https://example.com"},
        });
    });

    it("omits the action when the config has none", async () => {
        await writeTopBarAction("a.json", makeConfig({text: "Only text", icon: ""}));
        const form = fetchSyncPost.mock.calls[0][1] as FormData;
        expect(JSON.parse(await readFileText(form.get("file") as File))).toEqual({text: "Only text", icon: ""});
    });

    it("throws the kernel message", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "read only"});
        await expect(writeTopBarAction("a.json", makeConfig())).rejects.toThrow("read only");
    });

    it("falls back to the url and code", async () => {
        fetchSyncPost.mockResolvedValue({code: 500});
        await expect(writeTopBarAction("a.json", makeConfig())).rejects.toThrow("/api/file/putFile code 500");
    });
});

describe("removeTopBarAction", () => {
    it("removes the file", async () => {
        await removeTopBarAction("a.json");
        expect(fetchSyncPost).toHaveBeenCalledWith(
            "/api/file/removeFile",
            {path: topBarPath("a.json")},
            undefined,
            false,
        );
    });

    it("throws the kernel message", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "no such file"});
        await expect(removeTopBarAction("a.json")).rejects.toThrow("no such file");
    });
});

describe("openTopBarMenu", () => {
    const oneAction = () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: configJson({text: "Quick"})});
    };

    it("shows a disabled hint when there are no quick actions", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        await openTopBarMenu(makeContext());
        const menu = Menu.instances.at(-1);
        expect(menu?.items[0]).toEqual(expect.objectContaining({label: "topBarEmpty", disabled: true}));
    });

    it("lists every action, a separator and the manage entry", async () => {
        oneAction();
        const context = makeContext();
        await openTopBarMenu(context);
        const menu = Menu.instances.at(-1);
        expect(menu?.items).toHaveLength(2);
        expect(menu?.items[0].label).toBe("Quick");
        expect(menu?.items[0].icon).toBe("iconZap");
        expect(menu?.separators).toBe(1);
        expect(menu?.items[1]).toEqual(expect.objectContaining({icon: "iconSettings", label: "topBarManage"}));
    });

    it("runs the action when the menu item is clicked", async () => {
        oneAction();
        await openTopBarMenu(makeContext());
        Menu.instances.at(-1)?.items[0].click();
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("https://example.com");
    });

    it("opens below the top bar icon", async () => {
        oneAction();
        const target = document.createElement("div");
        target.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 40, width: 120, height: 24, toJSON: () => ({}),
        });
        await openTopBarMenu(makeContext(), target);
        expect(Menu.instances.at(-1)?.opened).toEqual({x: 120, y: 40, h: 24, isLeft: true});
    });

    it("falls back to a fixed position without a target", async () => {
        oneAction();
        await openTopBarMenu(makeContext());
        expect(Menu.instances.at(-1)?.opened).toEqual({x: window.innerWidth - 240, y: 48});
    });

    it("shows a message when the directory cannot be read", async () => {
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await openTopBarMenu(makeContext());
        expect(showMessage).toHaveBeenCalledWith("topBarLoadFailed");
        expect(Menu.instances).toHaveLength(0);
    });
});

describe("openTopBarManager", () => {
    const waitForRows = () => vi.waitFor(() => {
        expect(document.querySelectorAll(".bis-manager__row").length).toBeGreaterThan(0);
    });

    it("prefills a new quick action with the default icon", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openTopBarManager(makeContext());
        document.querySelector<HTMLElement>('[data-bis="create"]')?.click();
        expect(openButtonBlockEditor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            blockID: "",
            config: {text: "topBarDefaultText", icon: "iconCirclePlay"},
        }));
    });

    it("keeps the icon of the quick action being edited", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: configJson({text: "Quick", icon: ""})});
        openTopBarManager(makeContext());
        await waitForRows();
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        document.querySelector<HTMLElement>(".bis-manager__actions button")?.click();
        expect(openButtonBlockEditor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            config: expect.objectContaining({text: "Quick", icon: ""}),
            // 编辑窗口按快捷操作的口径取文案，不说「按钮块」
            quickAction: true,
        }));
    });

    it("shows the empty hint and the count", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openTopBarManager(makeContext());
        await vi.waitFor(() => {
            expect(document.querySelector(".bis-manager__hint")?.textContent).toBe("topBarManagerEmpty");
        });
        expect(document.querySelector(".bis-manager__status")?.textContent).toBe("0 topBarCount");
    });

    it("renders a row per action and previews the selected one", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: configJson({text: "Quick"})});
        openTopBarManager(makeContext());
        await waitForRows();
        const row = document.querySelector<HTMLElement>(".bis-manager__row");
        expect(row?.querySelector(".bis-manager__row-title")?.textContent).toBe("Quick");
        expect(row?.querySelector(".bis-manager__row-meta")?.textContent).toBe("a.json");
        row?.click();
        expect(document.querySelector(".bis-manager__action-title")?.textContent).toBe("Quick");
        expect(document.querySelector(".bis-manager__meta")?.textContent).toContain("a.json");
        expect(document.querySelector(".bis-manager__actions button")?.textContent).toBe("topBarEdit");
    });

    it("selects a row from the keyboard", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.json"}]});
        mockFiles({[topBarPath("a.json")]: configJson({text: "Quick"})});
        openTopBarManager(makeContext());
        await waitForRows();
        const row = document.querySelector<HTMLElement>(".bis-manager__row");
        row?.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
        expect(row?.classList.contains("bis-manager__row--current")).toBe(true);
        row?.dispatchEvent(new KeyboardEvent("keydown", {key: " ", bubbles: true}));
        expect(document.querySelector(".bis-manager__action-title")?.textContent).toBe("Quick");
    });

    it("goes fullscreen on mobile", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openTopBarManager(makeContext({isMobile: true}));
        expect(document.querySelector(".b3-dialog__container")?.classList.contains("bis-dialog-fullscreen")).toBe(true);
    });

    it("shows a message when the list cannot be loaded", async () => {
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        openTopBarManager(makeContext());
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("topBarLoadFailed"));
    });

    it("closes from the close button", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openTopBarManager(makeContext());
        document.querySelector<HTMLElement>('[data-bis="close"]')?.click();
        expect(document.querySelector(".b3-dialog")).toBeNull();
    });
});
