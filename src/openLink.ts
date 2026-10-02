import {Constants, fetchPost, getBackend, getFrontend, openTab, platformUtils, showMessage} from "siyuan";
import type {IContext} from "./context";
import {
    resolveAssetOpenAction,
    resolveAvailableAssetOpenAction,
    resolveExecutableAssetOpenAction,
} from "./assetOpen";
import {getIpcRenderer} from "./electron";
import {createLogger} from "./logger";

const log = createLogger("openLink");

/** 取资源扩展名：去掉查询串与锚点后的小写后缀。 */
const getAssetExtension = (path: string) => {
    const clean = path.split("#", 1)[0].split("?", 1)[0];
    const index = clean.lastIndexOf(".");
    return index === -1 ? "" : clean.substring(index).toLowerCase();
};

/** 地址里的查询串（不含锚点）。 */
const getAssetQuery = (path: string) => path.split("#", 1)[0].split("?", 2)[1] || "";

const HEIF_EXTENSIONS = [".heic", ".heif"];

/** 桌面端（含桌面端新窗口）才有本地文件系统与 Electron；浏览器前端、移动端没有。 */
const hasLocalFileSystem = () => {
    const frontend = getFrontend();
    return frontend === "desktop" || frontend === "desktop-window";
};

/** 移动端（含浏览器移动端）。 */
const isMobileFrontend = () => {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
};

const isWindows = () => getBackend() === "windows";

/**
 * 本地路径判定，与宿主 `app/src/util/pathName.ts` 的 isLocalPath 一致：`assets/…`、`file://…`、
 * Windows 网络共享（`\\…`）、盘符（`C:…`）与 Unix 绝对路径（`/…`）都算本地。
 */
const isLocalPath = (link: string) => {
    const value = link.trim().toLowerCase();
    if (!value) {
        return false;
    }
    if (value.startsWith("assets/") || value.startsWith("file://") || value.startsWith("\\\\")) {
        return true;
    }
    if (isWindows()) {
        return value.indexOf(":") === 1;
    }
    return value.startsWith("/");
};

/**
 * 判断资源能否交给思源的资源页签渲染，条件与宿主的 `editor/openLink.ts` 一致：扩展名在
 * `Constants.SIYUAN_ASSETS_EXTS` 里、HEIF 不带 `download=true`（宿主的 isBrowserRenderableImagePath）、
 * PDF 必须是库内资源、本地路径不能是 `assets/` 与 `file://` 之外的东西。不满足时 openTab 会让宿主的
 * newTab 返回 undefined，`wnd.addTab(undefined)` 直接把页签布局搞坏（思源整窗报错），所以必须先判断。
 */
const isPreviewableAsset = (path: string) => {
    if (isLocalPath(path) && !path.startsWith("assets/") && !path.startsWith("file://")) {
        return false;
    }
    const extension = getAssetExtension(path);
    if (!Constants.SIYUAN_ASSETS_EXTS.includes(extension)) {
        return false;
    }
    if (HEIF_EXTENSIONS.includes(extension) &&
        new URLSearchParams(getAssetQuery(path)).getAll("download").some((value) => value.toLowerCase() === "true")) {
        return false;
    }
    return extension !== ".pdf" || path.startsWith("assets/");
};

/** PDF 标注引用：`assets/x.pdf/<标注 id>`。 */
const PDF_ANNOTATION_PATH = /^(assets\/(?:[^/]+\/)*[^/]+\.[pP][dD][fF])\/(\d{14}-[a-z0-9]{7})$/;

const decodeQueryComponent = (value: string) => {
    try {
        return decodeURIComponent(value.replace(/\+/g, " "));
    } catch (error) {
        log.debug("the query component is not valid encoded text", {value, error});
        return value;
    }
};

/**
 * 拆出本地资源地址里的 PDF 参数，与宿主 `app/src/editor/pdfAssetLink.ts` 的 resolvePdfAssetLink 一致：
 * `assets/x.pdf?page=3` 去掉 `page` 只留页码，`assets/x.pdf/<标注 id>` 只留标注 id，其余查询串原样保留。
 * 不是 assets/ 下的 PDF 时原样返回，所以其它资源（含 `?box=` 之类的参数）不受影响。
 */
