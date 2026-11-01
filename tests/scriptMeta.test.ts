import {describe, expect, it} from "vitest";
import {
    isScriptEnvironmentSupported,
    isTargetSupported,
    parseScriptMeta,
    SCRIPT_BACKENDS,
    SCRIPT_FRONTENDS,
} from "../src/scriptMeta";

describe("parseScriptMeta", () => {
    it("returns no restrictions when the script has no declarations", () => {
        expect(parseScriptMeta("const value = 1;")).toEqual({frontends: [], backends: []});
    });

    it("reads the output mode from the leading comment block", () => {
        expect(parseScriptMeta("// @bis-output error\nconsole.log('x');").outputMode).toBe("error");
    });

    it("matches the declaration key and value case-insensitively", () => {
        const meta = parseScriptMeta("// @bis-OUTPUT ALWAYS\n// @bis-FRONTENDS Desktop\n// @bis-BACKENDS WINDOWS");
        expect(meta.outputMode).toBe("always");
        expect(meta.frontends).toEqual(["desktop"]);
        expect(meta.backends).toEqual(["windows"]);
    });

    it("ignores an unknown output mode and keeps following the plugin setting", () => {
        expect(parseScriptMeta("// @bis-output loud").outputMode).toBeUndefined();
    });

    it("splits target lists on spaces, commas and Chinese commas", () => {
        const meta = parseScriptMeta("// @bis-frontends desktop, mobile，browser-desktop\n// @bis-backends windows linux,darwin");
        expect(meta.frontends).toEqual(["desktop", "mobile", "browser-desktop"]);
        expect(meta.backends).toEqual(["windows", "linux", "darwin"]);
    });

    it("drops unknown targets and falls back to a list that matches nothing", () => {
        expect(parseScriptMeta("// @bis-frontends desktop, tablet").frontends).toEqual(["desktop"]);
        expect(parseScriptMeta("// @bis-frontends tablet, watch").frontends).toEqual(["__unsupported__"]);
    });

    it("treats an empty target value as no restriction", () => {
        expect(parseScriptMeta("// @bis-frontends ,\n// @bis-backends").frontends).toEqual([]);
        expect(parseScriptMeta("// @bis-frontends ,\n// @bis-backends").backends).toEqual([]);
    });

    it("stops at the first line of real code", () => {
        const meta = parseScriptMeta("const a = 1;\n// @bis-output never\n// @bis-frontends mobile");
        expect(meta.outputMode).toBeUndefined();
        expect(meta.frontends).toEqual([]);
    });

    it("keeps scanning through blank lines and unrelated comments", () => {
        const meta = parseScriptMeta("// a note\n\n// another note\n// @bis-output console\n\n// @bis-frontends mobile");
        expect(meta.outputMode).toBe("console");
        expect(meta.frontends).toEqual(["mobile"]);
    });

    it("handles CRLF files and a UTF-8 BOM", () => {
        const meta = parseScriptMeta("\uFEFF// @bis-output warn\r\n// @bis-frontends desktop\r\nconsole.log('x');");
        expect(meta.outputMode).toBe("warn");
        expect(meta.frontends).toEqual(["desktop"]);
    });

    it("lets a later declaration override an earlier one", () => {
        const meta = parseScriptMeta("// @bis-output error\n// @bis-output always\n// @bis-frontends mobile\n// @bis-frontends desktop");
        expect(meta.outputMode).toBe("always");
        expect(meta.frontends).toEqual(["desktop"]);
    });

    it("does not mistake a declaration inside a block comment for a declaration", () => {
        const meta = parseScriptMeta("/*\n// @bis-output never\n*/\nconst a = 1;");
        expect(meta.outputMode).toBeUndefined();
    });
});

describe("isTargetSupported", () => {
    it("treats an empty list and `all` as unrestricted", () => {
        expect(isTargetSupported([], "mobile")).toBe(true);
        expect(isTargetSupported(["all"], "mobile")).toBe(true);
    });

    it("matches the current target exactly", () => {
        expect(isTargetSupported(["desktop", "mobile"], "mobile")).toBe(true);
        expect(isTargetSupported(["desktop"], "mobile")).toBe(false);
    });

    it("does not match an unsupported placeholder", () => {
        expect(isTargetSupported(["__unsupported__"], "desktop")).toBe(false);
    });
});

describe("isScriptEnvironmentSupported", () => {
    it("accepts the current environment when nothing is declared", () => {
        expect(isScriptEnvironmentSupported({frontends: [], backends: []}, "desktop", "windows")).toBe(true);
    });

    it("requires both the frontend and the backend to match", () => {
        const meta = {frontends: ["desktop"], backends: ["windows"]};
        expect(isScriptEnvironmentSupported(meta, "desktop", "windows")).toBe(true);
        expect(isScriptEnvironmentSupported(meta, "mobile", "windows")).toBe(false);
        expect(isScriptEnvironmentSupported(meta, "desktop", "linux")).toBe(false);
    });

    it("reads the current frontend and backend from the host when they are omitted", () => {
        expect(isScriptEnvironmentSupported({frontends: ["desktop"], backends: ["windows"]})).toBe(true);
    });
});

describe("target constants", () => {
    it("contains the values the SiYuan bazaar accepts", () => {
        expect(SCRIPT_FRONTENDS).toContain("all");
        expect(SCRIPT_FRONTENDS).toContain("desktop-window");
        expect(SCRIPT_FRONTENDS).toContain("browser-mobile");
        expect(SCRIPT_BACKENDS).toContain("darwin");
        expect(SCRIPT_BACKENDS).toContain("harmony");
    });
});
