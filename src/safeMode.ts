/**
 * 移动端「安全模式」（issue #43）。
 *
 * App 里在一个满屏对话框还挂在屏幕上时再建第二个对话框，WebView 会整帧卡死并重载前端：
 * 插件的 JS 38ms 就跑完了，之后连宿主 50ms 的打开定时器都不再执行，新窗口一帧都没画出来。
 * 真机逐步排除后确认与抽屉、图层预热、CodeMirror 都无关，只有把下层窗口从渲染树里摘掉才正常
 * （见 `dialog.ts` 的 `hideWhileOpening`）。
 *
 * 这是宿主/WebView 侧的问题，代价是下层窗口在打开期间会「消失」，所以做成**默认关闭的可选安全模式**；
 * 关闭时插件的行为与以前完全一致。开关**只存在本机**（`localStorage`），不写进插件设置，
 * 因此不跟随思源同步，重装插件也不受影响；读不到（隐私模式、清过站点数据）按关闭处理。
 */
const SAFE_MODE_KEY = "button-in-siyuan/mobile-safe-mode";

/** 是否打开了移动端安全模式。 */
export const getMobileSafeMode = () => {
    try {
        return window.localStorage.getItem(SAFE_MODE_KEY) === "true";
    } catch (error) {
        return false;
    }
};

/** 记住安全模式开关；写不进去只影响下次启动，本次仍按传入值返回。 */
export const setMobileSafeMode = (enabled: boolean) => {
    try {
        window.localStorage.setItem(SAFE_MODE_KEY, String(enabled));
    } catch (error) {
        // 隐私模式等写不进去的场景：本次照常生效，下次启动回落关闭
    }
    return enabled;
};
