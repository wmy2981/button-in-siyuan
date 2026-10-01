// 校验 docs/ 里的 JavaScript 文档与代码一致：
// 1. 每段 ```js 示例都能被 new Function 解析（与按钮执行时的包装方式完全一致）
// 2. 文档接口表里列出的名字，与 src/scriptApi.ts 实际注入的名字一致（不多不少）
//
// 文档是内嵌进插件里的，用户会照着抄；示例写错或接口表漏项都在这里拦住。
// 用法：node scripts/check-docs.mjs（已挂在 npm run check 上）
import {build} from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = ["docs/javascript.zh-CN.md", "docs/javascript.md"];
const problems = [];

// ---- 1. 示例语法 ----
let fenceCount = 0;
docs.forEach((file) => {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    Array.from(text.matchAll(/```js\n([\s\S]*?)```/g)).forEach((match, index) => {
        fenceCount++;
        try {
            new Function(`return (async () => {\n${match[1]}\n})()`);
        } catch (error) {
            problems.push(`${file} 第 ${index + 1} 段示例语法错误：${error.message}`);
        }
    });
});
if (fenceCount === 0) {
    problems.push("两份文档里都没有找到 ```js 示例");
}

// ---- 2. 接口清单 ----
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "siyuan-check-docs-"));
let scopeNames = [];
try {
    const stubPath = path.join(tempDir, "siyuan-stub.mjs");
    // scriptApi.ts 只用到宿主的接口，校验注入清单时给一个空替身即可
    fs.writeFileSync(stubPath, `const noop = () => undefined;
export const Constants = {};
export const platformUtils = {};
class Stub {}
export const Dialog = Stub;
export const Menu = Stub;
export const Setting = Stub;
export const Plugin = Stub;
export const Protyle = Stub;
export const ProtyleMethod = {};
export const adaptHotkey = noop;
export const adjustEditorFontSize = noop;
export const confirm = noop;
export const expandDocTree = noop;
export const fetchGet = noop;
export const fetchPost = noop;
export const fetchSyncPost = noop;
export const getActiveEditor = () => undefined;
export const getActiveTab = noop;
export const getAllEditor = () => [];
export const getAllModels = noop;
export const getAllTabs = noop;
export const getBackend = noop;
export const getFrontend = noop;
export const getModelByDockType = noop;
export const globalCommand = noop;
export const hideMessage = noop;
export const isBottomDockVisible = noop;
export const isLeftDockVisible = noop;
export const isRightDockVisible = noop;
export const openAssetPicker = noop;
export const openAttributePanel = noop;
export const openEmoji = noop;
export const openInputDialog = noop;
export const openMobileFileById = noop;
export const openSetting = noop;
export const openTab = noop;
export const openWindow = noop;
export const saveExportFile = noop;
export const saveLayout = noop;
export const setEditorFontSize = noop;
export const showMessage = noop;
export const toggleBottomDock = noop;
export const toggleLeftDock = noop;
export const toggleRightDock = noop;
`);
    const bundlePath = path.join(tempDir, "scriptApi.mjs");
    await build({
        entryPoints: [path.join(root, "src", "scriptApi.ts")],
        bundle: true,
        outfile: bundlePath,
        format: "esm",
        platform: "neutral",
        target: "es2022",
        alias: {siyuan: stubPath},
        logLevel: "warning",
    });
    globalThis.window = {siyuan: {}, Lute: class Lute {
    }};
    const {createScriptScope} = await import(pathToFileURL(bundlePath).href);
    // 注入清单里会打一条 debug 日志，这里静音，保持校验输出干净
    const debug = console.debug;
    console.debug = () => undefined;
    try {
        scopeNames = createScriptScope({
            plugin: {}, app: {}, i18n: {}, isMobile: false, blockID: "20240101000000-abcdefg",
        }).names;
    } finally {
        console.debug = debug;
    }
} finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
}

docs.forEach((file) => {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const section = text.slice(text.indexOf("## 2."), text.indexOf("### 2.2"));
    if (!section) {
        problems.push(`${file}: 找不到「2. 运行环境」小节，接口表无法校验`);
        return;
    }
    const documented = new Set(Array.from(section.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g), (match) => match[1]));
    const missing = scopeNames.filter((name) => !documented.has(name));
    if (missing.length) {
        problems.push(`${file}: 接口表缺少 ${missing.join(", ")}`);
    }
});

if (problems.length) {
    problems.forEach((problem) => console.error(problem));
    process.exit(1);
}
console.log(`docs: ${fenceCount} 段示例语法合法，接口表覆盖全部 ${scopeNames.length} 个注入项`);
