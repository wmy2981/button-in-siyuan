import type {Dialog} from "siyuan";
import {createLogger} from "./logger";

const log = createLogger("bottomSheet");

/** 抽屉抓手与思源自己的底部菜单一致：由 `.b3-menu__title--root` 的伪元素画出那根短横线。 */
const HANDLE_CLASS = "b3-menu__title b3-menu__title--root";

/** 下拉关闭的判据，与宿主的 `bindBottomSheetDrag` 相同：距离、面板高度的比例、甩动速度。 */
const CLOSE_DISTANCE = 120;
const CLOSE_HEIGHT_RATIO = .25;
const CLOSE_SPEED = .6;

/** 可见视口，照抄宿主的 `getVisibleViewportBounds`：键盘压小视口时整层要跟着抬起来。 */
const getVisibleViewportBounds = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
        return {top: 0, bottom: window.innerHeight};
    }
    const top = Math.max(0, Math.min(window.innerHeight, viewport.offsetTop));
    return {
        top,
        bottom: Math.max(top, Math.min(window.innerHeight, viewport.offsetTop + viewport.height)),
    };
};

/** 整屏高度（含键盘占掉的那一段），宿主的 `bindBottomSheetDialog` 用它判断键盘有没有弹起。 */
const getFullHeight = () => {
    const size = window.siyuan?.mobile?.size;
    const orientation = size ? (size.isLandscape ? size.landscape : size.portrait) : undefined;
    return Math.max(window.innerHeight, orientation?.height1 || 0);
};

/**
 * 键盘收起、视口稳定之后再展开（宿主的 `waitForSheetViewport`）。
 *
 * 键盘还在弹起动画里就开始滑入时，面板会先滑进一个被压小的视口、等键盘落定后再被重算一次，
 * 看到的就是「滑到一半跳一下」。所以这里与宿主一样先等：没有键盘时下一帧就展开；有键盘时等它
 * 收起并稳定 32ms 之后再展开，最多等 1s（浮动键盘、窗口尺寸变化）。
 */
const waitForViewport = (open: () => void) => {
    const start = performance.now();
    const height = () => Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
    const waitForKeyBoard = getFullHeight() - height() > 100;
    let frame = 0;
    let cancelled = false;
    let restoredAt: number | undefined;
    const check = () => {
        if (cancelled) {
            return;
        }
        const now = performance.now();
        if (height() >= getFullHeight() - 2) {
            restoredAt = restoredAt ?? now;
        } else {
            restoredAt = undefined;
        }
        if (!waitForKeyBoard || (restoredAt !== undefined && now - restoredAt >= 32) || now - start >= 1000) {
            open();
            return;
        }
        frame = window.requestAnimationFrame(check);
    };
    frame = window.requestAnimationFrame(check);
    return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
    };
};

