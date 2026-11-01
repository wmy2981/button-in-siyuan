import {describe, expect, it} from "vitest";
import {
    ASSET_OPEN_ACTIONS,
    DEFAULT_ASSET_OPEN,
    resolveAssetOpenAction,
    resolveAvailableAssetOpenAction,
    resolveExecutableAssetOpenAction,
} from "../src/assetOpen";

describe("resolveAssetOpenAction", () => {
    it("uses the defaults when the host config is missing", () => {
        expect(resolveAssetOpenAction(undefined)).toBe(DEFAULT_ASSET_OPEN.click);
        expect(resolveAssetOpenAction(undefined, {ctrlKey: true})).toBe(DEFAULT_ASSET_OPEN.ctrlClick);
        expect(resolveAssetOpenAction(undefined, {altKey: true})).toBe(DEFAULT_ASSET_OPEN.altClick);
        expect(resolveAssetOpenAction(undefined, {shiftKey: true})).toBe(DEFAULT_ASSET_OPEN.shiftClick);
    });

    it("reads the configured action for each gesture", () => {
        const config = {click: "current", ctrlClick: "right", altClick: "bottom", shiftClick: "folder"};
        expect(resolveAssetOpenAction(config)).toBe("current");
        expect(resolveAssetOpenAction(config, {ctrlKey: true})).toBe("right");
        expect(resolveAssetOpenAction(config, {altKey: true})).toBe("bottom");
        expect(resolveAssetOpenAction(config, {shiftKey: true})).toBe("folder");
    });

    it("falls back to the default for an unknown configured action", () => {
        const config = {click: "teleport", ctrlClick: "nope"};
        expect(resolveAssetOpenAction(config)).toBe(DEFAULT_ASSET_OPEN.click);
        expect(resolveAssetOpenAction(config, {ctrlKey: true})).toBe(DEFAULT_ASSET_OPEN.ctrlClick);
    });

    it("treats several modifiers as a plain click", () => {
        const config = {click: "current", ctrlClick: "folder", altClick: "app"};
        expect(resolveAssetOpenAction(config, {ctrlKey: true, altKey: true})).toBe("current");
        expect(resolveAssetOpenAction(config, {ctrlKey: true, altKey: true, shiftKey: true})).toBe("current");
    });

    it("does not let an empty modifier object count as a gesture", () => {
        expect(resolveAssetOpenAction({click: "bottom"}, {})).toBe("bottom");
    });

    it("covers every action the host knows", () => {
        ASSET_OPEN_ACTIONS.forEach((action) => {
            expect(resolveAssetOpenAction({click: action})).toBe(action);
        });
    });
});

describe("resolveExecutableAssetOpenAction", () => {
    it("hands non-previewable resources to the system", () => {
        expect(resolveExecutableAssetOpenAction("current", {previewable: false, noSplitScreen: false})).toBe("app");
        expect(resolveExecutableAssetOpenAction("app", {previewable: false, noSplitScreen: false})).toBe("app");
        expect(resolveExecutableAssetOpenAction("folder", {previewable: false, noSplitScreen: false})).toBe("folder");
    });

    it("expands follow-tab according to the split-screen setting", () => {
        expect(resolveExecutableAssetOpenAction("follow-tab", {previewable: true, noSplitScreen: false})).toBe("right");
        expect(resolveExecutableAssetOpenAction("follow-tab", {previewable: true, noSplitScreen: true})).toBe("current");
    });

    it("keeps the other actions untouched", () => {
        ASSET_OPEN_ACTIONS.filter((action) => action !== "follow-tab").forEach((action) => {
            expect(resolveExecutableAssetOpenAction(action, {previewable: true, noSplitScreen: false})).toBe(action);
        });
    });
});

describe("resolveAvailableAssetOpenAction", () => {
    it("falls back to the current tab without a local file system", () => {
        expect(resolveAvailableAssetOpenAction("app", false)).toBe("current");
        expect(resolveAvailableAssetOpenAction("folder", false)).toBe("current");
    });

    it("keeps the action when the system can open files", () => {
        expect(resolveAvailableAssetOpenAction("app", true)).toBe("app");
        expect(resolveAvailableAssetOpenAction("folder", true)).toBe("folder");
    });

    it("does not touch tab actions", () => {
        expect(resolveAvailableAssetOpenAction("right", false)).toBe("right");
    });
});
