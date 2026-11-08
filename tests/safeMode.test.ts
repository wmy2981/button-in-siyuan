import {describe, expect, it, vi} from "vitest";
import {getMobileSafeMode, setMobileSafeMode} from "../src/safeMode";

describe("mobile safe mode", () => {
    it("is off by default", () => {
        expect(getMobileSafeMode()).toBe(false);
    });

    it("remembers the switch on this device only", () => {
        setMobileSafeMode(true);
        expect(getMobileSafeMode()).toBe(true);
        expect(window.localStorage.getItem("button-in-siyuan/mobile-safe-mode")).toBe("true");
        // 只写 localStorage，不进插件设置，因此不跟随思源同步
        expect(window.localStorage.length).toBe(1);
        setMobileSafeMode(false);
        expect(getMobileSafeMode()).toBe(false);
    });

    it("falls back to off when localStorage throws", () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("denied");
        });
        try {
            expect(getMobileSafeMode()).toBe(false);
            // 写不进去也不抛：本次仍按传入值生效
            expect(setMobileSafeMode(true)).toBe(true);
        } finally {
            getItem.mockRestore();
            setItem.mockRestore();
        }
    });
});
