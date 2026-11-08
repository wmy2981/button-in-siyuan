import {describe, expect, it, vi} from "vitest";
import {describeButtonAction, openButtonBlockManager} from "../src/buttonManager";
import {serializeButtonConfig} from "../src/buttonBlock";
import {Dialog, fetchSyncPost, platformUtils, showMessage} from "./mocks/siyuan";
import {makeConfig, makeContext} from "./helpers";
import {setMobileSafeMode} from "../src/safeMode";

vi.mock("../src/editDialog", () => ({openButtonBlockEditor: vi.fn()}));

const configOf = (overrides: Parameters<typeof makeConfig>[0] = {}) => serializeButtonConfig(makeConfig(overrides));

const row = (overrides: Record<string, unknown> = {}) => ({
    id: "20240101000000-abcdefg",
    content: configOf({text: "Alpha"}),
    root_title: "Doc",
    box: "box",
    hpath: "/Doc",
    ...overrides,
});

/** 列表第一行是笔记名字，第二行是「笔记本 · hPath」，所以行内代码依赖这两项。 */
const withNotebook = (notebooks: Array<{id: string, name: string}>) => {
    (window as any).siyuan.notebooks = notebooks;
};

const waitForRows = (count: number) => vi.waitFor(() => {
    expect(document.querySelectorAll(".bis-manager__row")).toHaveLength(count);
});

describe("describeButtonAction", () => {
    it("describes a button without an action", () => {
        expect(describeButtonAction(makeContext(), makeConfig())).toBe("actionNone");
    });

    it("describes a link", () => {
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "link", link: "https://example.com"}})))
            .toBe("actionLink: https://example.com");
    });

    it("describes a script file", () => {
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "file", file: "data/assets/a.js"}})))
            .toBe("actionFile: data/assets/a.js");
    });

    it("shows the first line of an inline script", () => {
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "script", script: "  first();  \nsecond();"}})))
            .toBe("actionScript: first(); …");
    });

    it("does not add an ellipsis for a single-line script", () => {
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "script", script: "first();"}})))
            .toBe("actionScript: first();");
    });

    it("falls back to the inline-script label for an empty script", () => {
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "script", script: "   \nsecond();"}})))
            .toBe("actionScript: managerInlineScript");
    });

    it("describes a command by its name", () => {
        (window as any).siyuan.config.keymap = {general: {globalSearch: {}}};
        (window as any).siyuan.languages = {globalSearch: "Global search"};
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "command", command: "globalSearch"}})))
            .toBe("actionCommand: Global search");
    });

    it("keeps the command id when the command is gone", () => {
        (window as any).siyuan.config.keymap = {general: {}};
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "command", command: "plugin/gone/x"}})))
            .toBe("actionCommand: plugin/gone/x");
    });

    it("describes an agent prompt by its first line", () => {
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "prompt", prompt: "  # 标题  \n第二行"}})))
            .toBe("actionPrompt: # 标题 …");
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "prompt", prompt: "一行"}})))
            .toBe("actionPrompt: 一行");
        expect(describeButtonAction(makeContext(), makeConfig({action: {type: "prompt", prompt: "  "}})))
            .toBe("actionPrompt");
    });
});

