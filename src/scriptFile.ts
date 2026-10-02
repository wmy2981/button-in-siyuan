import {fetchSyncPost} from "siyuan";
import {createLogger} from "./logger";

const log = createLogger("scriptFile");

/** 本地脚本文件都放在工作空间的 assets/ 下。 */
export const ASSET_PREFIX = "assets/";

/**
 * 按钮里存的资源路径（`assets/xxx.js`）→ 内核文件接口要的工作空间相对路径（`data/assets/xxx.js`）。
 *
 * 两个前缀不是一回事：`assets/…` 是思源引用资源的形式，相对的是**数据目录**（`GetAssetAbsPathInBox`
 * 拿它拼 `util.DataDir`，见 kernel/model/assets.go）；而 `/api/file/*` 与 Agent 的 `file` 工具的 path
 * 一律相对**工作空间根**（`GetAbsPathInWorkspace` 直接拼 `util.WorkspaceDir`，见 kernel/util/path.go），
 * 资源目录实际是 `<工作空间>/data/assets/`（kernel/util/working.go 的 InitWorkspace）。
 * 少了 `data/` 前缀，文件会落到工作空间根下另建的一个 `assets/`：插件自己按同一路径读写、看不出问题，
 * 但那个目录不在数据目录里，既不进思源的资源索引，也不会被同步（同步仓库只索引 `data/`，
 * 见 kernel/model/sync_ignore.go 的 syncPathFilter 与 model/sync_path.go 的 pathsAffectSync）。
 */
const toWorkspacePath = (assetPath: string) => `data/${assetPath}`;

/** 云端脚本：http(s) 地址，每次点击按钮都会重新下载。 */
export const isRemoteScript = (path: string) => /^https?:\/\//i.test(path.trim());

/**
 * assets/ 下的本地 .js 文件。只有这类文件能编辑、重命名、删除：其他地址（云端、别处的文件）
 * 插件不该动，也拿不到内核的文件接口权限。
 */
export const isLocalScript = (path: string) => {
    const value = path.trim();
    return value.startsWith(ASSET_PREFIX) && !value.includes("..") && value.toLowerCase().endsWith(".js");
};

/**
 * 内核只接受能通过 `FilterUploadFileName` 的文件名（先经 `FilterFileName` 把 `'` 换成 `_`，再删掉
 * `~ [ ] ( ) ! \` & { } = # % $ ;` 并把名字截到 189 字节，见 kernel/util/file.go），先在本地拦住，
 * 免得用户在保存时才撞上一个看不懂的 400。
 */
const INVALID_FILE_NAME_CHARS = /[~[\]()!`&{}=#%$;'\\/:*?"<>|]/;

/** 用户输入的文件名 → assets/ 下的脚本路径；名字不合法时返回 undefined。 */
export const toAssetScriptPath = (name: string) => {
    const trimmed = name.trim();
    const fileName = trimmed.toLowerCase().endsWith(".js") ? trimmed : `${trimmed}.js`;
    if (!fileName || fileName.startsWith(".") || INVALID_FILE_NAME_CHARS.test(fileName) ||
        new TextEncoder().encode(fileName).length > 180) {
        return;
    }
    return `${ASSET_PREFIX}${fileName}`;
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

/**
 * 读 assets/ 下的文本文件（`path` 是按钮里存的那种 `assets/…` 资源路径）。
 *
 * 这里没有用宿主的 `fetchPost`：`/api/file/getFile` 成功时回的是裸字节（按 Content-Type 给文本或
 * JSON），出错时才是 JSON 信封（HTTP 202，见 apicontract 的 `GetFile.ErrorStatus`）；而宿主对
 * `code < 0` 的响应只弹一个提示、不调用回调，403/404 这类错误就拿不到了 —— 「文件不存在」正是
 * 新建脚本前要判断的情况。
 */
export const readWorkspaceFile = async (path: string) => {
    const response = await fetch("/api/file/getFile", {
        method: "POST",
        body: JSON.stringify({path: toWorkspacePath(path)}),
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

/** 写入 assets/ 下的文本文件（`path` 同上）；文件不存在时由内核创建（父目录也会建）。 */
export const writeWorkspaceFile = async (path: string, content: string) => {
    const fileName = path.substring(path.lastIndexOf("/") + 1);
    // /api/file/putFile 是 multipart/form-data：path 决定写到哪里，file 是内容（isDir 用字符串）
    const form = new FormData();
    form.append("path", toWorkspacePath(path));
    form.append("isDir", "false");
    form.append("file", new File([content], fileName, {type: "text/javascript"}));
    await postKernel("/api/file/putFile", form);
    log.info("wrote a script file", {path, chars: content.length});
};

export const removeWorkspaceFile = (path: string) => postKernel("/api/file/removeFile", {path: toWorkspacePath(path)});

export const renameWorkspaceFile = (path: string, newPath: string) =>
    postKernel("/api/file/renameFile", {path: toWorkspacePath(path), newPath: toWorkspacePath(newPath)});

/**
 * 同目录下是否已经有这个文件名。用 readDir 列目录，而不是「试着读一次文件」：读取失败时
 * 分不清「文件不存在」和「读不了」，列目录则能确定地回答。
 */
export const workspaceFileExists = async (path: string) => {
    const slash = path.lastIndexOf("/");
    const dir = path.substring(0, slash);
    const response = await fetchSyncPost("/api/file/readDir", {path: toWorkspacePath(dir)}, undefined, false);
    if (response.code !== 0) {
        // assets/ 目录还不存在就是还没有这个文件（第一次新建脚本）
        log.debug("cannot list the asset directory, treating the file as missing", {
            dir,
            code: response.code,
            msg: response.msg,
        });
        return false;
    }
    const entries = (response.data || []) as Array<{name?: string}>;
    return entries.some((entry) => entry?.name === path.substring(slash + 1));
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

/** 把云端脚本下载成 assets/ 下的本地文件（随机文件名），返回新的路径。 */
export const downloadScriptToAssets = async (url: string) => {
    const response = await fetch(url, {cache: "no-store"});
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    const code = await response.text();
    const path = `${ASSET_PREFIX}${window.Lute?.NewNodeID?.() || Date.now().toString()}.js`;
    await writeWorkspaceFile(path, code);
    log.info("downloaded a remote script into assets", {url, path, chars: code.length});
    return path;
};
