import {Dialog} from "siyuan";
import type {IContext} from "./context";
import {createLogger} from "./logger";

const log = createLogger("icon");

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
    <input class="b3-text-field fn__block" data-bis="search" spellcheck="false" placeholder="${i18n.searchIcon}">
    <div class="fn__hr"></div>
    <div class="bis-icon-picker" data-bis="list"></div>
    <div class="bis-icon-picker__empty" data-bis="empty">${i18n.noMatchedIcon}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="cancel">${i18n.cancel}</button>
</div>`,
    });
    const searchElement = dialog.element.querySelector<HTMLInputElement>('[data-bis="search"]');
    const listElement = dialog.element.querySelector<HTMLElement>('[data-bis="list"]');
    const emptyElement = dialog.element.querySelector<HTMLElement>('[data-bis="empty"]');
    const cancelElement = dialog.element.querySelector<HTMLElement>('[data-bis="cancel"]');
    if (!searchElement || !listElement || !emptyElement || !cancelElement) {
        log.error("图标选择对话框的节点缺失，关闭对话框");
        dialog.destroy();
        return;
    }
    cancelElement.addEventListener("click", () => dialog.destroy());

    const names = collectIconNames();
    log.debug("打开图标选择对话框", {count: names.length, selected: options.selected || "none"});
    if (names.length === 0) {
        log.warn("当前界面没有可用的 SVG 图标");
    }
    const items = names.map(name => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `bis-icon-picker__item${name === options.selected ? " bis-icon-picker__item--current" : ""}`;
        item.dataset.icon = name;
        item.setAttribute("aria-label", name);
        item.append(createIconElement(name));
        item.addEventListener("click", () => {
            log.debug("选中图标", {name});
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
