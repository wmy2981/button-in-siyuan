import {getFrontend, Plugin, Setting, showMessage} from "siyuan";
import type {IEventBusMap, Protyle} from "siyuan";
import {downloadAgentSkill, installAgentSkill, removeAgentSkill} from "./agentSkill";
import {syncAssetReferences, syncRenderedAssetReference} from "./assetReference";
import {createButtonBlockIconHtml} from "./buttonIcon";
import {BUTTON_BLOCK_TYPE, DEFAULT_BUTTON_ICON, parseButtonConfig, renderButtonBlock, serializeButtonConfig} from "./buttonBlock";
import type {IContext} from "./context";
import {openButtonBlockEditor} from "./editDialog";
import type {II18n} from "./i18nKeys";
import {createLogger} from "./logger";
import type {ISettings, TCodeMode, TOutputMode} from "./settings";
import {CODE_MODES, DEFAULT_SETTINGS, loadSettings, OUTPUT_MODES, saveSettings} from "./settings";
import "./index.scss";

const log = createLogger("plugin");

/** 块信息格式为 <插件包名>/<块类型>，两段都经过 encodeURIComponent。 */
const encodeBlockInfo = (pluginName: string, blockType: string) =>
    `${encodeURIComponent(pluginName)}/${encodeURIComponent(blockType)}`;

/**
 * 斜杠菜单项的 id。
 *
 * 主编辑器的斜杠菜单会按 id 过滤单元格里的候选项：只保留思源 `TABLE_CELL_SLASH_IDS` 清单里的项，
 * 插件项一律被过滤掉（过滤在 `app/src/protyle/hint/extend.ts` 的 `hintSlash`，清单在
 * `app/src/protyle/util/tableCellRichMenu.ts`），而这个过滤只看 `id`，所以插件必须借清单里的一个
 * id 才有机会出现在那条路径上 —— 取 `code` 是因为它最接近「在这里插入一个块」的语义。
 * 插件项与内置项不会串：思源给插件项算的 entryKey 是 `plugin:<包名>:<id>`
 * （`app/src/config/entryVisibility/catalog.ts`），与内置项的 id 无关；点选时的派发也按这个 entryKey
 * 回到本插件的 `protyleSlash`。
 *
 * 注意：**桌面端在单元格里编辑时这条路径走不到**。思源 3.8.6 起点击单元格会挂上富文本单元格编辑器
 * （`app/src/protyle/render/tableCellRichEditor.ts`），它把 `pluginExtensions` 关掉，插件项根本不会被
 * 构造出来，单元格的斜杠菜单里也就不会有按钮块。这个 id 只兜住「思源仍然向插件索取单元格候选」的
 * 情形，不代表单元格里一定能用（README 的「限制」里写明了）。
 */
const SLASH_ITEM_ID = "code";

/** 输出弹窗策略 → 文案键。设置面板里的下拉列表与 i18n 一一对应。 */
const OUTPUT_MODE_KEYS: Record<TOutputMode, keyof II18n> = {
    always: "outputModeAlways",
    output: "outputModeOutput",
    console: "outputModeConsole",
    warn: "outputModeWarn",
    error: "outputModeError",
    never: "outputModeNever",
};

/** 代码编辑器三态设置 → 文案键。 */
const CODE_MODE_KEYS: Record<TCodeMode, keyof II18n> = {
    auto: "codeModeAuto",
    on: "codeModeOn",
    off: "codeModeOff",
};

/** 解析块信息；格式不合法时返回 undefined。 */
const parseBlockInfo = (info: string) => {
    const separator = info.indexOf("/");
    if (separator < 1 || separator !== info.lastIndexOf("/") || separator === info.length - 1) {
        return;
    }
    try {
        return {
            pluginName: decodeURIComponent(info.slice(0, separator)),
            blockType: decodeURIComponent(info.slice(separator + 1)),
        };
    } catch (error) {
        log.warn("block info is not valid encoded text", {info, error});
        return;
    }
};

