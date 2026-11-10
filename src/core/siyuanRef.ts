import {fetchSyncPost} from "siyuan";
import {createLogger} from "./logger";

const log = createLogger("siyuanRef");

/**
 * `docs/*.md` 里思源版本引用的占位符。
 *
 * javascript 文档要给出一份与本机思源版本一致的官方 API 文档地址（见文档 §2.1），但版本只有运行时才
 * 知道，而这两份文档是构建时作为字符串内嵌进 index.js 的静态文本，所以正文里写占位符，写到技能目录与
 * 渲染文档弹窗时统一替换 —— 两个出口的正文也就不会各自漂移。
 */
export const SIYUAN_REF_PLACEHOLDER = "{{siyuan-ref}}";

/** 思源的 git 标签就是版本号加 `v` 前缀（内核 `util.Ver` 是 `3.8.7-alpha.3`，对应 tag `v3.8.7-alpha.3`）。 */
const tagOf = (version: string) => `v${version.trim().replace(/^v/, "")}`;

/**
 * 要钉进文档链接的版本引用。
 *
 * 优先本机内核版本：`window.siyuan.config.system.kernelVersion` 就是内核 `util.Ver`，插件加载时已经在
 * 内存里，不必多打一次接口。读不到时回落 `/api/system/version`（同一个值的权威来源）。
 * 两条路都拿不到时用 `dev` 分支：链接仍然可用，只是文档可能描述比本机更新的构建，文档里对这一点有说明。
 */
export const resolveSiyuanRef = async () => {
    const cached = window.siyuan?.config?.system?.kernelVersion;
    if (typeof cached === "string" && cached.trim()) {
        log.debug("using the kernel version from the frontend config", {version: cached.trim()});
        return tagOf(cached);
    }
    try {
        const response = await fetchSyncPost("/api/system/version", {}, undefined, false);
        if (response.code === 0 && typeof response.data === "string" && response.data.trim()) {
            return tagOf(response.data);
        }
        log.warn("cannot read the kernel version", {code: response.code, msg: response.msg});
    } catch (error) {
        log.warn("cannot read the kernel version", {error});
    }
    return "dev";
};

/** 把正文里的占位符换成版本引用。`replaceAll` 要 ES2021，而构建目标是 ES2019，所以用 split/join。 */
export const fillSiyuanRef = (text: string, ref: string) => text.split(SIYUAN_REF_PLACEHOLDER).join(ref);
