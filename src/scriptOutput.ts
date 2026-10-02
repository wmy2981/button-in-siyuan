import {Dialog, platformUtils, showMessage} from "siyuan";
import type {IContext} from "./context";
import {createLogger} from "./logger";

const log = createLogger("scriptOutput");

/** console 的方法名，决定输出行的前缀与配色。 */
export type TScriptLevel = "log" | "info" | "debug" | "warn" | "error" | "table" | "dir";

export interface IScriptEntry {
    level: TScriptLevel;
    /** 可能带 ANSI 颜色转义（\u001b[31m 之类），渲染时解析，复制时去掉 */
    text: string;
}

export interface IScriptResult {
    entries: IScriptEntry[];
    /** 已格式化的返回值；undefined 表示脚本没有 return */
    result?: string;
    /** 已格式化的错误 */
    failure?: string;
}

/**
 * 输出行前缀的配色，全部取自思源自己的变量：debug 用浅灰、log/info 用正文灰、
 * warn 用卡片警告色、error 用主题错误色。
 */
const LEVEL_LABELS: Record<TScriptLevel, string> = {
    log: "log",
    info: "info",
    debug: "debug",
    warn: "warn",
    error: "error",
    table: "table",
    dir: "dir",
};

const LEVEL_COLORS: Record<TScriptLevel, string> = {
    log: "var(--b3-theme-on-surface)",
    info: "var(--b3-theme-on-surface)",
    debug: "var(--b3-theme-on-surface-light)",
    warn: "var(--b3-card-warning-color)",
    error: "var(--b3-theme-error)",
    table: "var(--b3-theme-on-surface)",
    dir: "var(--b3-theme-on-surface)",
};

/**
 * ANSI 转义序列（SGR）。配色故意选中间色调，浅色与深色主题下都能看清，
 * 「黑/白」两档也按可读性调整过，不跟终端里的纯黑纯白一致。
 */