export default class ButtonInSiYuan extends Plugin {
    private isMobile = false;
    private settings: ISettings = {...DEFAULT_SETTINGS};

    /** 每次取值都反映当前的 app 与 i18n，避免在生命周期之外持有宿主对象。 */
    private get context(): IContext {
        return {
            app: this.app,
            plugin: this,
            i18n: this.i18n as II18n,
            isMobile: this.isMobile,
            openEditor: (blockID, config, editable) => openButtonBlockEditor(this.context, {blockID, config, editable}),
            syncAssetReference: (element, blockID, config) => syncRenderedAssetReference(element, blockID, config),
            getSettings: () => this.settings,
        };
    }

    onload() {
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
        const context = this.context;
        log.info("plugin loaded", {name: this.name, displayName: this.displayName, frontend, isMobile: this.isMobile});
        this.customBlockRenders[BUTTON_BLOCK_TYPE] = {
            render: (options) => renderButtonBlock(context, options),
        };
        this.eventBus.on("click-blockicon", this.blockIconMenu);
        this.protyleSlash = [{
            // filter 是斜杠菜单的搜索关键字（不显示给用户，所以不放进 i18n）：
            // 中文界面按「按钮块」、英文界面按 button / btn 都能搜到
            filter: [context.i18n.insertButtonBlock, "button", "btn", "按钮块", "anniu"],
            // 斜杠菜单里的图标是本插件自绘的按钮块图形（src/buttonIcon.ts），与市集图标同源。
            // bis-slash-item 是给移动端斜杠菜单用的标记：思源会把插件项 html 整个塞进
            // .keyboard__slash-text（插件项没有图标槽），那里没有 .b3-list-item__first 的 flex 上下文，
            // 图标与文字会叠成两行，index.scss 里按这个类把 flex 补回来。
            html: `<div class="b3-list-item__first bis-slash-item">${createButtonBlockIconHtml()}<span class="b3-list-item__text">${context.i18n.insertButtonBlock}</span></div>`,
            id: SLASH_ITEM_ID,
            callback: (protyle) => this.insertButtonBlock(protyle),
        }];
        log.debug("registered the custom block renderer, the slash item and the block menu listener", {
            blockType: BUTTON_BLOCK_TYPE,
            blockInfo: encodeBlockInfo(this.name, BUTTON_BLOCK_TYPE),
            slashFilter: this.protyleSlash[0].filter,
        });
        // 设置与技能都要读盘/走内核，放到注册之后再跑：渲染器与菜单项必须第一时间就位。
        // 设置面板等设置读完再注册，否则面板打开的瞬间可能还拿着默认值，保存就把用户设置冲掉了
        void this.initSettings().finally(() => this.registerSetting());
    }

    onunload() {
        this.eventBus.off("click-blockicon", this.blockIconMenu);
        log.info("plugin unloaded");
        // 禁用、重载与卸载都会走到这里：宿主的 teardown 一定先跑 onunload，只有卸载时才接着补跑
        // uninstall（siyuan 的 app/src/plugin/lifecycle.ts）。所以技能在这里删一次就覆盖了「禁用」
        // 与「卸载」两种情况，不会留下一个指向已停用插件的技能让 Agent 白调一趟。
        return removeAgentSkill(this.name);
    }

    private async initSettings() {
        this.settings = await loadSettings(this);
        if (this.settings.agentSkill) {
            await installAgentSkill(this.name);
        }
        // 补齐按钮块上的资源引用属性：脚本文件不该出现在「未引用的资源文件」里被清理掉
        await syncAssetReferences(this.context);
    }

