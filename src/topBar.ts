import {fetchSyncPost, Menu, showMessage} from "siyuan";
import type {APIFormData, IMenu, PutFileRequestInput} from "siyuan";
import {createDialog} from "./dialog";
import type {IButtonConfig} from "./buttonBlock";
import {DEFAULT_BUTTON_ICON, parseButtonConfig, runAction} from "./buttonBlock";
import {describeButtonAction} from "./buttonManager";
import type {IContext} from "./context";
import {openButtonBlockEditor} from "./editDialog";
import {createIconElement} from "./icon";
import {createLogger} from "./logger";
import {PLUGIN_STORAGE_DIR} from "./pluginPaths";

const log = createLogger("topBar");

/**
 * 顶栏快捷操作的数据目录（issue #30）。
 *
 * 一个快捷操作一个 JSON 文件，文件名就是菜单顺序：插件每次展开菜单都重新列目录，所以 Agent 或用户
 * 直接在这个目录里新建 / 编辑文件，菜单就会跟着变。内容与按钮块的 payload 同形，只是不保存 `color`
 * （issue 要求快捷操作只允许编辑文本、图标与操作，配色不可改）。
 */
export const TOPBAR_DIR = `${PLUGIN_STORAGE_DIR}/topbar`;

const TOPBAR_EXT = ".json";

/** 顶栏图标的 SVG id：思源内置的闪电，表示「快捷操作」。 */
export const TOPBAR_ICON = "iconZap";

/** 顶栏条目在宿主里的注册 id，卸载时按它移除。 */
export const TOPBAR_ID = "button-in-siyuan-topbar";

export interface ITopBarAction {
    /** 工作空间里完整的文件名（含 `.json`），也是编辑 / 删除时的定位。 */
    fileName: string;
    config: IButtonConfig;
}

const topBarPath = (fileName: string) => `${TOPBAR_DIR}/${fileName}`;

/** 读一个 JSON 文件；出错时抛给调用方，由列表决定跳过还是提示。 */
const readTextFile = async (path: string) => {
    const response = await fetch("/api/file/getFile", {
        method: "POST",
        body: JSON.stringify({path}),
    });
    // 失败是 HTTP 202 + JSON 信封，成功是裸字节（与 scriptFile.ts 的说明一致）
    if (response.status === 202 || !response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try {
            const payload = JSON.parse(await response.text()) as {msg?: string};
            message = payload.msg || message;
        } catch (error) {
            log.debug("the error body is not JSON", {status: response.status, error});
        }
        throw new Error(message);
    }
    return response.text();
};

/**
 * 解析一个快捷操作文件。只保留文本、图标与操作：文件里写了 `color` 也丢掉，快捷操作不覆写配色。
 * 内容不是 JSON 对象、或一个认识的字段都没有时返回 undefined（该文件被跳过）。
 */
const parseTopBarConfig = (content: string, defaultText: string) => {
    let source: unknown;
    try {
        source = JSON.parse(content);
    } catch (error) {
        log.warn("the top bar file is not valid JSON, skipping it", {content, error});
        return;
    }
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
        log.warn("the top bar file is not a JSON object, skipping it", {content});
        return;
    }
    const record = source as {text?: unknown; icon?: unknown; action?: unknown};
    if (typeof record.text !== "string" && typeof record.icon !== "string" && !record.action) {
        log.warn("the top bar file has none of the known fields, skipping it", {content});
        return;
    }
    const config = parseButtonConfig(content, defaultText);
    if (!config) {
        return;
    }
    return {text: config.text, icon: config.icon, action: config.action};
};

