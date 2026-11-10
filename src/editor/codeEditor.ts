import {javascript} from "@codemirror/lang-javascript";
import {markdown} from "@codemirror/lang-markdown";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {Compartment, EditorState, type Extension} from "@codemirror/state";
import {Decoration, EditorView, placeholder, ViewPlugin, type DecorationSet, type ViewUpdate} from "@codemirror/view";
import {basicSetup} from "codemirror";
import {Constants} from "siyuan";
import {ensureHighlighter, highlightTokens, isHighlighterReady} from "./codeHighlight";
import {getIpcRenderer} from "../core/electron";
import {createLogger} from "../core/logger";
import {resolveCodeMode, type TCodeMode} from "../core/settings";

const log = createLogger("codeEditor");

/**
 * 代码编辑器：CodeMirror 提供行号、括号匹配、补全与编辑手感，
 * 语法高亮与思源的代码块完全一致 —— 两者都用宿主那份 highlight.js 切 token，
 * 用到的那套 `hljs-…` 类名与配色样式表也都是同一份（见 src/editor/codeHighlight.ts）。
 */

/** 编辑器能编辑的语言；同时也是宿主 highlight.js 的语言名。 */
export type TCodeLanguage = "javascript" | "markdown";

const languageExtension = (language: TCodeLanguage): Extension =>
    language === "markdown" ? markdown() : javascript();

/** 等宿主的高亮脚本就绪后重画的扩展位。 */
const highlightCompartment = new Compartment();

/**
 * 敲完最后一个字符后隔多久重新着色。着色要把整个文档交给宿主的 highlight.js 再重建一遍装饰，
 * 每个按键都做一次，就等于每次输入都换掉一段 DOM：输入法组字、快速连打时字符会被吞掉
 * （issue #45 反馈）。所以改成停下打字之后再算，中间那段先沿用上一份着色。
 */
const HIGHLIGHT_DELAY = 200;

/**
 * 一段文本的着色：把 highlight.js 的类名原样挂到区间上，颜色交给宿主的代码高亮样式表。
 *
 * 两条约束都来自「输入丢字符」这个反馈：**组字期间不重建**（装饰一变，CodeMirror 会让组字区
 * 附近的 DOM 重新生成），**打字期间也不重建**（见 HIGHLIGHT_DELAY）。这期间已有装饰按变更
 * 映射过去，区间始终与正文对齐；等手停下来再整段重算一次颜色。
 */
const createTokenHighlight = (language: string) => ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private stale = false;
    private timer = 0;

    constructor(private readonly view: EditorView) {
        this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged) {
            this.decorations = this.decorations.map(update.changes);
            this.stale = true;
            this.schedule();
            return;
        }
        if (this.stale && !update.view.composing) {
            this.decorations = this.build(update.view);
            this.stale = false;
        }
    }

    destroy() {
        window.clearTimeout(this.timer);
    }

    /** 排一次空闲后的重算；还在组字就往后推，等组字结束那次更新来收尾。 */
    private schedule() {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            if (!this.stale || !this.view.dom.isConnected) {
                return;
            }
            if (this.view.composing) {
                this.schedule();
                return;
            }
            // 空事务只为触发一次 update，让上面那条分支把颜色重算出来
            this.view.dispatch({});
        }, HIGHLIGHT_DELAY);
    }

    private build(view: EditorView) {
        try {
            const marks = highlightTokens(view.state.doc.toString(), language)
                .filter((token) => token.classes && token.from < token.to && token.to <= view.state.doc.length)
                .map((token) => Decoration.mark({class: token.classes}).range(token.from, token.to));
            return Decoration.set(marks, true);
        } catch (error) {
            // 着色出问题时宁可不加颜色：异常从 update 里抛出去会打断 CodeMirror 自己的更新循环，
            // DOM 与正文就此错开，表现为输入丢字符
            log.warn("token highlighting failed, keeping the plain text", {language, error});
            return Decoration.none;
        }
    }
}, {
    decorations: (value) => value.decorations,
});

const isDarkMode = () => {
    const mode = document.documentElement.getAttribute("data-theme-mode");
    if (mode) {
        return mode === "dark";
    }
    return window.siyuan?.config?.appearance?.mode === 1;
};

