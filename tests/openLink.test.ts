import {describe, expect, it, vi} from "vitest";
import {openLink, resolvePdfAssetLink} from "../src/openLink";
import {
    Constants,
    fetchPost,
    getBackend,
    getFrontend,
    openTab,
    platformUtils,
    showMessage,
} from "./mocks/siyuan";
import {makeContext} from "./helpers";

/** 其他插件的 eventBus：返回值表示「没人接管」；false 表示某个插件 preventDefault 了。 */
const makeApp = (results: boolean[] = []) => ({
    plugins: results.map((result) => ({eventBus: {emit: vi.fn(() => result)}})),
});

/** 默认挂一个不接管事件的插件：真实环境里 app.plugins 不会为空。 */
const contextWith = (results: boolean[] = [true]) => makeContext({app: makeApp(results) as never});

describe("resolvePdfAssetLink", () => {
    it("returns a non-pdf address untouched", () => {
        expect(resolvePdfAssetLink("assets/a.png?page=3")).toEqual({linkAddress: "assets/a.png?page=3"});
        expect(resolvePdfAssetLink("https://example.com/a.pdf?page=3"))
            .toEqual({linkAddress: "https://example.com/a.pdf?page=3"});
    });

    it("extracts the page number from a local pdf", () => {
        expect(resolvePdfAssetLink("assets/a.pdf?page=3")).toEqual({linkAddress: "assets/a.pdf", pdfParams: 3});
    });

    it("keeps the other query parameters", () => {
        expect(resolvePdfAssetLink("assets/a.pdf?page=3&box=1"))
            .toEqual({linkAddress: "assets/a.pdf?box=1", pdfParams: 3});
    });

    it("drops the hash from the address", () => {
        expect(resolvePdfAssetLink("assets/a.pdf?page=3#fragment"))
            .toEqual({linkAddress: "assets/a.pdf", pdfParams: 3});
    });

    it("recognises a pdf annotation path", () => {
        expect(resolvePdfAssetLink("assets/a.pdf/20240101000000-abcdefg"))
            .toEqual({linkAddress: "assets/a.pdf", pdfParams: "20240101000000-abcdefg"});
    });

    it("keeps a nested asset path", () => {
        expect(resolvePdfAssetLink("assets/folder/a.pdf?page=2"))
            .toEqual({linkAddress: "assets/folder/a.pdf", pdfParams: 2});
    });

    it("matches the pdf suffix case-insensitively", () => {
        expect(resolvePdfAssetLink("assets/a.PDF?page=1")).toEqual({linkAddress: "assets/a.PDF", pdfParams: 1});
    });

    it("ignores a non-numeric page", () => {
        expect(resolvePdfAssetLink("assets/a.pdf?page=abc")).toEqual({linkAddress: "assets/a.pdf"});
    });

    it("decodes an encoded page number", () => {
        expect(resolvePdfAssetLink("assets/a.pdf?page=%33")).toEqual({linkAddress: "assets/a.pdf", pdfParams: 3});
        expect(resolvePdfAssetLink("assets/a.pdf?page=1+2")).toEqual({linkAddress: "assets/a.pdf", pdfParams: 1});
    });

    it("handles a page key without a value", () => {
        expect(resolvePdfAssetLink("assets/a.pdf?page")).toEqual({linkAddress: "assets/a.pdf"});
    });

    it("only rewrites assets/ pdf paths", () => {
        expect(resolvePdfAssetLink("data/assets/a.pdf?page=3"))
            .toEqual({linkAddress: "data/assets/a.pdf?page=3"});
    });
});