/** 列出所有顶栏快捷操作，按文件名排序（也就是菜单顺序）。目录不存在时返回空数组。 */
export const loadTopBarActions = async (context: IContext) => {
    const response = await fetchSyncPost("/api/file/readDir", {path: TOPBAR_DIR}, undefined, false);
    if (response.code !== 0) {
        log.debug("cannot list the top bar directory, treating it as empty", {
            code: response.code,
            msg: response.msg,
        });
        return [];
    }
    const entries = (response.data || []) as Array<{name?: string; isDir?: boolean}>;
    const files = entries
        .filter((entry) => entry?.name && !entry.isDir && entry.name.toLowerCase().endsWith(TOPBAR_EXT))
        .map((entry) => entry.name as string)
        .sort((a, b) => a.localeCompare(b));
    const quickActions: ITopBarAction[] = [];
    for (const fileName of files) {
        try {
            const content = await readTextFile(topBarPath(fileName));
            const config = parseTopBarConfig(content, context.i18n.topBarDefaultText);
            if (config) {
                quickActions.push({fileName, config});
            }
        } catch (error) {
            log.warn("cannot read the top bar action file", {fileName, error});
        }
    }
    log.info("loaded the top bar actions", {files: files.length, actions: quickActions.length});
    return quickActions;
};

/** 把一个快捷操作写成 JSON 文件；文件不存在时内核会建出父目录。 */
export const writeTopBarAction = async (fileName: string, config: IButtonConfig) => {
    const payload: Record<string, unknown> = {text: config.text, icon: config.icon};
    if (config.action) {
        payload.action = config.action;
    }
    // putFile 的契约是 multipart，宿主的类型要求 APIFormData<PutFileRequestInput>
    const form = new FormData() as APIFormData<PutFileRequestInput>;
    form.append("path", topBarPath(fileName));
    form.append("isDir", "false");
    form.append("file", new File([JSON.stringify(payload, null, 4)], fileName, {type: "application/json"}));
    const response = await fetchSyncPost("/api/file/putFile", form, undefined, false);
    if (response.code !== 0) {
        throw new Error(response.msg || `/api/file/putFile code ${response.code}`);
    }
    log.info("wrote a top bar action", {fileName, action: config.action?.type || "none"});
};

export const removeTopBarAction = async (fileName: string) => {
    const response = await fetchSyncPost("/api/file/removeFile", {path: topBarPath(fileName)}, undefined, false);
    if (response.code !== 0) {
        throw new Error(response.msg || `/api/file/removeFile code ${response.code}`);
    }
    log.info("removed a top bar action", {fileName});
};

/** 生成一个不与现有文件重名的文件名：思源的块 ID 按时间有序，菜单顺序就是创建顺序。 */
const createTopBarFileName = (existing: Set<string>) => {
    const base = window.Lute?.NewNodeID?.() || `${Date.now()}`;
    let fileName = `${base}${TOPBAR_EXT}`;
    let index = 2;
    while (existing.has(fileName)) {
        fileName = `${base}-${index}${TOPBAR_EXT}`;
        index++;
    }
    return fileName;
};

/** 在快捷操作编辑窗口里跑一次当前表单：与点击顶栏菜单项完全同一条 runAction。 */
const runTopBarAction = (context: IContext, config: IButtonConfig) =>
    runAction(context, {blockID: "", config});

/**
 * 展开顶栏快捷操作菜单。
 *
 * 每次点击都重新读目录，Agent 在目录里改完文件不需要重载插件。菜单只负责执行这些快捷操作，
 * 末尾固定给一个「管理」入口，新建与编辑都在管理面板里做。菜单定位照宿主自己的顶栏菜单：
 * 贴着图标右下方、向左展开。
 */
export const openTopBarMenu = async (context: IContext, target?: HTMLElement) => {
    let quickActions: ITopBarAction[];
    try {
        quickActions = await loadTopBarActions(context);
    } catch (error) {
        log.error("failed to load the top bar actions", {error});
        showMessage(context.i18n.topBarLoadFailed);
        return;
    }
    const menu = new Menu("button-in-siyuan-topbar-menu");
    if (!quickActions.length) {
        menu.addItem({label: context.i18n.topBarEmpty, disabled: true});
    }
    quickActions.forEach((action) => {
        const item: IMenu = {
            label: action.config.text || context.i18n.topBarDefaultText,
            icon: action.config.icon || undefined,
            click: () => {
                log.info("top bar action clicked", {fileName: action.fileName, action: action.config.action?.type || "none"});
                runTopBarAction(context, action.config);
            },
        };
        menu.addItem(item);
    });
    menu.addSeparator();
    menu.addItem({
        icon: "iconSettings",
        label: context.i18n.topBarManage,
        click: () => openTopBarManager(context),
    });
    const rect = target?.getBoundingClientRect();
    if (rect) {
        menu.open({x: rect.right, y: rect.bottom, h: rect.height, isLeft: true});
    } else {
        menu.open({x: window.innerWidth - 240, y: 48});
    }
    log.debug("opened the top bar menu", {quickActions: quickActions.length});
};

