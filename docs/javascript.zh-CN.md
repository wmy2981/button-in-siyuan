# 按钮块的 JavaScript 操作

按钮块运行一段 JavaScript：脚本在思源前端页面里执行，能直接调用思源开放给插件（petal）的全部接口，
也能读写内核数据。第 1 节说明它怎么执行，**第 2 节是注入接口的完整清单**（写脚本时照这里查），
第 4 节只保留少量完整示例。

---

## 1. 脚本是怎么执行的

- **触发时机**：点击按钮时执行。
- **代码从哪来**：代码直接写在按钮里，或让按钮操作指向「JavaScript 文件」（`assets/` 下的本地文件，
  或 http(s) 地址）。后一种每次点击都会重新读文件（云端地址则重新下载），所以改文件就等于改按钮的行为。
- **async 包装**：整段代码被包进一个 async 函数，所以可以直接用 `await`，也可以用 `return` 结束。
- **返回值**：`return` 的值显示在结果弹窗的「返回值」一行（对象会被 JSON 序列化）。
- **弹窗**：没有 `return`、没有 `console` 输出、也没有报错时**不弹结果弹窗**（静默执行）；什么时候弹由
  插件设置里的「JavaScript 输出弹窗」决定，可选值与默认值见第 5 节。
- **console 输出**：`console.log / info / debug / warn / error / table / dir` 会被收集，按级别显示在弹窗里。
- **错误**：脚本里抛出的异常会显示在弹窗的「错误」一行，不会影响思源运行。
- **颜色**：输出支持 ANSI 颜色转义，见第 3 节。
- **每次都重新执行**：脚本本身不保存状态，需要记住东西时用 `plugin.saveData()` 或写进笔记。
- **调用内核接口**：`const response = await fetchPost("/api/…", {…})`，响应的 `code` 为 `0` 才算成功。

## 2. 注入接口清单

脚本被包成「以这些名字为形参」的 async 函数，所以下表中的名字在脚本里**直接可写**；
没有列在这里的思源接口，脚本拿不到。签名与思源 `petal`（插件 API 声明）及宿主实现一致；
标注「桌面端」的接口只在桌面端可用：`getActiveTab` / `getAllModels` / `getAllTabs` 在移动端不存在
（值为 `undefined`，调用会报错），§2.4 的停靠栏接口则是空实现（返回 `false`）。

### 2.1 内核 HTTP 接口

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `fetchPost` | `fetchPost(url, data?, cb?, headers?)` | 最常用的一个。不传 `cb` 时可以直接 `await` 到内核响应；传了 `cb` 就完全按思源原本的回调方式走 |
| `fetchSyncPost` | `fetchSyncPost(url, data?, headers?)` | 用同步 XHR 发 POST，直接拿到内核响应 |
| `fetchGet` | `fetchGet(url, cb?)` | GET；不传 `cb` 时同样可以 `await`，响应是 JSON 就给对象，否则给文本 |

响应结构是 `{code, msg, data}`。`fetchPost` / `fetchGet` 在思源里是回调式的，本插件把「不传回调」的写法
补成可 `await`（见第 5 节），所以两种写法都能用。

### 2.2 提示、确认与对话框

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `showMessage` | `showMessage(text, timeout?, type?, id?)` | 思源原生 Toast；`type` 取 `"info"` 或 `"error"`，`timeout` 为毫秒；运行时会返回这条消息的 id（petal 声明里写的是 `void`） |
| `hideMessage` | `hideMessage(id?)` | 收起 Toast；传 `id` 只收起对应那条 |
| `confirm` | `confirm(title, text, onConfirm?, onCancel?)` | 确认对话框，两个回调都会收到 `Dialog` 实例 |
| `openInputDialog` | `openInputDialog({title, value, label?, type?, multiline?, placeholder?, maxLength?, actions?, onConfirm, …})` | 让用户输入一段文本；`onConfirm(value, dialog)` 拿到输入值 |
| `Dialog` | 类 | 自己弹窗口：`new Dialog({title, width, content})`，用 `dialog.element` 拿 DOM、`dialog.destroy()` 关闭 |
| `Menu` | 类 | 自己造菜单：`new Menu()`、`menu.addItem({...})`、`menu.open({x, y})` |
| `Setting` | 类 | 思源的设置面板组件（本插件自己的设置面板就是用它搭的） |
| `openSetting` | `openSetting(app)` | 打开思源「设置」对话框（默认停在「编辑器」页）。要打开**本插件**的设置面板，用 `plugin.openSetting()` |
| `openEmoji` | `openEmoji({position, selectedCB?, …})` | 表情/图标面板，`selectedCB(emoji)` 拿到选中的图标 |
| `openAssetPicker` | `openAssetPicker({exts?, match?})` | 资源选择器；选中后 Promise 给 `{path}`（`assets/` 相对路径），取消为 `null` |
| `openAttributePanel` | `openAttributePanel({data?, nodeElement?, focusName, protyle?})` | 打开块属性面板；`data` 与 `nodeElement` 二选一，`focusName` 决定聚焦哪个字段 |

