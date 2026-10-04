import {Dialog, showMessage} from "siyuan";
import type {IBreadcrumbConfig} from "./breadcrumbButton";
import {saveBreadcrumbConfig, syncBreadcrumbButtons} from "./breadcrumbButton";
import {DEFAULT_BUTTON_ICON} from "./buttonBlock";
import type {TButtonAction} from "./buttonBlock";
import {createCodeEditor} from "./codeEditor";
import type {IContext} from "./context";
import {guardUnsavedChanges} from "./discardChanges";
import {createIconElement, openIconPicker} from "./icon";
import {createLogger} from "./logger";
import {openScriptDocs} from "./scriptDocs";

const log = createLogger("breadcrumbDialog");

/**
 * 打开「配置按钮块」对话框：配置当前文档面包屑处那个按钮。
 *
 * 与「编辑按钮块」的差别只有字段本身 —— 面包屑上是一枚图标（下拉菜单里没有位置放文本），
 * 所以不支持文本与颜色；操作也不支持 JavaScript 文件（脚本要跟着文档同步，文件不跟着）。
 * 窗口样式、图标选择、操作字段、关窗前的确认都与按钮块一致。
 *
 * 开关只决定这个文档显不显示按钮，**关掉不会清掉图标与操作**（它们仍然留在文档属性里）。
 */
