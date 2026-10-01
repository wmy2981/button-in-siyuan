/**
 * 插件日志：统一前缀 + 分级输出，便于在开发者工具里按级别过滤。
 *
 * 级别与 console 方法一一对应：
 * - `debug` → `console.debug`，浏览器默认把它归到 Verbose，平时不打扰用户；
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

const emit = (level: TLogLevel, scope: string, message: string, detail?: unknown) => {
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
