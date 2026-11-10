import {fetchSyncPost, showMessage} from "siyuan";
import {createDialog, hideWhileOpening, makeFullscreenDialog} from "../dialog";
import {createLogger} from "../../core/logger";
import {getMobileSafeMode} from "../safeMode";
import type {IButtonConfig, TButtonAction} from "../../button/buttonBlock";
import {createButtonElement, isBlockEditable, parseButtonConfig, runAction} from "../../button/buttonBlock";
import {commandLabel} from "../../action/commands";
import type {IContext} from "../../core/context";
import {openButtonBlockEditor} from "../dialogs/editDialog";
import {openLink} from "../../action/openLink";

const log = createLogger("buttonManager");

/** 一次最多列出多少个按钮块；显式 LIMIT 避免内核按用户设置的搜索条数上限静默截断。 */
const BUTTON_QUERY_LIMIT = 5000;

/** 工作空间里的一个按钮块，外加它所在笔记的信息（列表与详情里要显示）。 */
interface IButtonRow {
    id: string;
    config: IButtonConfig;
    /** 所在笔记的标题 */
    rootTitle: string;
    /** 所在笔记的人可读路径，例如 `/日记/2024-01-01` */
    hPath: string;
    /** 所在笔记本的名字 */
    notebook: string;
}

const actionTypeOf = (config: IButtonConfig) => config.action?.type || "none";

/**
 * 笔记本名。宿主的 `window.siyuan.notebooks` 就是 `/api/notebook/lsNotebooks` 的结果
 * （`app/src/util/pathName.ts` 的 `setNoteBook`），按 box id 找名字即可，不必再发一次请求；
 * 找不到时退回 id，总比空着强。
 */
const notebookNameOf = (box: string) => window.siyuan?.notebooks?.find((item) => item.id === box)?.name || box;

/** 列表第二行：笔记本与笔记 hPath，灰色小字，体现它与上面那行是同一条目（issue #34）。 */
const rowMetaOf = (row: IButtonRow) => [row.notebook, row.hPath].filter(Boolean).join(" · ");

/** 列表第一行：笔记名字；文档没有内容（标题为空）时退回 hPath 或块 ID。 */
const rowTitleOf = (row: IButtonRow) => row.rootTitle || row.hPath || row.id;

/** 操作的一句话摘要，按钮块管理器与快捷操作管理器的预览共用。 */
export const describeButtonAction = (context: IContext, config: IButtonConfig) => {
    const {i18n} = context;
    const action: TButtonAction | undefined = config.action;
    if (!action) {
        return i18n.actionNone;
    }
    if (action.type === "link") {
        return `${i18n.actionLink}: ${action.link}`;
    }
    if (action.type === "file") {
        return `${i18n.actionFile}: ${action.file}`;
    }
    if (action.type === "command") {
        // 命令显示它的名字，不显示 id：id 是宿主的内部标识，给用户看没有意义
        return `${i18n.actionCommand}: ${commandLabel(context, action.command)}`;
    }
    if (action.type === "prompt") {
        // 提示词与内联脚本一样只给第一行，多行的补一个省略号
        const firstLine = action.prompt.split(/\r?\n/, 1)[0].trim();
        return firstLine
            ? `${i18n.actionPrompt}: ${firstLine}${action.prompt.includes("\n") ? " …" : ""}`
            : i18n.actionPrompt;
    }
    const firstLine = action.script.split(/\r?\n/, 1)[0].trim();
    return `${i18n.actionScript}: ${firstLine ? `${firstLine}${action.script.includes("\n") ? " …" : ""}` : i18n.managerInlineScript}`;
};

/**
 * 读取当前工作空间的全部按钮块（issue #28）。
 *
 * 用一条 SQL 同时取块内容与它所在笔记的信息：自定义块的 `content` 就是那段 JSON，`markdown` 是
 * `;;;button-in-siyuan/button` 围栏。`hpath` 是内核按文档整篇写进每个块的（`kernel/sql/database.go`
 * 的 `batchUpdateHPath`），所以块自己那一行就有笔记路径，不用再查文档；`box` 是笔记本 ID，名字去
 * `window.siyuan.notebooks` 里换。所有块都过一遍 `parseButtonConfig`，内容不是本插件配置的块
 * （比如别的插件也用 custom 块）在列表里直接跳过。
 */
