/**
 * 插件在工作空间里的私有目录。
 *
 * 插件名必须与 `plugin.json` 的 `name` 一致：宿主的 `saveData` / `loadData` 用的就是这个目录
 * （`app/src/plugin/index.ts` 拼 `/data/storage/petal/<插件名>/`），而脚本文件与按钮数据也放在这里，
 * 两者必须落在同一棵树下。路径一律相对**工作空间根**，这是 `/api/file/*` 与 Agent 的 `file` 工具
 * 都认的形式。
 */
export const PLUGIN_NAME = "button-in-siyuan";

/** 插件私有目录（工作空间相对路径）。 */
export const PLUGIN_STORAGE_DIR = `data/storage/petal/${PLUGIN_NAME}`;

/** JavaScript 文件在插件目录下的子目录。 */
export const PLUGIN_SCRIPT_DIR = `${PLUGIN_STORAGE_DIR}/scripts/`;

/** 按钮脚本通过 `plugin.saveData` 写的数据文件在插件目录下的前缀（见 scriptStorage.ts）。 */
export const SCRIPT_DATA_PREFIX = "storage/";

/** 用户资源目录（工作空间相对路径）；旧版本把脚本放在这里。 */
export const ASSET_SCRIPT_DIR = "data/assets/";

/** 所有允许存放按钮脚本的目录，路径统一以工作空间根为基准。 */
export const SCRIPT_DIRECTORIES = [ASSET_SCRIPT_DIR, PLUGIN_SCRIPT_DIR] as const;