export const resolvePdfAssetLink = (address: string): {linkAddress: string; pdfParams?: number | string} => {
    const hashIndex = address.indexOf("#");
    const addressWithoutHash = hashIndex < 0 ? address : address.substring(0, hashIndex);
    const queryIndex = addressWithoutHash.indexOf("?");
    const path = queryIndex < 0 ? addressWithoutHash : addressWithoutHash.substring(0, queryIndex);
    const annotationMatch = PDF_ANNOTATION_PATH.exec(path);
    const pdfPath = annotationMatch?.[1] || path;
    if (!/^assets\/.+\.pdf$/i.test(pdfPath)) {
        return {linkAddress: address};
    }
    const query = queryIndex < 0 ? "" : addressWithoutHash.substring(queryIndex + 1);
    let page: string | undefined;
    const remainingQuery = query ? query.split("&").filter((item) => {
        const separatorIndex = item.indexOf("=");
        const key = separatorIndex < 0 ? item : item.substring(0, separatorIndex);
        if (decodeQueryComponent(key) !== "page") {
            return true;
        }
        if (typeof page === "undefined") {
            page = decodeQueryComponent(separatorIndex < 0 ? "" : item.substring(separatorIndex + 1));
        }
        return false;
    }).join("&") : "";
    const parsedPage = typeof page === "undefined" ? undefined : Number.parseInt(page, 10);
    const pdfParams = annotationMatch?.[2] ||
        (typeof parsedPage === "number" && !Number.isNaN(parsedPage) ? parsedPage : undefined);
    return {
        linkAddress: pdfPath + (remainingQuery ? `?${remainingQuery}` : ""),
        pdfParams,
    };
};

/**
 * 交给系统：与宿主的 `useShell` 一致，走 Electron 的 `shell.openPath` / `shell.showItemInFolder`。
 * 之前这里用 window.open 打开资源地址，结果被浏览器类插件接管，非图片类资源在浏览器里也打不开。
 */
const useShell = (context: IContext, type: "app" | "folder", filePath: string) => {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
        log.error("this environment has no Electron ipcRenderer, cannot hand the file to the system", {type, filePath});
        showMessage(context.i18n.assetOpenFailed);
        return;
    }
    log.info("handing the file to the system", {type, filePath});
    ipcRenderer.send(Constants.SIYUAN_CMD, {cmd: type === "folder" ? "showItemInFolder" : "openPath", filePath});
};

/**
 * 用系统默认程序打开资源、或在文件管理器里定位它，步骤与宿主的 `openBy` 一致：
 * `assets/…` 先向内核要绝对路径，`file://` 与绝对路径则按宿主的方式去掉协议前缀（Windows 下把 / 换成 \）。
 */
