import {afterEach, describe, expect, it, vi} from "vitest";
import {ensureHighlighter, highlightTokens, isHighlighterReady} from "../src/codeHighlight";
import {ProtyleMethod} from "./mocks/siyuan";

const hljs = () => (window as any).hljs;

/** 模拟宿主还没加载 highlight.js 的窗口。 */
const dropHighlighter = () => {
    delete (window as any).hljs;
};

/** 让宿主的 highlight.js 只把关键字包起来，便于断言区间。 */
const fakeHighlight = () => {
    hljs().highlight = (code: string) => ({
        value: code.replace(/\bconst\b/g, '<span class="hljs-keyword">const</span>'),
    });
};

afterEach(() => {
    vi.useRealTimers();
});

describe("isHighlighterReady", () => {
    it("is true when the host highlighter is loaded", () => {
        expect(isHighlighterReady()).toBe(true);
    });

    it("is false before the host has loaded it", () => {
        dropHighlighter();
        expect(isHighlighterReady()).toBe(false);
    });
});

describe("ensureHighlighter", () => {
    it("resolves right away when the host highlighter is already there", async () => {
        await expect(ensureHighlighter()).resolves.toBe(true);
        expect(ProtyleMethod.highlightRender).not.toHaveBeenCalled();
    });

    it("asks the host to render an offscreen code block and cleans it up", async () => {
        vi.useFakeTimers();
        const instance = hljs();
        dropHighlighter();
        const ensured = ensureHighlighter();
        const host = document.querySelector<HTMLElement>(".code-block");
        expect(host).not.toBeNull();
        expect(host?.getAttribute("aria-hidden")).toBe("true");
        expect(host?.querySelector(".hljs")).not.toBeNull();
        // 宿主渲染器的语言名取自 .hljs 前一个兄弟节点的第一个子元素
        expect(host?.querySelector(".hljs")?.previousElementSibling?.firstElementChild?.textContent)
            .toBe("javascript");
        expect(ProtyleMethod.highlightRender).toHaveBeenCalledWith(host);
        (window as any).hljs = instance;
        await vi.advanceTimersByTimeAsync(50);
        await expect(ensured).resolves.toBe(true);
        expect(document.querySelector(".code-block")).toBeNull();
        expect(hljs()).toBe(instance);
    });

    it("gives up after the timeout, removes the block and can be retried", async () => {
        vi.useFakeTimers();
        const instance = hljs();
        dropHighlighter();
        const ensured = ensureHighlighter();
        await vi.advanceTimersByTimeAsync(3100);
        await expect(ensured).resolves.toBe(false);
        expect(document.querySelector(".code-block")).toBeNull();
        // 失败不缓存：下一次调用会重新请宿主加载
        (window as any).hljs = instance;
        ProtyleMethod.highlightRender.mockClear();
        await expect(ensureHighlighter()).resolves.toBe(true);
        expect(ProtyleMethod.highlightRender).not.toHaveBeenCalled();
    });
});

describe("highlightTokens", () => {
    it("maps the highlight.js classes onto character ranges", () => {
        fakeHighlight();
        expect(highlightTokens("const a = 1;", "javascript")).toEqual([
            {from: 0, to: 5, classes: "hljs-keyword"},
            {from: 5, to: 12, classes: ""},
        ]);
    });

    it("keeps the nesting of the highlight.js output disjoint", () => {
        hljs().highlight = () => ({
            value: '<span class="hljs-string">a<span class="hljs-subst">b</span>c</span>',
        });
        expect(highlightTokens("abc", "javascript")).toEqual([
            {from: 0, to: 1, classes: "hljs-string"},
            {from: 1, to: 2, classes: "hljs-subst"},
            {from: 2, to: 3, classes: "hljs-string"},
        ]);
    });

    it("is empty without text or without a highlighter that knows the language", () => {
        expect(highlightTokens("", "javascript")).toEqual([]);
        expect(highlightTokens("const a = 1;", "rust")).toEqual([]);
        dropHighlighter();
        expect(highlightTokens("const a = 1;", "javascript")).toEqual([]);
    });

    it("keeps the editor usable when the highlighter throws", () => {
        hljs().highlight = () => {
            throw new Error("boom");
        };
        expect(highlightTokens("const a = 1;", "javascript")).toEqual([]);
    });
});
