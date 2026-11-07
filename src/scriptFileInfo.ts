import {Dialog, showMessage} from "siyuan";
import type {IContext} from "./context";
import {createLogger} from "./logger";
import {ASSET_SCRIPT_DIR, PLUGIN_SCRIPT_DIR} from "./pluginPaths";
import type {TScriptLocation} from "./scriptFile";
import {
    normalizeScriptPath,
    renameWorkspaceFile,
    scriptFileName,
    scriptLocation,
    toScriptPath,
    workspaceFileExists,
    writeWorkspaceFile,
} from "./scriptFile";

const log = createLogger("scriptFileInfo");

/**
 * 新建 / 编辑 JavaScript 文件信息的弹窗（issue #20）。
 *
 * 文件位置只有两处：插件自己的 `data/storage/petal/button-in-siyuan/scripts/`（默认，推荐，
 * 不占用户资源目录），或用户资源目录 `data/assets/`。名字框后面固定显示 `.js`，用户只填文件名；
 * 弹窗里实时显示最终会写入的**完整工作空间相对路径**，与按钮里保存的值完全一致。
 *
 * 「编辑」是原来的「重命名」加上移动：改名字、改位置，或者两者一起改，内核的 renameFile 会跨目录移动。
 * 目标已存在时不覆盖，留在弹窗里让用户改。
 */
export const openScriptFileInfo = (context: IContext, options: {
    mode: "create" | "edit";
    /** 编辑时是当前文件的完整相对路径；新建时不需要。 */
    path?: string;
    onSaved: (path: string) => void;
}) => {
    const {i18n} = context;
    const existing = options.path ? normalizeScriptPath(options.path) : undefined;
    const initialLocation: TScriptLocation = (existing && scriptLocation(existing)) || "plugin";
    const directoryOf = (location: TScriptLocation) =>
        location === "plugin" ? PLUGIN_SCRIPT_DIR : ASSET_SCRIPT_DIR;
    const dialog = new Dialog({
        title: options.mode === "create" ? i18n.scriptFileCreateTitle : i18n.scriptFileInfoTitle,
        width: context.isMobile ? "92vw" : "560px",
        content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">${i18n.scriptFileLocation}</div>
    <div class="fn__hr--small"></div>
    <select class="b3-select fn__block" data-bis="location">
        <option value="plugin">${i18n.scriptFileLocationPlugin}</option>
        <option value="assets">${i18n.scriptFileLocationAssets}</option>
    </select>
    <div class="fn__hr"></div>
    <div class="ft__on-surface">${i18n.scriptFileName}</div>
    <div class="fn__hr--small"></div>
    <div class="fn__flex">
        <input class="b3-text-field fn__flex-1" data-bis="name" spellcheck="false" autocomplete="off">
        <div class="fn__space"></div>
        <span class="ft__on-surface fn__flex-center">.js</span>
    </div>
    <div class="fn__hr--small"></div>
    <div class="ft__on-surface ft__smaller ft__breakword" data-bis="path"></div>
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
    const locationElement = field<HTMLSelectElement>("location");
    const nameElement = field<HTMLInputElement>("name");
    const pathElement = field<HTMLElement>("path");
    const saveElement = field<HTMLButtonElement>("save");
    locationElement.value = initialLocation;
    nameElement.value = existing ? scriptFileName(existing) : "";
    // 实时显示最终路径：用户改位置或名字时立刻看到按钮里会存成什么
    const previewPath = () => {
        const name = nameElement.value.trim();
        const suffix = name.toLowerCase().endsWith(".js") ? "" : ".js";
        return `${directoryOf(locationElement.value as TScriptLocation)}${name || "…"}${suffix}`;
    };
    const updatePath = () => {
        pathElement.textContent = previewPath();
    };
    updatePath();

    const save = async () => {
        const next = toScriptPath(locationElement.value as TScriptLocation, nameElement.value);
        if (!next) {
            log.warn("the script file name is not valid", {name: nameElement.value});
            showMessage(i18n.scriptFileInvalidName);
            nameElement.focus();
            return;
        }
        if (next === existing) {
            dialog.destroy();
            return;
        }
        saveElement.disabled = true;
        try {
            if (await workspaceFileExists(next)) {
                showMessage(i18n.scriptFileExists);
                return;
            }
            if (options.mode === "create") {
                await writeWorkspaceFile(next, "");
                log.info("created a script file", {path: next});
            } else if (existing) {
                await renameWorkspaceFile(existing, next);
                log.info("moved or renamed a script file", {path: existing, next});
            }
            options.onSaved(next);
            dialog.destroy();
        } catch (error) {
            log.error("script file operation failed", {path: existing, next, action: options.mode, error});
            showMessage(error instanceof Error && error.message ? error.message : i18n.scriptFileFailed);
        } finally {
            saveElement.disabled = false;
        }
    };
    locationElement.addEventListener("change", updatePath);
    nameElement.addEventListener("input", updatePath);
    nameElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            void save();
        }
    });
    field<HTMLButtonElement>("cancel").addEventListener("click", () => dialog.destroy());
    saveElement.addEventListener("click", () => void save());
};
