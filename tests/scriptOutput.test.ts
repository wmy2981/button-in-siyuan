import {describe, expect, it} from "vitest";
import type {IScriptResult} from "../src/scriptOutput";
import {showScriptOutput, stripAnsi} from "../src/scriptOutput";
import {Dialog, platformUtils, showMessage} from "./mocks/siyuan";
import {makeContext, makeI18n} from "./helpers";

const render = (result: IScriptResult, context = makeContext()) => {
    showScriptOutput(context, result);
    const dialog = Dialog.instances.at(-1);
    if (!dialog) {
        throw new Error("no dialog was opened");
    }
    const output = dialog.element.querySelector<HTMLElement>('[data-bis="output"]');
    if (!output) {
        throw new Error("no output element");
    }
    return {dialog, output};
};

describe("stripAnsi", () => {
    it("removes SGR sequences", () => {
        expect(stripAnsi("\u001b[31mred\u001b[0m plain")).toBe("red plain");
        expect(stripAnsi("no escapes")).toBe("no escapes");
    });

    it("removes the 256-color and true-color forms too", () => {
        expect(stripAnsi("\u001b[38;5;196mx\u001b[0m")).toBe("x");
        expect(stripAnsi("\u001b[38;2;1;2;3mx\u001b[0m")).toBe("x");
    });
});