export const openBreadcrumbEditor = (context: IContext, options: {
    /** 文档块 ID */
    blockID: string;
    /** 这个文档当前的配置；没有就是还没配置过（默认关闭） */
    config?: IBreadcrumbConfig;
}) => {
    const {i18n} = context;
    const blockID = options.blockID;
    // 图标必填：没配置过、或者存量配置里缺图标时都用默认图标，用户不必先选一个才能开启
    let icon = options.config?.icon || DEFAULT_BUTTON_ICON;
    log.info("opened the breadcrumb button editor", {
        blockID,
        enabled: Boolean(options.config),
        icon,
        action: options.config?.action?.type || "none",
        isMobile: context.isMobile,
    });
    const dialog = new Dialog({
        title: i18n.configureButtonBlock,
        // 与「编辑按钮块」同一档宽度；用 min() 收在视口内（思源自己也给容器留了 88vw 的上限）
        width: "min(760px, 92vw)",
        content: `<div class="b3-dialog__content" data-bis="editor-body">
    <label class="fn__flex">
        <input type="checkbox" class="b3-switch fn__flex-center" data-bis="enable">
        <span class="fn__space"></span>
        <span class="ft__on-surface fn__flex-center">${i18n.breadcrumbButtonEnable}</span>
    </label>
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${i18n.buttonIcon}</div>
    <div class="fn__hr--small"></div>
    <button class="b3-button b3-button--outline bis-icon-button" data-bis="icon"></button>
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
    // 窗口高度由 updateActionFields 按「JavaScript 字段有没有展开」来给（与编辑按钮块一致）
    const containerElement = dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
    const enableElement = field<HTMLInputElement>("enable");
    const iconElement = field<HTMLButtonElement>("icon");
    const actionElement = field<HTMLSelectElement>("action");
    const linkFieldElement = field<HTMLElement>("link-field");
    const linkElement = field<HTMLInputElement>("link");
    const scriptFieldElement = field<HTMLElement>("script-field");
    const scriptEditor = createCodeEditor({
        value: options.config?.action?.type === "script" ? options.config.action.script : "",
        placeholder: i18n.scriptCodePlaceholder,
    });
    field<HTMLElement>("script-editor").append(scriptEditor.element);

    const updateIconElement = () => {
        iconElement.replaceChildren(createIconElement(icon), document.createTextNode(icon));
    };
    const updateActionFields = () => {
        const isScript = actionElement.value === "script";
        linkFieldElement.classList.toggle("fn__none", actionElement.value !== "link");
        scriptFieldElement.classList.toggle("fn__none", !isScript);
        // 写 JavaScript 时才给窗口一个默认高度：编辑区会填满正文剩下的空间（见 src/codeEditor.ts），
        // 其余操作的字段很少，窗口按内容自适应就好
        if (containerElement) {
            containerElement.style.height = isScript ? "min(84vh, 720px)" : "";
        }
    };
    /** 表单当前值 → 文档属性里的配置；保存与「有没有改过」的判断共用它。 */
    const currentConfig = (): IBreadcrumbConfig => {
        let action: TButtonAction | undefined;
        if (actionElement.value === "link") {
            action = {type: "link", link: linkElement.value.trim()};
        } else if (actionElement.value === "script") {
            action = {type: "script", script: scriptEditor.getValue()};
        }
        return {icon: icon || DEFAULT_BUTTON_ICON, action, enabled: enableElement.checked};
    };

    enableElement.checked = Boolean(options.config?.enabled);
    actionElement.value = options.config?.action?.type || "";
    linkElement.value = options.config?.action?.type === "link" ? options.config.action.link : "";
    updateIconElement();
    updateActionFields();
    // 改了东西且还没保存时，关窗前先问一次（取消、×、Esc、点遮罩四条路都拦，见 discardChanges.ts）。
    // 开关也进快照（它在 currentConfig 里）：只是开/关一下同样是改动
    const openedWith = JSON.stringify(currentConfig());
    let saved = false;
    guardUnsavedChanges(context, dialog, {blockID}, () => !saved && JSON.stringify(currentConfig()) !== openedWith);
    actionElement.addEventListener("change", updateActionFields);
    iconElement.addEventListener("click", () => {
        openIconPicker(context, {
            selected: icon,
            onSelect: (name) => {
                icon = name;
                updateIconElement();
                log.debug("breadcrumb button icon updated", {icon: name});
            },
        });
    });
    field<HTMLButtonElement>("cancel").addEventListener("click", () => {
        log.debug("cancelled the breadcrumb button editor", {blockID});
        dialog.destroy();
    });
    field<HTMLButtonElement>("docs").addEventListener("click", () => void openScriptDocs(context, {
        onLoad: (code) => {
            // 示例载入后把操作切到 JavaScript 并展开对应字段，不然用户看不到载进来的代码
            actionElement.value = "script";
            updateActionFields();
            scriptEditor.setValue(code);
            scriptEditor.focus();
        },
    }));
    field<HTMLButtonElement>("save").addEventListener("click", async () => {
        if (actionElement.value === "link" && !linkElement.value.trim()) {
            log.warn("save rejected: the link is empty", {blockID});
            showMessage(i18n.actionContentRequired);
            linkElement.focus();
            return;
        }
        if (actionElement.value === "script" && !scriptEditor.getValue().trim()) {
            log.warn("save rejected: the JavaScript code is empty", {blockID});
            showMessage(i18n.actionContentRequired);
            scriptEditor.focus();
            return;
        }
        // 关掉开关只是不在面包屑上显示：配置照旧写进属性，图标与操作不会丢
        const next = currentConfig();
        if (!await saveBreadcrumbConfig(blockID, next)) {
            log.error("failed to save the breadcrumb button, keeping the dialog open", {blockID});
            showMessage(i18n.breadcrumbSaveFailed);
            return;
        }
        log.info("saved the breadcrumb button", {
            blockID,
            enabled: next.enabled,
            icon: next.icon,
            action: next.action?.type || "none",
        });
        // 已经写进属性了，关窗时不必再问一次
        saved = true;
        // 内核把属性推回 DOM 是异步的，这里先按刚保存的配置重画按钮
        syncBreadcrumbButtons(context, {blockID, config: next});
        dialog.destroy();
    });
    // 打开窗口时不聚焦任何控件（焦点留在宿主的对话框容器上，Tab 与 Esc 照常，见 docs/development.md）
};