### 2.3 页签、窗口与布局

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `openTab` | `openTab({app, doc?, asset?, pdf?, search?, card?, custom?, position?, keepCursor?, removeCurrentTab?, afterOpen?})` | 打开文档 / 资源 / PDF / 搜索 / 卡片 / 自定义页签；`position` 取 `"right"` 或 `"bottom"` |
| `openWindow` | `openWindow({doc?, position?, width?, height?, alwaysOnTop?, tab?})` | 桌面端新开一个窗口；移动端不生效 |
| `openMobileFileById` | `openMobileFileById(app, id, action?)` | 移动端按块 ID 打开文档 |
| `getActiveEditor` | `getActiveEditor(wndActive?)` | 当前编辑器实例（Protyle） |
| `getActiveTab` | `getActiveTab(wndActive?)` | 当前页签（Tab）｜桌面端 |
| `getAllEditor` | `getAllEditor()` | 所有编辑器实例（含搜索、反链、自定义页签里的编辑器） |
| `getAllTabs` | `getAllTabs(type?)` | 所有页签；传 `type` 只取某一类（`"Editor"`、`"Search"`、自定义页签的类型名…）｜桌面端 |
| `getAllModels` | `getAllModels()` | 按类型分组的所有页签模型（`editor` / `search` / `backlink` / `custom` …）｜桌面端 |
| `getModelByDockType` | `getModelByDockType(type)` | 按类型取停靠栏实例（`"file"`、`"outline"`，插件停靠栏则是 `<插件名><类型>`） |
| `saveLayout` | `saveLayout(cb)` | 保存当前布局；`cb` 在保存完成后调用 |

### 2.4 侧栏与文档树

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `toggleLeftDock` / `toggleRightDock` / `toggleBottomDock` | `toggleXxxDock(visible?)` | 显示 / 隐藏 / 切换整条侧栏；不传 `visible` 就是切换，返回该组是否有活动工具｜桌面端 |
| `isLeftDockVisible` / `isRightDockVisible` / `isBottomDockVisible` | `isXxxDockVisible()` | 该侧栏当前是否可见｜桌面端 |
| `expandDocTree` | `expandDocTree({id, isSetCurrent?})` | 在文档树里展开并定位（笔记本 ID 或文档 ID），桌面端与移动端都可用 |

### 2.5 编辑器、快捷键与导出

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `setEditorFontSize` | `setEditorFontSize(fontSize, options?)` | 直接设置编辑器字号，返回生效后的字号 |
| `adjustEditorFontSize` | `adjustEditorFontSize(action, options?)` | 按动作调整字号（放大 / 缩小 / 复位），返回生效后的字号 |
| `globalCommand` | `globalCommand(command, app)` | 执行一个全局命令，命令名与思源快捷键表里的名字一致（`globalSearch`、`recentDocs`、`fileTree`…）；不同前端支持的命令集合不同 |
| `adaptHotkey` | `adaptHotkey(hotkey)` | 把 `Ctrl+…` 之类的快捷键文本适配成当前平台（macOS 会变成 `⌘`） |
| `saveExportFile` | `saveExportFile(uri, msgId?)` | 把内核导出的文件（`/api/export/*` 返回的路径）交给用户保存 |

### 2.6 运行平台

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `getFrontend` | `getFrontend()` | `"desktop"` / `"desktop-window"` / `"mobile"` / `"browser-desktop"` / `"browser-mobile"` |
| `getBackend` | `getBackend()` | `"windows"` / `"linux"` / `"darwin"` / `"docker"` / `"android"` / `"ios"` / `"harmony"` |

### 2.7 退出与锁屏（慎用）

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `exitSiYuan` | `exitSiYuan(setCurrentWorkspace?)` | 退出思源：桌面端先把所有窗口与工作区落盘再调 `/api/system/exit`；落盘失败或还有待安装的更新包时只弹提示 / 确认，不会直接退出。`setCurrentWorkspace` 默认 `true`，表示记住当前工作区 |
| `lockScreen` | `lockScreen()` | 锁屏：保存布局后登出鉴权（回到锁屏 / 登录界面）。只读模式与发布服务下直接返回，什么都不做；实现不取参数 |

这两项操作用户立刻可见且不可撤销，脚本里应当先 `confirm(...)` 再调用，示例见 4.6。

