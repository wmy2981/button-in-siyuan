import {fetchSyncPost, saveExportFile} from "siyuan";
import type {APIFormData, PutFileRequestInput} from "siyuan";
import iconsSource from "../docs/icons.md";
import scriptSource from "../docs/javascript.md";
import skillSource from "../docs/skill.md";
import {createLogger} from "./logger";
import {fillSiyuanRef, resolveSiyuanRef} from "./siyuanRef";

const log = createLogger("agentSkill");

/**
 * 技能名（也就是 `data/storage/ai/agent/skills/<name>/SKILL.md` 里的目录名）。
 * 思源按技能目录名与 frontmatter 的 name 建立索引，这里的名字只属于本插件；两者必须写同一个名字。
 */
export const AGENT_SKILL_NAME = "button-block";

/**
 * 技能里附件所在的子目录。
 *
 * 内核加载技能正文时会把技能目录下的文本文件列成资源清单（`kernel/util/skill.go` 的
 * `listSkillResources`，单个文件上限 64 KiB），Agent 再用 `skill` 工具的 `load`
 * 按「技能名/相对路径」把其中一份读出来；`references/` 只是约定俗成的名字，内核并不限定目录名。
 */
const REFERENCE_DIR = "references";

/** 技能目录在工作区中的相对路径 —— 内核的文件接口只认这种形式（相对工作空间根）。 */
const SKILL_DIR = `data/storage/ai/agent/skills/${AGENT_SKILL_NAME}`;

/** 下载时压缩包的包名与文件名；宿主的保存对话框按 URL 最后一段取默认文件名。 */
const SKILL_ZIP_NAME = `${AGENT_SKILL_NAME}.zip`;

/** 打包下载时先把技能放进 `temp/export/`，内核的 `copyExportFile` 只肯复制这个目录下的文件。 */
const EXPORT_DIR = `temp/export/${AGENT_SKILL_NAME}`;

/** 技能里的一个文件：技能目录下的相对路径、文件名（putFile 的表单用它命名）与正文。 */
interface ISkillFile {
    path: string;
    name: string;
    content: string;
}

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
 * 一份技能的三个文件：正文 + 两份参考文档。
 *
 * 正文与附件都是构建时内嵌进 index.js 的 `docs/*.md`（与内置文档同一套做法），所以写入技能不需要联网、
 * 也不依赖工作区里有没有 `docs/` 目录，插件升级后取到的必然是新版正文；文档里的思源版本占位符在这里
 * 换成实际标签。写入技能与打包下载共用这一处渲染，两个出口的内容不会各自漂移。
 */
const buildSkill = async (pluginName: string, ref: string) => ({
    manifest: withVersion(fillSiyuanRef(skillSource, ref), await readPluginVersion(pluginName)),
    references: [
        {
            path: `${REFERENCE_DIR}/javascript.md`,
            name: "javascript.md",
            content: fillSiyuanRef(scriptSource, ref),
        },
        {path: `${REFERENCE_DIR}/icons.md`, name: "icons.md", content: fillSiyuanRef(iconsSource, ref)},
    ] as ISkillFile[],
});

/**
 * 把一段文本写进工作区里的某个文件。
 *
 * 内核的文件接口会自动建出父目录（`kernel/api/file.go` 里写的 `os.MkdirAll(filepath.Dir(...))`），
 * 而且对已存在的文件是无条件覆盖 —— 正是这里要的行为；它也会照宿主的规则通知同步。
 */
const putTextFile = async (dir: string, file: ISkillFile) => {
    // putFile 的契约是 multipart，宿主的类型要求 APIFormData<PutFileRequestInput>，这里按同一契约标注
    const form = new FormData() as APIFormData<PutFileRequestInput>;
    form.append("path", `${dir}/${file.path}`);
    form.append("isDir", "false");
    form.append("file", new File([file.content], file.name, {type: "text/markdown"}));
    const response = await fetchSyncPost("/api/file/putFile", form, undefined, false);
    if (response.code !== 0) {
        throw new Error(response.msg || `/api/file/putFile code ${response.code}`);
    }
};

/**
 * 把技能写给 Agent：正文走 `/api/ai/agent/saveSkill`、两份参考文档走内核的文件接口。
 *
 * saveSkill 只肯写 `SKILL.md`（`util.SaveSkill` 把 content 写进那个固定文件名），技能目录里的其他文件
 * 没有对应的技能接口，只能落盘写。
 *
 * 每次加载插件都无条件重写一遍：技能由插件维护、不是用户数据，而技能目录里的副本可能是旧版本留下的、
 * 也可能被手工改过，只有每次覆盖才能保证 Agent 读到的就是当前插件 `docs/` 的正文。
 * 代价只是内核的一次覆盖写，不值得为省下它去先比对内容。
 */
