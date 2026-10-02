import {javascript} from "@codemirror/lang-javascript";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {EditorState, type Extension} from "@codemirror/state";
import {EditorView, placeholder} from "@codemirror/view";
import {tags, type Tag} from "@lezer/highlight";
import {basicSetup} from "codemirror";
import {Constants} from "siyuan";
import {getIpcRenderer} from "./electron";
import {createLogger} from "./logger";

const log = createLogger("codeEditor");

/**
 * JavaScript 代码编辑器：CodeMirror 提供行号、语法高亮、括号匹配与补全。
 * 配色不写死，而是从思源已经加载的代码高亮主题（#protyleHljsStyle 对应的 highlight.js 样式）
 * 里读出实际颜色，因此与「设置 - 外观 - 代码高亮」里用户选择的方案、以及明暗模式保持一致。
 */

/** 代码主题里与标记对应的高亮类；前面的类没有单独配色时退回后面的类。 */
const TOKEN_STYLES: Array<{tags: Tag[], classes: string[]}> = [
    {tags: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.definitionKeyword], classes: ["hljs-keyword"]},
    {tags: [tags.string, tags.special(tags.string), tags.character], classes: ["hljs-string"]},
    {tags: [tags.regexp], classes: ["hljs-regexp", "hljs-string"]},
    {tags: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], classes: ["hljs-comment", "hljs-quote"]},
    {tags: [tags.number, tags.integer, tags.float], classes: ["hljs-number"]},
    {tags: [tags.bool, tags.null, tags.atom, tags.self], classes: ["hljs-literal"]},
    {tags: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], classes: ["hljs-title"]},
    {tags: [tags.typeName, tags.className, tags.namespace], classes: ["hljs-type", "hljs-title"]},
    {tags: [tags.standard(tags.variableName), tags.standard(tags.propertyName)], classes: ["hljs-built_in", "hljs-title"]},
    {tags: [tags.variableName, tags.local(tags.variableName)], classes: ["hljs-variable", "hljs-params"]},
    {tags: [tags.propertyName, tags.attributeName], classes: ["hljs-attr", "hljs-attribute"]},
    {tags: [tags.meta, tags.annotation, tags.processingInstruction], classes: ["hljs-meta"]},
    {tags: [tags.operator, tags.derefOperator], classes: ["hljs-operator", "hljs-punctuation"]},
    {tags: [tags.punctuation, tags.separator, tags.bracket, tags.squareBracket, tags.paren, tags.brace, tags.angleBracket], classes: ["hljs-punctuation"]},
    {tags: [tags.tagName], classes: ["hljs-tag", "hljs-name"]},
];

interface ITextStyle {
    color: string;
    fontWeight: string;
    fontStyle: string;
}

const readTextStyle = (element: Element): ITextStyle => {
    const computed = getComputedStyle(element);
    return {color: computed.color, fontWeight: computed.fontWeight, fontStyle: computed.fontStyle};
};

/** 主题没有单独给这个类配色时，计算值等于基础样式，此时应继续试下一个类。 */
const isStyled = (style: ITextStyle, base: ITextStyle) =>
    style.color !== base.color || style.fontWeight !== base.fontWeight || style.fontStyle !== base.fontStyle;

/**
 * 代码块的前景/背景取自 .code-block（思源的 highlight.js 主题把底色与文字色定义在这个类上），
 * 各标记颜色取自 .hljs-* 类，探针挂在离屏元素上读完即删。
 */
const readCodeTheme = () => {
    const holder = document.createElement("div");
    holder.className = "code-block";
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
    const code = document.createElement("code");
    code.className = "hljs";
    holder.append(code);
    document.body.append(holder);

    const base = readTextStyle(holder);
    const background = getComputedStyle(holder).backgroundColor;
    const cache = new Map<string, ITextStyle>();
    const readClass = (name: string) => {
        let style = cache.get(name);
        if (!style) {
            const span = document.createElement("span");
            span.className = name;
            span.textContent = "x";
            code.append(span);
            style = readTextStyle(span);
            span.remove();
            cache.set(name, style);
        }
        return style;
    };
    const specs: Array<{tag: Tag, color: string, fontWeight?: string, fontStyle?: string}> = [];
    const defined = new Set<Tag>();
    TOKEN_STYLES.forEach((item) => {
        const picked = item.classes.map(readClass).find((style) => isStyled(style, base));
        if (!picked) {
            return;
        }
        item.tags.forEach((tag) => {
            if (defined.has(tag)) {
                return;
            }
            defined.add(tag);
            specs.push({
                tag,
                color: picked.color,
                fontWeight: picked.fontWeight === base.fontWeight ? undefined : picked.fontWeight,
                fontStyle: picked.fontStyle === base.fontStyle ? undefined : picked.fontStyle,
            });
        });
    });
    holder.remove();
    if (specs.length === 0) {
        log.warn("no token colours found in the code highlight theme, the editor only has the base colours", {background, color: base.color});
    } else {
        log.debug("read the code highlight theme", {background, color: base.color, tokens: specs.length});
    }
    return {base, background, specs};
};

