import {afterEach, describe, expect, it, vi} from "vitest";
import {runAgentPrompt} from "../src/agent/agentPrompt";
import {showMessage} from "./mocks/siyuan";
import {makeContext, makeI18n} from "./helpers";

const i18n = () => makeI18n({
    agentUnavailable: "no agent",
    agentSendBlocked: "cannot send",
    agentNewChatBlocked: "no new chat",
});

/**
 * 假定时器下推进时间：代码里每一步 await 之后才排下一次定时器，所以要一小段一小段地推进，
 * 每推进一次都让微任务跑完。
 */
const advance = async (total: number) => {
    for (let elapsed = 0; elapsed < total; elapsed += 50) {
        await vi.advanceTimersByTimeAsync(50);
    }
};

const PANEL_HTML = `<div class="sy__agentChat">
    <div class="agent-chat__composer-host">
        <div class="protyle"><div class="protyle-wysiwyg"><div data-type="NodeParagraph" class="p"></div></div></div>
    </div>
    <button class="agent-chat__send"></button>
</div>`;

/** 桌面端右侧停靠栏上的智能体按钮；点它把面板挂进文档（与宿主展开面板的效果一致）。 */
const mountDock = (active = false) => {
    const item = document.createElement("div");
    item.className = `dock__item${active ? " dock__item--active" : ""}`;
    item.dataset.type = "agentChat";
    item.addEventListener("click", () => {
        item.classList.add("dock__item--active");
        if (!document.querySelector(".sy__agentChat")) {
            document.body.insertAdjacentHTML("beforeend", PANEL_HTML);
        }
    });
    document.body.append(item);
    return item;
};

const composer = () => document.querySelector<HTMLElement>(".agent-chat__composer-host .protyle-wysiwyg") as HTMLElement;
const sendButton = () => document.querySelector<HTMLButtonElement>(".agent-chat__send") as HTMLButtonElement;

/** 带「新对话」按钮的面板，里面是一个已经有内容的会话。 */
const PANEL_WITH_NEW_SESSION = `<div class="sy__agentChat">
    <div class="block__icons"><span class="block__icon" data-type="new-session"></span></div>
    <div class="agent-chat__messages"><div class="agent-chat__msg">old</div></div>
    <div class="agent-chat__composer-host">
        <div class="protyle"><div class="protyle-wysiwyg"><div data-type="NodeParagraph" class="p">draft</div></div></div>
    </div>
    <button class="agent-chat__send"></button>
</div>`;

/**
 * 挂一个带「新对话」按钮的面板，并照宿主 `performCreateSession` 的顺序演一遍点击效果：
 * 清空发生在几次 await 之后（这里用 20ms 模拟），最后才重画欢迎页。
 */
const mountNewSessionPanel = () => {
    document.body.insertAdjacentHTML("beforeend", PANEL_WITH_NEW_SESSION);
    const messages = () => document.querySelector<HTMLElement>(".agent-chat__messages") as HTMLElement;
    const click = vi.fn(() => {
        window.setTimeout(() => {
            messages().innerHTML = '<div class="agent-welcome"></div>';
            composer().innerHTML = '<div data-type="NodeParagraph" class="p"></div>';
        }, 20);
    });
    document.querySelector<HTMLElement>('.block__icon[data-type="new-session"]')?.addEventListener("click", click);
    return click;
};

afterEach(() => {
    vi.useRealTimers();
});

