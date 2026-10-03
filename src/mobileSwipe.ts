import {createLogger} from "./logger";

const log = createLogger("mobileSwipe");

/** 横向滑动的启动距离，与宿主保持一致（`app/src/mobile/util/touchPanelGesture.ts` 的 MOBILE_SIDEBAR_SWIPE_ACTIVATION_DISTANCE）。 */
const ACTIVATION_DISTANCE = 12;

export interface IMobileSwipeOptions {
    /** 监听真实触摸的元素：自定义块的挂载元素，事件从里面的按钮冒泡上来。 */
    element: HTMLElement;
    /**
     * 合成事件的派发目标：挂载元素之外的自定义块元素。宿主的三个触摸处理函数都拿 `event.target`
     * 当被触摸的元素用（找块、判断是否在面板里），所以派发目标必须是一个元素而不是 document。
     */
    forwardTo: HTMLElement;
    /** 确认是横向滑动时回调一次（按钮用它吃掉随后可能补上的一次 click）。 */
    onSwipe: () => void;
}

/**
 * 把自定义块里的横向滑动交给宿主的侧栏滑动手势。
 *
 * 宿主的自定义块渲染器会给挂载元素（`.custom-block__content`）挂一组阻断冒泡的触摸监听
 * （`app/src/plugin/customBlockRender.ts` 的 `isolateEditorEvents`，含 touchstart / touchmove /
 * touchend / touchcancel），目的是让编辑器不响应块内的交互；而移动端的侧栏滑动是挂在 `document`
 * 上的冒泡监听（`app/src/mobile/util/touch.ts` 的 handleTouchStart / handleTouchMove /
 * handleTouchEnd），事件到不了那里 —— 于是**任何**自定义块内容上左右滑动都拉不出侧面板，不只是
 * 本插件的按钮。
 *
 * 插件既取消不掉宿主挂的匿名监听，也没有打开移动端侧栏的 API（`toggleLeftDock` /
 * `toggleRightDock` 在移动端构建里直接 `return false`）。所以这里在确认是一次横向滑动之后，照宿主
 * 自己的桥接写法（`app/src/mobile/util/mousePointerTouchBridge.ts`）合成一份触摸事件，派发到挂载
 * 元素之外的自定义块元素上：事件从那里照常冒泡到 document，宿主的滑动逻辑（方向判断、跟手位移、
 * 松手提交、遮罩）原样工作，插件不重复实现一遍，也不会与宿主的判断标准跑偏。
 *
 * **只在看出是横向滑动之后才转发**：点击、长按、纵向滚动都不进这条路，宿主的点选、长按多选与长按
 * 弹菜单不会被块内的按钮误触发；起点的坐标照实传，宿主算出的跟手位移就是手指真正走过的距离。
 */
export const bindMobileSwipe = (options: IMobileSwipeOptions) => {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    /** 触摸起点所在的元素，宿主用它找块；缺省给挂载元素，保证合成事件里一定有元素可用。 */
    let touchTarget: EventTarget = options.element;
    let tracking = false;
    let forwarding = false;

    /** 合成一份触摸事件：只带宿主机手真正会读的字段（与 mousePointerTouchBridge 的做法一致）。 */
    const forward = (type: "touchstart" | "touchmove" | "touchend" | "touchcancel", x: number, y: number) => {
        const event = new Event(type, {bubbles: true, cancelable: true}) as TouchEvent;
        const touch = {clientX: x, clientY: y, target: touchTarget} as Touch;
        const touches = type === "touchend" || type === "touchcancel" ? [] : [touch];
        Object.defineProperties(event, {
            touches: {value: touches},
            targetTouches: {value: touches},
            changedTouches: {value: [touch]},
        });
        options.forwardTo.dispatchEvent(event);
    };

    const reset = () => {
        tracking = false;
        forwarding = false;
    };

    const onTouchStart = (event: TouchEvent) => {
        reset();
        if (event.touches.length !== 1) {
            // 多指手势不是侧栏滑动
            return;
        }
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        lastX = startX;
        lastY = startY;
        touchTarget = event.target || options.element;
        tracking = true;
    };

    const onTouchMove = (event: TouchEvent) => {
        if (!tracking) {
            return;
        }
        if (event.touches.length !== 1) {
            // 中途变成多指：这次手势不再转发，交回宿主自己判断
            if (forwarding) {
                forward("touchcancel", lastX, lastY);
            }
            reset();
            return;
        }
        const touch = event.touches[0];
        lastX = touch.clientX;
        lastY = touch.clientY;
        if (!forwarding) {
            const xDiff = lastX - startX;
            const yDiff = lastY - startY;
            if (Math.abs(xDiff) < ACTIVATION_DISTANCE || Math.abs(xDiff) <= Math.abs(yDiff)) {
                return;
            }
            forwarding = true;
            log.debug("forwarding the sidebar swipe to the host", {xDiff, yDiff, target: (touchTarget as HTMLElement).tagName});
            options.onSwipe();
            forward("touchstart", startX, startY);
        }
        forward("touchmove", lastX, lastY);
    };

    const onTouchEnd = (event: TouchEvent) => {
        if (!forwarding) {
            reset();
            return;
        }
        const touch = event.changedTouches[0];
        forward("touchend", touch ? touch.clientX : lastX, touch ? touch.clientY : lastY);
        reset();
    };

    const onTouchCancel = () => {
        if (forwarding) {
            forward("touchcancel", lastX, lastY);
        }
        reset();
    };

    // touchstart 是只读的：这里不改事件的默认行为，删监听时也不带 passive（捕获标志才是配对的唯一依据）
    options.element.addEventListener("touchstart", onTouchStart, {passive: true});
    options.element.addEventListener("touchmove", onTouchMove);
    options.element.addEventListener("touchend", onTouchEnd);
    options.element.addEventListener("touchcancel", onTouchCancel);
    return () => {
        options.element.removeEventListener("touchstart", onTouchStart);
        options.element.removeEventListener("touchmove", onTouchMove);
        options.element.removeEventListener("touchend", onTouchEnd);
        options.element.removeEventListener("touchcancel", onTouchCancel);
    };
};
