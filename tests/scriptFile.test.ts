import {describe, expect, it, vi} from "vitest";
import {
    downloadScriptToAssets,
    isRemoteScript,
    loadActionScript,
    normalizeScriptPath,
    readWorkspaceFile,
    removeWorkspaceFile,
    renameWorkspaceFile,
    scriptFileName,
    scriptLocation,
    toScriptPath,
    workspaceFileExists,
    writeWorkspaceFile,
} from "../src/scriptFile";
import {ASSET_SCRIPT_DIR, PLUGIN_SCRIPT_DIR} from "../src/pluginPaths";
import {fetchSyncPost} from "./mocks/siyuan";
import {kernelErrorResponse, readFileText, textResponse} from "./helpers";

describe("isRemoteScript", () => {
    it.each(["https://example.com/a.js", "HTTP://example.com/a.js", "  https://example.com/a.js  "])(
        "recognises %s as remote",
        (path) => expect(isRemoteScript(path)).toBe(true),
    );

    it.each(["data/assets/a.js", "//example.com/a.js", "ftp://example.com/a.js", ""])(
        "does not treat %s as remote",
        (path) => expect(isRemoteScript(path)).toBe(false),
    );
});

describe("normalizeScriptPath", () => {
    it("keeps paths in the two managed directories as they are", () => {
        expect(normalizeScriptPath("data/assets/a.js")).toBe("data/assets/a.js");
        expect(normalizeScriptPath(`${PLUGIN_SCRIPT_DIR}a.js`)).toBe(`${PLUGIN_SCRIPT_DIR}a.js`);
    });

    it("upgrades the legacy assets/ form to a workspace-relative path", () => {
        expect(normalizeScriptPath("assets/a.js")).toBe("data/assets/a.js");
    });

    it("normalizes backslashes, a leading slash and ./", () => {
        expect(normalizeScriptPath("\\data\\assets\\a.js")).toBe("data/assets/a.js");
        expect(normalizeScriptPath("/data/assets/a.js")).toBe("data/assets/a.js");
        expect(normalizeScriptPath("./assets/a.js")).toBe("data/assets/a.js");
    });

    it("accepts the .js suffix case-insensitively", () => {
        expect(normalizeScriptPath("data/assets/A.JS")).toBe("data/assets/A.JS");
    });

    it.each([
        "",
        "   ",
        "data/assets/a.txt",
        "data/assets/a",
        "data/other/a.js",
        "data/assets/../secret.js",
        "assets/../../secret.js",
        "C:/data/assets/a.js",
        "data/assets/",
    ])("rejects %p", (path) => expect(normalizeScriptPath(path)).toBeUndefined());
});

describe("scriptLocation", () => {
    it("tells the plugin scripts from the asset scripts", () => {
        expect(scriptLocation(`${PLUGIN_SCRIPT_DIR}a.js`)).toBe("plugin");
        expect(scriptLocation("data/assets/a.js")).toBe("assets");
        expect(scriptLocation("assets/a.js")).toBe("assets");
    });

    it("returns undefined for an unsupported path", () => {
        expect(scriptLocation("data/elsewhere/a.js")).toBeUndefined();
    });
});

describe("scriptFileName", () => {
    it("returns the name without directory or suffix", () => {
        expect(scriptFileName("data/assets/hello.js")).toBe("hello");
        expect(scriptFileName(`${PLUGIN_SCRIPT_DIR}hello.js`)).toBe("hello");
    });

    it("returns an empty string for an unsupported path", () => {
        expect(scriptFileName("data/elsewhere/hello.js")).toBe("");
    });
});

