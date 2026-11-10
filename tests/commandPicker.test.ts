import {describe, expect, it, vi} from "vitest";
import {openCommandPicker} from "../src/ui/dialogs/commandPicker";
import {Dialog} from "./mocks/siyuan";
import {makeContext} from "./helpers";

const setKeymap = (general: Record<string, {custom?: string}>, languages: Record<string, string>) => {
    (window as any).siyuan.config.keymap = {general};
    (window as any).siyuan.languages = languages;
};

describe("openCommandPicker", () => {
    const open = (selected = "", onSelect = vi.fn(), context = makeContext()) => {
        openCommandPicker(context, {selected, onSelect});
        const dialog = Dialog.instances.at(-1);
        if (!dialog) {
            throw new Error("no dialog");
        }
        return {dialog, onSelect};
    };

    const items = (dialog: Dialog) => dialog.element.querySelectorAll<HTMLElement>(".bis-command-picker__item");

    it("lists the commands and marks the selected one", () => {
        setKeymap({config: {custom: "⌥P"}, dailyNote: {}}, {config: "Settings", dailyNote: "Daily note"});
        const {dialog} = open("dailyNote");
        expect(items(dialog)).toHaveLength(2);
        expect(items(dialog)[0].querySelector(".b3-list-item__text")?.textContent).toBe("Settings");
        expect(items(dialog)[1].classList.contains("bis-command-picker__item--current")).toBe(true);
    });

    it("filters by label and by id, and hides the empty hint", () => {
        setKeymap({config: {}, dailyNote: {}}, {config: "Settings", dailyNote: "Daily note"});
        const {dialog} = open();
        const search = dialog.element.querySelector<HTMLInputElement>('[data-bis="search"]') as HTMLInputElement;
        const empty = dialog.element.querySelector<HTMLElement>('[data-bis="empty"]');
        expect(empty?.classList.contains("fn__none")).toBe(true);
        search.value = "DAILY";
        search.dispatchEvent(new Event("input"));
        expect(items(dialog)[0].classList.contains("fn__none")).toBe(true);
        expect(items(dialog)[1].classList.contains("fn__none")).toBe(false);
        search.value = "nomatch";
        search.dispatchEvent(new Event("input"));
        expect(empty?.classList.contains("fn__none")).toBe(false);
    });

    it("shows the empty hint when there is no command at all", () => {
        setKeymap({}, {});
        const {dialog} = open();
        expect(items(dialog)).toHaveLength(0);
        expect(dialog.element.querySelector<HTMLElement>('[data-bis="empty"]')?.classList.contains("fn__none")).toBe(false);
    });

    it("focuses the search field on the desktop and not on mobile", () => {
        setKeymap({config: {}}, {config: "Settings"});
        const {dialog} = open();
        expect(document.activeElement).toBe(dialog.element.querySelector('[data-bis="search"]'));
        dialog.destroy();
        const mobile = open("", vi.fn(), makeContext({isMobile: true}));
        expect(document.activeElement).not.toBe(mobile.dialog.element.querySelector('[data-bis="search"]'));
    });

    it("returns the picked id and closes", () => {
        setKeymap({config: {}, dailyNote: {}}, {config: "Settings", dailyNote: "Daily note"});
        const onSelect = vi.fn();
        const {dialog} = open("", onSelect);
        items(dialog)[1].click();
        expect(onSelect).toHaveBeenCalledWith("dailyNote");
        expect(dialog.destroyed).toBe(true);
    });

    it("closes without picking from the cancel button", () => {
        setKeymap({config: {}}, {config: "Settings"});
        const onSelect = vi.fn();
        const {dialog} = open("", onSelect);
        dialog.element.querySelector<HTMLElement>('[data-bis="cancel"]')?.click();
        expect(onSelect).not.toHaveBeenCalled();
        expect(dialog.destroyed).toBe(true);
    });
});
