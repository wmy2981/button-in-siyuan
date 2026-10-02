import {getFrontend, Plugin} from "siyuan";
import type {IEventBusMap, Protyle} from "siyuan";
import {createButtonBlockIconHtml} from "./buttonIcon";
import {BUTTON_BLOCK_TYPE, DEFAULT_BUTTON_ICON, parseButtonConfig, renderButtonBlock, serializeButtonConfig} from "./buttonBlock";
import type {IContext} from "./context";
import {openButtonBlockEditor} from "./editDialog";
import type {II18n} from "./i18nKeys";
import {createLogger} from "./logger";
import "./index.scss";

const log = createLogger("plugin");

/** 块信息格式为 <插件包名>/<块类型>，两段都经过 encodeURIComponent。 */
const encodeBlockInfo = (pluginName: string, blockType: string) =>
    `${encodeURIComponent(pluginName)}/${encodeURIComponent(blockType)}`;

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

    /** 每次取值都反映当前的 app 与 i18n，避免在生命周期之外持有宿主对象。 */
    private get context(): IContext {
        return {
            app: this.app,
            plugin: this,
            i18n: this.i18n as II18n,
            isMobile: this.isMobile,
            openEditor: (blockID, config) => openButtonBlockEditor(this.context, {blockID, config}),
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
            id: "insertButtonBlock",
            callback: (protyle) => this.insertButtonBlock(protyle),
        }];
        log.debug("registered the custom block renderer, the slash item and the block menu listener", {
            blockType: BUTTON_BLOCK_TYPE,
            blockInfo: encodeBlockInfo(this.name, BUTTON_BLOCK_TYPE),
            slashFilter: this.protyleSlash[0].filter,
        });
    }

    onunload() {
        this.eventBus.off("click-blockicon", this.blockIconMenu);
        log.info("plugin unloaded");
    }

    /** 斜杠菜单：在光标处插入一个还没有操作的按钮块，内容由用户在「编辑按钮块」里设置。 */
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

    /** 块菜单 > 插件 > 编辑按钮块：只对本插件的按钮块显示，只读文档不提供编辑。 */
    private readonly blockIconMenu = (event: CustomEvent<IEventBusMap["click-blockicon"]>) => {
        const {menu, protyle, blockElements} = event.detail;
        if (protyle.disabled) {
            log.debug("block menu: the document is read-only, no edit entry");
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
