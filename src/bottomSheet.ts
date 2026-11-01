import type {Dialog} from "siyuan";
import {createLogger} from "./logger";

const log = createLogger("bottomSheet");

/** 抽屉抓手与思源自己的底部菜单一致：由 `.b3-menu__title--root` 的伪元素画出那根短横线。 */
const HANDLE_CLASS = "b3-menu__title b3-menu__title--root";

/**
 * 把插件自己造的对话框改成思源移动端原生的底部抽屉（issue #23）。
 *
 * 宿主没有把底部抽屉的构造入口暴露给插件，但它的样式与结构都是全局的：给对话框挂上
 * `mobile-bottom-sheet-dialog`、给容器挂上 `mobile-bottom-sheet`、再补一个抓手，就与思源
 * 自己的底部面板（引用预览、移动端属性面板）完全一致 —— 半透明遮罩、圆角顶边、60vh 上限、
 * 从底部展开。展开与收起、下拉关闭的手势在这里按宿主同一套阈值实现：
 * 下拉超过 120px 或面板高度的 1/4，或者下拉速度超过 0.6px/ms 就关闭，否则回弹。
 *
 * 只应在移动端调用；桌面端返回空函数，对话框保持原来的居中窗口。
 *
 * @returns 清理函数，调用方要在对话框销毁时执行它（移除监听器、复原行内样式）
 */
