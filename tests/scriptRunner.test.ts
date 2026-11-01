import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {isDebugEnabled, setDebugEnabled} from "../src/logger";
import {formatValue, runScript, shouldShowOutput} from "../src/scriptRunner";
import type {IScriptEntry} from "../src/scriptOutput";
import {Dialog, showMessage} from "./mocks/siyuan";
import {makeContext, makeI18n, makeSettings} from "./helpers";

const entry = (level: IScriptEntry["level"]): IScriptEntry => ({level, text: "x"});

/** 脚本的 console 会被原样转发到宿主控制台，测试里静音，免得刷满 CI 日志。 */
const consoleSpies = {
    log: vi.spyOn(console, "log").mockImplementation(() => undefined),
    info: vi.spyOn(console, "info").mockImplementation(() => undefined),
    debug: vi.spyOn(console, "debug").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
    table: vi.spyOn(console, "table").mockImplementation(() => undefined),
    dir: vi.spyOn(console, "dir").mockImplementation(() => undefined),
};

beforeEach(() => {
    Object.values(consoleSpies).forEach((spy) => spy.mockClear());
});

afterEach(() => {
    setDebugEnabled(false);
});

describe("shouldShowOutput", () => {
    const empty = {entries: [], hasResult: false, hasFailure: false};
    const withOutput = {entries: [entry("log")], hasResult: false, hasFailure: false};
    const withResult = {entries: [], hasResult: true, hasFailure: false};
    const withFailure = {entries: [], hasResult: false, hasFailure: true};

    it("always shows the dialog in always mode", () => {
        [empty, withOutput, withResult, withFailure].forEach((options) => {
            expect(shouldShowOutput("always", options)).toBe(true);
        });
    });

    it("never shows the dialog in never mode", () => {
        [empty, withOutput, withResult, withFailure].forEach((options) => {
            expect(shouldShowOutput("never", options)).toBe(false);
        });
    });

    it("shows the dialog for console output in console mode", () => {
        expect(shouldShowOutput("console", empty)).toBe(false);
        expect(shouldShowOutput("console", withOutput)).toBe(true);
        expect(shouldShowOutput("console", withResult)).toBe(false);
    });

    it("treats warnings and errors as a reason in warn mode", () => {
        expect(shouldShowOutput("warn", empty)).toBe(false);
        expect(shouldShowOutput("warn", withFailure)).toBe(true);
        expect(shouldShowOutput("warn", {entries: [entry("warn")], hasResult: false, hasFailure: false})).toBe(true);
        expect(shouldShowOutput("warn", {entries: [entry("error")], hasResult: false, hasFailure: false})).toBe(true);
        expect(shouldShowOutput("warn", {entries: [entry("log")], hasResult: true, hasFailure: false})).toBe(false);
    });

    it("only treats errors as a reason in error mode", () => {
        expect(shouldShowOutput("error", empty)).toBe(false);
        expect(shouldShowOutput("error", withFailure)).toBe(true);
        expect(shouldShowOutput("error", {entries: [entry("warn")], hasResult: false, hasFailure: false})).toBe(false);
        expect(shouldShowOutput("error", {entries: [entry("error")], hasResult: false, hasFailure: false})).toBe(true);
    });

    it("uses the default output mode for an unknown mode", () => {
        expect(shouldShowOutput("output", empty)).toBe(false);
        expect(shouldShowOutput("output", withOutput)).toBe(true);
        expect(shouldShowOutput("output", withResult)).toBe(true);
        expect(shouldShowOutput("output", withFailure)).toBe(true);
        expect(shouldShowOutput("something" as never, withOutput)).toBe(true);
    });
});

describe("formatValue", () => {
    it("returns strings unchanged", () => {
        expect(formatValue("text")).toBe("text");
        expect(formatValue("")).toBe("");
    });

    it("uses the stack for errors", () => {
        const error = new Error("boom");
        expect(formatValue(error)).toBe(error.stack);
    });

    it("falls back to name and message for an error without a stack", () => {
        const error = new Error("boom");
        Object.defineProperty(error, "stack", {value: ""});
        expect(formatValue(error)).toBe("Error: boom");
    });

    it("prints undefined explicitly", () => {
        expect(formatValue(undefined)).toBe("undefined");
    });

    it("serializes objects and arrays", () => {
        expect(formatValue({a: 1})).toBe("{\"a\":1}");
        expect(formatValue([1, 2])).toBe("[1,2]");
        expect(formatValue(0)).toBe("0");
        expect(formatValue(false)).toBe("false");
        expect(formatValue(null)).toBe("null");
    });

    it("falls back to String for a value JSON cannot serialize", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(formatValue(circular)).toBe("[object Object]");
    });
});

