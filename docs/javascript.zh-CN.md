# 按钮块的 JavaScript 操作

按钮块可以把「点一下」变成一段 JavaScript：脚本在思源前端页面里执行，能直接调用思源给插件开放的全部接口，
也能读写内核数据。本文说明它怎么执行、能用哪些接口，并给出可以直接粘贴运行的例子。

> 对应插件版本 0.1.0；文中的接口都按思源 3.8.x 的源码核对过（`app/src/plugin/API.ts`、`kernel/api/`）。
> 例子只做「读取」或「追加」，不会删除、覆盖你的笔记。

---

## 1. 脚本是怎么执行的

- **触发时机**：点击按钮时执行。按钮上右键（桌面端）或长按（移动端）打开的是编辑窗口，不会执行脚本。
- **async 包装**：整段代码被包进一个 async 函数，所以可以直接用 `await`，也可以用 `return` 结束。
- **返回值**：`return` 的值会显示在结果弹窗的「返回值」一行（对象会被 JSON 序列化）。
- **console 输出**：`console.log / info / debug / warn / error / table / dir` 会被收集，按级别显示在弹窗里。
- **错误**：脚本里抛出的异常会显示在弹窗的「错误」一行，不会影响思源运行。
- **颜色**：输出支持 ANSI 颜色转义（见第 3 节）。
- **复制**：弹窗右下角有「复制」按钮，复制的是去掉颜色转义后的纯文本。
- **每次都重新执行**：脚本本身不保存状态，需要记住东西时用 `plugin.saveData()` 或写进笔记。

## 2. 运行环境里有什么

### 2.1 直接可用的注入接口

| 名字 | 说明 |
| --- | --- |
| `app` | 思源应用对象（`openTab` 等接口需要它） |
| `plugin` | 本插件实例，`loadData / saveData / removeData` 可以存插件私有数据 |
| `siyuan` | `window.siyuan`，配置、笔记本列表、当前语言等 |
| `Lute` | Lute 解析器（`Lute.New().Md2BlockDOM(md)` 之类） |
| `Constants` | 思源的常量表（扩展名列表、通道名等） |
| `platformUtils` | 平台工具：`copyPlainText`、`readText`、`isMac`、`openByMobile` 等 |
| `fetchPost` / `fetchSyncPost` / `fetchGet` | 内核 HTTP 接口，最常用的一个 |
| `showMessage` / `hideMessage` | 右下角提示 |
| `confirm` | 确认对话框 |
| `openInputDialog` | 让用户输入一段文本的对话框 |
| `openSetting` | 打开插件设置（思源「设置 - 集市 - 已下载」里的插件页） |
| `openTab` | 打开文档 / 资源 / 搜索 / 卡片页签 |
| `openWindow` | 桌面端新开一个窗口 |
| `openMobileFileById` | 移动端按块 ID 打开 |
| `openAssetPicker` | 资源选择框 |
| `openEmoji` | 表情/图标面板 |
| `openAttributePanel` | 块属性面板 |
| `getActiveEditor` / `getAllEditor` | 当前编辑器 / 所有编辑器实例（Protyle） |
| `getActiveTab` / `getAllTabs` / `getAllModels` / `getModelByDockType` | 页签与面板 |
| `toggleLeftDock` / `toggleRightDock` / `toggleBottomDock`、`isLeftDockVisible` / `isRightDockVisible` / `isBottomDockVisible` | 侧栏与底栏 |
| `globalCommand` / `adaptHotkey` | 快捷键与全局命令 |
| `saveExportFile` / `saveLayout` / `expandDocTree` | 导出、保存布局、展开文档树 |
| `setEditorFontSize` / `adjustEditorFontSize` | 编辑器字号 |
| `getFrontend` / `getBackend` | 当前前端（桌面/移动/浏览器）与后端平台 |
| `Dialog` / `Menu` / `Setting` / `Protyle` / `ProtyleMethod` / `Plugin` | 思源的类，可以自己弹窗口、造菜单 |
| `protyle` | **当前按钮块所在的编辑器实例**（Protyle），取不到时为 `undefined` |
| `blockID` | 当前按钮块自己的块 ID |
| `isMobile` | 是否移动端 |
| `i18n` | 本插件的文案（例如 `i18n.copied`） |

### 2.2 页面里的全局对象

脚本运行在思源页面上下文，这些全局照常可用：`window`、`document`、`fetch`、`setTimeout`、`localStorage`、
`window.siyuan`（配置、`languages` 语言包）、`window.Lute`。

### 2.3 没有注入的接口

- `exitSiYuan()`（退出思源）与 `lockScreen()`（锁屏）：故意不注入，脚本不该关掉用户的思源。
- 桌面端仍然可以通过 `window.require("electron")` 拿 Electron 模块，但移动端与浏览器前端没有它，
  写进按钮后按钮在那些平台上就会报错，不建议使用。

