import {describe, expect, it} from "vitest";
import {
    ASSET_REFERENCE_ATTR,
    setAssetReference,
    syncAssetReferences,
    syncRenderedAssetReference,
} from "../src/assetReference";
import {serializeButtonConfig} from "../src/buttonBlock";
import {fetchSyncPost} from "./mocks/siyuan";
import {flushPromises, makeConfig, makeContext} from "./helpers";

const lastAttrsCall = () => fetchSyncPost.mock.calls.at(-1);

describe("setAssetReference", () => {
    it("records an asset script as an assets/ path", async () => {
        await expect(setAssetReference("block-1", makeConfig({
            action: {type: "file", file: "data/assets/x.js"},
        }))).resolves.toBe(true);
        expect(lastAttrsCall()).toEqual([
            "/api/attr/setBlockAttrs",
            {id: "block-1", attrs: {[ASSET_REFERENCE_ATTR]: "assets/x.js"}},
            undefined,
            false,
        ]);
    });

    it("normalizes the legacy assets/ form", async () => {
        await setAssetReference("block-2", makeConfig({action: {type: "file", file: "assets/x.js"}}));
        expect(lastAttrsCall()?.[1]).toEqual({
            id: "block-2",
            attrs: {[ASSET_REFERENCE_ATTR]: "assets/x.js"},
        });
    });

    it.each([
        makeConfig({action: {type: "file", file: "data/storage/petal/button-in-siyuan/scripts/x.js"}}),
        makeConfig({action: {type: "link", link: "https://example.com"}}),
        makeConfig({action: {type: "script", script: "1;"}}),
        makeConfig(),
    ])("clears the attribute for a non-asset action", async (config) => {
        await setAssetReference("block-3", config);
        expect(lastAttrsCall()?.[1]).toEqual({
            id: "block-3",
            attrs: {[ASSET_REFERENCE_ATTR]: ""},
        });
    });

    it("reports a kernel error", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "locked"});
        await expect(setAssetReference("block-4", makeConfig())).resolves.toBe(false);
    });

    it("reports a rejected kernel call", async () => {
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await expect(setAssetReference("block-5", makeConfig())).resolves.toBe(false);
    });
});

describe("syncRenderedAssetReference", () => {
    it("does nothing when the attribute already matches", async () => {
        const element = document.createElement("div");
        element.setAttribute(ASSET_REFERENCE_ATTR, "assets/x.js");
        syncRenderedAssetReference(element, "block-6", makeConfig({action: {type: "file", file: "data/assets/x.js"}}));
        await flushPromises();
        expect(fetchSyncPost).not.toHaveBeenCalled();
    });

    it("does nothing when both sides are empty", async () => {
        const element = document.createElement("div");
        syncRenderedAssetReference(element, "block-7", makeConfig());
        await flushPromises();
        expect(fetchSyncPost).not.toHaveBeenCalled();
    });

    it("writes the attribute when it is missing", async () => {
        const element = document.createElement("div");
        syncRenderedAssetReference(element, "block-8", makeConfig({action: {type: "file", file: "data/assets/x.js"}}));
        await flushPromises();
        expect(lastAttrsCall()?.[1]).toEqual({
            id: "block-8",
            attrs: {[ASSET_REFERENCE_ATTR]: "assets/x.js"},
        });
    });

    it("clears a stale attribute when the script moved out of assets/", async () => {
        const element = document.createElement("div");
        element.setAttribute(ASSET_REFERENCE_ATTR, "assets/x.js");
        syncRenderedAssetReference(element, "block-9", makeConfig({
            action: {type: "file", file: "data/storage/petal/button-in-siyuan/scripts/x.js"},
        }));
        await flushPromises();
        expect(lastAttrsCall()?.[1]).toEqual({
            id: "block-9",
            attrs: {[ASSET_REFERENCE_ATTR]: ""},
        });
    });
});