const loadRows = async (context: IContext) => {
    const response = await fetchSyncPost("/api/query/sql", {
        stmt: `SELECT b.id, b.content, b.box, b.hpath, (SELECT content FROM blocks WHERE id = b.root_id) AS root_title ` +
            `FROM blocks b WHERE b.type = 'custom' AND b.markdown LIKE ';;;button-in-siyuan/button%' LIMIT ${BUTTON_QUERY_LIMIT}`,
    }, undefined, false);
    if (response.code !== 0) {
        throw new Error(response.msg || `/api/query/sql code ${response.code}`);
    }
    const rows: IButtonRow[] = [];
    for (const item of (response.data || []) as Array<{
        id?: string;
        content?: string;
        box?: string;
        hpath?: string;
        root_title?: string;
    }>) {
        const config = parseButtonConfig(item.content || "", context.i18n.defaultButtonText);
        if (!item.id || !config) {
            continue;
        }
        rows.push({
            id: item.id,
            config,
            rootTitle: item.root_title || "",
            hPath: item.hpath || "",
            notebook: notebookNameOf(item.box || ""),
        });
    }
    // 按「笔记本 + 笔记路径」排：同一个笔记本、同一篇笔记里的按钮块挨在一起
    rows.sort((a, b) => (a.notebook + a.hPath).localeCompare(b.notebook + b.hPath));
    log.info("loaded the button blocks for the manager", {rows: rows.length, limit: BUTTON_QUERY_LIMIT});
    return rows;
};

/** 「按钮块管理」窗口的选项。 */
export interface IButtonBlockManagerOptions {
    /**
     * 点「在文档中定位」时先执行。入口在设置面板里，跳转前要把面板一起关掉，
     * 否则文档上还压着设置与管理两层窗口；面板是思源自己的 `Dialog`，由调用方负责关。
     */
    onLocate?: () => void;
}

/**
 * 「按钮块管理」窗口：列出、搜索、预览、编辑当前工作空间的所有按钮块。
 *
 * 入口在插件设置面板里。左侧是列表（按钮外观 + 所在笔记 + 笔记本与 hPath），右侧是选中项的详情：
 * 可以直接点的按钮块本身、操作摘要、块 ID、笔记 hPath、所在笔记本，以及「编辑按钮块」「在文档中定位」。
 * 编辑复用同一个编辑窗口：块没在当前窗口渲染时，保存会自动走内核的 `updateBlock`（见
 * `updateButtonContentAsync`）。
 */