describe("toScriptPath", () => {
    it("appends the suffix only when it is missing", () => {
        expect(toScriptPath("plugin", "hello")).toBe(`${PLUGIN_SCRIPT_DIR}hello.js`);
        expect(toScriptPath("plugin", "hello.js")).toBe(`${PLUGIN_SCRIPT_DIR}hello.js`);
        expect(toScriptPath("assets", "hello.JS")).toBe("data/assets/hello.JS");
    });

    it("trims the name", () => {
        expect(toScriptPath("plugin", "  hello  ")).toBe(`${PLUGIN_SCRIPT_DIR}hello.js`);
    });

    it.each(["", "   ", ".hidden", "a/b", "a\\b", "a:b", "a*b", "a?b", "a~b", "a b!", "a&b", "a=b", "a#b", "a%b", "a$b", "a;b"])(
        "rejects the invalid name %p",
        (name) => expect(toScriptPath("plugin", name)).toBeUndefined(),
    );

    it("rejects a name longer than the kernel limit", () => {
        expect(toScriptPath("plugin", "a".repeat(181))).toBeUndefined();
        expect(toScriptPath("plugin", "a".repeat(177))).toBe(`${PLUGIN_SCRIPT_DIR}${"a".repeat(177)}.js`);
    });
});

describe("readWorkspaceFile", () => {
    it("posts the normalized path and returns the body", async () => {
        vi.mocked(fetch).mockResolvedValue(textResponse("const a = 1;"));
        await expect(readWorkspaceFile("assets/a.js")).resolves.toBe("const a = 1;");
        expect(fetch).toHaveBeenCalledWith("/api/file/getFile", {
            method: "POST",
            body: JSON.stringify({path: "data/assets/a.js"}),
        });
    });

    it("turns a kernel error envelope into an Error with its message", async () => {
        vi.mocked(fetch).mockResolvedValue(kernelErrorResponse("file not found"));
        await expect(readWorkspaceFile("data/assets/a.js")).rejects.toThrow("file not found");
    });

    it("falls back to the status line when the error body is not JSON", async () => {
        vi.mocked(fetch).mockResolvedValue(new Response("", {status: 404, statusText: "Not Found"}));
        await expect(readWorkspaceFile("data/assets/a.js")).rejects.toThrow("404 Not Found");
    });

    it("refuses a path outside the managed directories without touching the kernel", async () => {
        await expect(readWorkspaceFile("data/elsewhere/a.js")).rejects.toThrow("unsupported script path");
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("writeWorkspaceFile", () => {
    it("uploads the file as multipart form data", async () => {
        await writeWorkspaceFile("assets/a.js", "const a = 1;");
        expect(fetchSyncPost).toHaveBeenCalledTimes(1);
        const [url, form, headers, processMessage] = fetchSyncPost.mock.calls[0];
        expect(url).toBe("/api/file/putFile");
        expect(headers).toBeUndefined();
        expect(processMessage).toBe(false);
        expect((form as FormData).get("path")).toBe("data/assets/a.js");
        expect((form as FormData).get("isDir")).toBe("false");
        const file = (form as FormData).get("file") as File;
        expect(file.name).toBe("a.js");
        expect(await readFileText(file)).toBe("const a = 1;");
    });

    it("throws the kernel message when the write fails", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "read only"});
        await expect(writeWorkspaceFile("data/assets/a.js", "")).rejects.toThrow("read only");
    });

    it("falls back to the url and code when the kernel sends no message", async () => {
        fetchSyncPost.mockResolvedValue({code: 500});
        await expect(writeWorkspaceFile("data/assets/a.js", "")).rejects.toThrow("/api/file/putFile code 500");
    });
});

describe("removeWorkspaceFile and renameWorkspaceFile", () => {
    it("removes the normalized path", async () => {
        await removeWorkspaceFile("assets/a.js");
        expect(fetchSyncPost).toHaveBeenCalledWith(
            "/api/file/removeFile",
            {path: "data/assets/a.js"},
            undefined,
            false,
        );
    });

    it("renames with both paths normalized", async () => {
        await renameWorkspaceFile("assets/a.js", `${PLUGIN_SCRIPT_DIR}b.js`);
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/file/renameFile", {
            path: "data/assets/a.js",
            newPath: `${PLUGIN_SCRIPT_DIR}b.js`,
        }, undefined, false);
    });

    it("rejects an unsupported target path", () => {
        // 路径校验在函数返回 Promise 之前就抛了（与内核调用无关），所以这里不能用 rejects
        expect(() => renameWorkspaceFile("data/assets/a.js", "data/elsewhere/b.js"))
            .toThrow("unsupported script path");
    });
});