const isDarkMode = () => {
    const mode = document.documentElement.getAttribute("data-theme-mode");
    if (mode) {
        return mode === "dark";
    }
    return window.siyuan?.config?.appearance?.mode === 1;
};

/** 编辑器外壳沿用思源变量：边框、悬浮底色、补全弹层都按思源对话框的观感来。 */
const createTheme = (base: ITextStyle, background: string) => EditorView.theme({
    "&": {
        color: base.color,
        backgroundColor: background,
        fontFamily: "var(--b3-font-family-code)",
        // 字号与思源的代码片段输入框一致：那边的 .b3-text-field 固定 14px（component/_text-field.scss），
        // 编辑器字号（--b3-font-size-editor）会明显偏大
        fontSize: "14px",
        borderRadius: "var(--b3-border-radius)",
        // 描边、悬浮与聚焦效果照抄 .b3-text-field：代码块底色和对话框底色相同时也能看出输入区边界
        outline: "1px solid var(--b3-border-color)",
        outlineOffset: "-1px",
        // 高度由 createCodeEditor 里的拖动抓手改：起手 100px、上限 55vh，与思源的代码片段
        // 输入框一致。不用 CSS 的 resize: vertical —— 它的命中区只有右下角几个像素，
        // 触屏上几乎抓不住（issue #5）
        height: "100px",
        minHeight: "80px",
        maxHeight: "55vh",
        overflow: "hidden",
    },
    "&.cm-focused": {
        outlineColor: "var(--b3-theme-primary-light)",
        boxShadow: "0 0 0 .6px var(--b3-theme-primary-lighter)",
    },
    ".cm-scroller": {
        fontFamily: "inherit",
        lineHeight: "1.625",
        height: "100%",
        overflow: "auto",
    },
    ".cm-content": {
        caretColor: base.color,
    },
    ".cm-gutters": {
        border: "0",
        paddingLeft: "4px",
        color: "var(--b3-theme-on-surface)",
        // 行号底色必须不透明：.cm-gutters 是 sticky 的，横向滚动时代码会从它下面穿过，
        // 透明底色会让行号和代码文字叠在一起
        backgroundColor: background,
    },
    ".cm-lineNumbers .cm-gutterElement": {
        // 行号与代码行同字号同基线（思源代码块的行号是 85% 字号，那样基线会差 2px，这里以对齐为准）
        minWidth: "20px",
        padding: "0 6px 0 0",
    },
    ".cm-activeLine": {
        backgroundColor: "var(--b3-list-hover)",
    },
    ".cm-activeLineGutter": {
        color: "var(--b3-theme-on-background)",
        backgroundColor: "transparent",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "var(--b3-theme-primary-lighter)",
    },
    "&.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--b3-theme-primary-lighter)",
    },
    ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: base.color,
    },
    ".cm-tooltip": {
        color: "var(--b3-theme-on-surface)",
        backgroundColor: "var(--b3-theme-surface)",
        border: "1px solid var(--b3-border-color)",
        borderRadius: "var(--b3-border-radius)",
        boxShadow: "var(--b3-dialog-shadow)",
        fontFamily: "var(--b3-font-family)",
    },
    ".cm-tooltip-autocomplete > ul > li": {
        padding: "2px 8px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        color: "var(--b3-theme-on-background)",
        backgroundColor: "var(--b3-list-hover)",
    },
    ".cm-completionDetail": {
        color: "var(--b3-theme-on-surface-light)",
        fontStyle: "normal",
    },
    ".cm-panels": {
        color: "var(--b3-theme-on-surface)",
        backgroundColor: "var(--b3-theme-surface)",
    },
}, {dark: isDarkMode()});

export interface ICodeEditor {
    /** 挂载到对话框里的容器。 */
    element: HTMLElement;
    getValue: () => string;
    focus: () => void;
}

/**
 * 代码编辑区的右键菜单用思源自己的原生文本菜单（撤销/重做/复制/剪切/删除/粘贴/粘贴为纯文本/全选）。
 *
 * 桌面端思源对 .b3-text-field 就是这么做的：把菜单项发给主进程，由 Electron 弹出系统菜单
 * （见宿主的 menus/index.ts 与 electron/main.js 的 siyuan-context-menu 通道），
 * 因此这里的菜单项、文案与快捷键与思源其它输入框完全一致。
 * 移动端与浏览器前端没有原生菜单，交回系统自己的选择菜单。
 */
