import type {Plugin} from "siyuan";
import {createLogger} from "../core/logger";
import {SCRIPT_DATA_PREFIX} from "../core/pluginPaths";

const log = createLogger("scriptStorage");

/**
 * 脚本数据文件在插件私有目录下的子目录（issue #25）。
 *
 * 旧版本里脚本的 `plugin.saveData("click-count", …)` 直接写在插件目录根，和插件的 `settings` 混在
 * 一起；现在统一收进 `data/storage/petal/button-in-siyuan/storage/`。这里只改注入给脚本的
 * `plugin`，插件自己的设置读写仍走原路径。
 */

/** 插件自己的文件，不能被脚本的存储代理挪走或删掉。 */
const RESERVED_NAMES = new Set(["settings"]);

const dataNameOf = (name: string) => {
    let value = name.trim().replace(/^\/+/, "");
    // 允许脚本直接写完整前缀（照文档抄路径时不会变成 storage/storage/…）
    if (value.startsWith(SCRIPT_DATA_PREFIX)) {
        value = value.substring(SCRIPT_DATA_PREFIX.length);
    }
    return value ? `${SCRIPT_DATA_PREFIX}${value}` : value;
};

/** 宿主把「文件不存在」也解析成 ""，所以空串要当作没读到，继续找旧位置。 */
const hasValue = (value: unknown) => value !== undefined && value !== null && value !== "";

/**
 * 把脚本的存储调用挪进 `storage/` 子目录，并顺手迁移旧文件。
 *
 * - 读：先读新位置；没有值时再读旧位置（插件目录根），读到就写进新位置并删掉旧文件。
 * - 写：写新位置，成功之后删掉旧位置的同名文件（同一个名字不该留下两份）。
 * - 删：两处都删，旧文件不会残留。
 *
 * 返回的是插件实例的代理：除这三个方法外的一切（`name`、`i18n`、`openSetting`、`eventBus` 等）
 * 原样转发，方法绑回真实实例，宿主用它自己的 `disposedPlugins` 判断生命周期时仍然认得。
 */
export const createScriptPlugin = (plugin: Plugin): Plugin => new Proxy(plugin, {
    get(target, property, receiver) {
        if (property === "loadData") {
            return async (name: string) => {
                if (typeof name !== "string" || !name.trim() || RESERVED_NAMES.has(name)) {
                    return target.loadData(name);
                }
                const next = dataNameOf(name);
                const value = await target.loadData(next);
                if (hasValue(value)) {
                    return value;
                }
                const legacy = await target.loadData(name);
                if (!hasValue(legacy)) {
                    return value;
                }
                log.info("migrating a script data file into storage/", {name});
                try {
                    await target.saveData(next, legacy);
                    await target.removeData(name);
                } catch (error) {
                    // 只读模式或写失败：这次仍然把旧值给脚本，下次再试
                    log.warn("cannot migrate the script data file", {name, error});
                }
                return legacy;
            };
        }
        if (property === "saveData") {
            return async (name: string, content: unknown) => {
                if (typeof name !== "string" || !name.trim() || RESERVED_NAMES.has(name)) {
                    return target.saveData(name, content);
                }
                const result = await target.saveData(dataNameOf(name), content);
                // 旧位置有同名文件就清掉；失败不影响这次保存，旧值也已经被新值覆盖
                try {
                    await target.removeData(name);
                } catch (error) {
                    log.warn("cannot remove the legacy script data file", {name, error});
                }
                return result;
            };
        }
        if (property === "removeData") {
            return async (name: string) => {
                if (typeof name !== "string" || !name.trim() || RESERVED_NAMES.has(name)) {
                    return target.removeData(name);
                }
                const result = await target.removeData(dataNameOf(name));
                try {
                    await target.removeData(name);
                } catch (error) {
                    log.warn("cannot remove the legacy script data file", {name, error});
                }
                return result;
            };
        }
        const value = Reflect.get(target, property, receiver);
        // 方法绑回真实插件实例：宿主的生命周期检查按实例身份判断，代理对象不在它的集合里
        return typeof value === "function" ? value.bind(target) : value;
    },
});
