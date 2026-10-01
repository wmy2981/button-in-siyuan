import {javascript} from "@codemirror/lang-javascript";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {EditorState, type Extension} from "@codemirror/state";
import {EditorView, placeholder} from "@codemirror/view";
import {tags, type Tag} from "@lezer/highlight";
import {basicSetup} from "codemirror";
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
        log.warn("没读到代码高亮主题的标记配色，编辑器只有基础配色", {background, color: base.color});
    } else {
        log.debug("读取代码高亮主题", {background, color: base.color, tokens: specs.length});
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
        fontSize: "var(--b3-font-size-editor, var(--b3-font-size))",
        borderRadius: "var(--b3-border-radius)",
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-scroller": {
        fontFamily: "inherit",
        lineHeight: "1.625",
        // 约 4 行代码的高度，再多就在编辑器内部滚动
        minHeight: "112px",
        maxHeight: "320px",
        overflow: "auto",
    },
    ".cm-content": {
        caretColor: base.color,
    },
    ".cm-gutters": {
        border: "0",
        paddingLeft: "4px",
        color: "var(--b3-theme-on-surface)",
        backgroundColor: "transparent",
    },
    ".cm-lineNumbers .cm-gutterElement": {
        // 行号样式与思源自己的代码块一致（_typography.scss 的 linenumber__rows）
        minWidth: "20px",
        padding: "0 6px 0 0",
        fontSize: "85%",
        textAlign: "right",
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
    log.debug("创建代码编辑器", {chars: view.state.doc.length, dark, lineWrap, tokens: specs.length});
    return {
        element,
        getValue: () => view.state.doc.toString(),
        focus: () => view.focus(),
    };
};