const openNativeTextMenu = (event: MouseEvent) => {
    if (event.shiftKey) {
        // 与宿主一致：shift + 右键交回浏览器
        return;
    }
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
        return;
    }
    const languages = window.siyuan?.languages || {};
    ipcRenderer.send(Constants.SIYUAN_CONTEXT_MENU, {
        x: event.clientX,
        y: event.clientY,
        requestedAt: Date.now(),
        items: [
            {role: "undo", label: languages.undo},
            {role: "redo", label: languages.redo},
            {type: "separator"},
            {role: "copy", label: languages.copy},
            {role: "cut", label: languages.cut},
            {role: "delete", label: languages.delete},
            {role: "paste", label: languages.paste},
            {role: "pasteAndMatchStyle", label: languages.pasteAsPlainText},
            {role: "selectAll", label: languages.selectAll},
        ],
    });
    // 宿主 window 上的 contextmenu 监听会给非输入框 preventDefault（浏览器菜单不出来），
    // 这里已经弹了思源的原生菜单，不再让它继续处理
    event.stopPropagation();
    log.debug("opened the native context menu of the code editor");
};

/** 抓手拖动的高度区间：与 createTheme 里的 min-height / max-height 保持一致。 */
const MIN_EDITOR_HEIGHT = 80;
const MAX_EDITOR_HEIGHT_RATIO = 0.55;

const clampEditorHeight = (height: number) => Math.min(
    Math.round(window.innerHeight * MAX_EDITOR_HEIGHT_RATIO),
    Math.max(MIN_EDITOR_HEIGHT, Math.round(height)),
);

/**
 * 编辑区下方的拖动抓手。CSS 的 `resize: vertical` 只在元素右下角留几个像素的命中区，
 * 鼠标要正好压在那几条斜线上，手指则完全抓不住；这里照思源自己块把手（.protyle-block-resize）
 * 的做法：命中条做宽（触屏再加宽），装饰线只占中间一小段，鼠标与手指共用同一套指针事件。
 */
const createResizeGrip = (view: EditorView) => {
    const grip = document.createElement("div");
    grip.className = "bis-code__resize";
    // 纯拖拽把手（原生 resize 同样不可聚焦），不进无障碍树
    grip.setAttribute("aria-hidden", "true");
    let dragging = false;
    let startY = 0;
    let startHeight = 0;
    const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }
        dragging = true;
        startY = event.clientY;
        startHeight = view.dom.getBoundingClientRect().height;
        // 捕获指针：手指/鼠标移出抓手范围也继续收到 move，拖拽不会中途丢
        grip.setPointerCapture(event.pointerId);
        grip.classList.add("bis-code__resize--active");
        // 触屏上别把这次拖动当成滚动
        event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
        if (!dragging) {
            return;
        }
        view.dom.style.height = `${clampEditorHeight(startHeight + event.clientY - startY)}px`;
        // 高度写在行内样式上，CodeMirror 要重新测量才知道行高与滚动条变了
        view.requestMeasure();
    };
    const onPointerUp = (event: PointerEvent) => {
        if (!dragging) {
            return;
        }
        dragging = false;
        grip.classList.remove("bis-code__resize--active");
        if (grip.hasPointerCapture(event.pointerId)) {
            grip.releasePointerCapture(event.pointerId);
        }
    };
    grip.addEventListener("pointerdown", onPointerDown);
    grip.addEventListener("pointermove", onPointerMove);
    grip.addEventListener("pointerup", onPointerUp);
    grip.addEventListener("pointercancel", onPointerUp);
    return grip;
};

export const createCodeEditor = (options: {
    value?: string;
    placeholder?: string;
} = {}): ICodeEditor => {
    const {base, background, specs} = readCodeTheme();
    const dark = isDarkMode();
    const lineWrap = Boolean(window.siyuan?.config?.editor?.codeLineWrap);
    const extensions: Extension[] = [
        basicSetup,
        javascript(),
        syntaxHighlighting(HighlightStyle.define(specs)),
        createTheme(base, background),
    ];
    if (lineWrap) {
        extensions.push(EditorView.lineWrapping);
    }
    if (options.placeholder) {
        extensions.push(placeholder(options.placeholder));
    }
    const element = document.createElement("div");
    element.className = "bis-code";
    const view = new EditorView({
        state: EditorState.create({doc: options.value || "", extensions}),
        parent: element,
    });
    element.addEventListener("contextmenu", openNativeTextMenu);
    element.append(createResizeGrip(view));
    log.debug("created the code editor", {chars: view.state.doc.length, dark, lineWrap, tokens: specs.length});
    return {
        element,
        getValue: () => view.state.doc.toString(),
        focus: () => view.focus(),
    };
};
