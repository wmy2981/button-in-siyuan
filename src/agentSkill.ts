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
 * 所以写入技能不需要联网、也不依赖工作区里有没有 docs/ 目录，插件升级后取到的必然是新版正文。
 */
const skillContent = () => skillSource;

/**
 * 把技能写给 Agent（`/api/ai/agent/saveSkill` → `data/storage/ai/agent/skills/<name>/SKILL.md`）。
 *
 * 每次加载插件都无条件重写一遍：技能由插件维护、不是用户数据，而技能目录里的副本可能是旧版本留下的、
 * 也可能被手工改过，只有每次覆盖才能保证 Agent 读到的就是当前插件 `docs/skill.md` 的正文。
 * 代价只是内核 `util.SaveSkill` 里的一次覆盖写，不值得为省下它去先 `getSkill` 比对内容。
 */
export const installAgentSkill = async () => {
    const content = skillContent();
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