## 3. 输出与颜色

| console 方法 | 弹窗里的前缀 | 颜色 |
| --- | --- | --- |
| `console.log` / `console.info` | `log:` / `info:` | 正文灰 |
| `console.debug` | `debug:` | 浅灰 |
| `console.warn` | `warn:` | 思源警告色 |
| `console.error` | `error:` | 思源错误色 |
| `console.table` / `console.dir` | `table:` / `dir:` | 正文灰 |

文本里可以带 ANSI 转义序列上色（写 `\u001b`，也就是 ESC）：

| 写法 | 效果 |
| --- | --- |
| `\u001b[31m` … `\u001b[37m` | 红、绿、黄、蓝、紫、青、灰（标准 8 色） |
| `\u001b[90m` … `\u001b[97m` | 上面 8 色的亮色版 |
| `\u001b[1m` `[2m` `[3m` `[4m` `[9m` | 加粗、变淡、斜体、下划线、删除线 |
| `\u001b[38;5;<0-255>m` | 256 色（终端里的 xterm 色号） |
| `\u001b[38;2;<r>;<g>;<b>m` | 真彩色 |
| `\u001b[40m`…`[47m`、`[100m`…`[107m`、`[48;5;n`、`[48;2;r;g;b` | 背景色 |
| `\u001b[0m` | 复位 |

配色是中间色调，浅色与深色主题下都看得清；「黑/白」两档为了可读性做过调整，不完全是终端里的纯黑纯白。
复制时这些转义会被去掉。

## 4. 示例

下面的例子都可以直接粘贴到「编辑按钮块 → 按钮操作 → JavaScript」里。把块 ID、路径换成你自己的即可。

### 4.1 最小示例：返回值 + console

```javascript
console.log("按钮被点了");
return 1 + 1;   // 弹窗里会显示：返回值: 2
```

### 4.2 彩色输出

```javascript
console.log("\u001b[32m✓\u001b[0m 任务完成");
console.log("\u001b[1;33m注意\u001b[0m：这只是演示");
console.log("\u001b[38;5;208m256 色\u001b[0m 与 \u001b[38;2;10;200;30m真彩色\u001b[0m");
console.warn("warn 会自动带警告色");
console.error("error 会自动带错误色");
return "颜色演示结束";
```

### 4.3 当前文档有多少字（只读）

```javascript
const editor = protyle || getActiveEditor();
if (!editor) {
    return "没有找到打开的编辑器";
}
const response = await fetchPost("/api/block/getTreeStat", {id: editor.protyle.block.rootID});
if (response.code !== 0) {
    return `读取失败：${response.msg}`;
}
const stat = response.data.stat;
console.log(`字数 ${stat.runeCount}，词数 ${stat.wordCount}，块 ${stat.blockCount}`);
showMessage(`本文 ${stat.runeCount} 字`);
return stat.runeCount;
```

