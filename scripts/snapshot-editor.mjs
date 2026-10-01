// 把 assets/preview.html 里的代码编辑器替换成真实 CodeMirror 的静态快照。
//
// 预览图里那一段编辑器不是手写的 HTML：这里用 esbuild 打包 src/codeEditor.ts，
// 在 Chromium 里真的挂载一次，再把 CodeMirror 自己注入的样式和渲染出的 DOM 抓出来，
// 写回 preview.html 的两个标记之间。这样预览图里的编辑器与插件对话框里的编辑器逐像素一致
// （行号位置、缩进、配色都来自同一份样式），改了 src/codeEditor.ts 之后重跑本脚本即可。
//
// 用法：node scripts/snapshot-editor.mjs
// 依赖：playwright（首次需 npx playwright install chromium）、esbuild（随 esbuild-loader 安装）。
import {build} from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {chromium} from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewPath = path.join(root, "assets", "preview.html");
const CSS_START = "<!-- editor-css:start 由 scripts/snapshot-editor.mjs 生成，勿手改 -->";
const CSS_END = "<!-- editor-css:end -->";
const DOM_START = "<!-- editor-dom:start 由 scripts/snapshot-editor.mjs 生成，勿手改 -->";
const DOM_END = "<!-- editor-dom:end -->";

// 与 assets/preview.html 里同一套思源变量 + 思源内置的 github 代码高亮主题
const PAGE = `<!DOCTYPE html>
<html lang="zh-CN" data-theme-mode="light">
<head>
<meta charset="UTF-8">
<title>editor snapshot</title>
<style id="page-css">
    :root {
        --b3-theme-primary: #3575f0;
        --b3-theme-primary-lighter: rgba(53, 117, 240, .38);
        --b3-theme-surface: #f6f6f6;
        --b3-theme-surface-lighter: #e0e0e0;
        --b3-theme-on-background: #222;
        --b3-theme-on-surface: #5f6368;
        --b3-theme-on-surface-light: rgba(95, 99, 104, .68);
        --b3-border-color: #e0e0e0;
        --b3-border-radius: 6px;
        --b3-list-hover: rgba(0, 0, 0, .075);
        --b3-dialog-shadow: 0 8px 24px rgba(0, 0, 0, .2);
        --b3-font-family: BlinkMacSystemFont, Helvetica, "PingFang SC", arial, sans-serif;
        --b3-font-family-code: "JetBrainsMono-Regular", mononoki, Consolas, "Liberation Mono", monospace;
        --b3-font-size: 14px;
        --b3-font-size-editor: 16px;
    }

    body {
        width: 640px;
        margin: 0;
        background-color: var(--b3-theme-surface);
        font-family: var(--b3-font-family);
        font-size: var(--b3-font-size);
    }

    /* 与预览图里 .b3-dialog__content 相同的内边距 */
    #mount { padding: 16px 24px; }

    .code-block { color: #24292e; background-color: #fff; }
    .hljs-keyword, .hljs-doctag, .hljs-type, .hljs-variable.language_ { color: #d73a49; }
    .hljs-title, .hljs-title.function_ { color: #6f42c1; }
    .hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-variable { color: #005cc5; }
    .hljs-string, .hljs-regexp { color: #032f62; }
    .hljs-built_in, .hljs-symbol { color: #e36209; }
    .hljs-comment { color: #6a737d; }
    .hljs-name, .hljs-quote { color: #22863a; }
</style>
</head>
<body>
<div id="mount"></div>
<script src="editor.js"></script>
</body>
</html>
`;

const ENTRY = `import {createCodeEditor} from "./src/codeEditor";

const editor = createCodeEditor({
    value: [
        "const el = document.querySelector(\\".protyle-wysiwyg\\");",
        "const text = el.innerText.replace(/\\\\s/g, \\"\\");",
        "console.log(\\"字数：\\" + text.length);",
        "return \\"统计完成\\";",
    ].join("\\n"),
});
document.getElementById("mount").append(editor.element);
`;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "siyuan-editor-snapshot-"));
let failure = "";

try {
    await build({
        stdin: {contents: ENTRY, resolveDir: root, loader: "ts", sourcefile: "snapshot-entry.ts"},
        bundle: true,
        outfile: path.join(tempDir, "editor.js"),
        format: "iife",
        target: "es2019",
        logLevel: "warning",
    });
    fs.writeFileSync(path.join(tempDir, "editor.html"), PAGE);

    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 640, height: 320}});
    await page.goto(pathToFileURL(path.join(tempDir, "editor.html")).href);
    await page.waitForTimeout(500);
    const snapshot = await page.evaluate(() => ({
        styles: Array.from(document.head.querySelectorAll("style"))
            .filter((item) => item.id !== "page-css")
            .map((item) => item.textContent.trim())
            .filter(Boolean),
        html: document.querySelector(".bis-code").outerHTML,
    }));
    await browser.close();

    let html = fs.readFileSync(previewPath, "utf8");
    const cssBlock = `${CSS_START}\n<style>\n${snapshot.styles.join("\n")}\n</style>\n${CSS_END}`;
    const domBlock = `${DOM_START}\n                ${snapshot.html}\n                ${DOM_END}`;

    if (html.includes(CSS_START)) {
        html = html.replace(new RegExp(`${escapeRegExp(CSS_START)}[\\s\\S]*?${escapeRegExp(CSS_END)}`), cssBlock);
    } else {
        const start = html.indexOf("<!-- CodeMirror 自己注入的样式");
        const end = html.indexOf("</style>", start) + "</style>".length;
        if (start < 0 || end < "</style>".length) {
            throw new Error("preview.html 里找不到 CodeMirror 样式块");
        }
        html = html.slice(0, start) + cssBlock + html.slice(end);
    }

    if (html.includes(DOM_START)) {
        html = html.replace(new RegExp(`${escapeRegExp(DOM_START)}[\\s\\S]*?${escapeRegExp(DOM_END)}`), domBlock);
    } else {
        const start = html.indexOf('                <div class="bis-code">');
        const end = html.indexOf("\n", start);
        if (start < 0 || end < 0) {
            throw new Error("preview.html 里找不到编辑器 DOM");
        }
        html = html.slice(0, start) + domBlock + html.slice(end);
    }

    fs.writeFileSync(previewPath, html);
    console.log(`assets/preview.html: 写入 ${snapshot.styles.join("").length} 字符 CSS、${snapshot.html.length} 字符 DOM`);
} catch (error) {
    failure = error.message;
} finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
}

if (failure) {
    console.error(failure);
    process.exit(1);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
