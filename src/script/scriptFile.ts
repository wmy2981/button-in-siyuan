import {fetchSyncPost} from "siyuan";
import {createLogger} from "../core/logger";
import {
    ASSET_SCRIPT_DIR,
    PLUGIN_SCRIPT_DIR,
    SCRIPT_DIRECTORIES,
} from "../core/pluginPaths";

const log = createLogger("scriptFile");

/** 脚本可以存放的两类位置：用户资源目录，或插件自己的 `scripts/` 目录。 */
export type TScriptLocation = "assets" | "plugin";

const LOCATION_DIRECTORIES: Record<TScriptLocation, string> = {
    assets: ASSET_SCRIPT_DIR,
    plugin: PLUGIN_SCRIPT_DIR,
};

/** 云端脚本：http(s) 地址，每次点击按钮都会重新下载。 */
export const isRemoteScript = (path: string) => /^https?:\/\//i.test(path.trim());

/**
 * 把按钮里存的文件路径规范成**从工作空间根开始的完整相对路径**（issue #20）：
 *
 * - `data/assets/foo.js`、`data/storage/petal/button-in-siyuan/scripts/foo.js` 原样保留；
 * - 旧版本存的 `assets/foo.js`（相对数据目录）补上 `data/`，继续可用；
 * - 反斜杠、开头的 `./` 与 `/` 一并规整。
 *
 * 不是这两类目录下的 `.js` 文件、或路径里带 `..` 时返回 undefined：脚本只允许放在插件管理的
 * 两个目录里，别处的文件交给宿主自己的链接/资源机制。
 */
export const normalizeScriptPath = (value: string): string | undefined => {
    let path = value.trim().replace(/\\/g, "/");
    if (path.startsWith("/")) {
        path = path.slice(1);
    }
    if (path.startsWith("./")) {
        path = path.slice(2);
    }
    if (path.startsWith("assets/")) {
        path = `data/${path}`;
    }
    if (!path || path.includes("..") || !path.toLowerCase().endsWith(".js")) {
        return;
    }
    return SCRIPT_DIRECTORIES.some((directory) => path.startsWith(directory)) ? path : undefined;
};

/** 脚本路径属于哪一类位置；不是插件管理的脚本时返回 undefined。 */
export const scriptLocation = (value: string): TScriptLocation | undefined => {
    const path = normalizeScriptPath(value);
    if (!path) {
        return;
    }
    return path.startsWith(PLUGIN_SCRIPT_DIR) ? "plugin" : "assets";
};

/** `data/assets/foo.js` → `foo.js`；名字用于新建/编辑弹窗预填。 */
export const scriptFileName = (value: string) => {
    const path = normalizeScriptPath(value);
    if (!path) {
        return "";
    }
    return path.substring(path.lastIndexOf("/") + 1, path.length - ".js".length);
};

/**
 * 内核只接受能通过 `FilterUploadFileName` 的文件名（先经 `FilterFileName` 把 `'` 换成 `_`，再删掉
 * `~ [ ] ( ) ! \` & { } = # % $ ;` 并把名字截到 189 字节，见 kernel/util/file.go），先在本地拦住，
 * 免得用户在保存时才撞上一个看不懂的 400。
 */