describe("openButtonBlockManager", () => {
    it("queries the button blocks with an explicit limit", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openButtonBlockManager(makeContext());
        await vi.waitFor(() => expect(fetchSyncPost).toHaveBeenCalled());
        const [url, rawBody, , processMessage] = fetchSyncPost.mock.calls[0];
        const body = rawBody as {stmt: string};
        expect(url).toBe("/api/query/sql");
        expect(body.stmt).toContain("type = 'custom'");
        expect(body.stmt).toContain("LIMIT 5000");
        expect(processMessage).toBe(false);
    });

    it("lists the parsed rows and sorts them", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [
                row({id: "b", content: configOf({text: "Beta"}), root_title: "Z", hpath: "/Z"}),
                row({id: "a", content: configOf({text: "Alpha"}), root_title: "A", hpath: "/A"}),
                row({id: "c", content: "not json"}),
                row({id: "", content: configOf({text: "No ID"})}),
            ],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(2);
        const titles = Array.from(document.querySelectorAll(".bis-manager__row-title")).map((item) => item.textContent);
        // 行首是笔记名字，不再重复按钮上的文本
        expect(titles).toEqual(["A", "Z"]);
        expect(document.querySelector(".bis-manager__status")?.textContent).toBe("2 managerCount");
    });

    it("shows the notebook and the note path on the second line", async () => {
        withNotebook([{id: "box", name: "My notebook"}]);
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [row({id: "a", content: configOf({text: "Alpha"}), root_title: "Doc A", hpath: "/Doc A"})],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        expect(document.querySelector(".bis-manager__row-meta")?.textContent).toBe("My notebook · /Doc A");
    });

    it("wraps the chip text so a long label can be ellipsized", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [row({id: "a", content: configOf({text: "A very long button label"})})],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        const chip = document.querySelector(".bis-manager__chip");
        expect(chip?.querySelector(".bis-manager__chip-text")?.textContent).toBe("A very long button label");
        expect(chip?.textContent).toBe("A very long button label");
    });

    it("filters by the search box", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [row({id: "a", content: configOf({text: "Alpha"})}), row({id: "b", content: configOf({text: "Beta"})})],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(2);
        const search = document.querySelector<HTMLInputElement>('[data-bis="search"]') as HTMLInputElement;
        search.value = "bet";
        search.dispatchEvent(new Event("input"));
        expect(document.querySelectorAll(".bis-manager__row")).toHaveLength(1);
        expect(document.querySelector(".bis-manager__chip")?.textContent).toBe("Beta");

        search.value = "nothing";
        search.dispatchEvent(new Event("input"));
        expect(document.querySelectorAll(".bis-manager__row")).toHaveLength(0);
        expect(document.querySelector(".bis-manager__hint")?.textContent).toBe("managerEmpty");
    });

    it("filters by the action type", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [
                row({id: "a", content: configOf({text: "Link", action: {type: "link", link: "https://example.com"}})}),
                row({id: "b", content: configOf({text: "Script", action: {type: "script", script: "1;"}})}),
                row({id: "c", content: configOf({text: "None"})}),
            ],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(3);
        const filter = document.querySelector<HTMLSelectElement>('[data-bis="action-filter"]') as HTMLSelectElement;
        filter.value = "script";
        filter.dispatchEvent(new Event("change"));
        expect(document.querySelectorAll(".bis-manager__row")).toHaveLength(1);
        expect(document.querySelector(".bis-manager__chip")?.textContent).toBe("Script");
    });

    it("previews the selected block", async () => {
        withNotebook([{id: "box", name: "My notebook"}]);
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [row({id: "a", content: configOf({text: "Alpha", color: 2}), root_title: "Doc A", hpath: "/A"})],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();

        const preview = document.querySelector(".bis-manager__preview");
        expect(preview?.querySelector(".bis-manager__preview-button")?.textContent).toBe("Alpha");
        expect(preview?.querySelector(".bis-manager__preview-button")?.classList.contains("bis-button-color")).toBe(true);
        const meta = preview?.querySelector(".bis-manager__meta")?.textContent || "";
        expect(meta).toContain("actionNone");
        expect(meta).toContain("/A");
        expect(meta).toContain("My notebook");
        expect(meta).toContain("a");
        // 详情里不再出现 .sy 路径
        expect(meta).not.toContain(".sy");
        expect(Array.from(preview?.querySelectorAll(".bis-manager__actions button") || []).map((button) => button.textContent))
            .toEqual(["managerEdit", "managerLocate"]);
    });

    it("runs the action of the previewed block", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [row({id: "a", content: configOf({text: "Alpha", action: {type: "link", link: "https://example.com"}})})],
        });
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        document.querySelector<HTMLElement>(".bis-manager__preview-button")?.click();
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("https://example.com");
    });

    it("refreshes the row after the editor closes without resetting the scroll", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a", content: configOf({text: "Old"})})]});
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        document.querySelector<HTMLElement>(".bis-manager__actions button")?.click();
        const {openButtonBlockEditor} = await import("../src/editDialog");
        const {onClosed} = vi.mocked(openButtonBlockEditor).mock.calls.at(-1)?.[1] as {onClosed?: () => void};

        const list = document.querySelector<HTMLElement>('[data-bis="list"]') as HTMLElement;
        let scrolled = 40;
        Object.defineProperty(list, "scrollTop", {
            configurable: true,
            get: () => scrolled,
            set: (value: number) => {
                scrolled = value;
            },
        });
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a", content: configOf({text: "New"})})]});
        onClosed?.();

        await vi.waitFor(() => expect(document.querySelector(".bis-manager__chip")?.textContent).toBe("New"));
        // 刷新既不显示「正在读取」，也不把列表带回顶部
        expect(document.querySelector(".bis-manager__hint")).toBeNull();
        expect(list.scrollTop).toBe(40);
    });

    it("opens the editor with the block context", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a", content: configOf({text: "Alpha"})})]});
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        const edit = document.querySelector<HTMLElement>(".bis-manager__actions button");
        edit?.click();
        const {openButtonBlockEditor} = await import("../src/editDialog");
        expect(openButtonBlockEditor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            blockID: "a",
            config: expect.objectContaining({text: "Alpha"}),
            editable: true,
        }));
    });

    it("keeps the manager visible on mobile unless the safe mode is on", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a", content: configOf({text: "Alpha"})})]});
        openButtonBlockManager(makeContext({isMobile: true}));
        await waitForRows(1);
        const managerElement = Dialog.instances.at(-1)?.element as HTMLElement;
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        document.querySelector<HTMLElement>(".bis-manager__actions button")?.click();
        // 安全模式默认关闭：行为与以前一致，管理窗口留在原地（issue #43）
        expect(managerElement.style.display).toBe("");
    });

    it("hides itself while the editor is open when the safe mode is on", async () => {
        setMobileSafeMode(true);
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a", content: configOf({text: "Alpha"})})]});
        openButtonBlockManager(makeContext({isMobile: true}));
        await waitForRows(1);
        const managerElement = Dialog.instances.at(-1)?.element as HTMLElement;
        expect(managerElement.style.display).toBe("");
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        document.querySelector<HTMLElement>(".bis-manager__actions button")?.click();

        // App 里压着满屏管理窗口再建对话框会把 WebView 卡死，安全模式把它摘出渲染树
        expect(managerElement.style.display).toBe("none");
        const {openButtonBlockEditor} = await import("../src/editDialog");
        const {onClosed} = vi.mocked(openButtonBlockEditor).mock.calls.at(-1)?.[1] as {onClosed?: () => void};
        onClosed?.();
        expect(managerElement.style.display).toBe("");
        await vi.waitFor(() => expect(document.querySelector(".bis-manager__chip")?.textContent).toBe("Alpha"));
    });

    it("closes itself and the settings panel before locating the block", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a"})]});
        const onLocate = vi.fn();
        openButtonBlockManager(makeContext(), {onLocate});
        await waitForRows(1);
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        document.querySelectorAll<HTMLElement>(".bis-manager__actions button")[1].click();
        expect(document.querySelector(".b3-dialog")).toBeNull();
        expect(onLocate).toHaveBeenCalledTimes(1);
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("siyuan://blocks/a");
    });

    it("marks the selected row", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [row({id: "a"})]});
        openButtonBlockManager(makeContext());
        await waitForRows(1);
        document.querySelector<HTMLElement>(".bis-manager__row")?.click();
        expect(document.querySelector(".bis-manager__row")?.classList.contains("bis-manager__row--current")).toBe(true);
    });

    it("shows a message when the query fails", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "sql error"});
        openButtonBlockManager(makeContext());
        await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("managerLoadFailed"));
        expect(document.querySelector(".bis-manager__status")?.textContent).toBe("0 managerCount");
    });

    it("goes fullscreen on mobile", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openButtonBlockManager(makeContext({isMobile: true}));
        expect(document.querySelector(".b3-dialog__container")?.classList.contains("bis-dialog-fullscreen")).toBe(true);
    });

    it("closes from the close button", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        openButtonBlockManager(makeContext());
        document.querySelector<HTMLElement>('[data-bis="close"]')?.click();
        expect(document.querySelector(".b3-dialog")).toBeNull();
    });
});
