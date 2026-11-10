import {getBackend, getFrontend} from "siyuan";
import {createLogger} from "../core/logger";
import {OUTPUT_MODES, type TOutputMode} from "../core/settings";

const log = createLogger("scriptMeta");

/**
 * 脚本可以在最前面用注释声明两块行为（issue #21）：
 *
 * ```javascript
 * // @bis-output error
 * // @bis-frontends desktop, mobile
 * // @bis-backends windows, linux
 * ```
 *
 * - `@bis-output`：这次执行的结果弹窗策略，覆盖插件设置里的「JavaScript 输出弹窗」。
 * - `@bis-frontends` / `@bis-backends`：允许运行的前端与后端，取值与思源集市包的 `frontends` /
 *   `backends` 完全一致；不声明就是 `all`，即两边都允许。当前环境不在声明里时只弹 Toast、不执行代码。
 *
 * 只认脚本最前面的注释块（第一个非注释行之前），写在代码中间不会被当成声明。
 */
export interface IScriptMeta {
    /** 未声明时 undefined，表示跟随插件设置。 */
    outputMode?: TOutputMode;
    /** 空数组表示没有限制（等同于 all）。 */
    frontends: string[];
    backends: string[];
}

/** 思源集市包 `frontends` 字段的取值（见 plugin-sample 的 README 与宿主 loader）。 */
export const SCRIPT_FRONTENDS = [
    "all",
    "desktop",
    "desktop-window",
    "mobile",
    "browser-desktop",
    "browser-mobile",
];

/** 思源集市包 `backends` 字段的取值（与内核 bazaar.GetCurrentBackend 的返回值一致）。 */
export const SCRIPT_BACKENDS = [
    "all",
    "windows",
    "linux",
    "darwin",
    "docker",
    "android",
    "ios",
    "harmony",
];

/** 声明里一个合法取值都没有时用它占位：照集市包的语义，列表非空且不匹配，等于哪儿都不能跑。 */
const NEVER = "__unsupported__";

const parseTargets = (value: string, allowed: string[]) => {
    const tokens = value.split(/[\s,，]+/).filter(Boolean).map((token) => token.toLowerCase());
    if (!tokens.length) {
        return [];
    }
    const valid = tokens.filter((token) => allowed.includes(token));
    return valid.length ? valid : [NEVER];
};

/** 按照集市包的 `IsTargetSupported` 语义判断：空列表 = all，含 "all" 也 = all。 */
export const isTargetSupported = (targets: string[], current: string) =>
    targets.length === 0 || targets.includes("all") || targets.includes(current);

/**
 * 从脚本开头的注释块里读声明。`//` 行、空行都跳过，遇到第一行真正的代码就停；不认识或非法的
 * 取值按上面两条规则处理（输出策略回落插件设置，环境列表退化成「哪儿都不能跑」）。
 */
export const parseScriptMeta = (code: string): IScriptMeta => {
    const meta: IScriptMeta = {frontends: [], backends: []};
    // 带 BOM 的文件（Windows 编辑器常见）第一行不是 `//`，先去掉 BOM 再找声明
    for (const line of code.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        if (!trimmed.startsWith("//")) {
            break;
        }
        const match = /^\/\/\s*@bis-(output|frontends|backends)\s+(.+)$/i.exec(trimmed);
        if (!match) {
            continue;
        }
        const key = match[1].toLowerCase();
        const value = match[2].trim();
        if (key === "output") {
            const mode = value.toLowerCase() as TOutputMode;
            if (OUTPUT_MODES.includes(mode)) {
                meta.outputMode = mode;
            } else {
                log.warn("unknown @bis-output value, following the plugin setting", {value});
            }
        } else if (key === "frontends") {
            meta.frontends = parseTargets(value, SCRIPT_FRONTENDS);
        } else {
            meta.backends = parseTargets(value, SCRIPT_BACKENDS);
        }
    }
    return meta;
};

/** 当前前端/后端是否落在脚本声明的范围内。 */
export const isScriptEnvironmentSupported = (
    meta: IScriptMeta,
    frontend = getFrontend(),
    backend = getBackend(),
) => isTargetSupported(meta.frontends, frontend) && isTargetSupported(meta.backends, backend);