describe("syncAssetReferences", () => {
    const config = serializeButtonConfig(makeConfig({action: {type: "file", file: "data/assets/x.js"}}));

    it("queries every custom block with an explicit LIMIT", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: []});
        await syncAssetReferences(makeContext());
        expect(fetchSyncPost).toHaveBeenCalledTimes(1);
        const [url, rawBody, , processMessage] = fetchSyncPost.mock.calls[0];
        const body = rawBody as {stmt: string};
        expect(url).toBe("/api/query/sql");
        expect(body.stmt).toContain("type = 'custom'");
        expect(body.stmt).toContain("LIMIT 1000");
        expect(processMessage).toBe(false);
    });

    it("writes the attribute only where it is missing or stale", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [
                {id: "a", content: config, ial: ""},
                {id: "b", content: config, ial: `${ASSET_REFERENCE_ATTR}="assets/x.js"`},
                {id: "c", content: config, ial: `${ASSET_REFERENCE_ATTR}="assets/old.js"`},
            ],
        });
        await syncAssetReferences(makeContext());
        const writes = fetchSyncPost.mock.calls.slice(1).map((call) => call[1]);
        expect(writes).toEqual([
            {id: "a", attrs: {[ASSET_REFERENCE_ATTR]: "assets/x.js"}},
            {id: "c", attrs: {[ASSET_REFERENCE_ATTR]: "assets/x.js"}},
        ]);
    });

    it("clears the attribute for a button that no longer uses an asset script", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [{id: "a", content: serializeButtonConfig(makeConfig({action: {type: "link", link: "x"}})), ial: `${ASSET_REFERENCE_ATTR}="assets/x.js"`}],
        });
        await syncAssetReferences(makeContext());
        expect(fetchSyncPost.mock.calls[1][1]).toEqual({id: "a", attrs: {[ASSET_REFERENCE_ATTR]: ""}});
    });

    it("skips rows without an ID or with content that is not a button config", async () => {
        fetchSyncPost.mockResolvedValue({
            code: 0,
            data: [
                {content: config, ial: ""},
                {id: "b", content: "not json", ial: ""},
                {id: "c", content: "{\"foo\":1}", ial: `${ASSET_REFERENCE_ATTR}="assets/x.js"`},
            ],
        });
        await syncAssetReferences(makeContext());
        // 只有 c 会写：内容认不出按钮配置时按「没有脚本文件」处理，清掉旧属性
        expect(fetchSyncPost).toHaveBeenCalledTimes(2);
        expect(fetchSyncPost.mock.calls[1][1]).toEqual({id: "c", attrs: {[ASSET_REFERENCE_ATTR]: ""}});
    });

    it("keeps going when one write fails", async () => {
        fetchSyncPost
            .mockResolvedValueOnce({code: 0, data: [{id: "a", content: config, ial: ""}, {id: "b", content: config, ial: ""}]})
            .mockResolvedValueOnce({code: -1, msg: "locked"})
            .mockResolvedValueOnce({code: 0});
        await syncAssetReferences(makeContext());
        expect(fetchSyncPost).toHaveBeenCalledTimes(3);
    });

    it("does nothing when the query fails", async () => {
        fetchSyncPost.mockResolvedValue({code: -1, msg: "sql error"});
        await syncAssetReferences(makeContext());
        expect(fetchSyncPost).toHaveBeenCalledTimes(1);
    });

    it("does nothing when the query rejects", async () => {
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await expect(syncAssetReferences(makeContext())).resolves.toBeUndefined();
        expect(fetchSyncPost).toHaveBeenCalledTimes(1);
    });

    it("handles a response without a data array", async () => {
        fetchSyncPost.mockResolvedValue({code: 0});
        await expect(syncAssetReferences(makeContext())).resolves.toBeUndefined();
        expect(fetchSyncPost).toHaveBeenCalledTimes(1);
    });

    it("ignores rows without a usable ID", async () => {
        fetchSyncPost.mockResolvedValue({code: 0, data: [{}, {id: ""}, {id: "x", content: config, ial: ""}]});
        await syncAssetReferences(makeContext());
        expect(fetchSyncPost).toHaveBeenCalledTimes(2);
        expect(fetchSyncPost.mock.calls[1][1]).toEqual({id: "x", attrs: {[ASSET_REFERENCE_ATTR]: "assets/x.js"}});
    });
});
