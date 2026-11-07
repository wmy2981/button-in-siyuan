import {describe, expect, it, vi} from "vitest";
import {collectIconNames, createIconElement, openIconPicker} from "../src/icon";
import {Dialog} from "./mocks/siyuan";
import {makeContext} from "./helpers";

const addSymbols = (...ids: string[]) => {
    ids.forEach((id) => {
        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
        symbol.id = id;
        document.body.append(symbol);
    });
};

describe("createIconElement", () => {
    it("creates an svg that references the SiYuan symbol", () => {
        const element = createIconElement("iconPlay");
        expect(element.namespaceURI).toBe("http://www.w3.org/2000/svg");
        expect(element.getAttribute("class")).toBe("svg");
        const use = element.querySelector("use");
        expect(use?.getAttribute("xlink:href")).toBe("#iconPlay");
    });
});

describe("collectIconNames", () => {
    it("collects the icon symbols and sorts them", () => {
        addSymbols("iconZap", "iconAdd", "iconAdd", "other", "iconSettings");
        expect(collectIconNames()).toEqual(["iconAdd", "iconSettings", "iconZap"]);
    });

    it("returns an empty list when the ui has no icons", () => {
        expect(collectIconNames()).toEqual([]);
    });
});

describe("openIconPicker", () => {
    const open = (selected = "", onSelect = vi.fn()) => {
        openIconPicker(makeContext(), {selected, onSelect});
        const dialog = Dialog.instances.at(-1);
        if (!dialog) {
            throw new Error("no dialog");
        }
        return {dialog, onSelect};
    };

    it("lists every available icon and marks the selected one", () => {
        addSymbols("iconPlay", "iconPause");
        const {dialog} = open("iconPlay");
        const items = dialog.element.querySelectorAll<HTMLElement>(".bis-icon-picker__item");
        expect(items).toHaveLength(2);
        expect(items[0].dataset.icon).toBe("iconPause");
        expect(items[1].classList.contains("bis-icon-picker__item--current")).toBe(true);
        expect(items[1].getAttribute("aria-label")).toBe("iconPlay");
        expect(items[1].querySelector("svg")).not.toBeNull();
    });

    it("shows the empty hint when no icon is available", () => {
        const {dialog} = open();
        const empty = dialog.element.querySelector<HTMLElement>('[data-bis="empty"]');
        expect(empty?.classList.contains("fn__none")).toBe(false);
        expect(dialog.element.querySelectorAll(".bis-icon-picker__item")).toHaveLength(0);
    });

    it("hides the empty hint when there are icons", () => {
        addSymbols("iconPlay");
        const {dialog} = open();
        expect(dialog.element.querySelector<HTMLElement>('[data-bis="empty"]')?.classList.contains("fn__none")).toBe(true);
    });

    it("filters the icons as the user types", () => {
        addSymbols("iconPlay", "iconPause", "iconAdd");
        const {dialog} = open();
        const search = dialog.element.querySelector<HTMLInputElement>('[data-bis="search"]') as HTMLInputElement;
        search.value = "PAU";
        search.dispatchEvent(new Event("input"));
        const items = dialog.element.querySelectorAll<HTMLElement>(".bis-icon-picker__item");
        expect(items[0].classList.contains("fn__none")).toBe(true);
        expect(items[1].classList.contains("fn__none")).toBe(false);
        expect(items[2].classList.contains("fn__none")).toBe(true);
    });

    it("shows the empty hint when the filter matches nothing", () => {
        addSymbols("iconPlay");
        const {dialog} = open();
        const search = dialog.element.querySelector<HTMLInputElement>('[data-bis="search"]') as HTMLInputElement;
        search.value = "zzz";
        search.dispatchEvent(new Event("input"));
        expect(dialog.element.querySelector<HTMLElement>('[data-bis="empty"]')?.classList.contains("fn__none")).toBe(false);
    });

    it("focuses the search field on open", () => {
        addSymbols("iconPlay");
        const {dialog} = open();
        expect(document.activeElement).toBe(dialog.element.querySelector('[data-bis="search"]'));
    });

    it("selects an icon and closes", () => {
        addSymbols("iconPlay", "iconAdd");
        const onSelect = vi.fn();
        const {dialog} = open("", onSelect);
        const item = dialog.element.querySelector<HTMLElement>(".bis-icon-picker__item");
        item?.click();
        expect(onSelect).toHaveBeenCalledWith("iconAdd");
        expect(dialog.destroyed).toBe(true);
    });

    it("closes without selecting from the cancel button", () => {
        addSymbols("iconPlay");
        const onSelect = vi.fn();
        const {dialog} = open("", onSelect);
        dialog.element.querySelector<HTMLElement>('[data-bis="cancel"]')?.click();
        expect(onSelect).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(true);
    });
});
