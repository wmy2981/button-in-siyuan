import type {Plugin} from "siyuan";
import {createLogger} from "./logger";

const log = createLogger("settings");

/** 设置存放的名字（落在 data/storage/petal/button-in-siyuan/settings.json）。 */
export const SETTINGS_STORAGE = "settings";

export interface ISettings {
    /** 是否把「操作按钮块」的技能写给 Agent（见 agentSkill.ts），默认开。 */
    agentSkill: boolean;
}

export const DEFAULT_SETTINGS: ISettings = {
    agentSkill: true,
};

/**
 * 合并已保存的设置与默认值：缺字段、类型不对的值一律回落默认。废弃字段不会留在结果里，
 * 保存时也就不会再写回去。
 */
export const mergeSettings = (saved: unknown): ISettings => {
    const source = (typeof saved === "object" && saved !== null ? saved : {}) as Partial<ISettings>;
    return {
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
    if (written.agentSkill !== settings.agentSkill) {
        log.error("the plugin settings did not survive the write", {expected: settings, written});
        return false;
    }
    log.info("saved the plugin settings", {settings: written});
    return true;
};
