import {Dialog} from "siyuan";

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
