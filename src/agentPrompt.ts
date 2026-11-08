import {Constants, getActiveEditor, showMessage} from "siyuan";
import type {IContext} from "./context";
import {createLogger} from "./logger";

const log = createLogger("agentPrompt");

/**
 * 智能体提示词操作（issue #45）：点按钮时打开智能体侧栏，把这段 Markdown 填进它的输入框，
 * 需要时直接发出去。
 *
 * 宿主没有给插件「往智能体输入框里塞文本」的接口，所以这里只做界面上那两步：打开侧栏，然后
 * 把 Markdown 渲染成块塞进输入框（`AgentChat` 的发送框是一个 protyle-lite，发送时它自己会把
 * 块 DOM 转回 Markdown，格式因此原样保留）。数据一律走 DOM，插件不碰会话状态。
 */

/** 智能体面板与输入框（`app/src/layout/dock/agent/AgentChat.ts` 的 DOM）。 */
const PANEL_CLASS = "sy__agentChat";
const COMPOSER_SELECTOR = ".agent-chat__composer-host .protyle-wysiwyg";
const SEND_SELECTOR = ".agent-chat__send";
/** 面板头部的「新对话」按钮，点了就换一个空会话。 */
const NEW_SESSION_SELECTOR = '.block__icon[data-type="new-session"]';
/** 空会话的欢迎页：新对话落定后由宿主重画（`app/src/layout/dock/agent/AgentMessageRenderer.ts`）。 */
const WELCOME_SELECTOR = ".agent-welcome";
/** 桌面端右侧停靠栏上的智能体按钮。 */
const DOCK_ITEM_SELECTOR = '.dock__item[data-type="agentChat"]';
/** 移动端侧滑面板里的智能体页签。 */
const MOBILE_TAB_SELECTOR = '[data-type="sidebar-agent-tab"]';

/** 面板是异步建出来的（移动端还要等动态 import），给它一点时间。 */
const PANEL_TIMEOUT = 3000;
const PANEL_POLL = 50;
/** 等发送按钮可用的上限：面板首次构造要读会话与模型列表。 */
const SEND_TIMEOUT = 3000;
/**
 * 等「新对话」落定的上限。宿主的 `createSession` 先保存上一轮、再清空消息区与输入框，中间夹着几次
 * 等待内核的调用，移动端一张网更慢；给它放宽到几秒，别按面板打开那种几百毫秒的预期来算。
 */
const NEW_CHAT_TIMEOUT = 5000;
/** 填完先等一下再确认内容还在：会话切换收尾时宿主会清空输入框。 */
const FILL_CONFIRM_DELAY = 150;
/** 点了发送之后，宿主要把输入框清空并开始回复，用它判断这一下真的发出去了。 */
const SEND_CONFIRM_TIMEOUT = 3000;

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const composerElement = (panel: HTMLElement) => panel.querySelector<HTMLElement>(COMPOSER_SELECTOR);

/** 输入框里还有没有内容（宿主的占位符是 contenteditable 里的零宽空格）。 */
const hasComposerText = (composer: HTMLElement) =>
    (composer.textContent || "").split(Constants.ZWSP).join("").trim() !== "";

const panelElement = () => document.querySelector<HTMLElement>(`.${PANEL_CLASS}`);

/** 面板已经展开时不要再点一次，那次点击会把它收起来。 */
const isDesktopPanelOpen = () =>
    Boolean(document.querySelector<HTMLElement>(DOCK_ITEM_SELECTOR)?.classList.contains("dock__item--active"));

const isMobilePanelOpen = () =>
    panelElement()?.closest<HTMLElement>(".side-panel")?.style.transform === "translateX(0px)";

/** 桌面端：点一下右侧停靠栏的智能体按钮。 */
const openDesktopDock = () => {
    const item = document.querySelector<HTMLElement>(DOCK_ITEM_SELECTOR);
    if (!item || item.classList.contains("fn__none")) {
        log.warn("the agent dock item is not there");
        return false;
    }
    if (!item.classList.contains("dock__item--active")) {
        item.click();
    }
    return true;
};

