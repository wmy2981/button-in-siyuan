import {Dialog, showMessage} from "siyuan";
import type {IButtonConfig, TButtonAction} from "./buttonBlock";
import {BUTTON_COLOR_INDEXES, updateButtonContent} from "./buttonBlock";
import {createCodeEditor} from "./codeEditor";
import type {IContext} from "./context";
import {createIconElement, openIconPicker} from "./icon";
import {createLogger} from "./logger";
import {openScriptDocs} from "./scriptDocs";

const log = createLogger("editDialog");

/** 打开「编辑按钮块」对话框，确定后由宿主的自定义块渲染器写回并重新渲染。 */
export const openButtonBlockEditor = (context: IContext, options: {
    blockID: string,
    config: IButtonConfig,
}) => {
    const {i18n} = context;
    const blockID = options.blockID;
    const config = options.config;
    let icon = config.icon;
    /** 0 表示不覆写颜色（思源原生蓝），见 BUTTON_COLOR_INDEXES。 */
    let color = config.color || 0;
    log.info("opened the button block editor", {
        blockID,
        text: config.text,
        icon: icon || "none",
        color: color || "default",
        action: config.action?.type || "none",
        isMobile: context.isMobile,
    });
    const dialog = new Dialog({
        title: i18n.editButtonBlock,
        width: context.isMobile ? "92vw" : "640px",
        content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">${i18n.buttonText}</div>
    <div class="fn__hr--small"></div>
    <input class="b3-text-field fn__block" data-bis="text" spellcheck="false" placeholder="${i18n.defaultButtonText}">
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${i18n.buttonIcon}</div>
    <div class="fn__hr--small"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline bis-icon-button" data-bis="icon">${i18n.chooseIcon}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--outline" data-bis="clear-icon">${i18n.clearIcon}</button>
    </div>
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${i18n.buttonColor}</div>
    <div class="fn__hr--small"></div>
    <div class="bis-button-colors" data-bis="colors"></div>
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${i18n.buttonAction}</div>
    <div class="fn__hr--small"></div>
    <select class="b3-select fn__block" data-bis="action">
        <option value="">${i18n.actionNone}</option>
        <option value="link">${i18n.actionLink}</option>
        <option value="script">${i18n.actionScript}</option>
    </select>
    <div data-bis="link-field">
        <div class="fn__hr"></div>
        <div class="ft__on-surface">${i18n.linkAddress}</div>
        <div class="fn__hr--small"></div>
        <input class="b3-text-field fn__block" data-bis="link" spellcheck="false" placeholder="${i18n.linkAddressPlaceholder}">
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.linkAddressTip}</div>
    </div>
    <div data-bis="script-field">
        <div class="fn__hr"></div>
        <div class="ft__on-surface">${i18n.scriptCode}</div>
        <div class="fn__hr--small"></div>
        <div data-bis="script-editor"></div>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.scriptCodeTip}</div>
        <div class="fn__hr--small"></div>
        <button type="button" class="bis-docs-link" data-bis="docs">${i18n.scriptDocs}</button>
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="cancel">${i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-bis="save">${i18n.save}</button>
</div>`,
    });
    const field = <T extends HTMLElement>(type: string) => {
        const element = dialog.element.querySelector<T>(`[data-bis="${type}"]`);
        if (!element) {
            throw new Error(`button-in-siyuan: dialog field [${type}] is missing`);
        }
        return element;
    };
    const textElement = field<HTMLInputElement>("text");
    const iconElement = field<HTMLButtonElement>("icon");
    const clearIconElement = field<HTMLButtonElement>("clear-icon");
    const colorsElement = field<HTMLElement>("colors");
    const actionElement = field<HTMLSelectElement>("action");
    const linkFieldElement = field<HTMLElement>("link-field");
    const linkElement = field<HTMLInputElement>("link");
    const scriptFieldElement = field<HTMLElement>("script-field");
    const scriptEditor = createCodeEditor({
        value: config.action?.type === "script" ? config.action.script : "",
        placeholder: i18n.scriptCodePlaceholder,
    });
    field<HTMLElement>("script-editor").append(scriptEditor.element);

    const updateIconElement = () => {
        iconElement.replaceChildren();
        if (icon) {
            iconElement.append(createIconElement(icon));
        }
        iconElement.append(document.createTextNode(icon || i18n.chooseIcon));
        clearIconElement.disabled = !icon;
    };
    // 色板用思源自己的 .color__square（正文颜色面板就是这些方块）：0 表示不覆写、用原生蓝，
    // 其余是 --b3-font-colorN 的序号，方块里显示一个「A」预览它的颜色。
    const colorSquares = [0, ...BUTTON_COLOR_INDEXES].map((index) => {
        const square = document.createElement("button");
        square.type = "button";
        square.className = "color__square";
        square.dataset.bisColor = String(index);
        square.setAttribute("aria-label", index === 0 ? i18n.buttonColorDefault : `${i18n.buttonColor} ${index}`);
        square.style.color = index === 0 ? "var(--b3-theme-primary)" : `var(--b3-font-color${index})`;
        square.textContent = "A";
        square.addEventListener("click", () => {
            color = index;
            updateColorElement();
            log.debug("button colour updated", {color: index || "default"});
        });
        colorsElement.append(square);
        return square;
    });
    const updateColorElement = () => {
        colorSquares.forEach((square) => {
            square.classList.toggle("color__square--current", Number(square.dataset.bisColor) === color);
            square.setAttribute("aria-pressed", String(Number(square.dataset.bisColor) === color));
        });
    };
    const updateActionFields = () => {
        linkFieldElement.classList.toggle("fn__none", actionElement.value !== "link");
        scriptFieldElement.classList.toggle("fn__none", actionElement.value !== "script");
    };

    textElement.value = config.text;
    actionElement.value = config.action?.type || "";
    linkElement.value = config.action?.type === "link" ? config.action.link : "";
    updateIconElement();
    updateColorElement();
    updateActionFields();
    actionElement.addEventListener("change", updateActionFields);
    iconElement.addEventListener("click", () => {
        openIconPicker(context, {
            selected: icon,
            onSelect: (name) => {
                icon = name;
                updateIconElement();
                log.debug("button icon updated", {icon: name});
            },
        });
    });
    clearIconElement.addEventListener("click", () => {
        icon = "";
        updateIconElement();
        log.debug("cleared the button icon");
    });
    field<HTMLButtonElement>("cancel").addEventListener("click", () => {
        log.debug("cancelled the button block editor", {blockID});
        dialog.destroy();
    });
    field<HTMLButtonElement>("docs").addEventListener("click", () => openScriptDocs(context));
    field<HTMLButtonElement>("save").addEventListener("click", () => {
        let action: TButtonAction | undefined;
        if (actionElement.value === "link") {
            const link = linkElement.value.trim();
            if (!link) {
                log.warn("save rejected: the link is empty", {blockID});
                showMessage(i18n.actionContentRequired);
                linkElement.focus();
                return;
            }
            action = {type: "link", link};
        } else if (actionElement.value === "script") {
            const script = scriptEditor.getValue();
            if (!script.trim()) {
                log.warn("save rejected: the JavaScript code is empty", {blockID});
                showMessage(i18n.actionContentRequired);
                scriptEditor.focus();
                return;
            }
            action = {type: "script", script};
        }
        const next: IButtonConfig = {
            text: textElement.value.trim() || i18n.defaultButtonText,
            icon,
            color: color || undefined,
            action,
        };
        if (!updateButtonContent(blockID, next)) {
            log.error("failed to write the button block back, keeping the dialog open", {blockID});
            showMessage(i18n.blockNotEditable);
            return;
        }
        log.info("saved the button block", {
            blockID,
            text: next.text,
            icon: icon || "none",
            color: color || "default",
            action: action?.type || "none",
        });
        dialog.destroy();
    });
    textElement.focus();
    textElement.select();
};