export const openButtonBlockManager = (context: IContext, options: IButtonBlockManagerOptions = {}) => {
    const {i18n} = context;
    const dialog = createDialog({
        title: i18n.manageButtonBlocks,
        width: context.isMobile ? "100%" : "min(980px, 94vw)",
        height: context.isMobile ? "100%" : "min(82vh, 760px)",
        content: `<div class="b3-dialog__content bis-manager">
    <div class="bis-manager__toolbar">
        <input class="b3-text-field fn__flex-1" data-bis="search" spellcheck="false" placeholder="${i18n.managerSearchPlaceholder}">
        <select class="b3-select" data-bis="action-filter">
            <option value="">${i18n.managerFilterAll}</option>
            <option value="none">${i18n.actionNone}</option>
            <option value="link">${i18n.actionLink}</option>
            <option value="script">${i18n.actionScript}</option>
            <option value="file">${i18n.actionFile}</option>
            <option value="command">${i18n.actionCommand}</option>
            <option value="prompt">${i18n.actionPrompt}</option>
        </select>
    </div>
    <div class="bis-manager__body">
        <div class="bis-manager__list" data-bis="list"><div class="bis-manager__hint ft__on-surface">${i18n.managerLoading}</div></div>
        <div class="bis-manager__preview" data-bis="preview"><div class="bis-manager__hint ft__on-surface">${i18n.managerSelectHint}</div></div>
    </div>
    <div class="bis-manager__status ft__on-surface ft__smaller" data-bis="status"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="close">${i18n.close}</button>
</div>`,
    });
    if (context.isMobile) {
        makeFullscreenDialog(dialog);
    }
    const field = <T extends HTMLElement>(type: string) => {
        const element = dialog.element.querySelector<T>(`[data-bis="${type}"]`);
        if (!element) {
            throw new Error(`button-in-siyuan: dialog field [${type}] is missing`);
        }
        return element;
    };
    const searchElement = field<HTMLInputElement>("search");
    const filterElement = field<HTMLSelectElement>("action-filter");
    const listElement = field<HTMLElement>("list");
    const previewElement = field<HTMLElement>("preview");
    const statusElement = field<HTMLElement>("status");
    let rows: IButtonRow[] = [];
    let selectedID = "";

    const matches = (row: IButtonRow) => {
        const filter = filterElement.value;
        if (filter && actionTypeOf(row.config) !== filter) {
            return false;
        }
        const keyword = searchElement.value.trim().toLowerCase();
        if (!keyword) {
            return true;
        }
        const action = row.config.action;
        const target = action
            ? action.type === "link"
                ? action.link
                : action.type === "file"
                    ? action.file
                    : action.type === "script"
                        ? action.script.substring(0, 500)
                        : action.type === "command"
                            ? commandLabel(context, action.command)
                            : action.prompt.substring(0, 500)
            : "";
        return [row.config.text, row.config.icon, target, row.rootTitle, row.hPath, row.notebook, row.id]
            .join("\n")
            .toLowerCase()
            .includes(keyword);
    };

    /** 右侧回到「还没选」的空状态。刷新后原来的块被删掉时也要走这里，不能留着已经不存在的块。 */
    const showPlaceholder = () => {
        previewElement.replaceChildren();
        const hint = document.createElement("div");
        hint.className = "bis-manager__hint ft__on-surface";
        hint.textContent = i18n.managerSelectHint;
        previewElement.append(hint);
    };

    /** 详情：整颗按钮 + 属性 + 两个动作。 */
    const showPreview = (row: IButtonRow) => {
        selectedID = row.id;
        // 刷新列表后直接恢复预览时，行高亮也要跟着回来
        listElement.querySelectorAll<HTMLElement>(".bis-manager__row").forEach((element) => {
            element.classList.toggle("bis-manager__row--current", element.dataset.bisId === row.id);
        });
        previewElement.replaceChildren();
        // 详情里的块本身就是真按钮：点它等于在文档里点这个块，链接、内联脚本、脚本文件都照跑。
        // 块可能没在当前窗口渲染，这时拿不到编辑器上下文，交给 runAction 按空上下文处理
        const previewButton = createButtonElement(context, row.config);
        previewButton.classList.add("bis-manager__preview-button");
        previewButton.addEventListener("click", () => {
            const blockElement = document.querySelector<HTMLElement>(
                `[data-type="NodeCustomBlock"][data-node-id="${row.id}"]`) || undefined;
            log.info("running a button block from the manager", {
                blockID: row.id,
                action: actionTypeOf(row.config),
            });
            runAction(context, {blockID: row.id, blockElement, config: row.config});
        });
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
        addMeta(i18n.managerAction, describeButtonAction(context, row.config));
        addMeta(i18n.managerBlockID, row.id);
        addMeta(i18n.managerHPath, row.hPath || "-");
        addMeta(i18n.managerNotebook, row.notebook || "-");
        const actions = document.createElement("div");
        actions.className = "bis-manager__actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "b3-button b3-button--outline";
        edit.textContent = i18n.managerEdit;
        edit.addEventListener("click", () => {
            const blockElement = document.querySelector<HTMLElement>(`[data-type="NodeCustomBlock"][data-node-id="${row.id}"]`);
            const open = () => openButtonBlockEditor(context, {
                blockID: row.id,
                config: row.config,
                editable: isBlockEditable(blockElement),
                onClosed: () => {
                    // 安全模式下编辑窗口关掉之后管理窗口再露出来（见 dialog.ts）
                    dialog.element.style.display = "";
                    void reload();
                },
            });
            if (context.isMobile && getMobileSafeMode()) {
                // App 里下层还挂着这个满屏窗口时再建对话框会把 WebView 卡死并重载前端（issue #43）
                hideWhileOpening(dialog.element, open);
            } else {
                open();
            }
        });
        const locate = document.createElement("button");
        locate.type = "button";
        locate.className = "b3-button b3-button--text";
        locate.textContent = i18n.managerLocate;
        locate.addEventListener("click", () => {
            log.info("locating a button block in its document", {blockID: row.id});
            // 先把管理窗口与设置面板关掉，再让宿主打开文档、滚动到块并高亮（`siyuan://blocks/<id>`
            // 由宿主的 processSiYuanUri 处理：打开所在文档 + 高亮 + 定位上下文）
            dialog.destroy();
            options.onLocate?.();
            openLink(context, `siyuan://blocks/${row.id}`);
        });
        actions.append(edit, locate);
        previewElement.append(previewButton, meta, actions);
    };

    const renderList = () => {
        const visible = rows.filter(matches);
        listElement.replaceChildren();
        if (!visible.length) {
            const empty = document.createElement("div");
            empty.className = "bis-manager__hint ft__on-surface";
            empty.textContent = i18n.managerEmpty;
            listElement.append(empty);
        }
        visible.forEach((row) => {
            const rowElement = document.createElement("div");
            rowElement.className = "b3-list-item bis-manager__row";
            rowElement.tabIndex = 0;
            rowElement.setAttribute("role", "button");
            rowElement.dataset.bisId = row.id;
            if (row.id === selectedID) {
                rowElement.classList.add("bis-manager__row--current");
            }
            const chip = createButtonElement(context, row.config);
            chip.classList.add("bis-manager__chip");
            chip.tabIndex = -1;
            chip.setAttribute("aria-hidden", "true");
            // 列表里的按钮只是外观示意：文本单独包一层，超宽时出省略号，图标与文字都不会被裁掉一半
            const chipText = document.createElement("span");
            chipText.className = "bis-manager__chip-text";
            for (const node of Array.from(chip.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                    chipText.textContent = node.textContent;
                    node.replaceWith(chipText);
                }
            }
            const text = document.createElement("div");
            text.className = "bis-manager__row-text";
            const title = document.createElement("div");
            title.className = "bis-manager__row-title";
            // 按钮文本已经由左边的按钮本体表达，这一行只说它在哪篇笔记里（issue #34）
            title.textContent = rowTitleOf(row);
            const meta = document.createElement("div");
            meta.className = "bis-manager__row-meta ft__on-surface ft__smaller";
            meta.textContent = rowMetaOf(row);
            text.append(title, meta);
            rowElement.append(chip, text);
            const select = () => {
                listElement.querySelectorAll(".bis-manager__row--current")
                    .forEach((element) => element.classList.remove("bis-manager__row--current"));
                rowElement.classList.add("bis-manager__row--current");
                showPreview(row);
            };
            rowElement.addEventListener("click", select);
            rowElement.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select();
                }
            });
            listElement.append(rowElement);
        });
        statusElement.textContent = `${visible.length} ${i18n.managerCount}`;
        // 选中的块被搜索条件过滤掉时清空右侧，避免显示一个已经不在列表里的项
        if (selectedID && !visible.some((row) => row.id === selectedID)) {
            selectedID = "";
            showPlaceholder();
        }
    };

    /**
     * 重新查询并刷新列表与详情。
     *
     * 只有第一次打开才显示「正在读取」：编辑或删除之后刷新时**不先清空列表**，否则窗口会闪一下、
     * 滚动位置也会被带回顶部（issue #34）。列表重画与滚动位置复原在同一个任务里完成，浏览器只画
     * 最终状态。
     */
    const reload = async (initial = false) => {
        if (initial) {
            listElement.replaceChildren();
            const loading = document.createElement("div");
            loading.className = "bis-manager__hint ft__on-surface";
            loading.textContent = i18n.managerLoading;
            listElement.append(loading);
        }
        const scrollTop = listElement.scrollTop;
        try {
            rows = await loadRows(context);
        } catch (error) {
            log.error("failed to load the button blocks", {error});
            showMessage(i18n.managerLoadFailed);
            rows = [];
        }
        // 刷新后如果原来选中的块还在，保留选中；否则回到空状态
        const previous = rows.find((row) => row.id === selectedID);
        selectedID = "";
        renderList();
        listElement.scrollTop = scrollTop;
        if (previous) {
            showPreview(previous);
        } else {
            // 选中的块被删掉了（或已被筛选条件排除）：右侧不能留着那个已经不存在的块
            showPlaceholder();
        }
    };

    searchElement.addEventListener("input", renderList);
    filterElement.addEventListener("change", renderList);
    field<HTMLButtonElement>("close").addEventListener("click", () => dialog.destroy());
    void reload(true);
};