/**
 * 移动端：照宿主 `openDock("agent")` 的做法滑出侧栏页签（`app/src/mobile/dock/util.ts`）。
 * 插件 API 的 `toggleLeftDock` / `toggleRightDock` 在移动端直接返回 false，别改走那条路。
 */
const openMobileSidePanel = () => {
    const tab = document.querySelector<HTMLElement>(MOBILE_TAB_SELECTOR);
    const sidePanel = tab?.closest<HTMLElement>(".side-panel");
    if (!tab || !sidePanel || tab.classList.contains("fn__none")) {
        log.warn("the agent side panel tab is not available", {hasTab: Boolean(tab)});
        return false;
    }
    document.querySelectorAll<HTMLElement>("#sidebar, #sidebarRight").forEach((element) => {
        if (element !== sidePanel) {
            element.style.transform = "";
        }
    });
    sidePanel.style.transform = "translateX(0px)";
    sidePanel.firstElementChild?.dispatchEvent(new CustomEvent("click", {detail: "agent"}));
    return true;
};

const waitForPanel = () => new Promise<HTMLElement | undefined>((resolve) => {
    const started = Date.now();
    const step = () => {
        const element = panelElement();
        if (element) {
            resolve(element);
            return;
        }
        if (Date.now() - started > PANEL_TIMEOUT) {
            resolve(undefined);
            return;
        }
        window.setTimeout(step, PANEL_POLL);
    };
    step();
});

/** 打开（或展开）智能体面板并返回它的根元素。 */
const ensurePanel = async (context: IContext) => {
    const existing = panelElement();
    if (existing && (context.isMobile ? isMobilePanelOpen() : isDesktopPanelOpen())) {
        return existing;
    }
    const opened = context.isMobile ? openMobileSidePanel() : openDesktopDock();
    if (!opened) {
        return undefined;
    }
    return waitForPanel();
};

/**
 * 等「新对话」生效：宿主的 `createSession` 是异步的（先存上一轮、再清空消息区与输入框），清空发生在
 * 若干次 await 之后，太早填进去的提示词会被它抹掉。欢迎页是 `performCreateSession` 的最后一步，
 * 换成另一个节点就说明这次切换收尾了。
 */
const waitForNewChat = (panel: HTMLElement, previous: Element | null) => new Promise<boolean>((resolve) => {
    const started = Date.now();
    const step = () => {
        const welcome = panel.querySelector(WELCOME_SELECTOR);
        if (welcome && welcome !== previous) {
            resolve(true);
            return;
        }
        if (Date.now() - started > NEW_CHAT_TIMEOUT) {
            resolve(false);
            return;
        }
        window.setTimeout(step, PANEL_POLL);
    };
    step();
});

/**
 * 点一下面板头部的「新对话」，并等这个空会话落定；没落定就再点一次。
 * 返回 false 表示这次没切换成功 —— 调用方不要往旧对话里填，否则提示词就发到上一个会话去了。
 */
const startNewChat = async (panel: HTMLElement) => {
    const button = panel.querySelector<HTMLElement>(NEW_SESSION_SELECTOR);
    if (!button || button.classList.contains("fn__none")) {
        log.warn("the new session button is not there");
        return false;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
        const previous = panel.querySelector(WELCOME_SELECTOR);
        button.click();
        if (await waitForNewChat(panel, previous)) {
            log.debug("the new agent session is ready", {attempt});
            return true;
        }
        log.warn("the new agent session did not show up", {attempt});
    }
    return false;
};

/**
 * 把 Markdown 填进发送框：**覆盖**原来的内容。提示词是按钮固定带的那一段，接在用户手上的草稿后面
 * 会混成一段谁也读不懂的话。发送框是 protyle-lite，块级 DOM 会被它自己还原成 Markdown
 * （`BlockDOM2StdMd`），所以格式能原样保留。
 */
const fillComposer = (composer: HTMLElement, markdown: string) => {
    const lute = getActiveEditor()?.protyle.lute || window.Lute?.New?.();
    const html = lute ? lute.Md2BlockDOM(markdown) : "";
    if (!html) {
        log.error("no Lute available, cannot put the prompt into the composer", {chars: markdown.length});
        return false;
    }
    composer.replaceChildren();
    composer.insertAdjacentHTML("beforeend", html);
    return true;
};

