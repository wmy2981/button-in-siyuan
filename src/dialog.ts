import {Dialog} from "siyuan";

/**
 * 插件自己的对话框统一走这里创建。
 *
 * 宿主的对话框容器带 `opacity` + `scale` 入场过渡：过渡开始与结束时浏览器会新建、销毁合成层，
 * 而 App 的 WebView 在那一帧只能提交旧的页面纹理 —— 真机上打开面板时会插一帧整屏旧画面（闪烁）。
 * 这里给对话框外壳挂上 `bis-dialog-warm`（`index.scss` 里给容器与遮罩常驻 `will-change`），
 * 图层在打开之前就已经存在，入场过渡只改它的属性，不再动合成层。
 *
 * 不改宿主的过渡本身：时长、曲线、`b3-dialog--open` 的切换时序都还是宿主那一份。
 */
export const createDialog = (options: ConstructorParameters<typeof Dialog>[0]) => {
    const dialog = new Dialog(options);
    dialog.element.classList.add("bis-dialog-warm");
    return dialog;
};
