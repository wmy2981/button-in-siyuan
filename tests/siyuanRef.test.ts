import {describe, expect, it} from "vitest";
import {fillSiyuanRef, resolveSiyuanRef, SIYUAN_REF_PLACEHOLDER} from "../src/siyuanRef";
import {fetchSyncPost} from "./mocks/siyuan";

describe("fillSiyuanRef", () => {
    it("replaces every placeholder", () => {
        expect(fillSiyuanRef(`a ${SIYUAN_REF_PLACEHOLDER} b ${SIYUAN_REF_PLACEHOLDER}`, "v3.8.6"))
            .toBe("a v3.8.6 b v3.8.6");
    });

    it("leaves text without a placeholder untouched", () => {
        expect(fillSiyuanRef("plain", "v3.8.6")).toBe("plain");
    });
});

describe("resolveSiyuanRef", () => {
    it("uses the kernel version already loaded by the host", async () => {
        await expect(resolveSiyuanRef()).resolves.toBe("v3.8.6");
        expect(fetchSyncPost).not.toHaveBeenCalled();
    });

    it("does not double the v prefix", async () => {
        (window as any).siyuan.config.system.kernelVersion = "v3.8.6";
        await expect(resolveSiyuanRef()).resolves.toBe("v3.8.6");
    });

    it("trims the cached version", async () => {
        (window as any).siyuan.config.system.kernelVersion = "  3.8.7-alpha.3  ";
        await expect(resolveSiyuanRef()).resolves.toBe("v3.8.7-alpha.3");
    });

    it("falls back to the version endpoint", async () => {
        (window as any).siyuan.config.system.kernelVersion = "";
        fetchSyncPost.mockResolvedValue({code: 0, data: "3.9.0"});
        await expect(resolveSiyuanRef()).resolves.toBe("v3.9.0");
        expect(fetchSyncPost).toHaveBeenCalledWith("/api/system/version", {}, undefined, false);
    });

    it("falls back to dev when the endpoint fails", async () => {
        (window as any).siyuan.config.system.kernelVersion = undefined;
        fetchSyncPost.mockResolvedValue({code: -1, msg: "no version"});
        await expect(resolveSiyuanRef()).resolves.toBe("dev");
    });

    it("falls back to dev when the endpoint returns an empty value", async () => {
        (window as any).siyuan.config.system.kernelVersion = undefined;
        fetchSyncPost.mockResolvedValue({code: 0, data: "  "});
        await expect(resolveSiyuanRef()).resolves.toBe("dev");
    });

    it("falls back to dev when the endpoint rejects", async () => {
        (window as any).siyuan.config.system.kernelVersion = undefined;
        fetchSyncPost.mockRejectedValue(new Error("offline"));
        await expect(resolveSiyuanRef()).resolves.toBe("dev");
    });

    it("falls back to the endpoint when the cached value is not a string", async () => {
        (window as any).siyuan.config.system.kernelVersion = 3;
        fetchSyncPost.mockResolvedValue({code: 0, data: "3.8.6"});
        await expect(resolveSiyuanRef()).resolves.toBe("v3.8.6");
    });
});
