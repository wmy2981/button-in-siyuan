// 把 dist/ 压成包根的 package.zip：集市要的是扁平布局（plugin.json、index.js 直接在 zip 根），
// 所以条目名取 dist/ 内部的相对路径，不带 dist/ 前缀。
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import yazl from "yazl";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const zipPath = path.join(root, "package.zip");

const files = [];
const walk = (dir) => {
    fs.readdirSync(dir, {withFileTypes: true}).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full);
        } else {
            files.push(full);
        }
    });
};
walk(dist);

const zipFile = new yazl.ZipFile();
files.forEach((file) => {
    zipFile.addFile(file, path.relative(dist, file).split(path.sep).join("/"));
});
zipFile.end();

await new Promise((resolve, reject) => {
    zipFile.outputStream
        .pipe(fs.createWriteStream(zipPath))
        .on("close", resolve)
        .on("error", reject);
});
console.log(`package.zip: ${files.length} files, ${Math.round(fs.statSync(zipPath).size / 1024)} KiB`);
