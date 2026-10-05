import {javascript} from "@codemirror/lang-javascript";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {EditorState, type Extension} from "@codemirror/state";
import {EditorView, placeholder} from "@codemirror/view";
import {tags, type Tag} from "@lezer/highlight";
import {basicSetup} from "codemirror";
import {Constants} from "siyuan";
import {getIpcRenderer} from "./electron";
import {createLogger} from "./logger";
import {resolveCodeMode, type TCodeMode} from "./settings";

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
        // 高度交给外层 .bis-code 的 flex 链（index.scss）：编辑区填满对话框正文里剩下的空间，
        // 对话框自己拖动改尺寸时跟着变；用户拖过右下角之后浏览器会在这里写行内 height，
        // .bis-code--manual 让这一层退出填充、高度就此固定 —— 与思源原生 textarea 一致
        flex: "1 1 0",
        // 改高的方式与思源的代码片段输入框相同：右下角那个原生的拖拽角。min-height 既是拖拽下限，
        // 也是对话框按内容自适应时的编辑区高度；拖得比对话框还高时正文自己滚动，与原生 textarea 一致
        minHeight: "100px",
        resize: "vertical",
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
    /** 整段替换正文（文档弹窗里的「载入」用它把示例放进编辑器）。 */
    setValue: (value: string) => void;
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

/**
 * 编辑区右下角的补充命中区。原生拖拽角的命中区由浏览器给定：鼠标 **16×16**、触屏约 **30×30**
 * （本机 Chromium 实测；`::-webkit-resizer` 的宽高与滚动条宽度都改不动它）。触屏那份够手指用，
 * 鼠标那份从角外擦过就抓不住，所以这里在角的外侧再挂一块 16×16 的透明区（位置见 index.scss 的
 * `.bis-code__corner`），原生角本身一点不动。拖动逻辑与浏览器一致：在编辑区上写行内 height，
 * 下限交给 min-height。
 */
const createCornerPad = (view: EditorView) => {
    const pad = document.createElement("div");
    pad.className = "bis-code__corner";
    // 纯命中区，不进无障碍树
    pad.setAttribute("aria-hidden", "true");
    let dragging = false;
    let startY = 0;
    let startHeight = 0;
    pad.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }
        dragging = true;
        startY = event.clientY;
        startHeight = view.dom.getBoundingClientRect().height;
        // 捕获指针：手指/鼠标移出这块小区域也继续收到 move，拖拽不会中途丢
        pad.setPointerCapture(event.pointerId);
        // 触屏上别把这次拖动当成滚动
        event.preventDefault();
    });
    pad.addEventListener("pointermove", (event) => {
        if (!dragging) {
            return;
        }
        view.dom.style.height = `${Math.max(0, Math.round(startHeight + event.clientY - startY))}px`;
        // 高度写在行内样式上，CodeMirror 要重新测量才知道行高与滚动条变了
        view.requestMeasure();
    });
    const stopDragging = (event: PointerEvent) => {
        if (!dragging) {
            return;
        }
        dragging = false;
        if (pad.hasPointerCapture(event.pointerId)) {
            pad.releasePointerCapture(event.pointerId);
        }
    };
    pad.addEventListener("pointerup", stopDragging);
    pad.addEventListener("pointercancel", stopDragging);
    return pad;
};

/**
 * 浏览器把行内 height 写到编辑区上，就说明用户拖过右下角（原生角或上面那块补充命中区）。
 * 此后整条 flex 链退出填充模式（index.scss 的 `.bis-code--manual`），高度只由那个行内值决定，
 * 与思源原生 textarea 一样：拖过之后不再跟着对话框大小变。
 */
const observeManualHeight = (view: EditorView) => {
    const observer = new MutationObserver(() => {
        if (!view.dom.style.height) {
            return;
        }
        // 只关心第一次：没有回到填充模式的路
        observer.disconnect();
        view.dom.parentElement?.classList.add("bis-code--manual");
        log.debug("the editor height is now fixed by the resize corner", {height: view.dom.style.height});
    });
    observer.observe(view.dom, {attributes: true, attributeFilter: ["style"]});
};

export const createCodeEditor = (options: {
    value?: string;
    placeholder?: string;
    /** 换行方式：跟随思源、强制启用、强制禁用（见 settings.ts 的 TCodeMode）。 */
    codeWrap?: TCodeMode;
} = {}): ICodeEditor => {
    const {base, background, specs} = readCodeTheme();
    const dark = isDarkMode();
    const lineWrap = resolveCodeMode(options.codeWrap, window.siyuan?.config?.editor?.codeLineWrap);
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
    element.append(createCornerPad(view));
    observeManualHeight(view);
    log.debug("created the code editor", {chars: view.state.doc.length, dark, lineWrap, tokens: specs.length});
    return {
        element,
        getValue: () => view.state.doc.toString(),
        setValue: (value) => {
            // 整段替换后再把光标放到末尾：载入示例后接着敲代码，落点是自然的
            view.dispatch({
                changes: {from: 0, to: view.state.doc.length, insert: value},
                selection: {anchor: value.length},
            });
        },
        focus: () => view.focus(),
    };
};
