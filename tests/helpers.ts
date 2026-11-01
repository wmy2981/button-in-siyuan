import {vi} from "vitest";
import type {IButtonConfig} from "../src/buttonBlock";
import type {IContext} from "../src/context";
import type {II18n} from "../src/i18nKeys";
import type {ISettings} from "../src/settings";
import {DEFAULT_SETTINGS} from "../src/settings";
import {Plugin} from "./mocks/siyuan";

/**
 * 文案替身：没显式给的键直接返回键名本身，断言里就能一眼看出取的是哪条文案
 * （例如 `managerEdit` 而不是一句中文）。
 */
export const makeI18n = (overrides: Partial<II18n> = {}): II18n => new Proxy(
    {...overrides} as Record<string, string>,
    {
        get(target, property) {
            if (typeof property !== "string") {
                return undefined;
            }
            return property in target ? target[property] : property;
        },
    },
) as unknown as II18n;

/** 插件运行上下文：默认值够大多数模块用，需要时按字段覆盖。 */
export const makeContext = (overrides: Partial<IContext> = {}): IContext => ({
    app: {plugins: []} as unknown as IContext["app"],
    plugin: new Plugin() as unknown as IContext["plugin"],
    i18n: makeI18n(),
    isMobile: false,
    openEditor: vi.fn(),
    syncAssetReference: vi.fn(),
    getSettings: () => ({...DEFAULT_SETTINGS}),
    ...overrides,
});

/** 常用按钮配置；`overrides` 里的字段直接覆盖。 */
export const makeConfig = (overrides: Partial<IButtonConfig> = {}): IButtonConfig => ({
    text: "Run",
    icon: "",
    ...overrides,
});

/** 设置替身：只覆盖关心的字段。 */
export const makeSettings = (overrides: Partial<ISettings> = {}): ISettings => ({
    ...DEFAULT_SETTINGS,
    ...overrides,
});

/** 等一轮宏任务，让 `void promise` 之类的后台链走完。 */
export const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** jsdom 的 `File` 没有 `text()`，用 `FileReader` 读回内容。 */
export const readFileText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
});

export const jsonResponse = (data: unknown, init: ResponseInit = {}) => new Response(
    JSON.stringify(data),
    {status: 200, headers: {"content-type": "application/json"}, ...init},
);

export const textResponse = (text: string, init: ResponseInit = {}) => new Response(text, {status: 200, ...init});

/** 内核出错时是 HTTP 202 + JSON 信封（见 src/scriptFile.ts）。 */
export const kernelErrorResponse = (msg: string, status = 202) => new Response(
    JSON.stringify({code: -1, msg}),
    {status, headers: {"content-type": "application/json"}},
);

/** 造一个只带 `touches` / `changedTouches` 的触摸事件（jsdom 没有 TouchEvent 构造器）。 */
export const touchEvent = (
    type: string,
    touches: Array<{clientX: number; clientY: number; target?: EventTarget}>,
    changedTouches = touches,
) => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    Object.defineProperties(event, {
        touches: {value: touches},
        targetTouches: {value: touches},
        changedTouches: {value: changedTouches},
    });
    return event as unknown as TouchEvent;
};
