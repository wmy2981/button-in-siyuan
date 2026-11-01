import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * 把 `docs/*.md` 当作字符串导入。webpack 用 `asset/source` 内嵌这些文件（见 docs/development.md），
 * Vite 默认会把 `.md` 当静态资源返回 URL，两者不一致，所以在这里按同样的语义处理。
 */
const markdownAsSource = {
    name: "markdown-as-source",
    enforce: "pre" as const,
    load(id: string) {
        const file = id.split("?")[0];
        if (file.endsWith(".md")) {
            return `export default ${JSON.stringify(fs.readFileSync(file, "utf8"))};`;
        }
    },
};

export default defineConfig({
    plugins: [markdownAsSource],
    resolve: {
        alias: {
            // 宿主的插件 API 只存在于思源页面里，测试统一换成一份可控的替身
            siyuan: path.join(root, "tests", "mocks", "siyuan.ts"),
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: [path.join(root, "tests", "setup.ts")],
        include: ["tests/**/*.test.ts"],
        clearMocks: true,
        unstubGlobals: true,
    },
});
