import {cpSync, readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {Plugin} from "vite";
import {defineConfig} from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

/** 生产包在 index.js 顶部带一份许可证。 */
const licenseBanner = `/*!\n${readFileSync(path.join(root, "LICENSE"), "utf8").trim().split("\n").map((line) => ` * ${line}`).join("\n")}\n */`;

/**
 * 把 `docs/*.md` 当作字符串导入。文档在构建时内嵌进 index.js（插件运行时装不到仓库里的原始文件），
 * Vite 默认会把 `.md` 当静态资源返回 URL，这里按源码字符串处理。
 * vitest.config.mts 里有一份同样的实现：测试跑在不加载本配置的环境里。
 */
const markdownAsSource: Plugin = {
    name: "markdown-as-source",
    enforce: "pre",
    load(id) {
        const file = id.split("?")[0];
        if (file.endsWith(".md")) {
            return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
        }
    },
};

/**
 * 打包后落在包根、但 Vite 不管的文件。
 * 素材放在源码的 assets/ 下，打包后落到包根：集市只认包根的 icon.png / preview.png。
 */
const packageFiles = (outDir: string, production: boolean): Plugin => ({
    name: "siyuan-package-files",
    // 压缩会把 output.banner 一起丢掉，所以许可证在这里补进入口 chunk
    generateBundle(_options, bundle) {
        if (!production) {
            return;
        }
        Object.values(bundle).forEach((chunk) => {
            if (chunk.type === "chunk" && chunk.isEntry) {
                chunk.code = `${licenseBanner}\n${chunk.code}`;
            }
        });
    },
    writeBundle() {
        const target = path.join(root, outDir);
        // 插件从包内的 i18n/ 读文案，开发模式也要跟着更新
        cpSync(path.join(root, "src/i18n"), path.join(target, "i18n"), {recursive: true});
        if (!production) {
            return;
        }
        ["plugin.json", "README.md", "README.zh-CN.md", "assets/icon.png", "assets/preview.png"].forEach((file) => {
            cpSync(path.join(root, file), path.join(target, path.basename(file)));
        });
        // 文档同时打进包里（index.js 里已经内嵌了一份，这里是给用户直接翻阅的原文件）
        // docs/development.md 只是仓库内部的开发说明，不随包发布给用户
        cpSync(path.join(root, "docs"), path.join(target, "docs"), {
            recursive: true,
            filter: (source) => path.basename(source) !== "development.md",
        });
    },
});

export default defineConfig(({mode}) => {
    // dev 是 watch 构建，只写仓库根的 index.js / index.css / i18n/，供本机插件目录直接加载；build 才写 dist/
    const production = mode === "production";
    const outDir = production ? "dist" : ".";
    return {
        plugins: [markdownAsSource, packageFiles(outDir, production)],
        // 插件不是站点，没有 public/ 目录
        publicDir: false,
        build: {
            outDir,
            // 开发模式输出到仓库根，根目录当然不能清空
            emptyOutDir: production,
            target: "es2019",
            minify: production ? "esbuild" : false,
            sourcemap: production ? false : "inline",
            lib: {
                entry: path.join(root, "src/index.ts"),
                // 思源会包装并 eval index.js，必须是 CommonJS
                formats: ["cjs"],
                fileName: () => "index.js",
                cssFileName: "index",
            },
            rollupOptions: {
                // siyuan 由宿主注入，绝不打包
                external: ["siyuan"],
            },
        },
    };
});
