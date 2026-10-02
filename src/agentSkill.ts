import {fetchSyncPost} from "siyuan";
import skillSource from "../docs/skill.md";
import {createLogger} from "./logger";

const log = createLogger("agentSkill");

/**
 * 技能名（也就是 `data/storage/ai/agent/skills/<name>/SKILL.md` 里的目录名）。
 * 思源按技能目录名与 frontmatter 的 name 建立索引，这里的名字只属于本插件。
 */
export const AGENT_SKILL_NAME = "siyuan-button-block";

/**
 * 技能正文：webpack 把 docs/skill.md 作为字符串内嵌进 index.js（与内置文档同一套做法），
 * 所以安装技能不需要联网、也不依赖工作区里有没有 docs/ 目录。
 */
const skillContent = () => skillSource;

/** 读取当前已安装的同名技能；不存在或读取失败时返回 undefined。 */
const readSkill = async () => {
    const response = await fetchSyncPost(`/api/ai/agent/getSkill`, {name: AGENT_SKILL_NAME}, undefined, false);
    if (response.code !== 0) {
        log.debug("the agent skill is not installed yet", {code: response.code, msg: response.msg});
        return;
    }
    const data = response.data as {content?: string} | undefined;
    return typeof data?.content === "string" ? data.content : undefined;
};

/**
 * 把技能写给 Agent（`/api/ai/agent/saveSkill` → `data/storage/ai/agent/skills/<name>/SKILL.md`）。
 *
 * 内容与我们的一致时什么都不做：插件每次加载都跑一遍，没必要反复写盘，也不会把用户改过的文件
 * 无声无息地盖掉 —— 只有内容确实不同（插件升级、用户改过）才覆盖。
 */
export const installAgentSkill = async () => {
    const content = skillContent();
    try {
        if (await readSkill() === content) {
            log.debug("the agent skill is already up to date", {name: AGENT_SKILL_NAME});
            return;
        }
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

/** 关闭开关或卸载插件时把技能删掉；没装过（或已经是用户自己的技能）时什么也不做。 */
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
