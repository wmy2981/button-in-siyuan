import {fetchSyncPost, showMessage} from "siyuan";
import {createDialog} from "../dialog";
import {setAssetReference} from "../../action/assetReference";
import {useBottomSheet} from "../bottomSheet";
import type {IButtonConfig, TButtonAction} from "../../button/buttonBlock";
import {BUTTON_COLOR_INDEXES, runAction, serializeButtonConfig, updateButtonContentAsync} from "../../button/buttonBlock";
import {createCodeEditor} from "../../editor/codeEditor";
import {commandLabel} from "../../action/commands";
import {openCommandPicker} from "./commandPicker";
import {confirmDanger} from "../confirmDanger";
import type {IContext} from "../../core/context";
import {guardUnsavedChanges} from "../discardChanges";
import {getMobileSafeMode} from "../safeMode";
import {createIconElement, openIconPicker} from "./icon";
import {createLogger} from "../../core/logger";
import {
    downloadScriptToAssets,
    isRemoteScript,
    normalizeScriptPath,
    removeWorkspaceFile,
} from "../../script/scriptFile";
import {openScriptFileEditor} from "./scriptFileDialog";
import {openScriptFileInfo} from "../../script/scriptFileInfo";
import {openScriptDocs} from "../../script/scriptDocs";

const log = createLogger("editDialog");

/**
 * 云端脚本的二次确认（issue #2）：强调引入云端文件可能不安全，给出三条路 —— 放弃、直接使用，
 * 或者下载到 assets/（随机文件名）之后与云端再无关系。
 *
 * 返回要继续使用的脚本路径（「直接使用」就是原地址，「下载到本地」是下载后的本地路径），
 * 放弃或直接关掉窗口时返回 undefined。
 */
