import type {Plugin} from "siyuan";
import {createLogger} from "./logger";

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

export interface ISettings {
    outputMode: TOutputMode;
    /** 是否把「操作按钮块」的技能写给 Agent（见 agentSkill.ts），默认开。 */
    agentSkill: boolean;
}

export const DEFAULT_SETTINGS: ISettings = {
    outputMode: "output",
    agentSkill: true,
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
