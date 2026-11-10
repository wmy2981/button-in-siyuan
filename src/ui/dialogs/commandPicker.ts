import {createDialog} from "../dialog";
import type {IContext} from "../../core/context";
import {listCommands} from "../../action/commands";
import {createLogger} from "../../core/logger";

const log = createLogger("commandPicker");

/**
 * 命令选择窗口（issue #38）：列出命令面板里的命令，输入关键字过滤，点一项就选中。
 * 结构与图标选择窗口一致（搜索框 + 列表 + 取消），选择本身不写任何东西。
 */
export const openCommandPicker = (context: IContext, options: {
    /** 当前绑定的命令 id，列表里高亮它 */
    selected: string;
    onSelect: (id: string) => void;
}) => {
    const {i18n} = context;
    const dialog = createDialog({
        title: i18n.commandPickerTitle,
        width: context.isMobile ? "92vw" : "560px",
        content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block" data-bis="search" spellcheck="false" placeholder="${i18n.searchCommand}">
    <div class="fn__hr"></div>
    <div class="bis-command-picker" data-bis="list"></div>
    <div class="bis-icon-picker__empty" data-bis="empty">${i18n.noMatchedCommand}</div>
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
        log.error("the command picker dialog has missing nodes, closing it");
        dialog.destroy();
        return;
    }
    cancelElement.addEventListener("click", () => dialog.destroy());
    const items = listCommands(context).map((command) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `b3-list-item bis-command-picker__item${command.id === options.selected ? " bis-command-picker__item--current" : ""}`;
        item.dataset.command = command.id;
        const textElement = document.createElement("span");
        textElement.className = "b3-list-item__text";
        textElement.textContent = command.label;
        item.append(textElement);
        item.addEventListener("click", () => {
            log.debug("command picked", {id: command.id});
            options.onSelect(command.id);
            dialog.destroy();
        });
        listElement.append(item);
        return {item, label: command.label.toLowerCase(), id: command.id.toLowerCase()};
    });
    log.debug("opened the command picker", {count: items.length, selected: options.selected || "none"});
    emptyElement.classList.toggle("fn__none", items.length > 0);
    const filter = () => {
        const keyword = searchElement.value.trim().toLowerCase();
        let matched = 0;
        items.forEach(({item, label, id}) => {
            const hit = !keyword || label.includes(keyword) || id.includes(keyword);
            item.classList.toggle("fn__none", !hit);
            if (hit) {
                matched++;
            }
        });
        emptyElement.classList.toggle("fn__none", matched > 0);
    };
    searchElement.addEventListener("input", filter);
    // 桌面端打开就聚焦搜索框；移动端不主动聚焦（App 里 focus 会直接唤起软键盘，窗口打开那一帧会闪），
    // 与图标选择窗口同一条理由（docs/development.md）
    if (!context.isMobile) {
        searchElement.focus();
    }
};
