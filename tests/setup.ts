import {afterEach, beforeEach, vi} from "vitest";
import {setDebugEnabled} from "../src/logger";
import {resetSiyuanMock} from "./mocks/siyuan";

/**
 * 每个测试都从「刚打开思源、还没加载插件」的状态开始：
 * - `window.siyuan` 是宿主暴露的前端配置，插件直接读它（语言、内核版本、资源打开方式）；
 * - `window.Lute` 提供块 ID 与 markdown 渲染，测试给一份固定输出；
 * - `fetch` 默认返回空 JSON，任何测试都不该真的联网。
 */
export const resetWindow = () => {
    // 宿主在桌面端注入的 Electron 入口与移动端的 visualViewport，都不该从一个测试漏到下一个
    delete (window as any).require;
    delete (window as any).visualViewport;
    // 安全模式存在 localStorage（不跟随同步），不能从一个用例漏到下一个
    window.localStorage.clear();
    (window as any).siyuan = {
        config: {
            lang: "zh_CN",
            system: {kernelVersion: "3.8.6"},
            editor: {
                assetOpen: {
                    click: "follow-tab",
                    ctrlClick: "folder",
                    altClick: "current",
                    shiftClick: "app",
                },
            },
            fileTree: {noSplitScreenWhenOpenTab: false},
        },
        dialogs: [],
        // 宿主的 lsNotebooks 结果，插件按 box id 换笔记本名字（列表与详情里显示）
        notebooks: [],
    };
    (window as any).Lute = {
        NewNodeID: () => "20240101000000-abcdefg",
        UnEscapeHTMLStr: (value: string) => value,
        New: () => ({
            ProtylePreviewStr: (_id: string, markdown: string) =>
                `<pre class="code-block" data-language="javascript"><code class="hljs">${markdown.length}</code></pre>`,
        }),
    };
    // 宿主的 highlight.js（思源渲染代码块时才加载）。默认「已经在、但什么都不着色」，
    // 需要 token 的测试自己改 highlight 的返回值，见 tests/codeHighlight.test.ts
    (window as any).hljs = {
        getLanguage: (language: string) => (["javascript", "markdown"].includes(language) ? {} : undefined),
        highlight: (code: string) => ({value: code}),
    };
};

beforeEach(() => {
    resetSiyuanMock();
    resetWindow();
    setDebugEnabled(false);
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {status: 200})));
});

/**
 * jsdom 没有布局引擎，CodeMirror 测量文字时会调到 Range 的几何接口。补成空实现，
 * 让编辑器能在测试里正常创建（尺寸相关的断言本来也不该依赖 jsdom 的布局）。
 */
if (typeof Range !== "undefined") {
    if (!Range.prototype.getClientRects) {
        Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    }
    if (!Range.prototype.getBoundingClientRect) {
        Range.prototype.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
            toJSON: () => ({}),
        }) as DOMRect;
    }
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
}

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
});
