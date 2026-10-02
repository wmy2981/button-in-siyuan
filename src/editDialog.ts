import {confirm, Dialog, openInputDialog, showMessage} from "siyuan";
import type {IButtonConfig, TButtonAction} from "./buttonBlock";
import {BUTTON_COLOR_INDEXES, updateButtonContent} from "./buttonBlock";
import {createCodeEditor} from "./codeEditor";
import type {IContext} from "./context";
import {createIconElement, openIconPicker} from "./icon";
import {createLogger} from "./logger";
import {
    ASSET_PREFIX,
    downloadScriptToAssets,
    isLocalScript,
    isRemoteScript,
    removeWorkspaceFile,
    renameWorkspaceFile,
    toAssetScriptPath,
    workspaceFileExists,
    writeWorkspaceFile,
} from "./scriptFile";
import {openScriptFileEditor} from "./scriptFileDialog";
import {openScriptDocs} from "./scriptDocs";

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
    const dialog = new Dialog({
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
        <option value="file">${i18n.actionFile}</option>
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
            <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="file-rename" aria-label="${i18n.scriptFileRename}"><svg class="svg"><use xlink:href="#iconEdit"></use></svg></button>
            <div class="fn__space"></div>
            <button type="button" class="b3-button b3-button--outline b3-button--icon b3-tooltips b3-tooltips__n" data-bis="file-remove" aria-label="${i18n.scriptFileRemove}"><svg class="svg"><use xlink:href="#iconTrashcan"></use></svg></button>
        </div>
        <div class="fn__hr--small"></div>
        <div class="ft__on-surface ft__smaller">${i18n.scriptFileTip}</div>
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
    const fileFieldElement = field<HTMLElement>("file-field");
    const fileElement = field<HTMLInputElement>("file");
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
        fileFieldElement.classList.toggle("fn__none", actionElement.value !== "file");
    };

    textElement.value = config.text;
    actionElement.value = config.action?.type || "";
    linkElement.value = config.action?.type === "link" ? config.action.link : "";
    fileElement.value = config.action?.type === "file" ? config.action.file : "";
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
    /**
     * 取输入框里的本地脚本路径。云端地址与空值都只提示不动作：编辑、重命名、删除只对
     * assets/ 下的 .js 文件开放（云端文件插件没有权限也不该改）。
     */
    const localScriptPath = () => {
        const path = fileElement.value.trim();
        if (!isLocalScript(path)) {
            log.warn("the script file action needs a local assets/ script", {path});
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
        openInputDialog({
            title: i18n.scriptFileCreateTitle,
            label: i18n.scriptFileName,
            value: "button-action.js",
            onConfirm: async (value, inputDialog) => {
                const path = toAssetScriptPath(value);
                if (!path) {
                    showMessage(i18n.scriptFileInvalidName);
                    return;
                }
                try {
                    if (await workspaceFileExists(path)) {
                        showMessage(i18n.scriptFileExists);
                        return;
                    }
                    await writeWorkspaceFile(path, "");
                } catch (error) {
                    reportScriptFailure(error, {path, action: "create"});
                    return;
                }
                fileElement.value = path;
                log.info("created a script file", {path});
                inputDialog.destroy();
            },
        });
    });
    field<HTMLButtonElement>("file-edit").addEventListener("click", () => {
        const path = localScriptPath();
        if (path) {
            void openScriptFileEditor(context, {path});
        }
    });
    field<HTMLButtonElement>("file-rename").addEventListener("click", () => {
        const path = localScriptPath();
        if (!path) {
            return;
        }
        openInputDialog({
            title: i18n.scriptFileRenameTitle,
            label: i18n.scriptFileName,
            value: path.substring(ASSET_PREFIX.length),
            onConfirm: async (value, inputDialog) => {
                const next = toAssetScriptPath(value);
                if (!next) {
                    showMessage(i18n.scriptFileInvalidName);
                    return;
                }
                if (next === path) {
                    inputDialog.destroy();
                    return;
                }
                try {
                    if (await workspaceFileExists(next)) {
                        showMessage(i18n.scriptFileExists);
                        return;
                    }
                    await renameWorkspaceFile(path, next);
                } catch (error) {
                    reportScriptFailure(error, {path, next, action: "rename"});
                    return;
                }
                fileElement.value = next;
                log.info("renamed a script file", {path, next});
                inputDialog.destroy();
            },
        });
    });
    field<HTMLButtonElement>("file-remove").addEventListener("click", () => {
        const path = localScriptPath();
        if (!path) {
            return;
        }
        confirm(i18n.scriptFileRemoveConfirm, path, () => {
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
    field<HTMLButtonElement>("docs").addEventListener("click", () => openScriptDocs(context, {
        onLoad: (code) => {
            // 示例载入后把操作切到 JavaScript 并展开对应字段，不然用户看不到载进来的代码
            actionElement.value = "script";
            updateActionFields();
            scriptEditor.setValue(code);
            scriptEditor.focus();
        },
    }));
    field<HTMLButtonElement>("save").addEventListener("click", async () => {
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
        } else if (actionElement.value === "file") {
            const path = fileElement.value.trim();
            if (!path) {
                log.warn("save rejected: the script file path is empty", {blockID});
                showMessage(i18n.scriptFileNeeded);
                fileElement.focus();
                return;
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
            action = {type: "file", file: fileElement.value.trim()};
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
            file: action?.type === "file" ? action.file : "none",
        });
        dialog.destroy();
    });
    textElement.focus();
    textElement.select();
};
