import {afterEach, describe, expect, it, vi} from "vitest";
import {
    BUTTON_COLOR_INDEXES,
    createButtonElement,
    DEFAULT_BUTTON_ICON,
    isBlockEditable,
    MAX_BUTTON_COLOR,
    MIN_BUTTON_COLOR,
    parseButtonColor,
    parseButtonConfig,
    renderButtonBlock,
    runAction,
    serializeButtonConfig,
    updateButtonContent,
    updateButtonContentAsync,
} from "../src/buttonBlock";
import {openLink} from "../src/openLink";
import {loadActionScript} from "../src/scriptFile";
import {runScript} from "../src/scriptRunner";
import {showMessage, fetchSyncPost} from "./mocks/siyuan";
import {flushPromises, makeConfig, makeContext, makeI18n} from "./helpers";

vi.mock("../src/openLink", () => ({openLink: vi.fn()}));
vi.mock("../src/scriptRunner", () => ({runScript: vi.fn(async () => undefined)}));
vi.mock("../src/scriptFile", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/scriptFile")>();
    return {...actual, loadActionScript: vi.fn()};
});

const DEFAULT_TEXT = "Button";

/** 与思源文档里的结构一致：自定义块挂在 .protyle-wysiwyg 里，渲染器的挂载元素是 .custom-block__content。 */
const mountBlock = (options: {blockID?: string; readonly?: boolean} = {}) => {
    const wysiwyg = document.createElement("div");
    wysiwyg.className = "protyle-wysiwyg";
    wysiwyg.setAttribute("data-readonly", options.readonly ? "true" : "false");
    const block = document.createElement("div");
    block.setAttribute("data-type", "NodeCustomBlock");
    block.setAttribute("data-node-id", options.blockID ?? "20240101000000-abcdefg");
    const element = document.createElement("div");
    element.className = "custom-block__content";
    block.append(element);
    wysiwyg.append(block);
    document.body.append(wysiwyg);
    return {wysiwyg, block, element};
};

afterEach(() => {
    vi.useRealTimers();
});

describe("serializeButtonConfig / parseButtonConfig", () => {
    it("round-trips a full configuration", () => {
        const config = makeConfig({icon: "iconPlay", color: 3, action: {type: "link", link: "https://example.com"}});
        expect(parseButtonConfig(serializeButtonConfig(config), DEFAULT_TEXT)).toEqual(config);
    });

    it("uses the default text for an empty block", () => {
        expect(parseButtonConfig("   ", DEFAULT_TEXT)).toEqual({text: DEFAULT_TEXT, icon: ""});
    });

    it.each(["not json", "{", "null", "[]", "42", "\"text\"", "true"])(
        "returns undefined for the non-config content %p",
        (content) => expect(parseButtonConfig(content, DEFAULT_TEXT)).toBeUndefined(),
    );

    it("returns undefined when the object has none of the known fields", () => {
        expect(parseButtonConfig(JSON.stringify({foo: "bar", nested: {}}), DEFAULT_TEXT)).toBeUndefined();
    });

    it("fills missing fields and drops unknown ones", () => {
        const parsed = parseButtonConfig(JSON.stringify({icon: "iconPlay", extra: true}), DEFAULT_TEXT);
        expect(parsed).toEqual({text: DEFAULT_TEXT, icon: "iconPlay", color: undefined, action: undefined});
    });

    it("accepts a config with only a color", () => {
        expect(parseButtonConfig(JSON.stringify({color: 5}), DEFAULT_TEXT))
            .toEqual({text: DEFAULT_TEXT, icon: "", color: 5, action: undefined});
    });

    it("keeps a text value even when it is empty", () => {
        expect(parseButtonConfig(JSON.stringify({text: ""}), DEFAULT_TEXT)?.text).toBe("");
    });

    it("parses each supported action and drops the extra fields", () => {
        expect(parseButtonConfig(JSON.stringify({action: {type: "link", link: "a", extra: 1}}), DEFAULT_TEXT)?.action)
            .toEqual({type: "link", link: "a"});
        expect(parseButtonConfig(JSON.stringify({action: {type: "script", script: "x"}}), DEFAULT_TEXT)?.action)
            .toEqual({type: "script", script: "x"});
        expect(parseButtonConfig(JSON.stringify({action: {type: "file", file: "data/assets/a.js"}}), DEFAULT_TEXT)?.action)
            .toEqual({type: "file", file: "data/assets/a.js"});
    });

    it.each([
        {type: "link"},
        {type: "link", link: 1},
        {type: "script"},
        {type: "file"},
        {type: "unknown", link: "a"},
        {},
    ])("drops the invalid action %p", (action) => {
        const parsed = parseButtonConfig(JSON.stringify({text: "t", action}), DEFAULT_TEXT);
        expect(parsed?.action).toBeUndefined();
    });
});

