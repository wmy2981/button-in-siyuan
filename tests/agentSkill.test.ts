import {describe, expect, it, vi} from "vitest";
import {
    AGENT_SKILL_NAME,
    downloadAgentSkill,
    installAgentSkill,
    removeAgentSkill,
} from "../src/agentSkill";
import {fetchSyncPost, saveExportFile} from "./mocks/siyuan";
import {readFileText} from "./helpers";

const SKILL_DIR = `data/storage/ai/agent/skills/${AGENT_SKILL_NAME}`;
const EXPORT_DIR = `temp/export/${AGENT_SKILL_NAME}`;
const PLUGIN_NAME = "button-in-siyuan";

const mockManifest = (version: string | null = "0.3.0") => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(version ? {version} : {}), {
        status: 200,
        headers: {"content-type": "application/json"},
    }));
};

const callsByUrl = (url: string) => fetchSyncPost.mock.calls.filter((call) => call[0] === url);
const formOf = (call: unknown[]) => call[1] as FormData;

describe("AGENT_SKILL_NAME", () => {
    it("is the directory name the host indexes", () => {
        expect(AGENT_SKILL_NAME).toBe("button-block");
    });
});

describe("installAgentSkill", () => {
    it("writes the manifest and both references", async () => {
        mockManifest();
        await installAgentSkill(PLUGIN_NAME);

        const saves = callsByUrl("/api/ai/agent/saveSkill");
        expect(saves).toHaveLength(1);
        expect(saves[0][1]).toEqual({name: AGENT_SKILL_NAME, content: expect.any(String)});
        expect((saves[0][1] as {content: string}).content).toContain(`skill_version: "0.3.0"`);
        expect((saves[0][1] as {content: string}).content).not.toContain("{{siyuan-ref}}");

        const puts = callsByUrl("/api/file/putFile");
        expect(puts).toHaveLength(2);
        const paths = puts.map((call) => formOf(call).get("path"));
        expect(paths).toEqual([
            `${SKILL_DIR}/references/javascript.md`,
            `${SKILL_DIR}/references/icons.md`,
        ]);
        puts.forEach((call) => {
            expect(formOf(call).get("isDir")).toBe("false");
        });
        const javascript = await readFileText(formOf(puts[0]).get("file") as File);
        expect(javascript).toContain("v3.8.6");
        expect(javascript).not.toContain("{{siyuan-ref}}");
    });

    it("installs the manifest without a version when the plugin manifest cannot be read", async () => {
        mockManifest(null);
        await installAgentSkill(PLUGIN_NAME);
        const content = (callsByUrl("/api/ai/agent/saveSkill")[0][1] as {content: string}).content;
        expect(content).not.toContain("skill_version");
        expect(callsByUrl("/api/file/putFile")).toHaveLength(2);
    });

    it("does not write the references when the skill api fails", async () => {
        mockManifest();
        fetchSyncPost.mockResolvedValue({code: -1, msg: "ai disabled"});
        await installAgentSkill(PLUGIN_NAME);
        expect(callsByUrl("/api/file/putFile")).toHaveLength(0);
    });

    it("stops at the first failing reference", async () => {
        mockManifest();
        fetchSyncPost
            .mockResolvedValueOnce({code: 0})
            .mockResolvedValueOnce({code: -1, msg: "disk full"});
        await expect(installAgentSkill(PLUGIN_NAME)).resolves.toBeUndefined();
        expect(callsByUrl("/api/file/putFile")).toHaveLength(1);
    });

    it("swallows a rejected save", async () => {
        mockManifest();
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await expect(installAgentSkill(PLUGIN_NAME)).resolves.toBeUndefined();
    });
});

describe("removeAgentSkill", () => {
    it("removes the skill directory in one call", async () => {
        fetchSyncPost.mockResolvedValue({code: 0});
        await removeAgentSkill(PLUGIN_NAME);
        expect(callsByUrl("/api/ai/agent/removeSkill")).toHaveLength(1);
        expect(callsByUrl("/api/file/readDir")).toHaveLength(0);
    });

    it("stops when the directory is already gone", async () => {
        fetchSyncPost
            .mockResolvedValueOnce({code: -1, msg: "skill not found"})
            .mockResolvedValueOnce({code: 404});
        await removeAgentSkill(PLUGIN_NAME);
        expect(callsByUrl("/api/ai/agent/saveSkill")).toHaveLength(0);
        expect(callsByUrl("/api/ai/agent/removeSkill")).toHaveLength(1);
    });

    it("restores the manifest and retries when the directory is still there", async () => {
        mockManifest();
        fetchSyncPost
            .mockResolvedValueOnce({code: -1, msg: "skill not found"})
            .mockResolvedValueOnce({code: 0, data: []})
            .mockResolvedValueOnce({code: 0})
            .mockResolvedValueOnce({code: 0});
        await removeAgentSkill(PLUGIN_NAME);
        expect(callsByUrl("/api/ai/agent/saveSkill")).toHaveLength(1);
        expect(callsByUrl("/api/ai/agent/removeSkill")).toHaveLength(2);
    });

    it("does not retry when restoring the manifest fails", async () => {
        fetchSyncPost
            .mockResolvedValueOnce({code: -1, msg: "skill not found"})
            .mockResolvedValueOnce({code: 0, data: []})
            .mockResolvedValueOnce({code: -1, msg: "ai disabled"});
        await removeAgentSkill(PLUGIN_NAME);
        expect(callsByUrl("/api/ai/agent/removeSkill")).toHaveLength(1);
    });

    it("swallows a rejected call", async () => {
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await expect(removeAgentSkill(PLUGIN_NAME)).resolves.toBeUndefined();
    });
});

describe("downloadAgentSkill", () => {
    it("writes the three files into temp/export and zips them", async () => {
        mockManifest();
        await downloadAgentSkill(PLUGIN_NAME);

        const puts = callsByUrl("/api/file/putFile");
        expect(puts.map((call) => formOf(call).get("path"))).toEqual([
            `${EXPORT_DIR}/SKILL.md`,
            `${EXPORT_DIR}/references/javascript.md`,
            `${EXPORT_DIR}/references/icons.md`,
        ]);
        expect(callsByUrl("/api/archive/zip")).toEqual([[
            "/api/archive/zip",
            {path: EXPORT_DIR, zipPath: `temp/export/${AGENT_SKILL_NAME}.zip`},
            undefined,
            false,
        ]]);
        expect(saveExportFile).toHaveBeenCalledWith(`/export/${AGENT_SKILL_NAME}.zip`);
    });

    it("throws when the archive cannot be created", async () => {
        mockManifest();
        fetchSyncPost
            .mockResolvedValueOnce({code: 0})
            .mockResolvedValueOnce({code: 0})
            .mockResolvedValueOnce({code: 0})
            .mockResolvedValueOnce({code: -1, msg: "zip failed"});
        await expect(downloadAgentSkill(PLUGIN_NAME)).rejects.toThrow("zip failed");
        expect(saveExportFile).not.toHaveBeenCalled();
    });

    it("throws when a file cannot be written", async () => {
        mockManifest();
        fetchSyncPost.mockResolvedValueOnce({code: -1, msg: "disk full"});
        await expect(downloadAgentSkill(PLUGIN_NAME)).rejects.toThrow("disk full");
    });
});
