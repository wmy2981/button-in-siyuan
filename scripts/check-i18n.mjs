// 校验 i18n 覆盖：src/i18nKeys.ts 里的键类型、src/i18n/*.json 的键必须完全一致，且不能有空文案。
//
// 思源只会加载当前语言的那一份文案文件（缺失时按 en、zh-CN 依次回落），所以任何一份缺键都会在
// 某个语言下显示成空字符串；加了键忘了补另一份文件，这个脚本会直接失败。
//
// 用法：node scripts/check-i18n.mjs（已挂在 npm run check 上）
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const keysPath = path.join(root, "src", "i18nKeys.ts");
const i18nDir = path.join(root, "src", "i18n");

const typeKeys = Array.from(
    fs.readFileSync(keysPath, "utf8").matchAll(/^\s{4}(\w+):\s*string;/gm),
    (match) => match[1],
);
if (typeKeys.length === 0) {
    console.error("src/i18nKeys.ts 里没有解析到任何文案键");
    process.exit(1);
}

const files = fs.readdirSync(i18nDir).filter((name) => name.endsWith(".json")).sort();
if (files.length === 0) {
    console.error("src/i18n/ 下没有文案文件");
    process.exit(1);
}

const problems = [];
const typeKeySet = new Set(typeKeys);
files.forEach((name) => {
    const values = JSON.parse(fs.readFileSync(path.join(i18nDir, name), "utf8"));
    const keys = Object.keys(values);
    const missing = typeKeys.filter((key) => !(key in values));
    const extra = keys.filter((key) => !typeKeySet.has(key));
    const empty = keys.filter((key) => typeof values[key] !== "string" || !values[key].trim());
    if (missing.length) {
        problems.push(`${name}: 缺少 ${missing.length} 个键 → ${missing.join(", ")}`);
    }
    if (extra.length) {
        problems.push(`${name}: 多出 ${extra.length} 个 src/i18nKeys.ts 里没有的键 → ${extra.join(", ")}`);
    }
    if (empty.length) {
        problems.push(`${name}: 空文案 → ${empty.join(", ")}`);
    }
    console.log(`${name}: ${keys.length} 个键`);
});

if (problems.length) {
    problems.forEach((problem) => console.error(problem));
    process.exit(1);
}
console.log(`i18n 覆盖完整：${typeKeys.length} 个键 × ${files.length} 份文案`);
