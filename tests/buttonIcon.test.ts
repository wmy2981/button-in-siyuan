import {describe, expect, it} from "vitest";
import {BUTTON_ICON_SVG, createButtonBlockIconHtml} from "../src/buttonIcon";

describe("createButtonBlockIconHtml", () => {
    it("returns a list icon that follows the current text color", () => {
        const html = createButtonBlockIconHtml();
        expect(html).toContain('class="b3-list-item__graphic"');
        expect(html).toContain('viewBox="33 48 94 64"');
        expect(html).toContain('stroke="currentColor"');
        expect(html).toContain('d="M9 12h5.6"');
    });

    it("does not fill the button panel in the list icon", () => {
        expect(createButtonBlockIconHtml()).not.toContain("fill-opacity");
    });

    it("is valid SVG markup", () => {
        const parsed = new DOMParser().parseFromString(createButtonBlockIconHtml(), "image/svg+xml");
        expect(parsed.querySelector("parsererror")).toBeNull();
        expect(parsed.documentElement.tagName).toBe("svg");
        expect(parsed.querySelectorAll("rect")).toHaveLength(1);
        expect(parsed.querySelectorAll("path")).toHaveLength(1);
    });
});

describe("BUTTON_ICON_SVG", () => {
    it("is a square 160 canvas with the brand color", () => {
        expect(BUTTON_ICON_SVG).toContain('width="160"');
        expect(BUTTON_ICON_SVG).toContain('height="160"');
        expect(BUTTON_ICON_SVG).toContain('viewBox="0 0 160 160"');
        expect(BUTTON_ICON_SVG).toContain("#3575F0");
        expect(BUTTON_ICON_SVG).toContain("<title>Button Block</title>");
    });

    it("keeps the three frosted-glass layers", () => {
        expect(BUTTON_ICON_SVG).toContain('id="bis-icon-surface"');
        expect(BUTTON_ICON_SVG).toContain('id="bis-icon-glow"');
        expect(BUTTON_ICON_SVG).toContain('id="bis-icon-grain"');
        expect(BUTTON_ICON_SVG).toContain("feGaussianBlur");
        expect(BUTTON_ICON_SVG).toContain("feTurbulence");
    });

    it("is valid SVG markup", () => {
        const parsed = new DOMParser().parseFromString(BUTTON_ICON_SVG, "image/svg+xml");
        expect(parsed.querySelector("parsererror")).toBeNull();
        expect(parsed.documentElement.getAttribute("width")).toBe("160");
    });
});
