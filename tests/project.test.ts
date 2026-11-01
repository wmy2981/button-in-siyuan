import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {PLUGIN_NAME, PLUGIN_SCRIPT_DIR, PLUGIN_STORAGE_DIR} from "../src/pluginPaths";

const root = path.dirname(fileURLToPath(import.meta.url)) + path.sep + "..";
const readJson = (name: string) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const exists = (name: string) => fs.existsSync(path.join(root, name));

describe("plugin manifest", () => {
    const plugin = readJson("plugin.json");
    const pkg = readJson("package.json");

    it("keeps the plugin name in sync with the storage path", () => {
        expect(plugin.name).toBe(PLUGIN_NAME);
        expect(pkg.name).toBe(PLUGIN_NAME);
    });

    it("keeps both version fields identical", () => {
        expect(plugin.version).toBe(pkg.version);
        expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("declares every language for the display name and description", () => {
        expect(plugin.displayName.default).toBeTruthy();
        expect(plugin.displayName["zh-CN"]).toBeTruthy();
        expect(plugin.description.default).toBeTruthy();
        expect(plugin.description["zh-CN"]).toBeTruthy();
    });

    it("points at files that exist", () => {
        expect(exists(plugin.readme.default)).toBe(true);
        expect(exists(plugin.readme["zh-CN"])).toBe(true);
        // 集市只认包根的 icon.png / preview.png，源文件在 assets/ 下，由 webpack 复制到包根
        expect(exists(path.join("assets", plugin.icon))).toBe(true);
        expect(exists(path.join("assets", plugin.preview))).toBe(true);
    });

    it("supports all frontends and backends", () => {
        expect(plugin.frontends).toContain("all");
        expect(plugin.backends).toContain("all");
    });

    it("keeps the storage paths consistent with the plugin name", () => {
        expect(PLUGIN_STORAGE_DIR).toBe(`data/storage/petal/${plugin.name}`);
        expect(PLUGIN_SCRIPT_DIR).toBe(`${PLUGIN_STORAGE_DIR}/scripts/`);
    });
});

describe("i18n files", () => {
    const i18nDir = path.join(root, "src", "i18n");
    const files = fs.readdirSync(i18nDir).filter((name) => name.endsWith(".json")).sort();
    const dictionaries = files.map((name) => ({
        name,
        values: JSON.parse(fs.readFileSync(path.join(i18nDir, name), "utf8")) as Record<string, unknown>,
    }));
    const keysSource = fs.readFileSync(path.join(root, "src", "i18nKeys.ts"), "utf8");
    const declared = Array.from(keysSource.matchAll(/^\s{4}(\w+):\s*string;/gm), (match) => match[1]);

    it("declares keys in the type file", () => {
        expect(declared.length).toBeGreaterThan(0);
        expect(new Set(declared).size).toBe(declared.length);
    });

    it("has at least the English and Chinese dictionaries", () => {
        expect(files).toEqual(expect.arrayContaining(["en.json", "zh-CN.json"]));
    });

    it("covers exactly the declared keys in every language", () => {
        dictionaries.forEach(({name, values}) => {
            expect(Object.keys(values).sort(), name).toEqual([...declared].sort());
        });
    });

    it("has no empty strings", () => {
        dictionaries.forEach(({name, values}) => {
            Object.entries(values).forEach(([key, value]) => {
                expect(typeof value, `${name}:${key}`).toBe("string");
                expect((value as string).trim(), `${name}:${key}`).not.toBe("");
            });
        });
    });
});