### 2.8 宿主的对象、类与常量

| 名字 | 说明 |
| --- | --- |
| `app` | 思源应用对象；`openTab`、`openWindow`、`openSetting` 等接口需要它 |
| `plugin` | 本插件实例：`loadData / saveData / removeData`、`getSecret / getVariable`、`openSetting()`、`eventBus`、`name` 等，见 2.10 |
| `siyuan` | `window.siyuan`：配置、笔记本列表、当前语言等 |
| `Lute` | Lute 解析器（`Lute.New().Md2BlockDOM(md)` 之类） |
| `Constants` | 思源的常量表（扩展名列表、通道名等） |
| `platformUtils` | 平台工具：`copyPlainText` / `writeText` / `readText`、`getStorageVal` / `setStorageVal` / `getLocalStorage`、`isMac` / `isIPhone` / `isIPad` / `isInIOS` / `isInAndroid` / `isHuawei` / `isOnlyMeta` / `isNotCtrl`、`openByMobile`、`sendNotification` / `cancelNotification`、`updateHotkeyTip`、`getEventName` |
| `Protyle` / `ProtyleMethod` / `Plugin` | 思源的类：自己造编辑器、调用渲染方法、构造插件对象 |

### 2.9 本次点击的上下文（本插件注入）

| 名字 | 说明 |
| --- | --- |
| `protyle` | **当前按钮块所在的编辑器实例**（Protyle），取不到时为 `undefined` |
| `blockID` | 当前按钮块自己的块 ID |
| `isMobile` | 是否移动端 |
| `i18n` | 本插件的文案（例如 `i18n.copied`） |

### 2.10 插件实例上还能用的（`plugin.`）

- **存储**：`plugin.saveData(name, value)` / `plugin.loadData(name)` / `plugin.removeData(name)`，落在
  `/data/storage/petal/button-in-siyuan/`；名字可以带子目录，但不能用 `..` 穿越出去。
- **密钥与变量**：`plugin.getSecret(name)` / `plugin.getVariable(name)`，见 4.5。
- **设置面板**：`plugin.openSetting()` 打开本插件自己的设置面板。
- **身份与事件**：`plugin.name` / `plugin.displayName` / `plugin.i18n` / `plugin.app`；
  `plugin.eventBus.on / once / off / emit(...)`。
- **注册信息**：`plugin.models` / `plugin.docks` / `plugin.commands` / `plugin.getOpenedTab()`。
- **注册接口**（`addTab` / `addDock` / `addCommand` / `addTopBar` 之类）：注册出来的 UI 要等插件卸载才会消失，
  按钮脚本不该调用它们；要常驻的入口请在插件自己的 `onload` 里注册。

### 2.11 页面全局与没有契约的对象

脚本运行在思源页面上下文，`window`、`document`、`fetch`、`setTimeout`、`localStorage`、`window.siyuan`、
`window.Lute` 照常可用。

`window.siyuan.layout`、`app.plugins`、`window.require("electron")` 这些是思源的内部实现，不是插件 API：
能拿到，但没有版本契约，思源升级后可能变化。其中 `app.plugins` 是当前窗口已加载的插件实例数组，
跨插件操作（打开别的插件的设置窗口、自定义页签、停靠栏）主要靠它；`window.require("electron")`
只在桌面端存在，移动端与浏览器前端没有它。

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
| `\u001b[1m` `[2m` `[3m` `[4m` `[7m` `[9m` | 加粗、变淡、斜体、下划线、反显、删除线 |
| `\u001b[38;5;<0-255>m` | 256 色（终端里的 xterm 色号） |
| `\u001b[38;2;<r>;<g>;<b>m` | 真彩色 |
| `\u001b[40m`…`[47m`、`[100m`…`[107m`、`[48;5;n`、`[48;2;r;g;b` | 背景色 |
| `\u001b[0m` | 复位（`[22m` / `[23m` / `[24m` / `[27m` / `[29m` 分别复位对应属性，`[39m` / `[49m` 复位前景 / 背景色） |

配色是中间色调，浅色与深色主题下都看得清；「黑/白」两档为了可读性做过调整，不完全是终端里的纯黑纯白。
弹窗里的「复制」按钮复制的是去掉颜色转义后的纯文本。

## 4. 示例

下面的例子都可以直接粘贴到「编辑按钮块 → 按钮操作 → JavaScript」里。把块 ID、路径换成你自己的即可。

### 4.1 最小示例：返回值 + console

```javascript
console.log("按钮被点了");
return 1 + 1;   // 弹窗里会显示：返回值: 2
```

### 4.2 调用内核接口并处理错误

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

### 4.3 在当前文档末尾追加一段内容

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

### 4.4 记住点击次数（插件私有数据）

