import {Dialog, showMessage} from "siyuan";
import type {IProtyle} from "siyuan";
import type {IButtonConfig, TButtonAction} from "./buttonBlock";
import {parseButtonConfig, serializeButtonConfig} from "./buttonBlock";
import type {IContext} from "./context";
import {createIconElement, openIconPicker} from "./icon";

/**
 * 按思源自定义块的更新方式写回配置：先改 data-content，再走编辑器事务，
 * 事务完成后思源会重新调用渲染器。找不到块（已被删除或换页）时返回 false。
 */
const saveButtonBlock = (protyle: IProtyle, blockID: string, element: HTMLElement, config: IButtonConfig) => {
    if (!blockID) {
        return false;
    }
    const target = element.isConnected ? element :
        protyle.wysiwyg?.element.querySelector<HTMLElement>(`[data-node-id="${blockID}"]`);
    if (!target || target.getAttribute("data-type") !== "NodeCustomBlock") {
        return false;
    }
    const oldHTML = target.outerHTML;
    target.setAttribute("data-content", serializeButtonConfig(config));
    protyle.getInstance().updateTransactionElement(target, oldHTML);
    return true;
};

/** 打开「编辑按钮块」对话框。 */
export const openButtonBlockEditor = (context: IContext, options: {protyle: IProtyle, element: HTMLElement}) => {
    const {i18n} = context;
    const blockID = options.element.getAttribute("data-node-id") || "";
    const config = parseButtonConfig(options.element.getAttribute("data-content") || "", i18n.defaultButtonText) ||
        {text: i18n.defaultButtonText, icon: ""};
    let icon = config.icon;
    const dialog = new Dialog({
        title: i18n.editButtonBlock,
        width: context.isMobile ? "92vw" : "560px",
        content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">${i18n.buttonText}</div>
    <div class="fn__hr--small"></div>
    <input class="b3-text-field fn__block" data-bis="text" spellcheck="false" placeholder="${i18n.defaultButtonText}">
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${i18n.buttonIcon}</div>
    <div class="fn__hr--small"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline" data-bis="icon">${i18n.chooseIcon}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--outline" data-bis="clear-icon">${i18n.clearIcon}</button>
    </div>
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
        <textarea class="b3-text-field fn__block bis-script-input" data-bis="script" spellcheck="false" placeholder="${i18n.scriptCodePlaceholder}"></textarea>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.scriptCodeTip}</div>
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
    const actionElement = field<HTMLSelectElement>("action");
    const linkFieldElement = field<HTMLElement>("link-field");
    const linkElement = field<HTMLInputElement>("link");
    const scriptFieldElement = field<HTMLElement>("script-field");
    const scriptElement = field<HTMLTextAreaElement>("script");

    const updateIconElement = () => {
        iconElement.replaceChildren();
        if (icon) {
            iconElement.append(createIconElement(icon));
        }
        iconElement.append(document.createTextNode(icon || i18n.chooseIcon));
        clearIconElement.disabled = !icon;
    };
    const updateActionFields = () => {
        linkFieldElement.classList.toggle("fn__none", actionElement.value !== "link");
        scriptFieldElement.classList.toggle("fn__none", actionElement.value !== "script");
    };

    textElement.value = config.text;
    actionElement.value = config.action?.type || "";
    linkElement.value = config.action?.type === "link" ? config.action.link : "";
    scriptElement.value = config.action?.type === "script" ? config.action.script : "";
    updateIconElement();
    updateActionFields();
    actionElement.addEventListener("change", updateActionFields);
    iconElement.addEventListener("click", () => {
        openIconPicker(context, {
            selected: icon,
            onSelect: (name) => {
                icon = name;
                updateIconElement();
            },
        });
    });
    clearIconElement.addEventListener("click", () => {
        icon = "";
        updateIconElement();
    });
    field<HTMLButtonElement>("cancel").addEventListener("click", () => dialog.destroy());
    field<HTMLButtonElement>("save").addEventListener("click", () => {
        let action: TButtonAction | undefined;
        if (actionElement.value === "link") {
            const link = linkElement.value.trim();
            if (!link) {
                showMessage(i18n.actionContentRequired);
                linkElement.focus();
                return;
            }
            action = {type: "link", link};
        } else if (actionElement.value === "script") {
            const script = scriptElement.value;
            if (!script.trim()) {
                showMessage(i18n.actionContentRequired);
                scriptElement.focus();
                return;
            }
            action = {type: "script", script};
        }
        const next: IButtonConfig = {text: textElement.value.trim() || i18n.defaultButtonText, icon, action};
        if (!saveButtonBlock(options.protyle, blockID, options.element, next)) {
            showMessage(i18n.blockNotFound);
            return;
        }
        dialog.destroy();
    });
    textElement.focus();
    textElement.select();
};
