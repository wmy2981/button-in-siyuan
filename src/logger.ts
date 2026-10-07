/**
 * 插件日志：统一前缀 + 分级输出，便于在开发者工具里按级别过滤。
 *
 * **所有级别只在设置里的「调试模式」打开时输出**（默认关，见 setDebugEnabled）：关掉时思源控制台里
 * 只有脚本自己的 console 调用写下的内容（由 scriptRunner.ts 转交），插件一条都不打印。
 * 调试模式打开后，级别与 console 方法一一对应：
 * - `debug` → `console.debug`，过程细节；
 * - `info`  → `console.info`，用户可见的关键动作（加载、卸载、打开对话框、执行操作）；
 * - `warn`  → `console.warn`，能继续跑但不符合预期的情况（内容认不出、写回失败）；
 * - `error` → `console.error`，出错（JavaScript 操作抛异常、写回被宿主拒绝）。
 *
 * 第二个参数是结构化细节，直接作为 console 的第二个实参传入，展开即可看对象。
 */

export type TLogLevel = "debug" | "info" | "warn" | "error";

export interface ILogger {
    debug: (message: string, detail?: unknown) => void;
    info: (message: string, detail?: unknown) => void;
    warn: (message: string, detail?: unknown) => void;
    error: (message: string, detail?: unknown) => void;
}

const PREFIX = "[button-in-siyuan]";

/** 调试模式开关，默认关：关掉时插件的日志一条都不输出（脚本自己的 console 输出不走这里）。 */
let debugEnabled = false;

/** 由插件入口按设置里的「调试模式」调用（设置读完、以及每次保存设置后）。 */
export const setDebugEnabled = (enabled: boolean) => {
    debugEnabled = enabled;
};

/** 当前是否开着调试模式；脚本的 `console.debug` 也按它决定要不要收集与转发。 */
export const isDebugEnabled = () => debugEnabled;

const emit = (level: TLogLevel, scope: string, message: string, detail?: unknown) => {
    if (!debugEnabled) {
        return;
    }
    const head = `${PREFIX}[${scope}] ${message}`;
    if (typeof detail === "undefined") {
        console[level](head);
        return;
    }
    console[level](head, detail);
};

/** 各模块用模块名建一个 logger，日志前缀形如 [button-in-siyuan][buttonBlock]。 */
export const createLogger = (scope: string): ILogger => ({
    debug: (message, detail) => emit("debug", scope, message, detail),
    info: (message, detail) => emit("info", scope, message, detail),
    warn: (message, detail) => emit("warn", scope, message, detail),
    error: (message, detail) => emit("error", scope, message, detail),
});