/**
 * 编辑器外壳的取值与文档里的代码块一致：底色是文档底色（思源把 .hljs 的底色置为透明，
 * 见 `component/_typography.scss`），正文色取 --b3-theme-on-background，等宽字体与 85% 的编辑器字号
 * 也来自那里的 .hljs 规则。边框、悬浮底色与补全弹层照思源对话框的观感来。
 */
const createTheme = (ligatures: boolean) => EditorView.theme({
    "&": {
        color: "var(--b3-theme-on-background)",
        backgroundColor: "var(--b3-theme-background)",
        fontFamily: "var(--b3-font-family-editor-code, var(--b3-font-family-code))",
        // 连字与思源的代码块用同一个开关：关掉时写字形不会合成（需要代码字体本身带连字才看得出来）
        fontVariantLigatures: ligatures ? "normal" : "none",
        // 字号是编辑器字号的 85%，与代码块的 .hljs 一致；--b3-font-size-editor 缺失时按 16px 算
        fontSize: "calc(var(--b3-font-size-editor, 16px) * .85)",
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
        caretColor: "var(--b3-theme-on-background)",
    },
    ".cm-gutters": {
        border: "0",
        paddingLeft: "4px",
        color: "var(--b3-theme-on-surface)",
        // 行号底色必须不透明：.cm-gutters 是 sticky 的，横向滚动时代码会从它下面穿过，
        // 透明底色会让行号和代码文字叠在一起
        backgroundColor: "var(--b3-theme-background)",
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
        borderLeftColor: "var(--b3-theme-on-background)",
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
    /**
     * 重新测量一次。编辑器所在字段在 `display: none` 里时量不到尺寸，切回可见后要重量，
     * 否则光标坐标与点击落点都会错位（表现为「输入被吞掉」）。
     */
    refresh: () => void;
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
    /** 编辑的语言：JavaScript 或 Markdown（智能体提示词用后者）。 */
    language?: TCodeLanguage;
    /** 换行方式：跟随思源、强制启用、强制禁用（见 settings.ts 的 TCodeMode）。 */
    codeWrap?: TCodeMode;
    /** 连字方式，取值与 codeWrap 相同。 */
    codeLigatures?: TCodeMode;
    /**
     * 是否可编辑。笔记锁定时传 false：编辑区只用来查看，不能输入，也没有右下角的改高角
     * （见 createCornerPad）。默认 true。
     */
    editable?: boolean;
} = {}): ICodeEditor => {
    const language = options.language || "javascript";
    const dark = isDarkMode();
    const editable = options.editable !== false;
    const lineWrap = resolveCodeMode(options.codeWrap, window.siyuan?.config?.editor?.codeLineWrap);
    const ligatures = resolveCodeMode(options.codeLigatures, window.siyuan?.config?.editor?.codeLigatures);
    // 宿主的高亮脚本与样式表通常已经在了（文档里有代码块就会加载）；还没有时先空着这个扩展位，
    // 等 ensureHighlighter 把它们带进来再补上 token 着色，编辑器本身不必等
    const highlighterReady = isHighlighterReady();
    const extensions: Extension[] = [
        basicSetup,
        languageExtension(language),
        // basicSetup 自带一份兜底的高亮样式（只会给关键字加粗、给注释斜体），它只在没有别的
        // 高亮样式时才生效；这里给一份空样式把位置占掉，token 的颜色因此全部来自宿主的那套 hljs 类
        syntaxHighlighting(HighlightStyle.define([])),
        createTheme(ligatures),
        highlighterReady ? createTokenHighlight(language) : highlightCompartment.of([]),
    ];
    if (!editable) {
        // 只读：CodeMirror 自己的 editable facet 关掉输入与光标，正文仍可选中复制
        extensions.push(EditorView.editable.of(false));
    }
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
    if (!highlighterReady) {
        void ensureHighlighter().then((loaded) => {
            if (!loaded || !view.dom.isConnected) {
                return;
            }
            view.dispatch({effects: highlightCompartment.reconfigure(createTokenHighlight(language))});
            log.debug("the token colours arrived after the editor was created", {chars: view.state.doc.length});
        });
    }
    element.addEventListener("contextmenu", openNativeTextMenu);
    if (editable) {
        element.append(createCornerPad(view));
    }
    observeManualHeight(view);
    log.debug("created the code editor", {chars: view.state.doc.length, language, dark, lineWrap, ligatures, editable, highlighterReady});
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
        refresh: () => view.requestMeasure(),
    };
};
