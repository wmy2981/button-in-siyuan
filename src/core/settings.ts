import type {Plugin} from "siyuan";
import {createLogger, setDebugEnabled} from "./logger";

const log = createLogger("settings");

/**
 * 设置存放的名字。宿主按这个名字原样拼路径（不加扩展名），所以盘上是
 * data/storage/petal/button-in-siyuan/settings。
 */
export const SETTINGS_STORAGE = "settings";

/**
 * 什么时候弹 JavaScript 结果弹窗。默认 `output` 与插件一直以来的行为一致
 * （有 console 输出、有返回值或出错时才弹），`always` 连空弹窗也弹。
 */
export type TOutputMode = "always" | "output" | "console" | "warn" | "error" | "never";

export const OUTPUT_MODES: TOutputMode[] = ["always", "output", "console", "warn", "error", "never"];

/**
 * 代码编辑器的三态设置：`auto` 跟随思源自己的那份设置，`on` / `off` 强制开关。
 * 编辑器每次打开时取值，所以改完设置重新打开编辑器就生效。
 */
export type TCodeMode = "auto" | "on" | "off";

export const CODE_MODES: TCodeMode[] = ["auto", "on", "off"];

export interface ISettings {
    outputMode: TOutputMode;
    /** 调试模式：插件的调试日志与脚本里 `console.debug` 的输出是否写到思源控制台，默认关。 */
    debug: boolean;
    /** 代码编辑器超出宽度时是否换行（见 codeEditor.ts）。 */
    codeWrap: TCodeMode;
    /** 代码编辑器是否显示连字（见 codeEditor.ts）。 */
    codeLigatures: TCodeMode;
    /** 是否把「操作按钮块」的技能写给 Agent（见 agentSkill.ts），默认开。 */
    agentSkill: boolean;
}

export const DEFAULT_SETTINGS: ISettings = {
    outputMode: "output",
    debug: false,
    codeWrap: "auto",
    codeLigatures: "auto",
    agentSkill: true,
};

/** 三态设置落到具体开关上：`auto` 用思源那份设置（取不到时按关），其余两个值强制开关。 */
export const resolveCodeMode = (mode: TCodeMode | undefined, siyuanValue: unknown) => {
    if (mode === "on") {
        return true;
    }
    if (mode === "off") {
        return false;
    }
    return Boolean(siyuanValue);
};

/**
 * 合并已保存的设置与默认值：缺字段、类型不对的值一律回落默认。废弃字段不会留在结果里，
 * 保存时也就不会再写回去。
 */
export const mergeSettings = (saved: unknown): ISettings => {
    const source = (typeof saved === "object" && saved !== null ? saved : {}) as Partial<ISettings>;
    return {
        outputMode: OUTPUT_MODES.includes(source.outputMode as TOutputMode)
            ? source.outputMode as TOutputMode
            : DEFAULT_SETTINGS.outputMode,
        debug: typeof source.debug === "boolean" ? source.debug : DEFAULT_SETTINGS.debug,
        codeWrap: CODE_MODES.includes(source.codeWrap as TCodeMode)
            ? source.codeWrap as TCodeMode
            : DEFAULT_SETTINGS.codeWrap,
        codeLigatures: CODE_MODES.includes(source.codeLigatures as TCodeMode)
            ? source.codeLigatures as TCodeMode
            : DEFAULT_SETTINGS.codeLigatures,
        agentSkill: typeof source.agentSkill === "boolean" ? source.agentSkill : DEFAULT_SETTINGS.agentSkill,
    };
};

/** 读设置；读不到（只读模式、发布服务、文件损坏）时用默认值继续跑。 */
export const loadSettings = async (plugin: Plugin) => {
    let saved: unknown;
    try {
        saved = await plugin.loadData(SETTINGS_STORAGE);
    } catch (error) {
        log.warn("cannot load the plugin settings, using the defaults", {error});
        return {...DEFAULT_SETTINGS};
    }
    const settings = mergeSettings(saved);
    // 读出来立刻生效：下面这条日志自己也受「调试模式」控制
    setDebugEnabled(settings.debug);
    log.debug("loaded the plugin settings", {settings});
    return settings;
};

/** 保存设置，并读回校验（宿主的 saveData 在真正落盘前就可能 resolve，也不检查 response.code）。 */
export const saveSettings = async (plugin: Plugin, settings: ISettings) => {
    await plugin.saveData(SETTINGS_STORAGE, settings);
    const written = mergeSettings(await plugin.loadData(SETTINGS_STORAGE));
    // mergeSettings 的字段顺序固定，两边都过一遍它，比较序列化结果即可覆盖全部字段
    if (JSON.stringify(written) !== JSON.stringify(mergeSettings(settings))) {
        log.error("the plugin settings did not survive the write", {expected: settings, written});
        return false;
    }
    log.info("saved the plugin settings", {settings: written});
    return true;
};

/**
 * 卸载时只删设置文件（issue #26）：`scripts/`、`storage/` 与 `topbar/` 都是用户内容，一律保留。
 *
 * 走宿主的 `removeData` 而不是自己调 `/api/file/removeFile`：它会带上发起窗口的 app id，内核据此
 * 把 storage 变更推给别的窗口、排除自己（`kernel/model/push_reload.go`）；裸调会让本窗口也收到
 * 变更，而插件没有覆盖 `onDataChanged`，宿主会重载整个插件——那正是它被卸载的时候。
 * 文件不存在时内核回 404（从没改过设置就是这种情况），按成功处理。
 */
export const removeSettings = async (plugin: Plugin) => {
    try {
        const response = await plugin.removeData(SETTINGS_STORAGE);
        if (response.code === 0) {
            log.info("removed the plugin settings");
        } else if (response.code === 404) {
            log.debug("the plugin settings file is not there to remove");
        } else {
            log.warn("failed to remove the plugin settings", {code: response.code, msg: response.msg});
        }
    } catch (error) {
        // 只读模式、发布服务或实例已销毁时 removeData 直接 reject；卸载流程里不打扰用户
        log.warn("cannot remove the plugin settings", {error});
    }
};