const openBySystem = (context: IContext, address: string, type: "app" | "folder") => {
    if (!address.startsWith("assets/")) {
        useShell(context, type, isWindows()
            ? address.replace("file:///", "").replace("file://\\", "").replace("file://", "").replace(/\//g, "\\")
            : address.replace("file://", ""));
        return;
    }
    fetchPost("/api/asset/resolveAssetPath", {path: address}, (response) => {
        const filePath = typeof response.data === "string" ? response.data : "";
        if (response.code !== 0 || !filePath) {
            log.error("failed to resolve the asset path, cannot hand the asset to the system", {
                address,
                type,
                code: response.code,
                msg: response.msg,
            });
            showMessage(response.msg || context.i18n.assetOpenFailed);
            return;
        }
        useShell(context, type, filePath);
    });
};

/**
 * 用思源的资源页签打开。`pdfParams` 是 PDF 页码或标注 id：宿主 `openFile` 的 page 参数就是这么传的
 * （见 plugin/API.ts 的 `openTab`），普通资源不带它。
 */
const openAssetTab = (context: IContext, path: string, pdfParams: number | string | undefined, options: {
    position?: "right" | "bottom";
    keepCursor?: boolean;
} = {}) => {
    log.info("opening the asset in a SiYuan tab", {path, pdfParams, position: options.position, keepCursor: options.keepCursor});
    if (typeof pdfParams === "undefined") {
        void openTab({app: context.app, asset: {path}, position: options.position, keepCursor: options.keepCursor});
        return;
    }
    const pdf = typeof pdfParams === "number" ? {path, page: pdfParams} : {path, id: pdfParams};
    void openTab({app: context.app, pdf, position: options.position, keepCursor: options.keepCursor});
};

/** 本地资源（`assets/…`、`file://…`、绝对路径）：按用户配的「资源文件打开方式」打开，与点文档里的资源链接一致。 */
const openLocalAsset = (context: IContext, address: string, event?: MouseEvent) => {
    // 移动端与宿主的 openLink 一样不认打开方式配置，直接交给 openByMobile：iOS/Android/鸿蒙各自
    // 把地址交给原生（`assets/…` 会转成工作空间里的资源地址），PDF 也由原生打开
    if (isMobileFrontend()) {
        log.info("handing the local asset to the host mobile logic", {address});
        platformUtils.openByMobile(address);
        return;
    }
    let linkAddress = address;
    let pdfParams: number | string | undefined;
    if (address.startsWith("assets/")) {
        ({linkAddress, pdfParams} = resolvePdfAssetLink(address));
    } else if (address.toLowerCase().indexOf(".pdf") > -1) {
        // 非 assets 的本地 PDF 也认 ?page=：页码单独取出来，地址去掉这段查询串，系统才打得开
        const page = new URLSearchParams(getAssetQuery(address)).get("page");
        const parsed = page === null ? Number.NaN : Number.parseInt(page, 10);
        pdfParams = Number.isNaN(parsed) ? undefined : parsed;
        linkAddress = address.split("?page")[0];
    }
    const action = resolveAvailableAssetOpenAction(
        resolveExecutableAssetOpenAction(
            resolveAssetOpenAction(window.siyuan?.config?.editor?.assetOpen, {
                altKey: event?.altKey,
                shiftKey: event?.shiftKey,
                ctrlKey: event?.ctrlKey,
            }),
            {
                previewable: isPreviewableAsset(linkAddress),
                noSplitScreen: Boolean(window.siyuan?.config?.fileTree?.noSplitScreenWhenOpenTab),
            },
        ),
        hasLocalFileSystem(),
    );
    switch (action) {
        case "current":
            openAssetTab(context, linkAddress, pdfParams);
            return;
        case "right":
            openAssetTab(context, linkAddress, pdfParams, {position: "right"});
            return;
        case "bottom":
            openAssetTab(context, linkAddress, pdfParams, {position: "bottom"});
            return;
        case "background":
            openAssetTab(context, linkAddress, pdfParams, {keepCursor: true});
            return;
        case "folder":
            openBySystem(context, linkAddress, "folder");
            return;
        case "new-window":
            // 插件 API 没有「资源在新窗口打开」（宿主的 openAssetNewWindow 走 Electron 专用通道），
            // 按宿主对做不了的动作的处理方式回落到当前页签
            log.warn("the plugin API cannot open an asset in a new window, using the current tab", {linkAddress});
            openAssetTab(context, linkAddress, pdfParams);
            return;
        default:
            openBySystem(context, linkAddress, "app");
            return;
    }
};

/** 与宿主 openLink 的第一步一致：地址里的 HTML 实体还原（`&amp;` 之类）。 */
const unescapeHtml = (link: string) => {
    try {
        return window.Lute.UnEscapeHTMLStr(link);
    } catch (error) {
        log.debug("Lute is not available to unescape the link", {error});
        return link;
    }
};

/**
 * 按钮的链接跳转：效果对齐「在文档里点一个 `[]()` 链接」（宿主的 `app/src/editor/openLink.ts`）。
 *
 * 插件拿不到宿主的 `openLink`，但能拿到它用的那几样东西：`platformUtils.openByMobile` 就是宿主
 * `openLink` 里调用的同一个函数 —— 它内部先走 `processSiYuanUri`（`siyuan://blocks|plugins|bazaar`
 * 与对应的插件事件都在那里处理），再按平台打开外部地址（桌面端最终落到系统浏览器，移动端走各自的
 * 原生通道）；本地资源则读 `window.siyuan.config.editor.assetOpen` 后按宿主的规则自己解析（见 assetOpen.ts）。
 * 唯一做不到的是 `new-window`：宿主的 `openAssetNewWindow` 走 Electron 专用通道，插件 API 没有对应入口。
 */
export const openLink = (context: IContext, link: string, event?: MouseEvent) => {
    const address = unescapeHtml(link).trim();
    if (!address) {
        log.warn("the link is empty, ignoring this click");
        return;
    }
    if (!isLocalPath(address)) {
        log.info("handing the link to the host", {address});
        platformUtils.openByMobile(address);
        return;
    }
    openLocalAsset(context, address, event);
};
