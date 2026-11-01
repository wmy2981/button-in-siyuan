import {describe, expect, it, vi} from "vitest";
import {getIpcRenderer} from "../src/electron";

describe("getIpcRenderer", () => {
    it("returns undefined when window.require is missing", () => {
        delete (window as any).require;
        expect(getIpcRenderer()).toBeUndefined();
    });

    it("returns undefined when require does not return electron", () => {
        (window as any).require = vi.fn(() => undefined);
        expect(getIpcRenderer()).toBeUndefined();
        expect((window as any).require).toHaveBeenCalledWith("electron");
    });

    it("returns undefined when electron has no ipcRenderer", () => {
        (window as any).require = vi.fn(() => ({}));
        expect(getIpcRenderer()).toBeUndefined();
    });

    it("returns the ipcRenderer exposed by the desktop host", () => {
        const ipcRenderer = {send: vi.fn()};
        (window as any).require = vi.fn(() => ({ipcRenderer}));
        expect(getIpcRenderer()).toBe(ipcRenderer);
    });
});
