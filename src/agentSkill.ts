import {fetchSyncPost, saveExportFile} from "siyuan";
import type {APIFormData, PutFileRequestInput} from "siyuan";
import skillSource from "../docs/skill.md";
import {createLogger} from "./logger";

const log = createLogger("agentSkill");

/**
 * 技能名（也就是 `data/storage/ai/agent/skills/<name>/SKILL.md` 里的目录名）。
 * 思源按技能目录名与 frontmatter 的 name 建立索引，这里的名字只属于本插件；两者必须写同一个名字。
 */
export const AGENT_SKILL_NAME = "button-block";

/**
 * 插件版本：现读安装目录里的清单文件，不写在代码里。
 *
 * 插件装在 `data/plugins/<插件名>/`（内核 `loadCode` 拼的是 `DataDir/plugins/<petal.Name>`，
 * 见 kernel/model/plugin.go），清单就在包根；读不到时返回 undefined，正文里就不写这一段。
 */
const readPluginVersion = async (pluginName: string) => {
    try {
        const response = await fetch("/api/file/getFile", {
            method: "POST",
            body: JSON.stringify({path: `data/plugins/${pluginName}/plugin.json`}),
        });
        // 出错时是 HTTP 202 + JSON 信封，成功时是裸字节（同 src/scriptFile.ts 里的说明）
        if (response.status === 202 || !response.ok) {
            log.warn("cannot read the plugin manifest", {status: response.status});
            return;
        }
        const manifest = JSON.parse(await response.text()) as {version?: unknown};
        return typeof manifest.version === "string" ? manifest.version : undefined;
    } catch (error) {
        log.warn("cannot read the plugin manifest", {error});
        return;
    }
};

/**
 * 把版本写进技能正文的 frontmatter（`metadata.skill_version: "<插件版本>"`）。
 *
 * 思源只从 frontmatter 取 `name` / `description`（kernel/util/skill.go 的 `parseSkillFrontmatter`
 * 按行取键值），多这一段不影响技能的索引与加载；读不到版本、或正文里没有 frontmatter 时原样返回。
 */
const withVersion = (source: string, version?: string) => {
    if (!version) {
        return source;
    }
    const end = source.indexOf("\n---", 3);
    if (!source.startsWith("---") || end < 0) {
        return source;
    }
    return `${source.slice(0, end)}\nmetadata:\n  skill_version: "${version}"${source.slice(end)}`;
};

/**
 * 要写出去（写进工作区或下载）的技能正文。
 *
 * webpack 把 docs/skill.md 作为字符串内嵌进 index.js（与内置文档同一套做法），所以写入技能不需要联网、
 * 也不依赖工作区里有没有 docs/ 目录，插件升级后取到的必然是新版正文；再补上插件清单里的版本。
 */
const skillText = async (pluginName: string) => withVersion(skillSource, await readPluginVersion(pluginName));

/**
 * 把技能写给 Agent（`/api/ai/agent/saveSkill` → `data/storage/ai/agent/skills/<name>/SKILL.md`）。
 *
 * 每次加载插件都无条件重写一遍：技能由插件维护、不是用户数据，而技能目录里的副本可能是旧版本留下的、
 * 也可能被手工改过，只有每次覆盖才能保证 Agent 读到的就是当前插件 `docs/skill.md` 的正文。
 * 代价只是内核 `util.SaveSkill` 里的一次覆盖写，不值得为省下它去先 `getSkill` 比对内容。
 */
export const installAgentSkill = async (pluginName: string) => {
    const content = await skillText(pluginName);
    try {
        const response = await fetchSyncPost("/api/ai/agent/saveSkill", {
            name: AGENT_SKILL_NAME,
            content,
        }, undefined, false);
        if (response.code !== 0) {
            log.warn("failed to install the agent skill", {code: response.code, msg: response.msg});
            return;
        }
        log.info("installed the agent skill", {name: AGENT_SKILL_NAME, chars: content.length});
    } catch (error) {
        // AI 功能被关掉时这个接口直接失败，属于正常情况：只记日志，不打扰用户
        log.warn("cannot install the agent skill", {error});
    }
};

/** 关闭开关、禁用或卸载插件时把技能删掉；没装过（或同名的是用户自己的技能）时什么也不做。 */
export const removeAgentSkill = async () => {
    try {
        const response = await fetchSyncPost("/api/ai/agent/removeSkill", {name: AGENT_SKILL_NAME}, undefined, false);
        if (response.code !== 0) {
            log.debug("the agent skill is not there to remove", {code: response.code, msg: response.msg});
            return;
        }
        log.info("removed the agent skill", {name: AGENT_SKILL_NAME});
    } catch (error) {
        log.warn("cannot remove the agent skill", {error});
    }
};

/** 下载时用的文件名：宿主的保存对话框按 URL 最后一段取默认文件名。 */
const SKILL_FILE_NAME = "SKILL.md";

/**
 * 把技能正文交给思源原生的保存流程（设置面板里的「下载 SKILL.md」）。
 *
 * 保存由宿主的 `saveExportFile` 完成：桌面端弹系统保存对话框、用 `/api/export/copyExportFile` 复制，
 * 移动端交给原生 App（见 `app/src/protyle/util/compatibility.ts`）。它只肯复制内核
 * `<工作空间>/temp/export/` 下的文件（`kernel/api/export.go` 的 `copyExportFile` 会校验来源路径），
 * 所以先把正文写进那个目录再交给它 —— 内核写文件走 `/api/file/putFile`，路径相对工作空间根。
 * 失败一律抛给调用方，弹什么提示由调用方决定。
 */
export const downloadAgentSkill = async (pluginName: string) => {
    const content = await skillText(pluginName);
    // putFile 的契约是 multipart，宿主的类型要求 APIFormData<PutFileRequestInput>，这里按同一契约标注
    const form = new FormData() as APIFormData<PutFileRequestInput>;
    form.append("path", `temp/export/${SKILL_FILE_NAME}`);
    form.append("isDir", "false");
    form.append("file", new File([content], SKILL_FILE_NAME, {type: "text/markdown"}));
    const response = await fetchSyncPost("/api/file/putFile", form, undefined, false);
    if (response.code !== 0) {
        throw new Error(response.msg || `/api/file/putFile code ${response.code}`);
    }
    await saveExportFile(`/export/${SKILL_FILE_NAME}`);
    log.info("handed the agent skill to saveExportFile", {name: SKILL_FILE_NAME, chars: content.length});
};