describe("runAgentPrompt", () => {
    it("opens the agent panel and puts the markdown into the composer", async () => {
        mountDock();
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "# Title\n- item"});
        // 提示词的两行替换掉发送框里原本的空段落
        expect(composer().querySelectorAll("[data-type='NodeParagraph']")).toHaveLength(2);
        expect(composer().textContent).toContain("# Title");
        expect(composer().textContent).toContain("- item");
        expect(showMessage).not.toHaveBeenCalled();
    });

    it("replaces what the user already typed instead of appending", async () => {
        const item = mountDock();
        const click = vi.spyOn(item, "click");
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "second"});
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "third"});
        expect(composer().querySelectorAll("[data-type='NodeParagraph']")).toHaveLength(1);
        expect(composer().textContent).toBe("third");
        // 面板已经展开，第二次不该再点停靠栏按钮（那次点击会把面板收起来）
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("sends the prompt when asked to", async () => {
        mountDock(true);
        document.body.insertAdjacentHTML("beforeend", PANEL_HTML);
        // 宿主发出后自己把输入框清空，插件据此确认这一下真的发出去了
        const click = vi.fn(() => composer().replaceChildren());
        sendButton().addEventListener("click", click);
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", autoSend: true});
        expect(click).toHaveBeenCalledTimes(1);
        expect(showMessage).not.toHaveBeenCalled();
    });

    it("waits for the send button of a freshly opened panel", async () => {
        vi.useFakeTimers();
        mountDock();
        document.body.insertAdjacentHTML("beforeend", PANEL_HTML);
        sendButton().setAttribute("disabled", "disabled");
        const click = vi.fn(() => composer().replaceChildren());
        sendButton().addEventListener("click", click);
        const running = runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", autoSend: true});
        // 面板刚建出来时 AgentChat 还在初始化，按钮是禁用的；等它可用再点，用户不用按第二次
        await advance(300);
        sendButton().removeAttribute("disabled");
        await advance(300);
        await running;
        expect(click).toHaveBeenCalledTimes(1);
        expect(showMessage).not.toHaveBeenCalled();
    });

    it("does not send by default", async () => {
        mountDock();
        const click = vi.fn();
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "go"});
        sendButton().addEventListener("click", click);
        expect(click).not.toHaveBeenCalled();
    });

    it("tells the user when the send button never becomes usable", async () => {
        mountDock(true);
        document.body.insertAdjacentHTML("beforeend", PANEL_HTML);
        sendButton().setAttribute("disabled", "disabled");
        vi.useFakeTimers();
        const running = runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", autoSend: true});
        await advance(7000);
        await running;
        expect(showMessage).toHaveBeenCalledWith("cannot send");
        // 提示词留在输入框里
        expect(composer().querySelectorAll("[data-type='NodeParagraph']")).toHaveLength(1);
    });

    it("reports a send click that did nothing", async () => {
        vi.useFakeTimers();
        mountDock();
        const running = runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", autoSend: true});
        await advance(7000);
        await running;
        // 按钮看着可用，点了宿主的 sendMessage 却静默返回（没配模型、上一轮还在回复）
        expect(showMessage).toHaveBeenCalledWith("cannot send");
        expect(composer().textContent).toBe("go");
    });

    it("reports a window without the agent dock", async () => {
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "go"});
        expect(showMessage).toHaveBeenCalledWith("no agent");
    });

    it("does nothing for an empty prompt", async () => {
        mountDock();
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "   "});
        expect(document.querySelector(".sy__agentChat")).toBeNull();
        expect(showMessage).not.toHaveBeenCalled();
    });

    it("opens a new chat before filling the prompt", async () => {
        mountDock(true);
        const click = mountNewSessionPanel();
        // 宿主的 createSession 是异步的：消息区与输入框要过几拍才清空，太早填进去会被抹掉
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", newChat: true});
        expect(click).toHaveBeenCalledTimes(1);
        expect(document.querySelector(".agent-welcome")).not.toBeNull();
        expect(composer().textContent).toBe("go");
    });

    it("keeps waiting for a new chat that takes a while", async () => {
        vi.useFakeTimers();
        mountDock(true);
        document.body.insertAdjacentHTML("beforeend", PANEL_WITH_NEW_SESSION);
        const messages = () => document.querySelector<HTMLElement>(".agent-chat__messages") as HTMLElement;
        // 移动端存一轮会话要慢一些：切换在几秒之后才收尾，也不能把提示词填到旧会话里
        document.querySelector<HTMLElement>('.block__icon[data-type="new-session"]')
            ?.addEventListener("click", () => window.setTimeout(() => {
                messages().innerHTML = '<div class="agent-welcome"></div>';
                composer().innerHTML = '<div data-type="NodeParagraph" class="p"></div>';
            }, 4000));
        const running = runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", newChat: true});
        await advance(5000);
        await running;
        expect(composer().textContent).toBe("go");
        expect(showMessage).not.toHaveBeenCalled();
    });

    it("does not fill the old conversation when the new chat never starts", async () => {
        vi.useFakeTimers();
        mountDock(true);
        document.body.insertAdjacentHTML("beforeend", PANEL_WITH_NEW_SESSION);
        const running = runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", newChat: true});
        await advance(11000);
        await running;
        expect(showMessage).toHaveBeenCalledWith("no new chat");
        // 一个字都不填：填进旧对话就发错地方了
        expect(composer().textContent).toBe("draft");
    });

    it("does not fill when the panel has no new-session button", async () => {
        mountDock();
        await runAgentPrompt(makeContext({i18n: i18n()}), {text: "go", newChat: true});
        expect(composer().textContent).not.toBe("go");
        expect(showMessage).toHaveBeenCalledWith("no new chat");
    });

    it("slides the mobile side panel out like the host does", async () => {
        const sidePanel = document.createElement("div");
        sidePanel.className = "side-panel";
        const toolbar = document.createElement("div");
        const tab = document.createElement("svg");
        tab.setAttribute("data-type", "sidebar-agent-tab");
        sidePanel.append(toolbar);
        toolbar.append(tab);
        document.body.append(sidePanel);
        const clicks: unknown[] = [];
        toolbar.addEventListener("click", (event) => {
            clicks.push((event as unknown as CustomEvent).detail);
            if (!document.querySelector(".sy__agentChat")) {
                sidePanel.insertAdjacentHTML("beforeend", PANEL_HTML);
            }
        });
        await runAgentPrompt(makeContext({isMobile: true, i18n: i18n()}), {text: "hello"});
        expect(clicks).toEqual(["agent"]);
        expect(sidePanel.style.transform).toBe("translateX(0px)");
        expect(composer().textContent).toContain("hello");
    });

    it("reports a mobile window whose agent tab is hidden", async () => {
        const sidePanel = document.createElement("div");
        sidePanel.className = "side-panel";
        const tab = document.createElement("svg");
        tab.setAttribute("data-type", "sidebar-agent-tab");
        tab.classList.add("fn__none");
        sidePanel.append(document.createElement("div"), tab);
        document.body.append(sidePanel);
        await runAgentPrompt(makeContext({isMobile: true, i18n: i18n()}), {text: "hello"});
        expect(showMessage).toHaveBeenCalledWith("no agent");
    });
});

