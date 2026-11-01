import {describe, expect, it, vi} from "vitest";
import {openScriptDocs} from "../src/scriptDocs";
import {Dialog, ProtyleMethod, platformUtils, showMessage} from "./mocks/siyuan";
import {makeContext} from "./helpers";

const CODE_HTML = `<pre class="code-block" data-language="javascript"><code class="hljs">first();\n</code></pre>
<pre class="code-block" data-language="javascript"><code>second();</code></pre>
<pre class="code-block" data-language="text"><code>not code</code></pre>`;

/** 装一个能记录收到的 markdown、并返回固定 HTML 的 Lute。 */
const mockLute = (html = CODE_HTML) => {
    const preview = vi.fn((_markdown: string) => html);
    (window as any).Lute = {
        ...(window as any).Lute,
        New: () => ({ProtylePreviewStr: (_id: string, markdown: string) => {
            preview(markdown);
            return html;
        }}),
    };
    return preview;
};

describe("openScriptDocs", () => {
    it("renders the bundled documentation with Lute and highlights it", async () => {
        const preview = mockLute();
        await openScriptDocs(makeContext());
        const dialog = Dialog.instances.at(-1);
        const docs = dialog?.element.querySelector<HTMLElement>('[data-bis="docs"]');
        expect(docs?.innerHTML).toContain("first();");
        expect(preview).toHaveBeenCalledTimes(1);
        expect(preview.mock.calls[0][0]).toContain("# 按钮块的 JavaScript 操作");
        expect(preview.mock.calls[0][0]).not.toContain("{{siyuan-ref}}");
        expect(preview.mock.calls[0][0]).toContain("v3.8.6");
        expect(ProtyleMethod.highlightRender).toHaveBeenCalledWith(docs);
    });

    it("picks the English document for a non-Chinese ui", async () => {
        (window as any).siyuan.config.lang = "en_US";
        const preview = mockLute();
        await openScriptDocs(makeContext());
        expect(preview.mock.calls[0][0]).toContain("# JavaScript actions in button blocks");
    });

    it("picks the Chinese document for a zh ui", async () => {
        (window as any).siyuan.config.lang = "zh-CN";
        const preview = mockLute();
        await openScriptDocs(makeContext());
        expect(preview.mock.calls[0][0]).toContain("# 按钮块的 JavaScript 操作");
    });

    it("shows a message when Lute is not available", async () => {
        (window as any).Lute = undefined;
        await openScriptDocs(makeContext());
        expect(showMessage).toHaveBeenCalledWith("scriptDocsFailed");
        expect(Dialog.instances).toHaveLength(0);
    });

    it("shows a message when Lute renders nothing", async () => {
        mockLute("");
        await openScriptDocs(makeContext());
        expect(showMessage).toHaveBeenCalledWith("scriptDocsFailed");
        expect(Dialog.instances).toHaveLength(0);
    });

    it("wraps every javascript example with load and copy actions", async () => {
        mockLute();
        await openScriptDocs(makeContext(), {onLoad: vi.fn()});
        const wrappers = document.querySelectorAll(".bis-docs-code");
        expect(wrappers).toHaveLength(2);
        wrappers.forEach((wrapper) => {
            const labels = Array.from(wrapper.querySelectorAll("button")).map((button) => button.textContent);
            expect(labels).toEqual(["docsLoad", "copy"]);
        });
    });

    it("hands the example to the caller and closes the dialog", async () => {
        mockLute();
        const onLoad = vi.fn();
        await openScriptDocs(makeContext(), {onLoad});
        const dialog = Dialog.instances.at(-1);
        const first = document.querySelector<HTMLElement>(".bis-docs-code");
        first?.querySelector("button")?.click();
        expect(onLoad).toHaveBeenCalledWith("first();");
        expect(dialog?.destroyed).toBe(true);
    });

    it("copies an example without loading it", async () => {
        mockLute();
        await openScriptDocs(makeContext(), {onLoad: vi.fn()});
        const second = document.querySelectorAll<HTMLElement>(".bis-docs-code")[1];
        second.querySelectorAll("button")[1].click();
        expect(platformUtils.copyPlainText).toHaveBeenCalledWith("second();");
        expect(showMessage).toHaveBeenCalledWith("copied");
    });

    it("hides the load action for a read-only editor", async () => {
        mockLute();
        const onLoad = vi.fn();
        await openScriptDocs(makeContext(), {onLoad, editable: false});
        const wrapper = document.querySelector<HTMLElement>(".bis-docs-code");
        expect(Array.from(wrapper?.querySelectorAll("button") || []).map((button) => button.textContent))
            .toEqual(["copy"]);
        wrapper?.querySelector("button")?.click();
        expect(onLoad).not.toHaveBeenCalled();
    });

    it("does not add a load action when the caller did not provide one", async () => {
        mockLute();
        await openScriptDocs(makeContext());
        const wrapper = document.querySelector<HTMLElement>(".bis-docs-code");
        expect(wrapper?.querySelectorAll("button")).toHaveLength(1);
    });

    it("closes from the close button", async () => {
        mockLute();
        await openScriptDocs(makeContext());
        document.querySelector<HTMLElement>('[data-bis="close"]')?.click();
        expect(Dialog.instances.at(-1)?.destroyed).toBe(true);
    });

    it("uses the localized title", async () => {
        mockLute();
        await openScriptDocs(makeContext());
        expect(Dialog.instances.at(-1)?.options.title).toBe("scriptDocs");
    });
});