### 4.4 在当前文档末尾追加一段内容（只追加）

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "没有找到当前文档";
}
const response = await fetchPost("/api/block/appendBlock", {
    dataType: "markdown",
    data: `> 由按钮追加于 ${new Date().toLocaleString()}`,
    parentID: rootID,   // 文档本身就是父块，内容会加在它最后
});
if (response.code !== 0) {
    return `追加失败：${response.msg}`;
}
showMessage("已追加到文档末尾");
return "已追加";
```

### 4.5 查全库未完成的待办（只读）

思源把任务列表项存成 `subtype = 't'` 的块，未完成的任务 markdown 形如 `- [ ] 内容`。

```javascript
const response = await fetchPost("/api/query/sql", {
    stmt: "SELECT content, id FROM blocks WHERE subtype = 't' AND markdown LIKE '%- [ ]%' ORDER BY updated DESC LIMIT 10",
});
if (response.code !== 0) {
    return `查询失败：${response.msg}`;
}
console.log(`未完成的待办：${response.data.length} 条`);
response.data.forEach((row, index) => console.log(`${index + 1}. ${row.content}`));
return response.data.length;
```

### 4.6 新建一篇文档并打开

`createDocWithMd` 不会覆盖同名文档，路径带时间戳最稳妥。

```javascript
const notebooks = await fetchPost("/api/notebook/lsNotebooks", {});
const notebook = notebooks.data?.notebooks?.find((item) => item && !item.closed);
if (!notebook) {
    return "没有打开的笔记本";
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const title = `按钮创建的文档 ${stamp}`;
const response = await fetchPost("/api/filetree/createDocWithMd", {
    notebook: notebook.id,
    path: `/${title}`,
    markdown: `# ${title}\n\n由按钮块创建。\n`,
});
if (response.code !== 0) {
    return `创建失败：${response.msg}`;
}
openTab({app, doc: {id: response.data}});
return response.data;
```

### 4.7 打开一个块

```javascript
// 换成你自己的块 ID（右键块 → 复制 → 复制块 ID）
openTab({app, doc: {id: "20240101000000-abcdefg"}});
return "已打开";
```

### 4.8 复制文档 Markdown 到剪贴板

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "没有找到当前文档";
}
const response = await fetchPost("/api/export/exportMdContent", {id: rootID});
platformUtils.copyPlainText(response.data.content);
showMessage(`已复制 ${response.data.hPath}（${response.data.content.length} 字符）`);
return "已复制";
```

### 4.9 给当前文档加一个自定义属性

```javascript
const editor = protyle || getActiveEditor();
const rootID = editor?.protyle?.block?.rootID;
if (!rootID) {
    return "没有找到当前文档";
}
const response = await fetchPost("/api/attr/setBlockAttrs", {
    id: rootID,
    attrs: {"custom-last-button-click": new Date().toISOString()},
});
return response.code === 0 ? "已记录点击时间" : `失败：${response.msg}`;
```

### 4.10 调用内核接口并处理错误

`fetchPost` 返回内核响应，`code` 为 `0` 才是成功；网络或权限问题会抛出异常，用 `try / catch` 包一下最稳。

```javascript
try {
    const response = await fetchPost("/api/block/getBlockInfo", {id: blockID});
    if (response.code !== 0) {
        showMessage(response.msg || "读取失败", 7000, "error");
        return "读取失败";
    }
    console.log("所在文档：", response.data.rootTitle);
    return response.data.rootTitle;
} catch (error) {
    console.error("接口调用异常", error);
    return `异常：${error.message}`;
}
```

### 4.11 请求网络接口

桌面端主窗口关闭了同源限制，跨域请求也能直接发；失败时错误会显示在弹窗里。

```javascript
try {
    const response = await fetch("https://api.github.com/repos/siyuan-note/siyuan");
    const data = await response.json();
    showMessage(`思源仓库 star：${data.stargazers_count}`);
    return data.stargazers_count;
} catch (error) {
    console.error("请求失败", error);
    return `请求失败：${error.message}`;
}
```

### 4.12 记住点击次数（插件私有数据）

```javascript
const count = (await plugin.loadData("click-count")) || 0;
const next = count + 1;
await plugin.saveData("click-count", next);
showMessage(`这个按钮被点了 ${next} 次`);
return next;
```

### 4.13 弹一个自己的窗口

```javascript
const dialog = new Dialog({
    title: "由按钮弹出的窗口",
    width: "min(560px, 92vw)",
    content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">这里是脚本自己造的界面，用的是思源自己的样式类。</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--text" data-role="close">关闭</button>
</div>`,
});
dialog.element.querySelector('[data-role="close"]').addEventListener("click", () => dialog.destroy());
return "已弹出";
```

### 4.14 让用户输入后再跳转

```javascript
openInputDialog({
    title: "打开块",
    label: "块 ID",
    value: blockID,
    onConfirm: (value) => {
        const id = value.trim();
        if (!id) {
            showMessage("块 ID 不能为空");
            return;
        }
        openTab({app, doc: {id}});
    },
});
return "等待输入";
```

## 5. 注意事项

- **写操作要幂等**：按钮每次点击都会执行，追加内容、新建文档之类的操作最好带上时间戳或先判断。
- **只读状态**：发布服务、只读模式的文档里，写接口会被内核拒绝（`code` 非 0，提示「只读」）；
  可以先看 `window.siyuan.config.readonly` 或 `protyle.disabled`。
- **移动端差异**：`getActiveTab`、`getAllModels`、`getAllTabs` 只在桌面端存在（移动端为 `undefined`）；
  依赖 Electron 的写法在移动端与浏览器前端一律不可用。
- **不要做破坏性操作**：脚本可以直接调用 `/api/block/deleteBlock`、`/api/filetree/removeDoc` 之类的接口，
  但一旦点错就无法撤销。本文的例子都只读或只追加。
- **调试**：脚本里的 `console` 输出会被弹窗收走（不会留在开发者工具里）；想同时看开发者工具，
  可以写 `window.console.log` 之外的通道，例如 `showMessage`，或临时用 `debugger` 断点。

## 6. 相关源码

- 本插件：`src/scriptApi.ts`（注入清单）、`src/scriptRunner.ts`（执行与 console 捕获）、
  `src/scriptOutput.ts`（结果弹窗、ANSI 颜色、复制）。
- 思源：`app/src/plugin/API.ts`（插件 API 全集，本插件按它注入）、`app/src/util/fetch.ts`（`fetchPost`）、
  `kernel/api/`（各 HTTP 接口的实现）、`app/src/menus/index.ts`（输入框的原生右键菜单）。
