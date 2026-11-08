import {Dialog} from "siyuan";

/** 入场动画的最长时钟：宿主 50ms 后才加 `b3-dialog--open`，过渡本身 150ms，留足余量。 */
const WARM_HOLD_MS = 400;

/**
 * 插件自己的对话框一律从这里创建。
 *
 * 宿主的对话框容器带 `transform: scale(.8)` + `opacity: 0` 入场过渡（`component/_dialog.scss`）：
 * 过渡起点与终点浏览器都会新建、销毁合成层，而 App 的 WebView 在那一帧只能提交旧纹理 ——
 * 真机上打开面板时会插一帧整屏旧画面（闪烁）。这里在创建后立刻给外壳挂 `bis-dialog-warm`，
 * `index.scss` 因此让容器与正文常驻 `will-change: transform`：图层在入场开始之前就已经存在。
 *
 * 宿主的 `Dialog` 构造器虽然支持 `containerClassName`，但当前 `siyuan` 类型声明里没有它，
 * 所以直接给 `dialog.element` 补私有类（两者等价，都在入场开始前生效）。
 * 不碰宿主的过渡本身：时长、曲线、`b3-dialog--open` 的切换时序都还是宿主那一份。
 */
export const createDialog = (options: ConstructorParameters<typeof Dialog>[0]) => {
    const dialog = new Dialog(options);
    dialog.element.classList.add("bis-dialog-warm");
    return dialog;
};

/**
 * 安全模式用：打开第二个对话框之前，先把下层的满屏窗口藏起来（issue #43）。
 *
 * 宿主的 App 里，满屏对话框（管理窗口、JavaScript 文件页）还挂在屏幕上时再建一个对话框，
 * WebView 会整帧卡死并重载前端：我们的 JS 38ms 就跑完了，之后连宿主 50ms 的打开定时器都不再运行，
 * 新窗口一帧都没画出来。把下层窗口从渲染树里摘掉（`display: none`）就完全正常 —— 抽屉、图层预热
 * 与 CodeMirror 三者已逐一排除（关掉抽屉、去掉 `will-change`、不建编辑器都照样卡）。
 *
 * 这是宿主/WebView 侧的问题，代价是下层窗口在打开期间会「消失」，所以只在这个可选的安全模式下使用
 * （见 `safeMode.ts`）；调用方在第二个窗口关闭时把 `display` 恢复成空串。
 */
export const hideWhileOpening = (element: HTMLElement, open: () => void) => {
    element.style.display = "none";
    try {
        open();
    } catch (error) {
        // 打开失败时不能把下层的窗口留在隐藏状态
        element.style.display = "";
        throw error;
    }
};

/**
 * 把移动端对话框变成满屏页面（去掉宿主的 88vw 上限、圆角与描边，见 `index.scss`）。
 *
 * 满屏对话框会一直开着，常驻的整屏合成层再叠一个抽屉时，App 的 WebView 会因为合成层过多卡死
 * 并重载前端（issue #43）；而图层预热只在入场那一刻有用，所以满屏页面在入场动画结束后把
 * `bis-dialog-warm` 收回来，`will-change` 随之释放，正文回落到普通滚动层。
 * 普通对话框不动，保持原来「常驻预热」的做法。
 *
 * 用固定时钟而不是 `transitionend`：宿主的容器同时过渡 `transform` 与 `opacity`，两条事件先后
 * 到达，按事件释放有可能在 `transform` 还没走完时就把图层提前拆掉。
 */
export const makeFullscreenDialog = (dialog: Dialog) => {
    dialog.element.querySelector(".b3-dialog__container")?.classList.add("bis-dialog-fullscreen");
    window.setTimeout(() => dialog.element.classList.remove("bis-dialog-warm"), WARM_HOLD_MS);
};