```javascript
// 存成对象：插件存储文件没有扩展名，内核按内容猜 Content-Type，只有 `{…}` / `[…]` 会被当成
// application/json 解析回对象；存裸数字会被当成文本，loadData 拿回来的是字符串（"1" + 1 = "11"）。
const saved = (await plugin.loadData("click-count")) || {};
const next = (Number(saved.count) || 0) + 1;
await plugin.saveData("click-count", {count: next});
showMessage(`这个按钮被点了 ${next} 次`);
return next;
```

### 4.5 读取思源的密钥与变量

<kbd>设置</kbd> > <kbd>密钥和变量</kbd> 里的条目可以直接读：`plugin.getSecret(name)` 与
`plugin.getVariable(name)` 返回对应值，名字没配置、或者当前不是管理员角色时返回空字符串。密钥在内核侧
加密存储，但前端收到的是明文，所以脚本拿到后可以发往任意地址 —— 密钥的「允许主机」只约束内核自己
发出的 HTTP 请求。

```javascript
const token = plugin.getSecret("api_token");
const host = plugin.getVariable("api_host");
if (!token || !host) {
    return "请先在 设置 - 密钥和变量 里配置 api_token 与 api_host";
}
const response = await fetch(`https://${host}/ping`, {headers: {Authorization: `Bearer ${token}`}});
return response.status;
```

### 4.6 退出思源或锁屏

两个操作都不可撤销，先用 `confirm` 问一句：

```javascript
confirm("退出思源？", "未保存的输入可能丢失。", () => exitSiYuan());
// 锁屏同理：confirm("锁屏？", "", () => lockScreen());
return "等待确认";
```

## 5. 注意事项

- **写操作要幂等**：按钮每次点击都会执行，追加内容、新建文档之类的操作最好带上时间戳或先判断。
- **`exitSiYuan` / `lockScreen` 不可逆**：退出思源会打断用户正在做的事，锁屏会要求重新输入密码（设了访问
  授权码时），脚本里务必先 `confirm`。只读模式与发布服务下 `lockScreen` 什么也不做，`exitSiYuan` 仍会尝试退出。
- **弹窗策略**：插件设置里的「JavaScript 输出弹窗」默认是 `有输出时显示` —— 有 console 输出、有返回值或报错才弹；
  其余选项是 `总是显示`、`仅 console 输出时显示`、`警告时显示（也包含错误）`、`错误时显示`、`始终不显示`，
  它们只决定要不要弹窗，不影响脚本是否执行。
- **`fetchPost` 的两种写法**：`await fetchPost(url, data)` 拿响应；`fetchPost(url, data, cb)` 与思源原生一致，
  走回调。回调只在 `code >= 0` 时才会被调用（思源内部对 `code < 0` 只弹个提示就结束），想自己处理错误响应
  就用 `await` 的写法。
- **只读状态**：发布服务、只读模式的文档里，写接口会被内核拒绝（`code` 非 0，提示「只读」）；
  可以先看 `window.siyuan.config.readonly` 或 `protyle.disabled`。
- **跨域请求**：桌面端连本地内核时主窗口关闭了同源限制，可以直接 `fetch("https://…")`；连接远程内核时
  同源限制照常生效，需要目标站点允许。
- **移动端差异**：`openTab`、`openWindow` 在移动端是空实现；`getActiveTab`、`getAllModels`、`getAllTabs`
  只在桌面端存在（移动端为 `undefined`），§2.4 的停靠栏接口在移动端是空实现（返回 `false`）。
  依赖 Electron 的写法在移动端与浏览器前端一律不可用。
- **`plugin.loadData` 拿到的未必是对象**：插件存储文件没有扩展名，内核按内容嗅探 Content-Type
  （`kernel/api/file.go` 的 `getFile`：先用扩展名，取不到再用 `mimetype.Detect` 猜），只有 `{…}` 或 `[…]`
  会被当成 `application/json` 解析回对象/数组；存裸数字、裸字符串、`true` 会被当成文本，`loadData` 回来的是
  **字符串** —— `"1" + 1` 得到 `"11"`，计数就会变成 1、11、111…。插件私有数据统一存成对象（`{count: next}`），
  或自己用 `Number()` / `JSON.parse()` 兜底。
- **破坏性操作**：脚本可以直接调用 `/api/block/deleteBlock`、`/api/filetree/removeDoc` 之类的接口，
  一旦点错就无法撤销，需谨慎编写。
- **调试**：脚本里的 `console` 输出会被弹窗收走（不会留在开发者工具里）；想同时看开发者工具，
  可以写 `window.console.log` 之外的通道，例如 `showMessage`，或临时用 `debugger` 断点。
