import {getActiveEditor, globalCommand} from "siyuan";
import type {ICommand, ICommandContext} from "siyuan";
import type {IContext} from "./context";
import {createLogger} from "./logger";

const log = createLogger("commands");

/**
 * 命令操作（issue #38）：按钮绑定的是思源命令面板里的一个命令，点击时执行它。
 *
 * 宿主没有给插件「列出并执行任意命令」的接口，这里只用两处公开能力：
 *
 * - 内置命令：命令面板列出的就是 `window.siyuan.config.keymap.general` 里的条目（面板的清单只比它少
 *   四个纯输入框快捷键，见 NOT_COMMANDS），执行走插件 API 导出的 `globalCommand`
 *   （`app/src/boot/globalEvent/command/global.ts`）；它返回 false 就说明这条命令在当前环境跑不了。
 * - 插件命令：遍历 `app.plugins[].commands`，id 与命令面板同形
 *   （`plugin/<插件名>/<langKey>`，见 `app/src/plugin/commandAdapter.ts`），执行时按命令面板的先后
 *   顺序调用命令自己注册的回调。
 *
 * 命令面板里依赖编辑器上下文的项目（插入标题、表格、折叠等由 `core.context.*` / `core.insert.*` 提供的
 * 命令）插件取不到，也不在这里列出。
 */

/** 命令 id 中插件命令的前缀，与宿主命令面板一致。 */
const PLUGIN_ID_PREFIX = "plugin/";

/**
 * 这几项在 `keymap.general` 里有条目，但只是特定输入框里的快捷键，不是命令面板里的命令：
 * 打开右键菜单、命令面板自身、以及智能体输入框的「打开面板 / 发送」。
 */
const NOT_COMMANDS = new Set(["openContextMenu", "commandPanel", "agentChat", "agentSend"]);

/** 命令面板给插件命令算的 id。 */
export const pluginCommandId = (pluginName: string, langKey: string) =>
    `${PLUGIN_ID_PREFIX}${encodeURIComponent(pluginName)}/${encodeURIComponent(langKey)}`;

/** 选择窗口里的一行：一个命令的 id 与它的显示文案。 */
export interface ICommandItem {
    id: string;
    label: string;
}

/** 插件实例在命令这一面上用到的字段（宿主的 `Plugin` 都公开）。 */
interface ICommandOwner {
    name: string;
    displayName: string;
    i18n?: Record<string, unknown>;
    commands?: ICommand[];
}

const hostPlugins = (context: IContext) => {
    const plugins = (context.app as unknown as {plugins?: ICommandOwner[]}).plugins;
    return Array.isArray(plugins) ? plugins : [];
};

/** 插件命令在界面上的写法，与宿主的命令面板一致：`插件显示名: 命令文案`。 */
const ownerLabel = (plugin: ICommandOwner, command: ICommand) => {
    const translated = plugin.i18n?.[command.langKey];
    const text = command.langText || (typeof translated === "string" ? translated : "") || command.langKey;
    return `${plugin.displayName || plugin.name}: ${text}`;
};

/**
 * 当前可绑定的命令：内置命令按快捷键设置里的顺序排在前面，插件命令排在后面。
 * 每次打开选择窗口时现取，装、卸插件之后不用重开思源。
 */
export const listCommands = (context: IContext) => {
    const items: ICommandItem[] = [];
    const keymap = window.siyuan?.config?.keymap;
    const languages = window.siyuan?.languages || {};
    Object.keys(keymap?.general || {}).forEach((key) => {
        if (NOT_COMMANDS.has(key)) {
            return;
        }
        items.push({id: key, label: languages[key] || key});
    });
    const coreCount = items.length;
    hostPlugins(context).forEach((plugin) => {
        (plugin.commands || []).forEach((command) => {
            items.push({
                id: pluginCommandId(plugin.name, command.langKey),
                label: ownerLabel(plugin, command),
            });
        });
    });
    log.debug("listed the commands", {core: coreCount, plugin: items.length - coreCount});
    return items;
};

/**
 * 选中项的显示文案。`commandLabel` 在按钮块管理器里按行调用，所以这里只解 id、不去重建整张命令表：
 * 内置命令的名字就在 `window.siyuan.languages` 里，插件命令按 id 找回注册它的插件。
 * 命令已经不存在（注册它的插件被禁用）时退回 id，用户仍看得出绑的是哪条。
 */
export const commandLabel = (context: IContext, id: string) => {
    if (!id) {
        return "";
    }
    if (!id.startsWith(PLUGIN_ID_PREFIX)) {
        return window.siyuan?.languages?.[id] || id;
    }
    const [, rawName, rawKey] = id.split("/");
    if (!rawName || !rawKey) {
        return id;
    }
    let name: string;
    let langKey: string;
    try {
        name = decodeURIComponent(rawName);
        langKey = decodeURIComponent(rawKey);
    } catch (error) {
        log.warn("the command id is not valid encoded text", {id, error});
        return id;
    }
    const plugin = hostPlugins(context).find((item) => item.name === name);
    const command = plugin?.commands?.find((item) => item.langKey === langKey);
    return plugin && command ? ownerLabel(plugin, command) : id;
};

/**
 * 命令执行时的上下文。命令面板传的是它捕获的那一份快照，插件只能给当前这一份：
 * 焦点优先当作编辑器（按钮就在编辑器里），拿不到活动编辑器时按全局处理。
 */
const createContext = (): ICommandContext => {
    const protyle = getActiveEditor()?.protyle;
    const selection = document.getSelection();
    return {
        source: "commandPanel",
        focus: protyle ? "editor" : "global",
        protyle,
        range: selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined,
    };
};

/** 按命令面板的优先顺序调用插件命令自己注册的回调；一条都没有时返回 false。 */
const runPluginCommand = (command: ICommand, pluginContext: ICommandContext) => {
    if (command.callback) {
        command.callback(pluginContext);
        return true;
    }
    if (pluginContext.protyle && command.editorCallback) {
        command.editorCallback(pluginContext.protyle, pluginContext);
        return true;
    }
    if (command.globalCallback) {
        command.globalCallback(pluginContext);
        return true;
    }
    if (command.execute) {
        void command.execute(pluginContext);
        return true;
    }
    return false;
};

const runPluginCommandById = (context: IContext, id: string) => {
    const matched = hostPlugins(context).flatMap((plugin) =>
        (plugin.commands || [])
            .filter((command) => pluginCommandId(plugin.name, command.langKey) === id)
            .map((command) => ({plugin, command})))[0];
    if (!matched) {
        // 注册它的插件被禁用、卸载，或者 id 是别的版本写下的：调用方据此提示用户
        log.warn("the plugin command is not registered right now", {id});
        return false;
    }
    const pluginContext = createContext();
    const ran = runPluginCommand(matched.command, pluginContext);
    log.info("ran a plugin command", {id, plugin: matched.plugin.name, ran});
    return ran;
};

/**
 * 执行一个命令，返回是否真的执行了。false 的两种情形（命令不存在、当前环境执行不了）对用户是同一件事：
 * 调用方给一条 toast。
 */
export const runCommand = (context: IContext, id: string) => {
    const commandId = id.trim();
    if (!commandId) {
        return false;
    }
    if (commandId.startsWith(PLUGIN_ID_PREFIX)) {
        return runPluginCommandById(context, commandId);
    }
    const handled = globalCommand(commandId, context.app);
    log.info("ran a core command", {command: commandId, handled});
    return handled;
};
