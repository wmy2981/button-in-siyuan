import type {IContext} from "./context";
import {createLogger} from "./logger";
import {createScriptScope} from "./scriptApi";
import type {IScriptEntry, TScriptLevel} from "./scriptOutput";
import {showScriptOutput} from "./scriptOutput";

const log = createLogger("scriptRunner");

/** 会被捕获的 console 方法：执行期间临时接管，输出进结果弹窗。 */
const CONSOLE_LEVELS: TScriptLevel[] = ["log", "info", "debug", "warn", "error", "table", "dir"];

export const formatValue = (value: unknown): string => {
    if (typeof value === "string") {
        return value;
    }
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
    }
    if (typeof value === "undefined") {
        return "undefined";
    }
    try {
        return JSON.stringify(value) || String(value);
    } catch (error) {
        return String(value);
    }
};

type TConsoleMethod = (...args: unknown[]) => void;

/** 接管 console：执行期间所有输出按级别记到 entries，返回恢复函数。 */
const captureConsole = (entries: IScriptEntry[]) => {
    const target = console as unknown as Record<TScriptLevel, TConsoleMethod>;
    const originals = new Map<TScriptLevel, TConsoleMethod>();
    CONSOLE_LEVELS.forEach((level) => {
        const original = target[level];
        if (typeof original !== "function") {
            return;
        }
        originals.set(level, original.bind(console));
        target[level] = (...args: unknown[]) => {
            entries.push({level, text: args.map(formatValue).join(" ")});
        };
    });
    return () => {
        originals.forEach((method, level) => {
            target[level] = method;
        });
    };
};

/**
 * 执行按钮的 JavaScript 操作：注入思源接口（见 scriptApi.ts）、捕获 console 输出与返回值，
 * 连同错误一起显示在结果弹窗里（见 scriptOutput.ts）。
 */
export const runScript = async (context: IContext, options: {
    blockID: string;
    blockElement?: HTMLElement;
    code: string;
}) => {
    const entries: IScriptEntry[] = [];
    const scope = createScriptScope({
        plugin: context.plugin,
        app: context.app,
        i18n: context.i18n,
        isMobile: context.isMobile,
        blockID: options.blockID,
        blockElement: options.blockElement,
    });
    log.info("开始执行 JavaScript 操作", {blockID: options.blockID, chars: options.code.length, api: scope.names.length});
    const restoreConsole = captureConsole(entries);
    const startedAt = Date.now();
    let result: unknown;
    let failure: unknown;
    try {
        // 用 async 包装，代码里既可以直接 return，也可以使用 await；
        // 思源接口作为形参注入，脚本里直接写 fetchPost(...)、protyle.insert(...) 即可
        const runner = new Function(...scope.names, `return (async () => {\n${options.code}\n})()`);
        result = await runner(...scope.values);
    } catch (error) {
        failure = error;
    } finally {
        restoreConsole();
    }
    const detail = {
        blockID: options.blockID,
        ms: Date.now() - startedAt,
        consoleLines: entries.length,
        hasResult: typeof result !== "undefined",
    };
    if (typeof failure === "undefined") {
        log.info("JavaScript 操作执行完成", detail);
    } else {
        log.error("JavaScript 操作执行出错", {failure, ...detail});
    }
    showScriptOutput(context, {
        entries,
        result: typeof result === "undefined" ? undefined : formatValue(result),
        failure: typeof failure === "undefined" ? undefined : formatValue(failure),
    });
};