export const useBottomSheet = (dialog: Dialog) => {
    const element = dialog.element;
    const sheet = element.querySelector<HTMLElement>(".b3-dialog__container");
    if (!sheet) {
        log.warn("the dialog has no container, leaving it as a normal dialog");
        return () => undefined;
    }
    element.classList.add("mobile-bottom-sheet-dialog");
    // 宿主的抽屉样式负责移出视口与滑入；`bis-bottom-sheet` 只常驻 `will-change: transform` 预热图层
    sheet.classList.add("mobile-bottom-sheet", "bis-bottom-sheet");
    // 原生抽屉没有关闭按钮（宿主移动端对话框本来也会把 × 藏起来），这里显式隐藏，
    // 免得换一个前端又露出来
    element.querySelector(".b3-dialog__close")?.classList.add("fn__none");
    // 原生抽屉通栏铺满、两侧不留空：覆盖调用方按桌面宽度写的行内宽度
    sheet.style.width = "100vw";
    sheet.style.maxWidth = "100vw";
    // 底部面板只支持下拉关闭，不参与通用对话框的拖动与四边缩放
    const header = sheet.querySelector(".b3-dialog__header");
    header?.classList.remove("resize__move");
    sheet.querySelectorAll(":scope > [class^=\"resize__\"]").forEach((handle) => handle.remove());
    const handle = document.createElement("div");
    handle.className = HANDLE_CLASS;
    handle.setAttribute("aria-hidden", "true");
    sheet.prepend(handle);

    // 面板从一开始就压在屏幕下方：宿主的 `.mobile-bottom-sheet` 把它摆在 `transform: translateY(100%)`，
    // 拿到打开类之后再滑上来（`app/src/assets/scss/main/_mobile.scss`）。这里只用位移动出视口、并让它在打开前
    // 不可见 —— 不碰 visibility / display，也不延迟挂载，面板全程留在渲染树里。
    sheet.style.transform = "translateY(100%)";
    sheet.style.opacity = "0";

    const dialogElement = element.querySelector<HTMLElement>(".b3-dialog");
    const scrim = element.querySelector<HTMLElement>(".b3-dialog__scrim");

    /** 键盘弹出时把面板压进可见视口，与宿主的底部抽屉做法一致。 */
    const resize = () => {
        const viewport = window.visualViewport;
        if (!viewport || !dialogElement) {
            return;
        }
        dialogElement.style.top = `${viewport.offsetTop}px`;
        dialogElement.style.height = `${viewport.height}px`;
    };

    let opened = false;
    const open = () => {
        if (opened || !element.isConnected || !element.classList.contains("b3-dialog--open")) {
            return;
        }
        opened = true;
        resize();
        // 挂上抽屉样式时，宿主容器的 transform 过渡（原本是 scale(.8)）也会跟着朝屏幕外跑起来。
        // 先取消它，打开时的滑动才能从屏幕外正常起步，用到的仍然是宿主自己那份 transition
        sheet.getAnimations?.().forEach((animation) => animation.cancel());
        sheet.style.transform = "";
        sheet.style.opacity = "";
        log.debug("opened the bottom sheet");
    };
    const observer = new MutationObserver(open);
    observer.observe(element, {attributes: true, attributeFilter: ["class"]});
    // 调用方可能已经把对话框搭好、宿主也已经加上打开类（例如先建对话框再初始化编辑器），
    // 这时 MutationObserver 等不到变化，直接补一次
    open();
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    resize();

    // 下拉关闭：起手位置、当前位移与关闭阈值都与宿主的 bindBottomSheetDrag 相同
    let start: {x: number, y: number, time: number} | undefined;
    let dragging = false;
    let closing = false;
    let suppressClickUntil = 0;
    const reset = () => {
        sheet.style.transition = "";
        sheet.style.transform = "";
        if (scrim) {
            scrim.style.opacity = "";
        }
        start = undefined;
        dragging = false;
    };
    const onStart = (event: TouchEvent) => {
        if (closing) {
            return;
        }
        reset();
        const target = event.target as HTMLElement;
        if (event.touches.length !== 1 ||
            target.closest("input, textarea, select, [contenteditable=\"true\"], .protyle, .block__icon, .b3-dialog__close")) {
            return;
        }
        let parent = target;
        while (parent && parent !== sheet) {
            if (parent.scrollHeight > parent.clientHeight + 1 && parent.scrollTop > 0 &&
                ["auto", "scroll", "overlay"].includes(getComputedStyle(parent).overflowY)) {
                return;
            }
            parent = parent.parentElement as HTMLElement;
        }
        const touch = event.touches[0];
        start = {x: touch.clientX, y: touch.clientY, time: performance.now()};
    };
    const onMove = (event: TouchEvent) => {
        if (!start || closing) {
            return;
        }
        if (event.touches.length !== 1) {
            reset();
            return;
        }
        const touch = event.touches[0];
        const offset = touch.clientY - start.y;
        if (!dragging && (offset <= 0 || Math.abs(touch.clientX - start.x) > offset)) {
            start = undefined;
            return;
        }
        dragging = true;
        sheet.style.transition = "none";
        sheet.style.transform = `translateY(${Math.max(0, offset)}px)`;
        if (scrim) {
            scrim.style.opacity = Math.max(0, 1 - Math.max(0, offset) / Math.max(sheet.clientHeight, 1)).toString();
        }
        if (event.cancelable) {
            event.preventDefault();
        }
    };
    const onEnd = (event: TouchEvent) => {
        if (closing) {
            return;
        }
        if (!dragging || !start || !event.changedTouches.length) {
            reset();
            return;
        }
        const offset = Math.max(0, event.changedTouches[0].clientY - start.y);
        const duration = Math.max(performance.now() - start.time, 1);
        const shouldClose = offset > Math.min(120, sheet.clientHeight * .25) ||
            (offset > 20 && offset / duration > .6);
        suppressClickUntil = performance.now() + 300;
        // 清掉行内 transition 与位移后，浏览器会从当前位移过渡回原位（或朝屏幕外滑走），不用强制回流催它
        sheet.style.transition = "";
        start = undefined;
        dragging = false;
        if (shouldClose) {
            closing = true;
            dialog.destroy();
            // 「放弃修改」确认取消时对话框还在，手势要能再次使用
            window.setTimeout(() => {
                closing = false;
            }, 600);
        } else {
            reset();
        }
    };
    const onCancel = () => {
        if (!closing) {
            reset();
        }
    };
    const onClick = (event: MouseEvent) => {
        if (performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };
    sheet.addEventListener("touchstart", onStart, {passive: true});
    sheet.addEventListener("touchmove", onMove, {passive: false});
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onCancel);
    sheet.addEventListener("click", onClick, true);

    return () => {
        observer.disconnect();
        window.visualViewport?.removeEventListener("resize", resize);
        window.visualViewport?.removeEventListener("scroll", resize);
        sheet.removeEventListener("touchstart", onStart);
        sheet.removeEventListener("touchmove", onMove);
        sheet.removeEventListener("touchend", onEnd);
        sheet.removeEventListener("touchcancel", onCancel);
        sheet.removeEventListener("click", onClick, true);
        handle.remove();
    };
};