describe("runScript", () => {
    const run = (code: string, overrides: Parameters<typeof makeContext>[0] = {}) =>
        runScript(makeContext(overrides), {blockID: "20240101000000-abcdefg", code});

    it("captures console output and the return value", async () => {
        await run("console.log('hello'); console.warn('careful'); return 42;");
        const dialog = Dialog.instances.at(-1);
        expect(dialog).toBeDefined();
        const text = dialog?.element.textContent || "";
        expect(text).toContain("log:");
        expect(text).toContain("hello");
        expect(text).toContain("warn:");
        expect(text).toContain("careful");
        expect(text).toContain("returnValue: 42");
    });

    it("supports await and async code", async () => {
        await run("const value = await Promise.resolve(7); return value * 2;");
        expect(Dialog.instances.at(-1)?.element.textContent).toContain("returnValue: 14");
    });

    it("injects the script API and the block context", async () => {
        await run("showMessage('from script'); return blockID;");
        expect(showMessage).toHaveBeenCalledWith("from script");
        expect(Dialog.instances.at(-1)?.element.textContent)
            .toContain("returnValue: 20240101000000-abcdefg");
    });

    it("reports a thrown error", async () => {
        await run("throw new Error('boom');");
        expect(Dialog.instances.at(-1)?.element.textContent).toContain("errorValue: Error: boom");
    });

    it("keeps silent when the script has no output at all", async () => {
        await run("const a = 1;");
        expect(Dialog.instances).toHaveLength(0);
    });

    it("honours the never mode", async () => {
        await run("console.log('hidden'); return 1;", {getSettings: () => makeSettings({outputMode: "never"})});
        expect(Dialog.instances).toHaveLength(0);
    });

    it("honours the always mode even without output", async () => {
        await run("", {getSettings: () => makeSettings({outputMode: "always"})});
        expect(Dialog.instances).toHaveLength(1);
        expect(Dialog.instances[0].element.textContent).toContain("noOutput");
    });

    it("honours the console mode", async () => {
        await run("return 1;", {getSettings: () => makeSettings({outputMode: "console"})});
        expect(Dialog.instances).toHaveLength(0);
        await run("console.log('x');", {getSettings: () => makeSettings({outputMode: "console"})});
        expect(Dialog.instances).toHaveLength(1);
    });

    it("lets the @bis-output declaration override the setting", async () => {
        await run("// @bis-output never\nconsole.log('hidden');");
        expect(Dialog.instances).toHaveLength(0);
    });

    it("does not execute a script declared for another environment", async () => {
        await run("// @bis-frontends mobile\nconsole.log('hidden');");
        expect(Dialog.instances).toHaveLength(0);
        expect(showMessage).toHaveBeenCalledWith("scriptUnavailable", 7000, "error");
    });

    it("drops console.debug while debug mode is off", async () => {
        await run("console.debug('quiet'); console.log('loud');");
        const text = Dialog.instances.at(-1)?.element.textContent || "";
        expect(text).toContain("loud");
        expect(text).not.toContain("quiet");
    });

    it("captures console.debug when debug mode is on", async () => {
        setDebugEnabled(true);
        await run("console.debug('quiet');");
        expect(Dialog.instances.at(-1)?.element.textContent).toContain("quiet");
    });

    it("restores the console after the run, even when the script throws", async () => {
        await run("throw new Error('boom');");
        console.log("after the run");
        expect(consoleSpies.log).toHaveBeenCalledWith("after the run");
        expect(isDebugEnabled()).toBe(false);
    });

    it("captures the remaining console methods", async () => {
        await run("console.info('i'); console.table([1]); console.dir({a: 1}); console.error('e');");
        const text = Dialog.instances.at(-1)?.element.textContent || "";
        ["info:", "i", "table:", "dir:", "error:", "e"].forEach((part) => expect(text).toContain(part));
    });

    it("formats a returned object as JSON", async () => {
        await run("return {a: 1};");
        expect(Dialog.instances.at(-1)?.element.textContent).toContain("returnValue: {\"a\":1}");
    });

    it("uses the localized return and error labels", async () => {
        await run("return 'x';", {i18n: makeI18n({returnValue: "returned"})});
        expect(Dialog.instances.at(-1)?.element.textContent).toContain("returned: x");
    });
});