    /**
     * 注册插件设置面板（集市 - 已下载 里插件卡片上的齿轮图标）。
     *
     * 面板是思源自己的 `Setting`：默认就是当前窗口里的模态对话框（不传 openInWindow），
     * 控件要插件自己造 —— 思源按类名判断布局（`b3-switch` 放进 label，其余元素加
     * `fn__flex-center fn__size200`），所以这里只用思源自己的控件类。
     * `createActionElement` 在每次打开面板时调用，那时读 `this.settings` 就是最新值。
     *
     * 下拉列表不传 `direction`：思源对 `<select>` 自己判成 column，标题在左、控件在右，
     * 与它自己的设置面板一致；窗口窄于 750px 时再由思源的响应式规则把控件换到标题下面占满整行。
     */
    private registerSetting() {
        const i18n = this.i18n as II18n;
        const outputSelect = document.createElement("select");
        outputSelect.className = "b3-select";
        OUTPUT_MODES.forEach((mode) => {
            const option = document.createElement("option");
            option.value = mode;
            option.textContent = i18n[OUTPUT_MODE_KEYS[mode]];
            outputSelect.append(option);
        });
        const wrapSelect = document.createElement("select");
        wrapSelect.className = "b3-select";
        const ligatureSelect = document.createElement("select");
        ligatureSelect.className = "b3-select";
        [wrapSelect, ligatureSelect].forEach((select) => CODE_MODES.forEach((mode) => {
            const option = document.createElement("option");
            option.value = mode;
            option.textContent = i18n[CODE_MODE_KEYS[mode]];
            select.append(option);
        }));
        const skillSwitch = document.createElement("input");
        skillSwitch.type = "checkbox";
        skillSwitch.className = "b3-switch fn__flex-center";
        // 下载按钮与思源自己的设置按钮同款：b3-button--outline，尺寸交给面板里的 fn__size200
        const skillDownload = document.createElement("button");
        skillDownload.className = "b3-button b3-button--outline";
        skillDownload.textContent = i18n.downloadSkill;
        skillDownload.addEventListener("click", () => void this.downloadSkill(skillDownload));
        this.setting = new Setting({
            confirmCallback: () => {
                // 保存按钮不等待回调：这里自己把结果落盘、必要时提示
                void this.saveSetting({
                    outputMode: outputSelect.value as TOutputMode,
                    codeWrap: wrapSelect.value as TCodeMode,
                    codeLigatures: ligatureSelect.value as TCodeMode,
                    agentSkill: skillSwitch.checked,
                });
            },
        });
        this.setting.addItem({
            title: i18n.settingsOutputMode,
            description: i18n.settingsOutputModeTip,
            createActionElement: () => {
                outputSelect.value = this.settings.outputMode;
                return outputSelect;
            },
        });
        this.setting.addItem({
            title: i18n.settingsCodeWrap,
            description: i18n.settingsCodeWrapTip,
            createActionElement: () => {
                wrapSelect.value = this.settings.codeWrap;
                return wrapSelect;
            },
        });
        this.setting.addItem({
            title: i18n.settingsCodeLigatures,
            description: i18n.settingsCodeLigaturesTip,
            createActionElement: () => {
                ligatureSelect.value = this.settings.codeLigatures;
                return ligatureSelect;
            },
        });
        this.setting.addItem({
            title: i18n.settingsAgentSkill,
            description: i18n.settingsAgentSkillTip,
            createActionElement: () => {
                skillSwitch.checked = this.settings.agentSkill;
                return skillSwitch;
            },
        });
        this.setting.addItem({
            title: i18n.settingsDownloadSkill,
            description: i18n.settingsDownloadSkillTip,
            createActionElement: () => skillDownload,
        });
        log.debug("registered the plugin setting panel", {outputModes: OUTPUT_MODES.length});
    }

    /**
     * 设置面板里的「下载技能」：把内置的整份技能打包交给思源原生的保存流程（见 agentSkill.ts）。
     * 保存对话框由宿主弹出，用户在对话框里取消不算失败，所以这里只在真正出错时提示。
     */
    private async downloadSkill(button: HTMLButtonElement) {
        button.disabled = true;
        try {
            await downloadAgentSkill(this.name);
        } catch (error) {
            log.error("failed to download the agent skill", {error});
            showMessage((this.i18n as II18n).downloadSkillFailed);
        } finally {
            button.disabled = false;
        }
    }