describe("openLink", () => {
    it("ignores an empty link", () => {
        openLink(contextWith(), "   ");
        expect(platformUtils.openByMobile).not.toHaveBeenCalled();
        expect(openTab).not.toHaveBeenCalled();
    });

    it("adds https to an address without a protocol", () => {
        const context = contextWith();
        openLink(context, "example.com");
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("https://example.com");
    });

    it("keeps an address that already has a protocol", () => {
        openLink(contextWith(), "https://example.com/a");
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("https://example.com/a");
    });

    it("lets the host handle siyuan:// links", () => {
        openLink(contextWith(), "siyuan://blocks/20240101000000-abcdefg");
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("siyuan://blocks/20240101000000-abcdefg");
    });

    it("sends a cancelable open-link event to every plugin first", () => {
        const context = contextWith();
        const event = new MouseEvent("click");
        openLink(context, "example.com", event);
        expect(context.app.plugins[0].eventBus.emit).toHaveBeenCalledWith("open-link", {
            href: "https://example.com",
            originalHref: "example.com",
            event,
        });
    });

    it("does not open the link when another plugin takes it over", () => {
        openLink(contextWith([false]), "example.com");
        expect(platformUtils.openByMobile).not.toHaveBeenCalled();
    });

    it("unescapes HTML entities before opening", () => {
        (window as any).Lute.UnEscapeHTMLStr = (value: string) => value.replace(/&amp;/g, "&");
        openLink(contextWith(), "https://example.com?a=1&amp;b=2");
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("https://example.com?a=1&b=2");
    });

    it("opens a local asset in a tab according to the configured action", () => {
        openLink(contextWith(), "assets/a.png");
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({
            asset: {path: "assets/a.png"},
            position: "right",
        }));
    });

    it("follows the alt-click configuration", () => {
        openLink(contextWith(), "assets/a.png", new MouseEvent("click", {altKey: true}));
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({asset: {path: "assets/a.png"}}));
        expect(openTab.mock.calls[0][0].position).toBeUndefined();
    });

    it("opens a pdf page in the pdf tab", () => {
        openLink(contextWith(), "assets/a.pdf?page=3");
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({pdf: {path: "assets/a.pdf", page: 3}}));
    });

    it("opens a pdf annotation by id", () => {
        openLink(contextWith(), "assets/a.pdf/20240101000000-abcdefg");
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({
            pdf: {path: "assets/a.pdf", id: "20240101000000-abcdefg"},
        }));
    });

    it("honours the bottom and background actions", () => {
        (window as any).siyuan.config.editor.assetOpen.click = "bottom";
        openLink(contextWith(), "assets/a.png");
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({position: "bottom"}));

        openTab.mockClear();
        (window as any).siyuan.config.editor.assetOpen.click = "background";
        openLink(contextWith(), "assets/a.png");
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({keepCursor: true}));
    });

    it("falls back to the current tab for new-window", () => {
        (window as any).siyuan.config.editor.assetOpen.click = "new-window";
        openLink(contextWith(), "assets/a.png");
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({asset: {path: "assets/a.png"}}));
    });

    it("hands a non-previewable resource to the system", () => {
        fetchPost.mockImplementation((_url, _data, callback) => callback?.({code: 0, data: ""}));
        openLink(contextWith(), "assets/a.bin");
        expect(openTab).not.toHaveBeenCalled();
        expect(showMessage).toHaveBeenCalledWith("assetOpenFailed");
    });

    it("keeps the folder action for a non-previewable resource", () => {
        const send = vi.fn();
        (window as any).require = () => ({ipcRenderer: {send}});
        fetchPost.mockImplementation((_url, _data, callback) => callback?.({code: 0, data: "/abs/a.bin"}));
        openLink(contextWith(), "assets/a.bin", new MouseEvent("click", {ctrlKey: true}));
        expect(send).toHaveBeenCalledWith(Constants.SIYUAN_CMD, {cmd: "showItemInFolder", filePath: "/abs/a.bin"});
    });

    it("resolves the asset path through the kernel before using the shell", () => {
        const send = vi.fn();
        (window as any).require = () => ({ipcRenderer: {send}});
        fetchPost.mockImplementation((_url, _data, callback) => callback?.({code: 0, data: "/abs/a.png"}));
        openLink(contextWith(), "assets/a.png", new MouseEvent("click", {shiftKey: true}));
        expect(fetchPost).toHaveBeenCalledWith("/api/asset/resolveAssetPath", {path: "assets/a.png"}, expect.any(Function));
        expect(send).toHaveBeenCalledWith(Constants.SIYUAN_CMD, {cmd: "openPath", filePath: "/abs/a.png"});
    });

    it("shows the kernel message when the asset path cannot be resolved", () => {
        (window as any).require = () => ({ipcRenderer: {send: vi.fn()}});
        fetchPost.mockImplementation((_url, _data, callback) => callback?.({code: -1, msg: "no such asset"}));
        openLink(contextWith(), "assets/a.png", new MouseEvent("click", {shiftKey: true}));
        expect(showMessage).toHaveBeenCalledWith("no such asset");
    });

    it("converts a file:// path for the Windows shell", () => {
        const send = vi.fn();
        (window as any).require = () => ({ipcRenderer: {send}});
        openLink(contextWith(), "file:///C:/dir/a.png", new MouseEvent("click", {shiftKey: true}));
        expect(send).toHaveBeenCalledWith(Constants.SIYUAN_CMD, {cmd: "openPath", filePath: "C:\\dir\\a.png"});
    });

    it("sends a cancelable open-asset event before opening a local asset", () => {
        const context = contextWith();
        openLink(context, "assets/a.png");
        expect(context.app.plugins[0].eventBus.emit).toHaveBeenCalledWith("open-asset", expect.objectContaining({
            path: "assets/a.png",
            action: "right",
        }));
    });

    it("does not open a local asset when another plugin takes it over", () => {
        openLink(contextWith([false]), "assets/a.png");
        expect(openTab).not.toHaveBeenCalled();
    });

    it("hands a local asset to the host mobile logic", () => {
        getFrontend.mockReturnValue("mobile");
        openLink(contextWith(), "assets/a.png");
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("assets/a.png");
        expect(openTab).not.toHaveBeenCalled();
    });

    it("hands a local pdf to the native mobile reader", () => {
        getFrontend.mockReturnValue("mobile");
        openLink(contextWith(), "assets/a.pdf?page=2");
        // 移动端插件没有 PDF 阅读器入口，与宿主一样交给原生打开
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("assets/a.pdf");
        expect(openTab).not.toHaveBeenCalled();
    });

    it("falls back to the current tab without a local file system", () => {
        getFrontend.mockReturnValue("browser-desktop");
        openLink(contextWith(), "assets/a.png", new MouseEvent("click", {shiftKey: true}));
        expect(openTab).toHaveBeenCalledWith(expect.objectContaining({asset: {path: "assets/a.png"}}));
    });

    it("recognises Windows drive letters as local paths", () => {
        getBackend.mockReturnValue("windows");
        (window as any).require = () => ({ipcRenderer: {send: vi.fn()}});
        openLink(contextWith(), "C:\\dir\\a.png", new MouseEvent("click", {shiftKey: true}));
        expect(openTab).not.toHaveBeenCalled();
    });

    it("recognises a Unix absolute path as local on non-Windows backends", () => {
        getBackend.mockReturnValue("linux");
        (window as any).require = () => ({ipcRenderer: {send: vi.fn()}});
        openLink(contextWith(), "/home/user/a.png", new MouseEvent("click", {shiftKey: true}));
        expect(openTab).not.toHaveBeenCalled();
    });

    it("treats a relative address as an external link", () => {
        openLink(contextWith(), "a.png");
        expect(platformUtils.openByMobile).toHaveBeenCalledWith("https://a.png");
    });
});