describe("parseButtonColor", () => {
    it("accepts the documented range", () => {
        expect(parseButtonColor(MIN_BUTTON_COLOR)).toBe(1);
        expect(parseButtonColor(MAX_BUTTON_COLOR)).toBe(12);
    });

    it.each([0, 13, -1, 1.5, "3", null, undefined, Number.NaN, Infinity])("rejects %p", (value) => {
        expect(parseButtonColor(value)).toBeUndefined();
    });

    it("keeps the palette inside the accepted range and skips 6 and 13", () => {
        expect(BUTTON_COLOR_INDEXES).not.toContain(6);
        expect(BUTTON_COLOR_INDEXES).not.toContain(13);
        BUTTON_COLOR_INDEXES.forEach((index) => {
            expect(index).toBeGreaterThanOrEqual(MIN_BUTTON_COLOR);
            expect(index).toBeLessThanOrEqual(MAX_BUTTON_COLOR);
        });
    });
});

describe("createButtonElement", () => {
    it("uses the native button classes and text", () => {
        const context = makeContext();
        const button = createButtonElement(context, makeConfig({text: "Hello"}));
        expect(button.tagName).toBe("BUTTON");
        expect(button.type).toBe("button");
        expect(button.className).toBe("b3-button b3-button--outline fn__size200");
        expect(button.textContent).toBe("Hello");
        expect(button.querySelector("svg")).toBeNull();
    });

    it("falls back to the localized default text", () => {
        const context = makeContext({i18n: makeI18n({defaultButtonText: "Default"})});
        expect(createButtonElement(context, makeConfig({text: ""})).textContent).toBe("Default");
    });

    it("prepends the icon element when an icon is configured", () => {
        const button = createButtonElement(makeContext(), makeConfig({icon: "iconPlay"}));
        const svg = button.querySelector("svg");
        expect(svg?.getAttribute("class")).toBe("svg");
        expect(svg?.querySelector("use")?.getAttribute("xlink:href")).toBe("#iconPlay");
        expect(button.firstElementChild).toBe(svg);
    });

    it("adds the color class and variable only when a color is set", () => {
        const colored = createButtonElement(makeContext(), makeConfig({color: 3}));
        expect(colored.classList.contains("bis-button-color")).toBe(true);
        expect(colored.style.getPropertyValue("--bis-button-color")).toBe("var(--b3-font-color3)");

        const plain = createButtonElement(makeContext(), makeConfig({color: undefined}));
        expect(plain.classList.contains("bis-button-color")).toBe(false);
        expect(plain.style.getPropertyValue("--bis-button-color")).toBe("");
    });
});

describe("isBlockEditable", () => {
    it("is true when there is no block element", () => {
        expect(isBlockEditable(null)).toBe(true);
    });

    it("is true outside the editor", () => {
        const element = document.createElement("div");
        document.body.append(element);
        expect(isBlockEditable(element)).toBe(true);
    });

    it("follows the host data-readonly marker", () => {
        expect(isBlockEditable(mountBlock({readonly: false}).block)).toBe(true);
        expect(isBlockEditable(mountBlock({readonly: true}).block)).toBe(false);
    });

    it("treats a missing data-readonly attribute as editable", () => {
        const wysiwyg = document.createElement("div");
        wysiwyg.className = "protyle-wysiwyg";
        const block = document.createElement("div");
        wysiwyg.append(block);
        expect(isBlockEditable(block)).toBe(true);
    });
});

describe("updateButtonContent", () => {
    it("returns false when the block is not rendered", () => {
        expect(updateButtonContent("missing-block", makeConfig())).toBe(false);
    });

    it("writes through the setter registered by the renderer", () => {
        const {element} = mountBlock({blockID: "block-1"});
        const setContent = vi.fn(() => true);
        renderButtonBlock(makeContext(), {element, content: serializeButtonConfig(makeConfig()), setContent});
        expect(updateButtonContent("block-1", makeConfig({text: "Changed"}))).toBe(true);
        expect(setContent).toHaveBeenCalledWith(serializeButtonConfig(makeConfig({text: "Changed"})));
    });

    it("returns whatever the host setter returned", () => {
        const {element} = mountBlock({blockID: "block-2"});
        renderButtonBlock(makeContext(), {
            element,
            content: serializeButtonConfig(makeConfig()),
            setContent: () => false,
        });
        expect(updateButtonContent("block-2", makeConfig())).toBe(false);
    });
});