    /** 保存设置并应用副作用：技能开关变化时立刻写入或删除技能。 */
    private async saveSetting(next: ISettings) {
        const previous = this.settings;
        let saved = false;
        try {
            saved = await saveSettings(this, next);
        } catch (error) {
            // 只读模式、发布服务下 saveData 会直接 reject
            log.error("failed to save the plugin settings", {error});
        }
        if (!saved) {
            showMessage((this.i18n as II18n).settingsSaveFailed);
            return;
        }
        this.settings = next;
        if (next.agentSkill === previous.agentSkill) {
            return;
        }
        if (next.agentSkill) {
            await installAgentSkill(this.name);
        } else {
            await removeAgentSkill(this.name);
        }
    }

    /**
     * 斜杠菜单：在光标处插入一个还没有操作的按钮块，内容由用户在「编辑按钮块」里设置。
     *
     * 插入交给思源自己的 `protyle.insert(dom, true)`：它按光标找最近的块，把新块插在那个块后面。
     * 光标在表格单元格里时，单元格本身不是块 —— 思源把整个表格渲染成一个 `NodeTable` 块，
     * 单元格里只有行内内容（`app/src/protyle/util/table.ts` 的表格 DOM），所以最近的块就是表格，
     * 按钮块会落在表格后面。
     */
    private insertButtonBlock(protyle: Protyle) {
        const lute = protyle.protyle.lute;
        if (!lute) {
            log.warn("the editor has no lute, skipping the button block insertion");
            return;
        }
        const info = encodeBlockInfo(this.name, BUTTON_BLOCK_TYPE);
        // 默认带一个图标：新建出来的按钮块不至于是一个光秃秃的按钮
        const content = serializeButtonConfig({text: this.context.i18n.defaultButtonText, icon: DEFAULT_BUTTON_ICON});
        const markdown = `;;;${info}\n${content}\n;;;`;
        protyle.insert(lute.Md2BlockDOM(markdown), true);
        log.info("inserted a button block", {blockInfo: info});
        log.debug("inserted markdown", markdown);
    }

    /**
     * 块菜单 > 插件 > 编辑按钮块：只对本插件的按钮块显示。
     *
     * 笔记锁定（或只读）时这里**不出现**：编辑按钮块会写回块内容，锁定的笔记不该有这条入口。
     * 要查看配置仍然可以右键（桌面端）或长按（移动端）按钮，那时打开的是只读预览（见 issue #19）。
     */
    private readonly blockIconMenu = (event: CustomEvent<IEventBusMap["click-blockicon"]>) => {
        const {menu, protyle, blockElements} = event.detail;
        if (protyle.disabled) {
            log.debug("block menu: the note is locked or read-only, no edit entry");
            return;
        }
        const blockElement = blockElements.find(item => {
            if (item.getAttribute("data-type") !== "NodeCustomBlock") {
                return false;
            }
            const info = parseBlockInfo(item.getAttribute("data-info") || "");
            return info?.pluginName === this.name && info.blockType === BUTTON_BLOCK_TYPE;
        });
        if (!blockElement) {
            return;
        }
        const blockID = blockElement.getAttribute("data-node-id") || "";
        const i18n = this.context.i18n;
        const content = blockElement.getAttribute("data-content") || "";
        const config = parseButtonConfig(content, i18n.defaultButtonText);
        // 内容不是本插件的配置时不提供编辑，避免把用户自己的数据覆盖成按钮配置
        if (!blockID || !config) {
            log.warn("block menu: the button block content is not this plugin config, no edit entry", {blockID, content});
            return;
        }
        log.debug("block menu: button block matched", {blockID, action: config.action?.type || "none", icon: config.icon});
        menu.addItem({
            id: "button-in-siyuan-edit",
            icon: "iconEdit",
            label: i18n.editButtonBlock,
            click: () => openButtonBlockEditor(this.context, {blockID, config}),
        });
    };
}