/**
 * 顶栏快捷操作管理器：列出目录里的快捷操作、预览、新建 / 编辑 / 删除。
 *
 * 快捷操作不是按钮块，列表与预览只用图标 + 文本呈现，不套按钮外观。编辑复用那个编辑窗口
 * （`openButtonBlockEditor`），只是把保存、删除、运行三个出口换成文件操作，并隐藏配色
 * （`colorEditable: false`）。因此运行 / 删除按钮的交互与 issue #27 完全一致。
 */
export const openTopBarManager = (context: IContext) => {
    const {i18n} = context;
    const dialog = createDialog({
        title: i18n.topBarManagerTitle,
        width: context.isMobile ? "100%" : "min(980px, 94vw)",
        height: context.isMobile ? "100%" : "min(82vh, 760px)",
        content: `<div class="b3-dialog__content bis-manager">
    <div class="bis-manager__toolbar">
        <div class="ft__on-surface ft__smaller fn__flex-1" data-bis="tip">${i18n.topBarManagerTip}</div>
        <button type="button" class="b3-button b3-button--outline b3-button--icon" data-bis="create" aria-label="${i18n.topBarCreate}"><svg><use xlink:href="#iconAdd"></use></svg></button>
    </div>
    <div class="bis-manager__body">
        <div class="bis-manager__list" data-bis="list"></div>
        <div class="bis-manager__preview" data-bis="preview"></div>
    </div>
    <div class="bis-manager__status ft__on-surface ft__smaller" data-bis="status"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="close">${i18n.close}</button>
</div>`,
    });
    if (context.isMobile) {
        dialog.element.querySelector(".b3-dialog__container")?.classList.add("bis-dialog-fullscreen");
    }
    const field = <T extends HTMLElement>(type: string) => {
        const element = dialog.element.querySelector<T>(`[data-bis="${type}"]`);
        if (!element) {
            throw new Error(`button-in-siyuan: dialog field [${type}] is missing`);
        }
        return element;
    };
    const listElement = field<HTMLElement>("list");
    const previewElement = field<HTMLElement>("preview");
    const statusElement = field<HTMLElement>("status");
    let quickActions: ITopBarAction[] = [];
    let selectedFile = "";

    const showPreview = (action: ITopBarAction) => {
        selectedFile = action.fileName;
        // 刷新列表后直接恢复预览时，行高亮也要跟着回来
        listElement.querySelectorAll<HTMLElement>(".bis-manager__row").forEach((element) => {
            element.classList.toggle("bis-manager__row--current", element.dataset.bisFile === action.fileName);
        });
        previewElement.replaceChildren();
        // 快捷操作不是按钮：预览只用图标 + 文本，避免看起来像一个按钮块
        const head = document.createElement("div");
        head.className = "bis-manager__action";
        const headIcon = document.createElement("span");
        headIcon.className = "bis-manager__row-icon";
        if (action.config.icon) {
            headIcon.append(createIconElement(action.config.icon));
        }
        const headText = document.createElement("div");
        headText.className = "bis-manager__action-title";
        headText.textContent = action.config.text || i18n.topBarDefaultText;
        head.append(headIcon, headText);
        const meta = document.createElement("dl");
        meta.className = "bis-manager__meta";
        const addMeta = (label: string, value: string) => {
            const term = document.createElement("dt");
            term.className = "ft__on-surface ft__smaller";
            term.textContent = label;
            const detail = document.createElement("dd");
            detail.className = "ft__breakword";
            detail.textContent = value;
            meta.append(term, detail);
        };
        addMeta(i18n.managerAction, describeButtonAction(context, action.config));
        addMeta(i18n.topBarFileName, action.fileName);
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "b3-button b3-button--outline";
        edit.textContent = i18n.topBarEdit;
        edit.addEventListener("click", () => openEditor(action));
        const actions = document.createElement("div");
        actions.className = "bis-manager__actions";
        actions.append(edit);
        previewElement.append(head, meta, actions);
    };

    const openEditor = (action?: ITopBarAction) => {
        openButtonBlockEditor(context, {
            blockID: "",
            // 新建时给一个默认图标：空图标在菜单里只显示文本，用户往往还要再点一次选图标
            config: action?.config || {text: i18n.topBarDefaultText, icon: DEFAULT_BUTTON_ICON},
            title: action ? i18n.topBarEditTitle : i18n.topBarNewTitle,
            // 编辑窗口对快捷操作说「快捷操作文本 / 图标 / 操作」，不说「按钮块」（issue #34）
            quickAction: true,
            colorEditable: false,
            deletable: Boolean(action),
            onSave: async (config) => {
                const fileName = action?.fileName || createTopBarFileName(
                    new Set(quickActions.map((item) => item.fileName)));
                try {
                    await writeTopBarAction(fileName, config);
                    return true;
                } catch (error) {
                    log.error("failed to save the top bar action", {fileName, error});
                    showMessage(i18n.topBarSaveFailed);
                    return false;
                }
            },
            onDelete: action ? async () => {
                try {
                    await removeTopBarAction(action.fileName);
                    return true;
                } catch (error) {
                    log.error("failed to remove the top bar action", {fileName: action.fileName, error});
                    showMessage(i18n.deleteTopBarButtonFailed);
                    return false;
                }
            } : undefined,
            onRun: (config) => runTopBarAction(context, config),
            onClosed: () => void reload(),
        });
    };

    const render = () => {
        listElement.replaceChildren();
        if (!quickActions.length) {
            const empty = document.createElement("div");
            empty.className = "bis-manager__hint ft__on-surface";
            empty.textContent = i18n.topBarManagerEmpty;
            listElement.append(empty);
        }
        quickActions.forEach((action) => {
            const row = document.createElement("div");
            row.className = "b3-list-item bis-manager__row";
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.dataset.bisFile = action.fileName;
            if (action.fileName === selectedFile) {
                row.classList.add("bis-manager__row--current");
            }
            const icon = document.createElement("span");
            icon.className = "bis-manager__row-icon";
            if (action.config.icon) {
                icon.append(createIconElement(action.config.icon));
            }
            const text = document.createElement("div");
            text.className = "bis-manager__row-text";
            const title = document.createElement("div");
            title.className = "bis-manager__row-title";
            title.textContent = action.config.text || i18n.topBarDefaultText;
            const file = document.createElement("div");
            file.className = "bis-manager__row-meta ft__on-surface ft__smaller";
            file.textContent = action.fileName;
            text.append(title, file);
            row.append(icon, text);
            const select = () => {
                listElement.querySelectorAll(".bis-manager__row--current")
                    .forEach((element) => element.classList.remove("bis-manager__row--current"));
                row.classList.add("bis-manager__row--current");
                showPreview(action);
            };
            row.addEventListener("click", select);
            row.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select();
                }
            });
            listElement.append(row);
        });
        statusElement.textContent = `${quickActions.length} ${i18n.topBarCount}`;
        if (selectedFile && !quickActions.some((action) => action.fileName === selectedFile)) {
            selectedFile = "";
            previewElement.replaceChildren();
        }
    };

    const reload = async () => {
        try {
            quickActions = await loadTopBarActions(context);
        } catch (error) {
            log.error("failed to load the top bar actions", {error});
            showMessage(i18n.topBarLoadFailed);
            quickActions = [];
        }
        const previous = quickActions.find((action) => action.fileName === selectedFile);
        selectedFile = "";
        render();
        if (previous) {
            showPreview(previous);
        } else {
            // 选中的快捷操作被删掉了：右侧不能留着那个已经不存在的文件
            previewElement.replaceChildren();
        }
    };

    field<HTMLButtonElement>("create").addEventListener("click", () => openEditor());
    field<HTMLButtonElement>("close").addEventListener("click", () => dialog.destroy());
    void reload();
};