describe("workspaceFileExists", () => {
    it("lists the parent directory and matches the file name", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "a.js"}, {name: "b.js"}]});
        await expect(workspaceFileExists("data/assets/a.js")).resolves.toBe(true);
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/file/readDir", {path: "data/assets"}, undefined, false);
    });

    it("returns false when the name is not in the directory", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{name: "b.js"}]});
        await expect(workspaceFileExists("data/assets/a.js")).resolves.toBe(false);
    });

    it("treats a missing directory as a missing file", async () => {
        fetchSyncPost.mockResolvedValue({code: 404, msg: "no such dir"});
        await expect(workspaceFileExists("data/assets/a.js")).resolves.toBe(false);
    });
});

describe("loadActionScript", () => {
    it("downloads a remote script on every call", async () => {
        vi.mocked(fetch).mockResolvedValue(textResponse("remote();"));
        await expect(loadActionScript("https://example.com/a.js")).resolves.toBe("remote();");
        expect(fetch).toHaveBeenCalledWith("https://example.com/a.js", {cache: "no-store"});
    });

    it("throws the status line when the remote script is unavailable", async () => {
        vi.mocked(fetch).mockResolvedValue(new Response("", {status: 500, statusText: "Server Error"}));
        await expect(loadActionScript("https://example.com/a.js")).rejects.toThrow("500 Server Error");
    });

    it("reads a local script through the kernel", async () => {
        vi.mocked(fetch).mockResolvedValue(textResponse("local();"));
        await expect(loadActionScript("assets/a.js")).resolves.toBe("local();");
        expect(fetch).toHaveBeenCalledWith("/api/file/getFile", expect.objectContaining({method: "POST"}));
    });
});

describe("downloadScriptToAssets", () => {
    it("stores the remote code under data/assets with a generated name", async () => {
        vi.mocked(fetch).mockResolvedValue(textResponse("downloaded();"));
        await expect(downloadScriptToAssets("https://example.com/a.js")).resolves.toBe("data/assets/20240101000000-abcdefg.js");
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/file/putFile", expect.any(FormData), undefined, false);
        const form = fetchSyncPost.mock.calls[0][1] as FormData;
        expect(form.get("path")).toBe("data/assets/20240101000000-abcdefg.js");
        expect(await readFileText(form.get("file") as File)).toBe("downloaded();");
    });

    it("falls back to a timestamp when Lute is unavailable", async () => {
        vi.mocked(fetch).mockResolvedValue(textResponse("x();"));
        (window as any).Lute = undefined;
        vi.spyOn(Date, "now").mockReturnValue(1700000000000);
        await expect(downloadScriptToAssets("https://example.com/a.js")).resolves.toBe("data/assets/1700000000000.js");
    });

    it("does not write anything when the download fails", async () => {
        vi.mocked(fetch).mockResolvedValue(new Response("", {status: 404, statusText: "Not Found"}));
        await expect(downloadScriptToAssets("https://example.com/a.js")).rejects.toThrow("404 Not Found");
        expect(fetchSyncPost).not.toHaveBeenCalled();
    });
});

describe("script directories", () => {
    it("uses the documented workspace paths", () => {
        expect(ASSET_SCRIPT_DIR).toBe("data/assets/");
        expect(PLUGIN_SCRIPT_DIR).toBe("data/storage/petal/button-in-siyuan/scripts/");
    });

    it("parses a readDir response with unexpected entries", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [null, {name: undefined}, {name: "a.js"}]});
        await expect(workspaceFileExists("data/assets/a.js")).resolves.toBe(true);
    });
});