describe("showScriptOutput", () => {
    it("renders one line per console entry with its level prefix", () => {
        const {output} = render({
            entries: [
                {level: "log", text: "hello"},
                {level: "warn", text: "careful"},
                {level: "error", text: "bad"},
            ],
        });
        const lines = output.querySelectorAll(".bis-script-output__line");
        expect(lines).toHaveLength(3);
        expect(lines[0].textContent).toBe("log: hello");
        expect(lines[1].textContent).toBe("warn: careful");
        expect(lines[2].textContent).toBe("error: bad");
    });

    it("uses the theme colors for the level prefixes", () => {
        const {output} = render({
            entries: [
                {level: "debug", text: "d"},
                {level: "warn", text: "w"},
                {level: "error", text: "e"},
            ],
        });
        const prefixes = output.querySelectorAll<HTMLElement>(".bis-script-output__level");
        expect(prefixes[0].style.color).toBe("var(--b3-theme-on-surface-light)");
        expect(prefixes[1].style.color).toBe("var(--b3-card-warning-color)");
        expect(prefixes[2].style.color).toBe("var(--b3-theme-error)");
    });

    it("renders the return value and the failure with their own colors", () => {
        const {output} = render({entries: [], result: "42", failure: "boom"});
        const lines = output.querySelectorAll<HTMLElement>(".bis-script-output__line");
        expect(lines).toHaveLength(2);
        expect(lines[0].textContent).toBe("returnValue: 42");
        expect(lines[0].style.color).toBe("var(--b3-theme-primary)");
        expect(lines[1].textContent).toBe("errorValue: boom");
        expect(lines[1].style.color).toBe("var(--b3-theme-error)");
    });

    it("shows the no-output hint for an empty result", () => {
        const {output} = render({entries: []});
        expect(output.textContent).toBe("noOutput");
        expect(output.querySelector(".bis-script-output__level")).toBeNull();
    });

    it("renders ANSI colors, backgrounds and text styles", () => {
        const {output} = render({
            entries: [{level: "log", text: "\u001b[31mred\u001b[42mgreen-bg\u001b[1mbold\u001b[3mitalic\u001b[4munder\u001b[9mstrike\u001b[2mdim\u001b[0m plain"}],
        });
        const spans = output.querySelectorAll<HTMLElement>(".bis-script-output__line span");
        const red = Array.from(spans).find((span) => span.textContent === "red");
        expect(red?.style.color).toBe("rgb(224, 85, 97)");

        const green = Array.from(spans).find((span) => span.textContent === "green-bg");
        expect(green?.style.backgroundColor).toBe("rgb(76, 166, 107)");

        const bold = Array.from(spans).find((span) => span.textContent === "bold");
        expect(bold?.style.fontWeight).toBe("600");

        const italic = Array.from(spans).find((span) => span.textContent === "italic");
        expect(italic?.style.fontStyle).toBe("italic");

        const under = Array.from(spans).find((span) => span.textContent === "under");
        expect(under?.style.textDecoration).toContain("underline");

        const strike = Array.from(spans).find((span) => span.textContent === "strike");
        expect(strike?.style.textDecoration).toContain("line-through");

        const dim = Array.from(spans).find((span) => span.textContent === "dim");
        expect(dim?.style.opacity).toBe("0.7");
    });

    it("supports the 256-color and true-color forms", () => {
        const {output} = render({
            entries: [{level: "log", text: "\u001b[38;5;196mred256\u001b[0m \u001b[38;2;10;20;30mtruecolor\u001b[0m"}],
        });
        const spans = output.querySelectorAll<HTMLElement>(".bis-script-output__line span");
        const red256 = Array.from(spans).find((span) => span.textContent === "red256");
        expect(red256?.style.color).toBe("rgb(255, 0, 0)");
        const truecolor = Array.from(spans).find((span) => span.textContent === "truecolor");
        expect(truecolor?.style.color).toBe("rgb(10, 20, 30)");
    });

    it("swaps the colors for inverse text", () => {
        const {output} = render({entries: [{level: "log", text: "\u001b[31;47;7minverse\u001b[0m"}]});
        const span = Array.from(output.querySelectorAll<HTMLElement>("span"))
            .find((item) => item.textContent === "inverse");
        expect(span?.style.color).toBe("rgb(200, 200, 200)");
        expect(span?.style.backgroundColor).toBe("rgb(224, 85, 97)");
    });

    it("keeps the text after a reset unstyled", () => {
        const {output} = render({entries: [{level: "log", text: "\u001b[31mred\u001b[0mplain"}]});
        const spans = Array.from(output.querySelectorAll<HTMLElement>(".bis-script-output__line span"))
            .filter((span) => !span.classList.contains("bis-script-output__level"));
        const plain = spans.find((span) => span.textContent === "plain");
        expect(plain?.style.color).toBe("");
    });

    it("copies the plain text without ANSI escapes", () => {
        const {dialog} = render({
            entries: [{level: "log", text: "\u001b[31mred\u001b[0m"}],
            result: "42",
            failure: "boom",
        });
        dialog.element.querySelector<HTMLElement>('[data-bis="copy"]')?.click();
        expect(platformUtils.copyPlainText).toHaveBeenCalledWith("log: red\nreturnValue: 42\nerrorValue: boom");
        expect(showMessage).toHaveBeenCalledWith("copied");
    });

    it("does not copy anything when there is no output", () => {
        const {dialog} = render({entries: []});
        dialog.element.querySelector<HTMLElement>('[data-bis="copy"]')?.click();
        expect(platformUtils.copyPlainText).not.toHaveBeenCalled();
        expect(showMessage).toHaveBeenCalledWith("noOutput");
    });

    it("closes the dialog from the close button", () => {
        const {dialog} = render({entries: [{level: "log", text: "x"}]});
        dialog.element.querySelector<HTMLElement>('[data-bis="close"]')?.click();
        expect(dialog.destroyed).toBe(true);
    });

    it("uses the localized title, labels and buttons", () => {
        const context = makeContext({
            i18n: makeI18n({scriptOutput: "Output", copy: "Copy", close: "Close", noOutput: "Nothing"}),
        });
        showScriptOutput(context, {entries: []});
        const dialog = Dialog.instances.at(-1);
        expect(dialog?.options.title).toBe("Output");
        expect(dialog?.element.textContent).toContain("Nothing");
        expect(dialog?.element.textContent).toContain("Copy");
        expect(dialog?.element.textContent).toContain("Close");
    });
});
