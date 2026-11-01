import {afterEach, describe, expect, it, vi} from "vitest";
import {createLogger, isDebugEnabled, setDebugEnabled} from "../src/logger";

describe("logger", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setDebugEnabled(false);
    });

    it("stays silent while debug mode is off", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        createLogger("buttonBlock").info("loaded");
        expect(info).not.toHaveBeenCalled();
        expect(isDebugEnabled()).toBe(false);
    });

    it("writes the module prefix and the structured detail when debug mode is on", () => {
        setDebugEnabled(true);
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const detail = {blockID: "20240101000000-abcdefg", count: 2};
        createLogger("buttonBlock").info("rendered", detail);
        expect(info).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledWith("[button-in-siyuan][buttonBlock] rendered", detail);
    });

    it("omits the second argument when there is no detail", () => {
        setDebugEnabled(true);
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        createLogger("scriptMeta").debug("parsed");
        expect(debug).toHaveBeenCalledWith("[button-in-siyuan][scriptMeta] parsed");
        expect(vi.mocked(debug).mock.calls[0]).toHaveLength(1);
    });

    it.each([
        ["debug", "debug"],
        ["info", "info"],
        ["warn", "warn"],
        ["error", "error"],
    ] as const)("maps the %s level to console.%s", (level, method) => {
        setDebugEnabled(true);
        const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
        createLogger("scope")[level]("message");
        expect(spy).toHaveBeenCalledWith("[button-in-siyuan][scope] message");
    });

    it("reports the current debug flag", () => {
        setDebugEnabled(true);
        expect(isDebugEnabled()).toBe(true);
        setDebugEnabled(false);
        expect(isDebugEnabled()).toBe(false);
    });

    it("keeps each logger bound to its own scope", () => {
        setDebugEnabled(true);
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        createLogger("first").info("one");
        createLogger("second").info("two");
        expect(info.mock.calls).toEqual([
            ["[button-in-siyuan][first] one"],
            ["[button-in-siyuan][second] two"],
        ]);
    });
});
