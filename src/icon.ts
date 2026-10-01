import {Dialog} from "siyuan";
import type {IContext} from "./context";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * 思源内置图标是文档里的 <symbol id="iconXxx">，用 <use> 引用即可。
 * 带上思源自带的 .svg 类，让填充型图标跟随 currentColor。
 */
export const createIconElement = (icon: string) => {
    const svgElement = document.createElementNS(SVG_NS, "svg");
    svgElement.setAttribute("class", "svg");
    const useElement = document.createElementNS(SVG_NS, "use");
    useElement.setAttributeNS(XLINK_NS, "xlink:href", `#${icon}`);
    svgElement.append(useElement);
    return svgElement;
};

/** 收集当前界面可用的图标：内置图标集、第三方图标包和插件注册的图标都在文档的 symbol 里。 */
export const collectIconNames = () => {
    const names = new Set<string>();
    document.querySelectorAll<SVGSymbolElement>("symbol[id]").forEach(item => {
        if (item.id.startsWith("icon")) {
            names.add(item.id);
        }
    });
    return Array.from(names).sort();
};

/** 打开图标选择对话框，选中后回调图标名。 */
export const openIconPicker = (context: IContext, options: {
    selected: string,
    onSelect: (icon: string) => void,
}) => {
    const {i18n} = context;
    const dialog = new Dialog({
        title: i18n.chooseIconTitle,
        width: context.isMobile ? "92vw" : "560px",
        content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block" data-type="search" spellcheck="false" placeholder="${i18n.searchIcon}">
    <div class="fn__hr"></div>
    <div class="bis-icon-picker" data-type="list"></div>
    <div class="bis-icon-picker__empty" data-type="empty">${i18n.noMatchedIcon}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-type="cancel">${i18n.cancel}</button>
</div>`,
    });
    const searchElement = dialog.element.querySelector<HTMLInputElement>('[data-type="search"]');
    const listElement = dialog.element.querySelector<HTMLElement>('[data-type="list"]');
    const emptyElement = dialog.element.querySelector<HTMLElement>('[data-type="empty"]');
    const cancelElement = dialog.element.querySelector<HTMLElement>('[data-type="cancel"]');
    if (!searchElement || !listElement || !emptyElement || !cancelElement) {
        dialog.destroy();
        return;
    }
    cancelElement.addEventListener("click", () => dialog.destroy());

    const items = collectIconNames().map(name => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `bis-icon-picker__item${name === options.selected ? " bis-icon-picker__item--current" : ""}`;
        item.dataset.icon = name;
        item.setAttribute("aria-label", name);
        item.append(createIconElement(name));
        item.addEventListener("click", () => {
            options.onSelect(name);
            dialog.destroy();
        });
        listElement.append(item);
        return item;
    });
    emptyElement.classList.toggle("fn__none", items.length > 0);
    const filter = () => {
        const keyword = searchElement.value.trim().toLowerCase();
        let matched = 0;
        items.forEach(item => {
            const hit = (item.dataset.icon || "").toLowerCase().includes(keyword);
            item.classList.toggle("fn__none", !hit);
            if (hit) {
                matched++;
            }
        });
        emptyElement.classList.toggle("fn__none", matched > 0);
    };
    searchElement.addEventListener("input", filter);
    searchElement.focus();
};