const ANSI_PATTERN = /\u001b\[([0-9;]*)m/g;

const BASE_COLORS = ["#3f3f3f", "#e05561", "#4ca66b", "#d19a3f", "#4c8ff0", "#c678dd", "#3aa8c1", "#c8c8c8"];
const BRIGHT_COLORS = ["#8a8a8a", "#ff7b86", "#6fd18f", "#f0bd63", "#7ab2ff", "#dda0ee", "#5fc9e0", "#f2f2f2"];

interface IAnsiState {
    color?: string;
    background?: string;
    inverse?: boolean;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
}

/** 256 色：0-15 用上面的调色板，16-231 是 6×6×6 色立方，232-255 是灰阶。 */
const color256 = (value: number) => {
    if (value < 8) {
        return BASE_COLORS[value];
    }
    if (value < 16) {
        return BRIGHT_COLORS[value - 8];
    }
    if (value < 232) {
        const cube = value - 16;
        const level = (part: number) => part === 0 ? 0 : 55 + part * 40;
        return `rgb(${level(Math.floor(cube / 36))}, ${level(Math.floor(cube / 6) % 6)}, ${level(cube % 6)})`;
    }
    const gray = 8 + (value - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
};

const clampChannel = (value: number) => Number.isNaN(value) ? 0 : Math.min(255, Math.max(0, Math.round(value)));

const clearState = (state: IAnsiState) => {
    Object.keys(state).forEach((key) => {
        delete (state as Record<string, unknown>)[key];
    });
};

const setAnsiColor = (state: IAnsiState, foreground: boolean, color: string) => {
    if (foreground) {
        state.color = color;
    } else {
        state.background = color;
    }
};

/** 解析一条 SGR 参数序列，就地更新样式状态。 */
const applySgr = (state: IAnsiState, raw: string) => {
    const params = raw.split(";").map((item) => Number.parseInt(item, 10));
    if (params.length === 0) {
        params.push(0);
    }
    for (let i = 0; i < params.length; i++) {
        const code = Number.isNaN(params[i]) ? 0 : params[i];
        if (code === 0) {
            clearState(state);
        } else if (code === 1) {
            state.bold = true;
        } else if (code === 2) {
            state.dim = true;
        } else if (code === 3) {
            state.italic = true;
        } else if (code === 4) {
            state.underline = true;
        } else if (code === 7) {
            state.inverse = true;
        } else if (code === 9) {
            state.strike = true;
        } else if (code === 22) {
            state.bold = false;
            state.dim = false;
        } else if (code === 23) {
            state.italic = false;
        } else if (code === 24) {
            state.underline = false;
        } else if (code === 27) {
            state.inverse = false;
        } else if (code === 29) {
            state.strike = false;
        } else if (code === 39) {
            state.color = undefined;
        } else if (code === 49) {
            state.background = undefined;
        } else if (code >= 30 && code <= 37) {
            state.color = BASE_COLORS[code - 30];
        } else if (code >= 90 && code <= 97) {
            state.color = BRIGHT_COLORS[code - 90];
        } else if (code >= 40 && code <= 47) {
            state.background = BASE_COLORS[code - 40];
        } else if (code >= 100 && code <= 107) {
            state.background = BRIGHT_COLORS[code - 100];
        } else if (code === 38 || code === 48) {
            const foreground = code === 38;
            if (params[i + 1] === 5 && !Number.isNaN(params[i + 2])) {
                setAnsiColor(state, foreground, color256(clampChannel(params[i + 2])));
                i += 2;
            } else if (params[i + 1] === 2) {
                setAnsiColor(state, foreground,
                    `rgb(${clampChannel(params[i + 2])}, ${clampChannel(params[i + 3])}, ${clampChannel(params[i + 4])})`);
                i += 4;
            }
        }
    }
};

/** 把带 ANSI 转义的文本切成「文本 + 样式」的片段。 */
const parseAnsi = (text: string) => {
    const segments: Array<{text: string; state: IAnsiState}> = [];
    const state: IAnsiState = {};
    let lastIndex = 0;
    let match = ANSI_PATTERN.exec(text);
    while (match) {
        if (match.index > lastIndex) {
            segments.push({text: text.slice(lastIndex, match.index), state: {...state}});
        }
        applySgr(state, match[1]);
        lastIndex = match.index + match[0].length;
        match = ANSI_PATTERN.exec(text);
    }
    if (lastIndex < text.length) {
        segments.push({text: text.slice(lastIndex), state: {...state}});
    }
    return segments;
};

/** 去掉 ANSI 转义，用于复制纯文本。 */
export const stripAnsi = (text: string) => text.replace(ANSI_PATTERN, "");

const applyStyle = (element: HTMLElement, state: IAnsiState) => {
    let color = state.color;
    let background = state.background;
    if (state.inverse) {
        color = background || "var(--b3-theme-background)";
        background = state.color || "var(--b3-theme-on-background)";
    }
    if (color) {
        element.style.color = color;
    }
    if (background) {
        element.style.backgroundColor = background;
    }
    if (state.bold) {
        element.style.fontWeight = "600";
    }
    if (state.dim) {
        element.style.opacity = ".7";
    }
    if (state.italic) {
        element.style.fontStyle = "italic";
    }
    const decoration = [state.underline ? "underline" : "", state.strike ? "line-through" : ""].filter(Boolean).join(" ");
    if (decoration) {
        element.style.textDecoration = decoration;
    }
};

/** 渲染一行：级别前缀 + 正文（正文按 ANSI 分段上色）。 */
const renderLine = (parent: HTMLElement, level: TScriptLevel | undefined, text: string, color?: string) => {
    const line = document.createElement("div");
    line.className = "bis-script-output__line";
    if (color) {
        line.style.color = color;
    }
    if (level) {
        const prefix = document.createElement("span");
        prefix.className = "bis-script-output__level";
        prefix.textContent = `${LEVEL_LABELS[level]}:`;
        prefix.style.color = LEVEL_COLORS[level];
        line.append(prefix, document.createTextNode(" "));
    }
    parseAnsi(text).forEach((segment) => {
        if (!segment.text) {
            return;
        }
        const span = document.createElement("span");
        span.textContent = segment.text;
        applyStyle(span, segment.state);
        line.append(span);
    });
    parent.append(line);
};

/** 弹窗里的纯文本（复制用）：级别前缀保留，ANSI 转义去掉。 */
const toPlainText = (context: IContext, scriptResult: IScriptResult) => {
    const lines = scriptResult.entries.map((entry) => `${entry.level}: ${stripAnsi(entry.text)}`);
    if (typeof scriptResult.result !== "undefined") {
        lines.push(`${context.i18n.returnValue}: ${scriptResult.result}`);
    }
    if (typeof scriptResult.failure !== "undefined") {
        lines.push(`${context.i18n.errorValue}: ${scriptResult.failure}`);
    }
    return lines.join("\n");
};

/** 打开运行结果弹窗：结构与思源的「运行信息」弹窗一致，输出支持 ANSI 彩色，另有复制按钮。 */
export const showScriptOutput = (context: IContext, scriptResult: IScriptResult) => {
    const {i18n} = context;
    const plainText = toPlainText(context, scriptResult);
    log.debug("opened the result dialog", {
        consoleLines: scriptResult.entries.length,
        hasResult: typeof scriptResult.result !== "undefined",
        hasFailure: typeof scriptResult.failure !== "undefined",
    });
    const dialog = new Dialog({
        title: i18n.scriptOutput,
        width: "min(720px, 92vw)",
        content: `<div class="b3-dialog__content">
    <div class="bis-script-output" tabindex="0" data-bis="output"></div>
</div>
<div class="b3-dialog__action">
    <button type="button" class="b3-button b3-button--text" data-bis="copy">${i18n.copy}</button>
    <div class="fn__space"></div>
    <button type="button" class="b3-button b3-button--text" data-bis="close">${i18n.close}</button>
</div>`,
    });
    const outputElement = dialog.element.querySelector<HTMLElement>('[data-bis="output"]');
    if (!outputElement) {
        log.error("the result dialog has missing nodes, closing it");
        dialog.destroy();
        return;
    }
    if (plainText) {
        scriptResult.entries.forEach((entry) => renderLine(outputElement, entry.level, entry.text));
        if (typeof scriptResult.result !== "undefined") {
            renderLine(outputElement, undefined, `${i18n.returnValue}: ${scriptResult.result}`, "var(--b3-theme-primary)");
        }
        if (typeof scriptResult.failure !== "undefined") {
            renderLine(outputElement, undefined, `${i18n.errorValue}: ${scriptResult.failure}`, "var(--b3-theme-error)");
        }
    } else {
        renderLine(outputElement, undefined, i18n.noOutput);
    }
    dialog.element.querySelector('[data-bis="copy"]')?.addEventListener("click", () => {
        if (!plainText) {
            showMessage(i18n.noOutput);
            return;
        }
        log.info("copied the run result", {chars: plainText.length});
        platformUtils.copyPlainText(plainText);
        showMessage(i18n.copied);
    });
    dialog.element.querySelector('[data-bis="close"]')?.addEventListener("click", () => dialog.destroy());
};
