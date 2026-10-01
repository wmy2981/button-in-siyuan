/**
 * 桌面端 Electron 能力的取用口。
 *
 * 思源桌面端的主窗口是 nodeIntegration: true + contextIsolation: false，插件里可以拿到
 * window.require；浏览器前端与移动端没有它，取到的都是 undefined，调用方要按平台分支。
 */
export interface IIpcRenderer {
    send: (channel: string, data: unknown) => void;
}

/** 桌面端 Electron 的 ipcRenderer；浏览器前端与移动端返回 undefined。 */
export const getIpcRenderer = (): IIpcRenderer | undefined => {
    const requireFunc = (window as unknown as {require?: (name: string) => unknown}).require;
    if (typeof requireFunc !== "function") {
        return;
    }
    const electron = requireFunc("electron") as {ipcRenderer?: IIpcRenderer} | undefined;
    return electron?.ipcRenderer;
};