export const installAgentSkill = async (pluginName: string) => {
    const skill = await buildSkill(pluginName, await resolveSiyuanRef());
    try {
        const response = await fetchSyncPost("/api/ai/agent/saveSkill", {
            name: AGENT_SKILL_NAME,
            content: skill.manifest,
        }, undefined, false);
        if (response.code !== 0) {
            log.warn("failed to install the agent skill", {code: response.code, msg: response.msg});
            return;
        }
        // 正文先落地、附件随后：中途失败时盘上留下的是一个能被索引到的技能，而不是一个只有附件的空目录
        for (const file of skill.references) {
            await putTextFile(SKILL_DIR, file);
        }
        const chars = skill.manifest.length + skill.references.reduce((sum, file) => sum + file.content.length, 0);
        log.info("installed the agent skill", {name: AGENT_SKILL_NAME, files: skill.references.length + 1, chars});
    } catch (error) {
        // AI 功能被关掉时技能接口直接失败，属于正常情况：只记日志，不打扰用户
        log.warn("cannot install the agent skill", {error});
    }
};

/** 技能目录是否真的在盘上：内核只把「目录里有 SKILL.md」的目录认成技能，光有附件它看不见。 */
const skillDirExists = async () => {
    const response = await fetchSyncPost("/api/file/readDir", {path: SKILL_DIR}, undefined, false);
    return response.code === 0;
};

/**
 * 关闭开关、禁用或卸载插件时把技能删掉。
 *
 * 正常情况一次 `removeSkill` 就够：内核那个接口是 `os.RemoveAll(skillDir)`，`references/` 会一起消失。
 * 但它是先按名字在技能目录里找记录、找不到就报 `skill not found`，而那条记录只有在目录里存在
 * `SKILL.md` 时才读得出来（`util.readSkillRecords`）—— 正文被手删过，整目录删除就不会发生，附件会留下。
 * 所以失败后再确认一次目录是否真的还在：在的话把正文补写回去（内容就在包里，不花代价），再删一次。
 */
export const removeAgentSkill = async (pluginName: string) => {
    try {
        const removed = await fetchSyncPost("/api/ai/agent/removeSkill", {name: AGENT_SKILL_NAME}, undefined, false);
        if (removed.code === 0) {
            log.info("removed the agent skill", {name: AGENT_SKILL_NAME});
            return;
        }
        if (!await skillDirExists()) {
            log.debug("the agent skill is not there to remove", {code: removed.code, msg: removed.msg});
            return;
        }
        const manifest = (await buildSkill(pluginName, await resolveSiyuanRef())).manifest;
        const restored = await fetchSyncPost("/api/ai/agent/saveSkill", {
            name: AGENT_SKILL_NAME,
            content: manifest,
        }, undefined, false);
        const retried = restored.code === 0
            ? await fetchSyncPost("/api/ai/agent/removeSkill", {name: AGENT_SKILL_NAME}, undefined, false)
            : restored;
        if (retried.code === 0) {
            log.info("removed the agent skill after restoring its manifest", {name: AGENT_SKILL_NAME});
        } else {
            log.warn("failed to remove the agent skill", {code: retried.code, msg: retried.msg});
        }
    } catch (error) {
        log.warn("cannot remove the agent skill", {error});
    }
};

/**
 * 把整份技能交给思源原生的保存流程（设置面板里的「下载技能」）。
 *
 * 技能是三个文件，只存正文没有意义，所以现场把三份都写进 `temp/export/button-block/`，再用内核的
 * `/api/archive/zip` 压成一个目录结构完好的包（`button-block/SKILL.md` 与 `button-block/references/*.md`
 * —— 内核按源目录名建顶层目录，见 kernel/api/archive.go 的 `zipFile.AddDirectory(base, …)`）。
 * 内容取包内自带的那份、而不是工作区里已经落盘的技能：技能开关关着也能导出，手改过的副本也不会被带走。
 *
 * 保存由宿主的 `saveExportFile` 完成：桌面端弹系统保存对话框、用 `/api/export/copyExportFile` 复制，
 * 移动端交给原生 App（见 `app/src/protyle/util/compatibility.ts`）。它只肯复制内核
 * `<工作空间>/temp/export/` 下的文件（kernel/api/export.go 的 `copyExportFile` 会校验来源路径），
 * 所以压缩包也必须先落在那个目录里。失败一律抛给调用方，弹什么提示由调用方决定。
 */
export const downloadAgentSkill = async (pluginName: string) => {
    const skill = await buildSkill(pluginName, await resolveSiyuanRef());
    const files: ISkillFile[] = [
        {path: "SKILL.md", name: "SKILL.md", content: skill.manifest},
        ...skill.references,
    ];
    for (const file of files) {
        await putTextFile(EXPORT_DIR, file);
    }
    const zipped = await fetchSyncPost("/api/archive/zip", {
        path: EXPORT_DIR,
        zipPath: `temp/export/${SKILL_ZIP_NAME}`,
    }, undefined, false);
    if (zipped.code !== 0) {
        throw new Error(zipped.msg || `/api/archive/zip code ${zipped.code}`);
    }
    await saveExportFile(`/export/${SKILL_ZIP_NAME}`);
    log.info("handed the agent skill to saveExportFile", {name: SKILL_ZIP_NAME, files: files.length});
};
