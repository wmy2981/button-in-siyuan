// 从 src/buttonIcon.ts 生成集市要求的插件图标：assets/icon.svg（图形源码）+ assets/icon.png。
//
// 图形只写在 src/buttonIcon.ts 一处：斜杠菜单里的按钮块图标用的是同一份图形，改一处两边都变。
//
// 尺寸与体积上限取自 plugin-sample/README.md 的 icon 字段说明（建议尺寸 160*160，
// 支持 PNG/JPEG/WebP/AVIF，上限 64KiB）。生成后按这两个数复核，越界直接失败，
// 避免超标的图被塞进 package.zip 才发现。
//
// 先按 4 倍密度栅格化再缩放，边缘比直接栅格化到目标尺寸更锐利。
import {build} from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import sharp from "sharp";

const SIZE = 160;
const MAX_BYTES = 64 * 1024;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const source = path.join(assets, "icon.svg");
const target = path.join(assets, "icon.png");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "siyuan-icon-"));
try {
    // 直接把 src/buttonIcon.ts 打包成可 import 的模块，取它生成的 SVG 源码
    const bundlePath = path.join(tempDir, "buttonIcon.mjs");
    await build({
        entryPoints: [path.join(root, "src", "buttonIcon.ts")],
        bundle: true,
        outfile: bundlePath,
        format: "esm",
        target: "es2019",
        logLevel: "warning",
    });
    const {BUTTON_ICON_SVG} = await import(pathToFileURL(bundlePath).href);
    if (typeof BUTTON_ICON_SVG !== "string" || !BUTTON_ICON_SVG.includes("<svg")) {
        throw new Error("src/buttonIcon.ts 没有导出可用的 BUTTON_ICON_SVG");
    }
    fs.writeFileSync(source, BUTTON_ICON_SVG);
} finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
}

await sharp(fs.readFileSync(source), {density: 384})
    .resize(SIZE, SIZE)
    .png({compressionLevel: 9})
    .toFile(target);

const {width, height} = await sharp(target).metadata();
if (width !== SIZE || height !== SIZE) {
    console.error(`assets/icon.png is ${width}x${height}, expected ${SIZE}x${SIZE}`);
    process.exit(1);
}

const bytes = fs.statSync(target).size;
if (bytes > MAX_BYTES) {
    console.error(`assets/icon.png is ${bytes} bytes, over the marketplace limit of ${MAX_BYTES}`);
    process.exit(1);
}

console.log(`assets/icon.svg + icon.png done: ${bytes} bytes (${SIZE}x${SIZE}, limit ${MAX_BYTES})`);
