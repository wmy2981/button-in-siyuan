import {getFrontend, Plugin} from "siyuan";
import type {IEventBusMap, Protyle} from "siyuan";
import {createButtonBlockIconHtml} from "./buttonIcon";
import {BUTTON_BLOCK_TYPE, parseButtonConfig, renderButtonBlock, serializeButtonConfig} from "./buttonBlock";
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
        log.warn("块信息不是合法的编码格式", {info, error});
        return;
    }
};

export default class ButtonInSiYuan extends Plugin {
    private isMobile = false;

    /** 每次取值都反映当前的 app 与 i18n，避免在生命周期之外持有宿主对象。 */
    private get context(): IContext {
        return {
            app: this.app,
            i18n: this.i18n as II18n,
            isMobile: this.isMobile,
        };
    }

    onload() {
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
        const context = this.context;
        log.info("插件加载", {name: this.name, displayName: this.displayName, frontend, isMobile: this.isMobile});
        this.customBlockRenders[BUTTON_BLOCK_TYPE] = {
            render: (options) => renderButtonBlock(context, options),
        };
        this.eventBus.on("click-blockicon", this.blockIconMenu);
        this.protyleSlash = [{
            filter: [context.i18n.insertButtonBlock, "button", "按钮块", "anniu"],
            // 斜杠菜单里的图标是本插件自绘的按钮块图形（src/buttonIcon.ts），与市集图标同源
            html: `<div class="b3-list-item__first">${createButtonBlockIconHtml()}<span class="b3-list-item__text">${context.i18n.insertButtonBlock}</span></div>`,
            id: "insertButtonBlock",
            callback: (protyle) => this.insertButtonBlock(protyle),
        }];
        log.debug("已注册自定义块渲染器、斜杠菜单项与块菜单监听", {
            blockType: BUTTON_BLOCK_TYPE,
            blockInfo: encodeBlockInfo(this.name, BUTTON_BLOCK_TYPE),
            slashFilter: this.protyleSlash[0].filter,
        });
    }

    onunload() {
        this.eventBus.off("click-blockicon", this.blockIconMenu);
        log.info("插件卸载");
    }

    /** 斜杠菜单：在光标处插入一个还没有操作的按钮块，内容由用户在「编辑按钮块」里设置。 */
    private insertButtonBlock(protyle: Protyle) {
        const lute = protyle.protyle.lute;
        if (!lute) {
            log.warn("当前编辑器没有 lute，取消插入按钮块");
            return;
        }
        const info = encodeBlockInfo(this.name, BUTTON_BLOCK_TYPE);
        const content = serializeButtonConfig({text: this.context.i18n.defaultButtonText, icon: ""});
        const markdown = `;;;${info}\n${content}\n;;;`;
        protyle.insert(lute.Md2BlockDOM(markdown), true);
        log.info("插入按钮块", {blockInfo: info});
        log.debug("插入的 markdown", markdown);
    }

    /** 块菜单 > 插件 > 编辑按钮块：只对本插件的按钮块显示，只读文档不提供编辑。 */
    private readonly blockIconMenu = (event: CustomEvent<IEventBusMap["click-blockicon"]>) => {
        const {menu, protyle, blockElements} = event.detail;
        if (protyle.disabled) {
            log.debug("块菜单：文档只读，不提供编辑入口");
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
            log.warn("块菜单：按钮块内容不是本插件的配置，不提供编辑入口", {blockID, content});
            return;
        }
        log.debug("块菜单：命中按钮块", {blockID, action: config.action?.type || "none", icon: config.icon});
        menu.addItem({
            id: "button-in-siyuan-edit",
            icon: "iconEdit",
            label: i18n.editButtonBlock,
            click: () => openButtonBlockEditor(this.context, {blockID, config}),
        });
    };
}