const INVALID_FILE_NAME_CHARS = /[~[\]()!`&{}=#%$;'\\/:*?"<>|]/;

/** 用户输入的文件名 → 指定目录下的完整工作空间相对路径；名字不合法时返回 undefined。 */
export const toScriptPath = (location: TScriptLocation, name: string) => {
    const trimmed = name.trim();
    const fileName = trimmed.toLowerCase().endsWith(".js") ? trimmed : `${trimmed}.js`;
    if (!fileName || fileName.startsWith(".") || INVALID_FILE_NAME_CHARS.test(fileName) ||
        new TextEncoder().encode(fileName).length > 180) {
        return;
    }
    return `${LOCATION_DIRECTORIES[location]}${fileName}`;
};

/** 内核错误一律是 {code, msg} 的 JSON 信封；解析不出来时退回状态码。 */
const kernelError = async (response: Response) => {
    const text = await response.text();
    try {
        const payload = JSON.parse(text) as {msg?: string};
        if (payload?.msg) {
            return payload.msg;
        }
    } catch (error) {
        log.debug("kernel error body is not JSON", {status: response.status, error});
    }
    return text || `${response.status} ${response.statusText}`;
};

/** 取规范路径；调用方传进来的路径必须已经过校验。 */
const requireScriptPath = (value: string) => {
    const path = normalizeScriptPath(value);
    if (!path) {
        throw new Error(`unsupported script path: ${value}`);
    }
    return path;
};

/**
 * 读工作空间里的文本文件（传入的是按钮里存的那种完整相对路径）。
 *
 * 这里没有用宿主的 `fetchPost`：`/api/file/getFile` 成功时回的是裸字节（按 Content-Type 给文本或
 * JSON），出错时才是 JSON 信封（HTTP 202，见 apicontract 的 `GetFile.ErrorStatus`）；而宿主对
 * `code < 0` 的响应只弹一个提示、不调用回调，403/404 这类错误就拿不到了 —— 「文件不存在」正是
 * 新建脚本前要判断的情况。
 */
export const readWorkspaceFile = async (path: string) => {
    const response = await fetch("/api/file/getFile", {
        method: "POST",
        body: JSON.stringify({path: requireScriptPath(path)}),
    });
    if (response.status === 202 || !response.ok) {
        throw new Error(await kernelError(response));
    }
    return response.text();
};

/**
 * POST 一个 JSON 信封接口（putFile / removeFile / renameFile 成功失败都是 JSON）。
 *
 * `fetchSyncPost` 的第四个参数关掉 `processMessage`：它只给 `code < 0` 弹提示并把回调丢掉，
 * 这里要自己拿 `code` 决定怎么提示。
 */
const postKernel = async (url: string, body: unknown) => {
    const response = await fetchSyncPost(url, body, undefined, false);
    if (response.code !== 0) {
        throw new Error(response.msg || `${url} code ${response.code}`);
    }
    return response;
};

/** 写入工作空间里的文本文件（文件不存在时由内核创建，父目录也会建）。 */
export const writeWorkspaceFile = async (path: string, content: string) => {
    const workspacePath = requireScriptPath(path);
    const fileName = workspacePath.substring(workspacePath.lastIndexOf("/") + 1);
    // /api/file/putFile 是 multipart/form-data：path 决定写到哪里，file 是内容（isDir 用字符串）
    const form = new FormData();
    form.append("path", workspacePath);
    form.append("isDir", "false");
    form.append("file", new File([content], fileName, {type: "text/javascript"}));
    await postKernel("/api/file/putFile", form);
    log.info("wrote a script file", {path: workspacePath, chars: content.length});
};

export const removeWorkspaceFile = (path: string) =>
    postKernel("/api/file/removeFile", {path: requireScriptPath(path)});

/** 重命名或移动脚本文件；目标目录不存在时内核会建出来。 */
export const renameWorkspaceFile = (path: string, newPath: string) =>
    postKernel("/api/file/renameFile", {
        path: requireScriptPath(path),
        newPath: requireScriptPath(newPath),
    });

/**
 * 同目录下是否已经有这个文件名。用 readDir 列目录，而不是「试着读一次文件」：读取失败时
 * 分不清「文件不存在」和「读不了」，列目录则能确定地回答。
 */
export const workspaceFileExists = async (path: string) => {
    const workspacePath = requireScriptPath(path);
    const slash = workspacePath.lastIndexOf("/");
    const dir = workspacePath.substring(0, slash);
    const response = await fetchSyncPost("/api/file/readDir", {path: dir}, undefined, false);
    if (response.code !== 0) {
        // 目录还不存在就是还没有这个文件（第一次新建脚本）
        log.debug("cannot list the script directory, treating the file as missing", {
            dir,
            code: response.code,
            msg: response.msg,
        });
        return false;
    }
    const entries = (response.data || []) as Array<{name?: string}>;
    return entries.some((entry) => entry?.name === workspacePath.substring(slash + 1));
};

/** 取按钮要执行的代码：云端地址现取（每次都重新下载），本地文件走内核接口。 */
export const loadActionScript = async (path: string) => {
    if (!isRemoteScript(path)) {
        return readWorkspaceFile(path);
    }
    const response = await fetch(path, {cache: "no-store"});
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.text();
};

/** 把云端脚本下载成 `data/assets/` 下的本地文件（随机文件名），返回完整的工作空间相对路径。 */
export const downloadScriptToAssets = async (url: string) => {
    const response = await fetch(url, {cache: "no-store"});
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    const code = await response.text();
    const path = `${ASSET_SCRIPT_DIR}${window.Lute?.NewNodeID?.() || Date.now().toString()}.js`;
    await writeWorkspaceFile(path, code);
    log.info("downloaded a remote script into the asset directory", {url, path, chars: code.length});
    return path;
};