const askAboutRemoteScript = (context: IContext, url: string) => new Promise<string | undefined>((resolve) => {
    const {i18n} = context;
    let settled = false;
    const finish = (path: string | undefined) => {
        if (!settled) {
            settled = true;
            resolve(path);
        }
    };
    const dialog = createDialog({
        title: i18n.cloudWarningTitle,
        width: context.isMobile ? "92vw" : "560px",
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">${i18n.cloudWarningTip}</div>
    <div class="fn__hr"></div>
    <div class="ft__on-surface ft__breakword" data-bis="url"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="cancel">${i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline" data-bis="remote">${i18n.cloudUseAnyway}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-bis="local">${i18n.cloudDownloadLocal}</button>
</div>`,
        destroyCallback: () => finish(undefined),
    });
    // 地址是用户填的，走 textContent 而不是拼进 HTML
    const urlElement = dialog.element.querySelector<HTMLElement>('[data-bis="url"]');
    if (urlElement) {
        urlElement.textContent = url;
    }
    dialog.element.querySelector('[data-bis="cancel"]')?.addEventListener("click", () => {
        log.info("the remote script was rejected");
        finish(undefined);
        dialog.destroy();
    });
    dialog.element.querySelector('[data-bis="remote"]')?.addEventListener("click", () => {
        log.info("the remote script is used as is", {url});
        finish(url);
        dialog.destroy();
    });
    const localElement = dialog.element.querySelector<HTMLButtonElement>('[data-bis="local"]');
    localElement?.addEventListener("click", async () => {
        // 下载期间禁用按钮，避免点两次下出两份文件
        localElement.disabled = true;
        try {
            const path = await downloadScriptToAssets(url);
            showMessage(`${i18n.cloudDownloaded} ${path}`);
            finish(path);
            dialog.destroy();
        } catch (error) {
            log.error("failed to download the remote script", {url, error});
            showMessage(i18n.cloudDownloadFailed);
            localElement.disabled = false;
        }
    });
});

/** 编辑窗口的选项。顶栏快捷操作与按钮块共用这个窗口，只是保存、删除、运行三个出口不同。 */
export interface IButtonEditorOptions {
    /** 按钮块 ID；顶栏快捷操作没有块，传空串。 */
    blockID: string;
    config: IButtonConfig;
    /**
     * 是否允许编辑。笔记锁定时传 false：窗口退化成预览 —— 所有编辑控件禁用、没有「确定」按钮，
     * 也完全不写回块内容（见 issue #19）。
     */
    editable?: boolean;
    /** 覆盖窗口标题（顶栏快捷操作用自己的标题）。 */
    title?: string;
    /**
     * 文案口径：编辑的是顶栏快捷操作而不是按钮块。字段标题与文本占位符换成「快捷操作」那一套
     * （issue #34），窗口结构与行为不变。
     */
    quickAction?: boolean;
    /** 是否显示配色选择，默认显示；顶栏快捷操作只允许文本、图标与操作，配色不可改（issue #30）。 */
    colorEditable?: boolean;
    /** 是否显示删除按钮，默认显示；新建顶栏快捷操作时还没有东西可删。 */
    deletable?: boolean;
    /** 保存出口；返回 false 时留在窗口里。不给就是按钮块，写回块内容。 */
    onSave?: (config: IButtonConfig) => Promise<boolean>;
    /** 删除出口（调用前已经二次确认）；返回 false 时留在窗口里。不给就是删除按钮块。 */
    onDelete?: () => Promise<boolean>;
    /** 运行出口；不给就走按钮块同一条 runAction。 */
    onRun?: (config: IButtonConfig) => void;
    /** 窗口关闭后执行（管理器用它刷新列表，块被删除或内容被改都会走到这里）。 */
    onClosed?: () => void;
}

/** 打开「编辑按钮块」对话框，确定后由宿主的自定义块渲染器写回并重新渲染。 */
export const openButtonBlockEditor = (context: IContext, options: IButtonEditorOptions) => {
    const {i18n} = context;
    const blockID = options.blockID;
    const config = options.config;
    const editable = options.editable !== false;
    const colorEditable = options.colorEditable !== false;
    const quickAction = options.quickAction === true;
    // 同一份窗口服务两种对象：字段标题与空文本的回落值跟着对象换词（issue #34）
    const textLabel = quickAction ? i18n.topBarTextLabel : i18n.buttonText;
    const iconLabel = quickAction ? i18n.topBarIconLabel : i18n.buttonIcon;
    const actionLabel = quickAction ? i18n.topBarActionLabel : i18n.buttonAction;
    const defaultText = quickAction ? i18n.topBarDefaultText : i18n.defaultButtonText;
    // 运行脚本时把块元素交给作用域，脚本里的 protyle 才能拿到当前编辑器；块不在当前窗口时为空
    const blockElement = blockID
        ? document.querySelector<HTMLElement>(`[data-type="NodeCustomBlock"][data-node-id="${blockID}"]`) || undefined
        : undefined;
    let icon = config.icon;
    /** 0 表示不覆写颜色（思源原生蓝），见 BUTTON_COLOR_INDEXES。 */
    let color = colorEditable ? config.color || 0 : 0;
    /** 命令操作的命令 id；空串表示还没选。 */
    let command = config.action?.type === "command" ? config.action.command : "";
    log.info("opened the button editor", {
        blockID: blockID || "topbar",
        text: config.text,
        icon: icon || "none",
        color: color || "default",
        action: config.action?.type || "none",
        isMobile: context.isMobile,
        editable,
        colorEditable,
    });
    // 移动端把这个对话框换成思源原生的底部抽屉（issue #23）；桌面端保持居中窗口。
    // 清理函数在对话框销毁时执行，移除手势监听并复原行内样式
    let disposeSheet: (() => void) | undefined;
    const dialog = createDialog({
        title: options.title || i18n.editButtonBlock,
        // 比原来的 640px 宽一圈；宽度用 min() 收在视口内（思源自己也给容器留了 88vw 的上限）
        width: "min(760px, 92vw)",
        destroyCallback: () => {
            disposeSheet?.();
            options.onClosed?.();
        },
        content: `<div class="b3-dialog__content" data-bis="editor-body">
    <div class="ft__on-surface ft__breakword fn__none" data-bis="readonly-tip"><strong>${i18n.readonlyPreviewTip}</strong></div>
    <div class="ft__on-surface">${textLabel}</div>
    <div class="fn__hr--small"></div>
    <input class="b3-text-field fn__block" data-bis="text" spellcheck="false" placeholder="${defaultText}">
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${iconLabel}</div>
    <div class="fn__hr--small"></div>
    <div class="fn__flex">
        <button class="b3-button b3-button--outline bis-icon-button" data-bis="icon">${i18n.chooseIcon}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--outline" data-bis="clear-icon">${i18n.clearIcon}</button>
    </div>
    <div data-bis="color-field" class="${colorEditable ? "" : "fn__none"}">
        <div class="fn__hr"></div>
        <div class="ft__on-surface">${i18n.buttonColor}</div>
        <div class="fn__hr--small"></div>
        <div class="bis-button-colors" data-bis="colors"></div>
    </div>
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${actionLabel}</div>
    <div class="fn__hr--small"></div>
    <select class="b3-select fn__block" data-bis="action">
        <option value="">${i18n.actionNone}</option>
        <option value="link">${i18n.actionLink}</option>
        <option value="script">${i18n.actionScript}</option>
        <option value="file">${i18n.actionFile}</option>
        <option value="command">${i18n.actionCommand}</option>
        <option value="prompt">${i18n.actionPrompt}</option>
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
    <div data-bis="file-field">
        <div class="fn__hr"></div>
        <div class="ft__on-surface">${i18n.scriptFile}</div>
        <div class="fn__hr--small"></div>
        <div class="fn__flex">
            <input class="b3-text-field fn__flex-1" data-bis="file" spellcheck="false" placeholder="${i18n.scriptFilePlaceholder}">
            <div class="fn__space"></div>
            <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="file-create" aria-label="${i18n.scriptFileCreate}"><svg class="svg"><use xlink:href="#iconAdd"></use></svg></button>
            <div class="fn__space"></div>
            <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="file-edit" aria-label="${i18n.scriptFileEdit}"><svg class="svg"><use xlink:href="#iconCode"></use></svg></button>
            <div class="fn__space"></div>
            <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="file-info" aria-label="${i18n.scriptFileInfo}"><svg class="svg"><use xlink:href="#iconEdit"></use></svg></button>
            <div class="fn__space"></div>
            <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="file-remove" aria-label="${i18n.scriptFileRemove}"><svg class="svg"><use xlink:href="#iconTrashcan"></use></svg></button>
        </div>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.scriptFileTip}</div>
    </div>
    <div data-bis="command-field">
        <div class="fn__hr"></div>
        <div class="fn__flex">
            <button type="button" class="b3-select fn__flex-1 bis-command-button" data-bis="command">${i18n.chooseCommand}</button>
        </div>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.commandTip}</div>
    </div>
    <div data-bis="prompt-field">
        <div class="fn__hr"></div>
        <div class="ft__on-surface">${i18n.promptText}</div>
        <div class="fn__hr--small"></div>
        <div data-bis="prompt-editor"></div>
        <div class="fn__hr"></div>
        <label class="fn__flex">
            <span class="fn__flex-1">${i18n.promptNewChat}</span>
            <input type="checkbox" class="b3-switch fn__flex-center" data-bis="prompt-new-chat">
        </label>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.promptNewChatTip}</div>
        <div class="fn__hr"></div>
        <label class="fn__flex">
            <span class="fn__flex-1">${i18n.promptAutoSend}</span>
            <input type="checkbox" class="b3-switch fn__flex-center" data-bis="prompt-auto-send">
        </label>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.promptTip}</div>
    </div>
</div>
<div class="b3-dialog__action">
    <div class="fn__flex bis-action-start">
        <button type="button" class="b3-button b3-button--remove b3-button--icon b3-tooltips b3-tooltips__n${options.deletable === false ? " fn__none" : ""}" data-bis="delete" aria-label="${options.onDelete ? i18n.deleteTopBarButton : i18n.deleteButtonBlock}"><svg><use xlink:href="#iconTrashcan"></use></svg></button>
        <div class="fn__space"></div>
        <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="run" aria-label="${i18n.runButtonBlock}"><svg><use xlink:href="#iconCirclePlay"></use></svg></button>
    </div>
    <button class="b3-button b3-button--cancel" data-bis="cancel">${i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text fn__none" data-bis="save">${i18n.save}</button>
</div>`,
    });
    // 宿主的 .b3-button 把 :hover 与 :focus 写成同一套样式，鼠标点过的按钮会一直像在悬停。
    // 这个标记让 index.scss 只对编辑窗口去掉「鼠标点完还留着」的焦点外观，键盘聚焦仍然保留
    dialog.element.classList.add("bis-editor-dialog");
    if (context.isMobile) {
        disposeSheet = useBottomSheet(dialog);
    }
    const field = <T extends HTMLElement>(type: string) => {
        const element = dialog.element.querySelector<T>(`[data-bis="${type}"]`);
        if (!element) {
            throw new Error(`button-in-siyuan: dialog field [${type}] is missing`);
        }
        return element;
    };
    // 窗口高度由 updateActionFields 按「JavaScript 字段有没有展开」来给
    const containerElement = dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
    const textElement = field<HTMLInputElement>("text");
    const iconElement = field<HTMLButtonElement>("icon");
    const clearIconElement = field<HTMLButtonElement>("clear-icon");
    const colorsElement = field<HTMLElement>("colors");
    const actionElement = field<HTMLSelectElement>("action");
    const linkFieldElement = field<HTMLElement>("link-field");
    const linkElement = field<HTMLInputElement>("link");
    const scriptFieldElement = field<HTMLElement>("script-field");
    const fileFieldElement = field<HTMLElement>("file-field");
    const fileElement = field<HTMLInputElement>("file");
    const commandFieldElement = field<HTMLElement>("command-field");
    const commandElement = field<HTMLButtonElement>("command");
    const promptFieldElement = field<HTMLElement>("prompt-field");
    const promptAutoSendElement = field<HTMLInputElement>("prompt-auto-send");
    const promptNewChatElement = field<HTMLInputElement>("prompt-new-chat");
    const editorSettings = context.getSettings();
    const scriptEditor = createCodeEditor({
        value: config.action?.type === "script" ? config.action.script : "",
        placeholder: i18n.scriptCodePlaceholder,
        codeWrap: editorSettings.codeWrap,
        codeLigatures: editorSettings.codeLigatures,
        editable,
    });
    field<HTMLElement>("script-editor").append(scriptEditor.element);
    const promptEditor = createCodeEditor({
        value: config.action?.type === "prompt" ? config.action.prompt : "",
        language: "markdown",
        placeholder: i18n.promptPlaceholder,
        codeWrap: editorSettings.codeWrap,
        codeLigatures: editorSettings.codeLigatures,
        editable,
    });
    field<HTMLElement>("prompt-editor").append(promptEditor.element);
    promptAutoSendElement.checked = config.action?.type === "prompt" && config.action.autoSend === true;
    promptNewChatElement.checked = config.action?.type === "prompt" && config.action.newChat === true;

    const updateIconElement = () => {
        iconElement.replaceChildren();
        if (icon) {
            iconElement.append(createIconElement(icon));
        }
        iconElement.append(document.createTextNode(icon || i18n.chooseIcon));
        clearIconElement.disabled = !editable || !icon;
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
        square.disabled = !editable;
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
        const wasScriptVisible = !scriptFieldElement.classList.contains("fn__none");
        const wasPromptVisible = !promptFieldElement.classList.contains("fn__none");
        const isScript = actionElement.value === "script";
        const isPrompt = actionElement.value === "prompt";
        linkFieldElement.classList.toggle("fn__none", actionElement.value !== "link");
        scriptFieldElement.classList.toggle("fn__none", !isScript);
        fileFieldElement.classList.toggle("fn__none", actionElement.value !== "file");
        commandFieldElement.classList.toggle("fn__none", actionElement.value !== "command");
        promptFieldElement.classList.toggle("fn__none", !isPrompt);
        // 编辑区刚从 display: none 切回可见时要重新测量：编辑器隐藏期间量到的尺寸是 0，
        // 直接打字会出现光标与落点错位、看起来像吞字符（issue #45 反馈）
        if (!wasScriptVisible && isScript) {
            scriptEditor.refresh();
        }
        if (!wasPromptVisible && isPrompt) {
            promptEditor.refresh();
        }
        // 写 JavaScript 或提示词时才给窗口一个默认高度：编辑区会填满正文剩下的空间，窗口拖动改尺寸它也跟着变
        // （见 src/editor/codeEditor.ts）。其余操作的字段很少，窗口按内容自适应就好，固定高度只会留一片空白
        if (containerElement) {
            containerElement.style.height = isScript || isPrompt ? "min(84vh, 720px)" : "";
        }
    };
    /** 命令按钮上显示选中命令的名字；还没选时显示「选择命令」。 */
    const updateCommandElement = () => {
        commandElement.textContent = commandLabel(context, command) || i18n.chooseCommand;
        commandElement.classList.toggle("bis-command-button--empty", !command);
    };
    /**
     * 表单当前值 → 块内容配置。保存与「有没有改过」的判断共用它，两处口径必须一致：
     * 关窗前的拦截就是拿它和打开时的快照比，一样就说明没什么可丢的。
     */
    const currentConfig = (): IButtonConfig => {
        let action: TButtonAction | undefined;
        if (actionElement.value === "link") {
            action = {type: "link", link: linkElement.value.trim()};
        } else if (actionElement.value === "script") {
            action = {type: "script", script: scriptEditor.getValue()};
        } else if (actionElement.value === "file") {
            const raw = fileElement.value.trim();
            // 本地脚本一律存成从工作空间根开始的完整路径；旧格式由 normalizeScriptPath 升级
            action = {type: "file", file: isRemoteScript(raw) ? raw : normalizeScriptPath(raw) || raw};
        } else if (actionElement.value === "command") {
            action = {type: "command", command};
        } else if (actionElement.value === "prompt") {
            action = {
                type: "prompt",
                prompt: promptEditor.getValue(),
                ...(promptNewChatElement.checked ? {newChat: true} : {}),
                ...(promptAutoSendElement.checked ? {autoSend: true} : {}),
            };
        }
        return {
            text: textElement.value.trim() || defaultText,
            icon,
            color: colorEditable ? color || undefined : undefined,
            action,
        };
    };

    textElement.value = config.text;
    actionElement.value = config.action?.type || "";
    linkElement.value = config.action?.type === "link" ? config.action.link : "";
    // 旧按钮里存的是 `assets/x.js`（相对数据目录），打开时直接显示升级后的完整路径；
    // 云端地址没有本地目录概念，原样保留
    const initialFile = config.action?.type === "file" ? config.action.file : "";
    fileElement.value = isRemoteScript(initialFile) ? initialFile : normalizeScriptPath(initialFile) || initialFile;
    updateIconElement();
    updateColorElement();
    updateCommandElement();
    updateActionFields();
    if (!editable) {
        // 预览模式（笔记锁定）：只读，字段与操作按钮全部禁用，「确定」不出现，只留「取消」关窗。
        // 路径输入框用 readonly 而不是 disabled —— 值要能读出来，「编辑」才能拿它去开只读预览
        textElement.disabled = true;
        actionElement.disabled = true;
        linkElement.disabled = true;
        fileElement.readOnly = true;
        iconElement.disabled = true;
        commandElement.disabled = true;
        promptAutoSendElement.disabled = true;
        promptNewChatElement.disabled = true;
        // 脚本文件的四个按钮里只有「编辑」留到预览模式（下面单独放行）：它打开的是只读窗口，不写盘
        ["file-create", "file-info", "file-remove"].forEach((type) => {
            field<HTMLButtonElement>(type).disabled = true;
        });
        dialog.element.querySelector('[data-bis="readonly-tip"]')?.classList.remove("fn__none");
        // 锁定的笔记里不能删块；运行仍可用，与直接点击按钮块的行为一致
        field<HTMLButtonElement>("delete").disabled = true;
    } else {
        field<HTMLButtonElement>("save").classList.remove("fn__none");
    }
    // 改了东西且还没保存时，关窗前先问一次（取消、×、Esc、点遮罩四条路都拦，见 discardChanges.ts）。
    // 预览模式下没有任何东西可以改，不用拦
    const openedWith = serializeButtonConfig(currentConfig());
    let saved = false;
    guardUnsavedChanges(context, dialog, {blockID},
        () => editable && !saved && serializeButtonConfig(currentConfig()) !== openedWith,
        // 快捷操作写回的是 JSON 文件，「放弃修改」的提示不能说「不会写回按钮块」
        quickAction ? i18n.topBarDiscardChangesTip : undefined);
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
    /**
     * 取输入框里的本地脚本路径（规范成工作空间相对路径）。云端地址与空值都只提示不动作：
     * 编辑代码、编辑文件信息、删除只对两个脚本目录下的 .js 文件开放（云端文件插件没有权限也不该改）。
     */
    const localScriptPath = () => {
        const path = normalizeScriptPath(fileElement.value);
        if (!path) {
            log.warn("the script file action needs a local script", {value: fileElement.value});
            showMessage(i18n.scriptFileNeeded);
            fileElement.focus();
            return;
        }
        return path;
    };
    const reportScriptFailure = (error: unknown, detail: Record<string, unknown>) => {
        log.error("script file operation failed", {...detail, error});
        showMessage(error instanceof Error && error.message ? error.message : i18n.scriptFileFailed);
    };
    field<HTMLButtonElement>("file-create").addEventListener("click", () => {
        openScriptFileInfo(context, {
            mode: "create",
            onSaved: (path) => {
                fileElement.value = path;
            },
        });
    });
    field<HTMLButtonElement>("file-edit").addEventListener("click", () => {
        // 这一条在预览模式下也留着：脚本文件窗口是只读的，看一眼文件内容不会改动任何东西
        const path = localScriptPath();
        if (path) {
            // 安全模式下打开这个满屏页面期间先把这个编辑窗口藏起来（issue #43，见 src/ui/safeMode.ts）
            const hideBelow = context.isMobile && getMobileSafeMode() ? dialog.element : undefined;
            void openScriptFileEditor(context, {path, editable, hideBelow});
        }
    });
    field<HTMLButtonElement>("file-info").addEventListener("click", () => {
        // 改名与移动共用一个窗口：位置可以换到 assets/ 或插件的 scripts/，名字一起改也行
        const path = localScriptPath();
        if (!path) {
            return;
        }
        openScriptFileInfo(context, {
            mode: "edit",
            path,
            onSaved: (next) => {
                fileElement.value = next;
            },
        });
    });
    field<HTMLButtonElement>("file-remove").addEventListener("click", () => {
        const path = localScriptPath();
        if (!path) {
            return;
        }
        confirmDanger(context, {
            title: i18n.scriptFileRemoveConfirm,
            tip: path,
            confirm: i18n.confirmDelete,
        }, () => {
            void removeWorkspaceFile(path).then(() => {
                // 文件已经不在，输入框里留着旧路径只会让保存后的按钮点不动
                if (fileElement.value.trim() === path) {
                    fileElement.value = "";
                }
                log.info("removed a script file", {path});
            }).catch((error) => reportScriptFailure(error, {path, action: "remove"}));
        });
    });
    field<HTMLButtonElement>("cancel").addEventListener("click", () => {
        log.debug("cancelled the button block editor", {blockID});
        dialog.destroy();
    });
    commandElement.addEventListener("click", () => {
        if (!editable) {
            log.warn("the command picker was rejected: the note is locked", {blockID});
            return;
        }
        openCommandPicker(context, {
            selected: command,
            onSelect: (id) => {
                command = id;
                updateCommandElement();
                log.debug("button command updated", {command: id});
            },
        });
    });
    field<HTMLButtonElement>("docs").addEventListener("click", () => void openScriptDocs(context, {
        onLoad: (code) => {
            // 示例载入后把操作切到 JavaScript 并展开对应字段，不然用户看不到载进来的代码
            actionElement.value = "script";
            updateActionFields();
            scriptEditor.setValue(code);
            scriptEditor.focus();
        },
        // 预览模式下「载入」按钮没有意义：编辑区不可写，载进来也只能看看
        editable,
    }));
    field<HTMLButtonElement>("save").addEventListener("click", async () => {
        if (!editable) {
            log.warn("save rejected: the note is locked, the editor is a preview", {blockID});
            return;
        }
        // 先逐项校验（并处理云端脚本的二次确认），确认无误后由 currentConfig() 统一取值
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
        if (actionElement.value === "command" && !command) {
            log.warn("save rejected: no command is chosen", {blockID});
            showMessage(i18n.commandRequired);
            return;
        }
        if (actionElement.value === "prompt" && !promptEditor.getValue().trim()) {
            log.warn("save rejected: the agent prompt is empty", {blockID});
            showMessage(i18n.promptRequired);
            promptEditor.focus();
            return;
        }
        if (actionElement.value === "file") {
            const path = fileElement.value.trim();
            if (!path) {
                log.warn("save rejected: the script file path is empty", {blockID});
                showMessage(i18n.scriptFileNeeded);
                fileElement.focus();
                return;
            }
            if (!isRemoteScript(path)) {
                const normalized = normalizeScriptPath(path);
                if (!normalized) {
                    log.warn("save rejected: the script file path is not in a managed directory", {blockID, path});
                    showMessage(i18n.scriptFileNeeded);
                    fileElement.focus();
                    return;
                }
                // 旧格式（assets/…）在这里升级成完整路径，按钮里从此只存一种形式
                fileElement.value = normalized;
            }
            if (isRemoteScript(path)) {
                const accepted = await askAboutRemoteScript(context, path);
                if (!accepted) {
                    // 放弃（或直接关掉警告窗口）：留在编辑窗口里继续改
                    return;
                }
                if (accepted !== path) {
                    // 选了「下载到本地」：输入框换成下载后的本地路径，从此与云端无关
                    fileElement.value = accepted;
                }
            }
        }
        const next = currentConfig();
        // 顶栏快捷操作由 onSave 写文件；块在别的文档里（管理器打开）时没有渲染器可写，
        // updateButtonContentAsync 会自动回落到内核的 updateBlock
        const written = options.onSave ? await options.onSave(next) : await updateButtonContentAsync(blockID, next);
        if (!written) {
            log.error("failed to write the button back, keeping the dialog open", {blockID: blockID || "topbar"});
            // 顶栏快捷操作的保存出口自己会给出失败提示，这里只在写块失败时补一条
            if (!options.onSave) {
                showMessage(i18n.blockNotEditable);
            }
            return;
        }
        log.info("saved the button", {
            blockID,
            text: next.text,
            icon: icon || "none",
            color: color || "default",
            action: next.action?.type || "none",
            file: next.action?.type === "file" ? next.action.file : "none",
        });
        // 让思源知道这个块引用了哪个脚本文件，免得它出现在「未引用的资源文件」里被清理掉。
        // 顶栏快捷操作不是块，没有块属性要维护
        if (!options.onSave) {
            void setAssetReference(blockID, next);
        }
        // 已经写回块里了，关窗时不必再问一次
        saved = true;
        dialog.destroy();
    });
    // 运行：拿表单当前值走与点击按钮块完全相同的 runAction，不用先保存就能试
    field<HTMLButtonElement>("run").addEventListener("click", () => {
        const running = currentConfig();
        log.info("running the button from the editor", {
            blockID: blockID || "topbar",
            action: running.action?.type || "none",
            editable,
        });
        if (options.onRun) {
            options.onRun(running);
        } else {
            runAction(context, {blockID, blockElement, config: running});
        }
    });
    // 删除：二次确认后走内核接口，块从文档里移除
    field<HTMLButtonElement>("delete").addEventListener("click", () => {
        if (!editable) {
            log.warn("delete rejected: the note is locked", {blockID});
            return;
        }
        confirmDanger(context, {
            title: options.onDelete ? i18n.deleteTopBarButton : i18n.deleteButtonBlock,
            tip: options.onDelete ? i18n.deleteTopBarButtonTip : i18n.deleteButtonBlockTip,
            confirm: i18n.confirmDelete,
        }, () => {
            void (async () => {
                try {
                    if (options.onDelete) {
                        if (!await options.onDelete()) {
                            log.error("failed to delete the top bar button");
                            showMessage(i18n.deleteTopBarButtonFailed);
                            return;
                        }
                    } else {
                        const response = await fetchSyncPost("/api/block/deleteBlock", {id: blockID}, undefined, false);
                        if (response.code !== 0) {
                            throw new Error(response.msg || `/api/block/deleteBlock code ${response.code}`);
                        }
                    }
                    log.info("deleted the button", {blockID: blockID || "topbar"});
                    // 已经删了，关窗时不用再问「放弃修改」
                    saved = true;
                    dialog.destroy();
                } catch (error) {
                    log.error("failed to delete the button", {blockID: blockID || "topbar", error});
                    showMessage(options.onDelete ? i18n.deleteTopBarButtonFailed : i18n.deleteButtonBlockFailed);
                }
            })();
        });
    });
    // 打开窗口时不聚焦任何输入框（原来是聚焦并全选按钮文字，顺手敲键盘就把它改掉了），要改哪一项用户自己点：
    // 焦点留在宿主的对话框容器上，Tab 与 Esc 照常
};