/**
 * 把插件自己造的对话框改成思源移动端原生的底部抽屉（issue #23）。
 *
 * 宿主没有把底部抽屉的构造入口暴露给插件，但它的样式与结构都是全局的：给对话框挂上
 * `mobile-bottom-sheet-dialog`、给容器挂上 `mobile-bottom-sheet`、再补一个抓手，就与思源
 * 自己的底部面板（引用预览、移动端属性面板）完全一致 —— 半透明遮罩、圆角顶边、60vh 上限、
 * 从底部展开。
 *
 * **入场与退出的时序照 `app/src/mobile/util/bindBottomSheetDialog.ts` 逐步实现**（issue #46）：
 * 建好面板先写 `transition: none` + `translateY(100%)` + `visibility: hidden`，等宿主加上
 * `b3-dialog--open`、并且键盘与视口都稳定之后，才依次放开 `visibility`、刷一次布局、恢复
 * `.mobile-bottom-sheet` 自己那份 `.15s` 过渡、再改成 `translateY(0)`。收起时（宿主开始销毁对话框，
 * `data-dialog-closing`）冻住面板高度并清掉拖动留下的行内过渡与位移，让同一份过渡把它整块送出屏幕，
 * 而不是等 DOM 被移除时突然消失。
 *
 * 位置与尺寸也照宿主的做法：可见视口只在入场那一次算好，之后只有视口真的变了（键盘弹出、旋转）
 * 才重算，不在打开过程中跟着 `visualViewport` 的每个事件写 `top` / `height` —— 那会在整页重排上再叠
 * 一层重排（issue #43）。
 *
 * 下拉关闭的手势按宿主同一套阈值实现：下拉超过 120px 或面板高度的 1/4，或者下拉速度超过 0.6px/ms
 * 就关闭，否则回弹。抓手只用于下拉关闭，不接管宿主那份「拖抓手改高度」的行为，面板高度由调用方决定。
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
    // 入场前先压在屏幕下方：初始定位不参与过渡，等打开类与视口都稳定后再恢复过渡滑上来。
    // `bis-bottom-sheet` 让面板常驻 `will-change: transform`（`index.scss`），图层在滑入前就存在
    sheet.style.transition = "none";
    sheet.style.transform = "translateY(100%)";
    sheet.style.visibility = "hidden";
    sheet.classList.add("mobile-bottom-sheet", "bis-bottom-sheet");

    const dialogElement = element.querySelector<HTMLElement>(".b3-dialog");
    const scrim = element.querySelector<HTMLElement>(".b3-dialog__scrim");

    let disposed = false;
    /** 入场是否已经开始：布局只在入场之后才算，免得打开过程中把整页重排一遍。 */
    let opened = false;
    /** 收起时冻住的高度，之后不再跟着视口重算。 */
    let frozen = false;
    let opening = false;
    let cancelOpen: (() => void) | undefined;

    /** 键盘把可见视口压小的时候，把整层对齐到键盘上方的可见区域（宿主 `bindMobileSheetLayout.resize`）。 */
    const resize = () => {
        if (disposed || !opened || frozen || !dialogElement) {
            return;
        }
        const viewport = getVisibleViewportBounds();
        // 整个视口可用时直接贴住布局底边，避免整数高度截断设备像素后露出背景
        const fullViewport = viewport.bottom >= window.innerHeight;
        dialogElement.style.top = `${viewport.top}px`;
        dialogElement.style.bottom = fullViewport ? "0px" : "auto";
        dialogElement.style.height = fullViewport ? "auto" : `${Math.max(0, viewport.bottom - viewport.top)}px`;
    };

    /** 收起时冻住当前高度：退出位移期间面板不再跟着视口重算，整块往下滑（宿主 layout.freeze）。 */
    const freeze = () => {
        if (frozen) {
            return;
        }
        const height = `${sheet.getBoundingClientRect().height}px`;
        sheet.style.height = height;
        sheet.style.maxHeight = height;
        frozen = true;
    };

    /**
     * 打开类到了才开始入场，收起时的清场也走这里（宿主的 `updateOpen`）。
     *
     * 收起必须先清掉拖动留下的行内 `transition` / `transform`：`mobile-bottom-sheet` 那份 `.15s`
     * 过渡才能从手指松开的位置把面板送出屏幕（issue #46）。宿主的 `destroy()` 在 190ms 之后才移除
     * DOM，正好够这段过渡跑完。
     */
    const updateOpen = () => {
        if (!element.classList.contains("b3-dialog--open")) {
            if (element.dataset.dialogClosing === "true") {
                freeze();
                sheet.style.transition = "";
                sheet.style.transform = "";
            }
            cancelOpen?.();
            cancelOpen = undefined;
            opening = false;
            return;
        }
        if (opening) {
            return;
        }
        opening = true;
        cancelOpen = waitForViewport(() => {
            cancelOpen = undefined;
            if (disposed || !element.isConnected || !element.classList.contains("b3-dialog--open")) {
                return;
            }
            opened = true;
            resize();
            sheet.style.visibility = "";
            // 强制一次布局，让「屏幕外」这一刻真正进过渲染树；再恢复过渡、改成归位，滑入才从头开始
            void sheet.offsetHeight;
            sheet.style.transition = "";
            void sheet.offsetHeight;
            sheet.style.transform = "";
            log.debug("opened the bottom sheet");
        });
    };
    const observer = new MutationObserver(updateOpen);
    observer.observe(element, {attributes: true, attributeFilter: ["class", "data-dialog-closing"]});
    // 调用方可能已经把对话框搭好、宿主也已经加上打开类，这时 `MutationObserver` 等不到变化，直接补一次
    updateOpen();

    // 下拉关闭：起手位置、当前位移与关闭阈值都与宿主的 bindBottomSheetDrag 相同
    let start: {x: number, y: number, time: number} | undefined;
    let dragging = false;
    let suppressClickUntil = 0;
    const isClosing = () => element.dataset.dialogClosing === "true";
    const reset = () => {
        sheet.style.transition = "";
        sheet.style.transform = "";
        if (scrim) {
            scrim.style.opacity = "";
        }
        start = undefined;
        dragging = false;
    };
    const onCancel = () => {
        if (disposed) {
            return;
        }
        if (dragging) {
            suppressClickUntil = performance.now() + 300;
        }
        reset();
    };
    const onStart = (event: TouchEvent) => {
        if (disposed || !opened || isClosing()) {
            return;
        }
        reset();
        const target = event.target as HTMLElement;
        if (event.touches.length !== 1 ||
            target.closest("input, textarea, select, button, [contenteditable=\"true\"], .protyle, .block__icon, .b3-dialog__close, [draggable=\"true\"]")) {
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
        if (disposed || !start || isClosing()) {
            return;
        }
        if (event.touches.length !== 1) {
            onCancel();
            return;
        }
        const touch = event.touches[0];
        const offset = touch.clientY - start.y;
        if (Math.abs(touch.clientX - start.x) > Math.abs(offset)) {
            // 横向为主：这是别的手势，不再接管
            onCancel();
            return;
        }
        if (!dragging && Math.abs(offset) < 4) {
            return;
        }
        if (offset <= 0) {
            // 面板高度由调用方决定，往上拉不留空白
            onCancel();
            return;
        }
        dragging = true;
        sheet.style.transition = "none";
        sheet.style.transform = `translateY(${offset}px)`;
        if (scrim) {
            scrim.style.opacity = Math.max(0, 1 - offset / Math.max(sheet.clientHeight, 1)).toString();
        }
        if (event.cancelable) {
            event.preventDefault();
        }
    };
    const onEnd = (event: TouchEvent) => {
        if (disposed || isClosing()) {
            return;
        }
        if (!dragging || !start || !event.changedTouches.length) {
            reset();
            return;
        }
        const offset = Math.max(0, event.changedTouches[0].clientY - start.y);
        const duration = Math.max(performance.now() - start.time, 1);
        const shouldClose = offset > Math.min(CLOSE_DISTANCE, sheet.clientHeight * CLOSE_HEIGHT_RATIO) ||
            (offset > 20 && offset / duration > CLOSE_SPEED);
        suppressClickUntil = performance.now() + 300;
        // 先刷一次布局再清掉行内过渡：回弹与滑出都从手指松开的位置接着走（宿主同一个顺序）
        void sheet.offsetHeight;
        sheet.style.transition = "";
        start = undefined;
        dragging = false;
        if (!shouldClose) {
            reset();
            return;
        }
        dialog.destroy();
        // 「放弃修改」确认取消时对话框还在，退出状态没有成立，面板退回原位
        if (!isClosing() && element.isConnected) {
            reset();
        }
    };
    const onClick = (event: MouseEvent) => {
        if (performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };
    /** 视口变了只作废「正在进行的下拉手势」，不动已经归位或正在退出的面板（宿主的 `dragState.cancel`）。 */
    const cancelDrag = () => {
        if (!start) {
            return;
        }
        onCancel();
    };
    const onGeometryChange = () => {
        // 键盘弹出、旋转、分屏：正在进行的下拉手势作废，位置重新对齐
        cancelDrag();
        resize();
    };

    sheet.addEventListener("touchstart", onStart, {passive: true});
    sheet.addEventListener("touchmove", onMove, {passive: false});
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onCancel);
    sheet.addEventListener("click", onClick, true);
    window.addEventListener("resize", onGeometryChange);
    window.addEventListener("orientationchange", onGeometryChange);
    window.visualViewport?.addEventListener("resize", onGeometryChange);
    window.visualViewport?.addEventListener("scroll", onGeometryChange);
    window.screen.orientation?.addEventListener?.("change", onGeometryChange);

    return () => {
        disposed = true;
        cancelOpen?.();
        cancelOpen = undefined;
        observer.disconnect();
        window.removeEventListener("resize", onGeometryChange);
        window.removeEventListener("orientationchange", onGeometryChange);
        window.visualViewport?.removeEventListener("resize", onGeometryChange);
        window.visualViewport?.removeEventListener("scroll", onGeometryChange);
        window.screen.orientation?.removeEventListener?.("change", onGeometryChange);
        sheet.removeEventListener("touchstart", onStart);
        sheet.removeEventListener("touchmove", onMove);
        sheet.removeEventListener("touchend", onEnd);
        sheet.removeEventListener("touchcancel", onCancel);
        sheet.removeEventListener("click", onClick, true);
        handle.remove();
    };
};