const isSendable = (button: HTMLElement | null): button is HTMLElement =>
    Boolean(button && !button.hasAttribute("disabled") && !button.classList.contains("fn__none"));

/**
 * 等发送按钮可用再点。面板第一次打开时 `AgentChat` 还在初始化（会话、模型列表都是异步的），
 * 那一刻按钮是禁用的 —— 直接点会白白提示一次「无法发送」，用户得再点一遍按钮（issue #45 反馈）。
 */
const waitForSendButton = (panel: HTMLElement) => new Promise<HTMLElement | undefined>((resolve) => {
    const started = Date.now();
    const step = () => {
        const button = panel.querySelector<HTMLElement>(SEND_SELECTOR);
        if (isSendable(button)) {
            resolve(button);
            return;
        }
        if (Date.now() - started > SEND_TIMEOUT) {
            resolve(undefined);
            return;
        }
        window.setTimeout(step, PANEL_POLL);
    };
    step();
});

/**
 * 填进发送框并确认内容还在。宿主的会话切换收尾时会 `composer.clear()`，正好撞上就会被抹掉，
 * 所以填完等一下再看一眼，没了就再填一次。
 */
const fillAndConfirm = async (panel: HTMLElement, markdown: string) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const composer = composerElement(panel);
        if (!composer || !fillComposer(composer, markdown)) {
            return undefined;
        }
        await delay(FILL_CONFIRM_DELAY);
        const current = composerElement(panel);
        if (current && hasComposerText(current)) {
            return current;
        }
        log.warn("the composer was cleared right after filling", {attempt});
    }
    return undefined;
};

/**
 * 点发送，然后等宿主把输入框清空。`sendMessage` 有几条静默返回的路径（没配模型、上一轮还在回复、
 * 输入框是空的），点了没反应时再点一次；两次都没清空就返回 false，由调用方提示。
 */
const sendAndConfirm = async (panel: HTMLElement) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const button = await waitForSendButton(panel);
        if (!button) {
            return false;
        }
        button.click();
        const started = Date.now();
        while (Date.now() - started <= SEND_CONFIRM_TIMEOUT) {
            const composer = composerElement(panel);
            if (!composer || !hasComposerText(composer)) {
                return true;
            }
            await delay(PANEL_POLL);
        }
        log.warn("the click on the send button did nothing", {attempt});
    }
    return false;
};

/** 执行一个智能体提示词操作。 */
export const runAgentPrompt = async (context: IContext, options: {
    text: string;
    /** 填完直接发出去。 */
    autoSend?: boolean;
    /** 先新建一个对话，再填提示词。 */
    newChat?: boolean;
}) => {
    const text = options.text.trim();
    if (!text) {
        log.warn("the agent prompt is empty, ignoring this click");
        return;
    }
    const panel = await ensurePanel(context);
    if (!panel) {
        log.warn("the agent panel could not be opened", {mobile: context.isMobile});
        showMessage(context.i18n.agentUnavailable);
        return;
    }
    if (options.newChat && !await startNewChat(panel)) {
        // 没切成新对话就不要往下填：填进去只会发到上一个会话里，用户还以为点了新对话
        log.warn("the new agent session could not be started");
        showMessage(context.i18n.agentNewChatBlocked);
        return;
    }
    if (!await fillAndConfirm(panel, text)) {
        log.warn("the agent composer is not available");
        showMessage(context.i18n.agentUnavailable);
        return;
    }
    log.info("filled the agent prompt", {chars: text.length, autoSend: options.autoSend === true, newChat: options.newChat === true});
    // 不主动聚焦输入框：移动端一聚焦就会唤起软键盘、整页重排（docs/development.md），
    // 桌面端也免得顺手敲键盘改掉刚填好的提示词
    if (!options.autoSend) {
        return;
    }
    if (!await sendAndConfirm(panel)) {
        // 提示词已经填好了，用户处理完（配置模型、等上一轮结束）可以直接发送
        showMessage(context.i18n.agentSendBlocked);
    }
};