describe("updateButtonContentAsync", () => {
    it("uses the rendered setter when the block is on screen", async () => {
        const {element} = mountBlock({blockID: "block-3"});
        const setContent = vi.fn(() => true);
        renderButtonBlock(makeContext(), {element, content: serializeButtonConfig(makeConfig()), setContent});
        await expect(updateButtonContentAsync("block-3", makeConfig({text: "New"}))).resolves.toBe(true);
        expect(setContent).toHaveBeenCalled();
    });

    it("falls back to the kernel update when the block is not rendered", async () => {
        const config = makeConfig({text: "New"});
        await expect(updateButtonContentAsync("block-4", config)).resolves.toBe(true);
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/block/updateBlock", {
            id: "block-4",
            dataType: "markdown",
            data: `;;;button-in-siyuan/button\n${serializeButtonConfig(config)}\n;;;`,
        }, undefined, false);
    });

    it("reports a kernel error", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "no such block"});
        await expect(updateButtonContentAsync("block-5", makeConfig())).resolves.toBe(false);
    });

    it("reports a rejected kernel call", async () => {
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await expect(updateButtonContentAsync("block-6", makeConfig())).resolves.toBe(false);
    });
});

describe("runAction", () => {
    it("does nothing without an action", () => {
        runAction(makeContext(), {blockID: "b", config: makeConfig()});
        expect(openLink).not.toHaveBeenCalled();
        expect(runScript).not.toHaveBeenCalled();
    });

    it("hands links to openLink together with the click event", () => {
        const context = makeContext();
        const event = new MouseEvent("click", {ctrlKey: true});
        const config = makeConfig({action: {type: "link", link: "https://example.com"}});
        runAction(context, {blockID: "b", config, event});
        expect(openLink).toHaveBeenCalledWith(context, "https://example.com", event);
    });

    it("runs inline scripts with the block context", () => {
        const context = makeContext();
        const element = document.createElement("div");
        runAction(context, {blockID: "b", blockElement: element, config: makeConfig({action: {type: "script", script: "1;"}})});
        expect(runScript).toHaveBeenCalledWith(context, {blockID: "b", blockElement: element, code: "1;"});
    });

    it("loads a script file first and then runs it", async () => {
        vi.mocked(loadActionScript).mockResolvedValue("file();");
        const context = makeContext();
        runAction(context, {blockID: "b", config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        await flushPromises();
        expect(loadActionScript).toHaveBeenCalledWith("data/assets/a.js");
        expect(runScript).toHaveBeenCalledWith(context, {blockID: "b", blockElement: undefined, code: "file();"});
    });

    it("shows the load error and does not execute anything", async () => {
        vi.mocked(loadActionScript).mockRejectedValue(new Error("file not found"));
        runAction(makeContext(), {blockID: "b", config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        await flushPromises();
        expect(showMessage).toHaveBeenCalledWith("file not found");
        expect(runScript).not.toHaveBeenCalled();
    });

    it("falls back to the localized message for a non-Error failure", async () => {
        vi.mocked(loadActionScript).mockRejectedValue("nope");
        const context = makeContext({i18n: makeI18n({scriptFileFailed: "load failed"})});
        runAction(context, {blockID: "b", config: makeConfig({action: {type: "file", file: "data/assets/a.js"}})});
        await flushPromises();
        expect(showMessage).toHaveBeenCalledWith("load failed");
    });
});

describe("renderButtonBlock", () => {
    it("shows the raw content when it is not this plugin config", () => {
        const {element} = mountBlock();
        renderButtonBlock(makeContext(), {element, content: "user data", setContent: vi.fn()});
        expect(element.querySelector("button")).toBeNull();
        expect(element.querySelector("pre")?.textContent).toBe("user data");
    });

    it("renders the button and aligns the asset reference", () => {
        const {element, block} = mountBlock({blockID: "block-7"});
        const context = makeContext();
        const config = makeConfig({text: "Click", color: 2});
        renderButtonBlock(context, {element, content: serializeButtonConfig(config), setContent: vi.fn()});
        const button = element.querySelector("button");
        expect(button?.textContent).toBe("Click");
        expect(button?.classList.contains("bis-button-color")).toBe(true);
        expect(context.syncAssetReference).toHaveBeenCalledWith(block, "block-7", expect.objectContaining({text: "Click"}));
    });

    it("runs the configured action on click", () => {
        const {element} = mountBlock();
        const context = makeContext();
        const config = makeConfig({action: {type: "link", link: "https://example.com"}});
        renderButtonBlock(context, {element, content: serializeButtonConfig(config), setContent: vi.fn()});
        element.querySelector("button")?.dispatchEvent(new MouseEvent("click"));
        expect(openLink).toHaveBeenCalledWith(context, "https://example.com", expect.any(MouseEvent));
    });

    it("opens the editor from the context menu and stops the native menu", () => {
        const {element} = mountBlock({blockID: "block-8"});
        const context = makeContext();
        renderButtonBlock(context, {element, content: serializeButtonConfig(makeConfig()), setContent: vi.fn()});
        const event = new MouseEvent("contextmenu", {bubbles: true, cancelable: true});
        const stop = vi.spyOn(event, "stopPropagation");
        element.querySelector("button")?.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(stop).toHaveBeenCalled();
        expect(context.openEditor).toHaveBeenCalledWith("block-8", expect.any(Object), true);
    });

    it("opens a read-only preview when the note is locked", () => {
        const {element} = mountBlock({blockID: "block-9", readonly: true});
        const context = makeContext();
        renderButtonBlock(context, {element, content: serializeButtonConfig(makeConfig()), setContent: vi.fn()});
        element.querySelector("button")?.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true}));
        expect(context.openEditor).toHaveBeenCalledWith("block-9", expect.any(Object), false);
    });

    it("does not register the editor without a block ID", () => {
        const element = document.createElement("div");
        document.body.append(element);
        const context = makeContext();
        renderButtonBlock(context, {element, content: serializeButtonConfig(makeConfig()), setContent: vi.fn()});
        element.querySelector("button")?.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true}));
        expect(context.openEditor).not.toHaveBeenCalled();
    });

    it("removes its listeners and the content setter on cleanup", () => {
        const {element} = mountBlock({blockID: "block-10"});
        const context = makeContext();
        const config = makeConfig({action: {type: "link", link: "https://example.com"}});
        const cleanup = renderButtonBlock(context, {
            element,
            content: serializeButtonConfig(config),
            setContent: vi.fn(),
        });
        cleanup?.();
        element.querySelector("button")?.dispatchEvent(new MouseEvent("click"));
        expect(openLink).not.toHaveBeenCalled();
        expect(updateButtonContent("block-10", config)).toBe(false);
    });

    it("opens the editor after a long press on mobile and swallows the following click", () => {
        vi.useFakeTimers();
        const {element} = mountBlock({blockID: "block-11"});
        const context = makeContext({isMobile: true});
        const config = makeConfig({action: {type: "link", link: "https://example.com"}});
        renderButtonBlock(context, {element, content: serializeButtonConfig(config), setContent: vi.fn()});
        const button = element.querySelector("button") as HTMLButtonElement;
        button.dispatchEvent(new Event("touchstart"));
        vi.advanceTimersByTime(500);
        expect(context.openEditor).toHaveBeenCalledWith("block-11", expect.any(Object), true);

        button.dispatchEvent(new MouseEvent("click"));
        expect(openLink).not.toHaveBeenCalled();

        vi.advanceTimersByTime(800);
        button.dispatchEvent(new MouseEvent("click"));
        expect(openLink).toHaveBeenCalledTimes(1);
    });

    it("cancels the long press when the finger moves away", () => {
        vi.useFakeTimers();
        const {element} = mountBlock();
        const context = makeContext({isMobile: true});
        renderButtonBlock(context, {element, content: serializeButtonConfig(makeConfig()), setContent: vi.fn()});
        const button = element.querySelector("button") as HTMLButtonElement;
        button.dispatchEvent(new Event("touchstart"));
        button.dispatchEvent(new Event("touchmove"));
        vi.advanceTimersByTime(1000);
        expect(context.openEditor).not.toHaveBeenCalled();
    });

    it("does not bind touch gestures on the desktop", () => {
        const addEventListener = vi.spyOn(HTMLButtonElement.prototype, "addEventListener");
        const {element} = mountBlock();
        renderButtonBlock(makeContext({isMobile: false}), {
            element,
            content: serializeButtonConfig(makeConfig()),
            setContent: vi.fn(),
        });
        const types = addEventListener.mock.calls.map((call) => call[0]);
        expect(types).toContain("click");
        expect(types).toContain("contextmenu");
        expect(types).not.toContain("touchstart");
    });
});

describe("button constants", () => {
    it("keeps the documented defaults", () => {
        expect(DEFAULT_BUTTON_ICON).toBe("iconCirclePlay");
    });
});
