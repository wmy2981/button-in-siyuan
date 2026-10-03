# 按钮块的 JavaScript 操作

按钮块运行一段 JavaScript，脚本在思源前端页面里执行，能调用思源开放给插件（petal）的全部接口。
第 1 节说明它怎么执行，**第 2 节是注入接口的完整清单**，第 3 节包含少量完整示例。

---

## 1. 脚本是怎么执行的

- **触发时机**：点击按钮时执行。
- **代码从哪来**：直接写在按钮里，或让按钮操作指向「JavaScript 文件」（`assets/` 下的本地文件，或 http(s) 地址）；
  后者每次点击都重新读文件，改文件就等于改按钮行为。
- **async 包装**：整段代码被包进 async 函数，可以直接 `await`，也可以用 `return` 结束。
- **输出**：`return` 的值、`console.log / info / debug / warn / error / table / dir` 的输出和抛出的错误都显示在结果弹窗里，
  弹窗可一键复制纯文本；三者都没有时**不弹窗**（静默执行）。弹窗时机见第 4 节。另外还有两条通道 ——
  Toast（`showMessage`，见 2.2）和自己建的窗口（见 3.7）—— 一个按钮该用哪条是逐按钮的决定：结果弹窗用来
  一次看全，Toast 适合长期留在笔记里的按钮，窗口用于点击后还得先问点什么的情况。
- **每次都重新执行**：脚本不保存状态，要记住东西用 `plugin.saveData()` 或写进笔记。
- **调用内核接口**：`const response = await fetchPost("/api/…", {…})`，响应的 `code` 为 `0` 才算成功。

## 2. 注入接口清单

这些名字被注入成 async 函数的形参，脚本里直接可写；没列出的思源接口拿不到。签名与思源 `petal`（插件 API
声明）及宿主实现一致；标「桌面端」的只在桌面端可用 —— `getActiveTab` / `getAllModels` / `getAllTabs`
在移动端不存在（值为 `undefined`），§2.4 的停靠栏接口返回 `false`。

### 2.1 内核 HTTP 接口

下面三个函数是调用方式。**端点目录不在本文维护**：思源提供的每条路由都注册在内核的 `kernel/api/router.go`，
其中契约稳定的一批写在它的 `docs/API.zh-CN.md` 里。要查某个端点，读这两份 —— 插件会把链接里的标签换成你
正在用的思源版本，所以它们描述的就是本机这一版：

| 要查什么 | 读哪份 |
| --- | --- |
| 端点的路径、参数与返回体 | `https://gcore.jsdelivr.net/gh/siyuan-note/siyuan@{{siyuan-ref}}/docs/API.zh-CN.md` |
| 某条路由是否存在、用什么方法、挂了哪些中间件 | `https://gcore.jsdelivr.net/gh/siyuan-note/siyuan@{{siyuan-ref}}/kernel/api/router.go` |

jsdelivr CDN连不上或取不到文件时，改用 GitHub 原文件地址：`https://raw.githubusercontent.com/siyuan-note/siyuan/{{siyuan-ref}}/`，路径其余部分不变。

用 `http_request` 工具取：`action` 是 HTTP 方法、`url` 是地址，单纯读取就是
`http_request(action: "get", url: "…")`。

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `fetchPost` | `fetchPost(url, data?, cb?, headers?)` | 不传 `cb` 时可 `await` 到内核响应，传了就按思源原本的回调方式走 |
| `fetchSyncPost` | `fetchSyncPost(url, data?, headers?)` | 同步 XHR，直接返回内核响应 |
| `fetchGet` | `fetchGet(url, cb?)` | GET，不传 `cb` 时同样可 `await` |

响应是 `{code, msg, data}`，`code` 为 `0` 才算成功。

### 2.2 提示、确认与对话框

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `showMessage` | `showMessage(text, timeout?, type?, id?)` | 原生 Toast；`type` 取 `"info"` 或 `"error"`，返回消息 id |
| `hideMessage` | `hideMessage(id?)` | 收起 Toast |
| `confirm` | `confirm(title, text, onConfirm?, onCancel?)` | 确认对话框 |
| `openInputDialog` | `openInputDialog({title, value, label?, type?, onConfirm, …})` | 让用户输入一段文本 |
| `Dialog` | 类 | 自建窗口：`new Dialog({title, width, content})`，用 `dialog.element` 取 DOM |
| `Menu` | 类 | 自建菜单：`new Menu()`、`menu.addItem({...})`、`menu.open({x, y})` |
| `Setting` | 类 | 设置面板组件 |
| `openSetting` | `openSetting(app)` | 打开思源「设置」（默认「编辑器」页）；**本插件**的设置面板用 `plugin.openSetting()` |
| `openEmoji` | `openEmoji({position, selectedCB?})` | 图标面板，`selectedCB(emoji)` 拿选中图标 |
| `openAssetPicker` | `openAssetPicker({exts?, match?})` | 资源选择器；选中给 `{path}`，取消给 `null` |
| `openAttributePanel` | `openAttributePanel({data?, nodeElement?, focusName, protyle?})` | 块属性面板；`data` 与 `nodeElement` 二选一 |

### 2.3 页签、窗口与布局

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `openTab` | `openTab({app, doc?, asset?, pdf?, search?, card?, custom?, position?, …})` | 打开文档 / 资源 / PDF / 搜索 / 卡片 / 自定义页签 |
| `openWindow` | `openWindow({doc?, width?, height?, alwaysOnTop?, …})` | 桌面端新开窗口；移动端不生效 |
| `openMobileFileById` | `openMobileFileById(app, id, action?)` | 移动端按块 ID 打开文档 |
| `getActiveEditor` | `getActiveEditor(wndActive?)` | 当前编辑器实例 |
| `getActiveTab` | `getActiveTab(wndActive?)` | 当前页签｜桌面端 |
| `getAllEditor` | `getAllEditor()` | 所有编辑器实例 |
| `getAllTabs` | `getAllTabs(type?)` | 所有页签，可按类型筛｜桌面端 |
| `getAllModels` | `getAllModels()` | 按类型分组的页签模型｜桌面端 |
| `getModelByDockType` | `getModelByDockType(type)` | 按类型取停靠栏实例 |
| `saveLayout` | `saveLayout(cb)` | 保存当前布局 |

### 2.4 侧栏与文档树

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `toggleLeftDock` / `toggleRightDock` / `toggleBottomDock` | `toggleXxxDock(visible?)` | 显示 / 隐藏 / 切换整条侧栏｜桌面端 |
| `isLeftDockVisible` / `isRightDockVisible` / `isBottomDockVisible` | `isXxxDockVisible()` | 该侧栏是否可见｜桌面端 |
| `expandDocTree` | `expandDocTree({id, isSetCurrent?})` | 在文档树里展开并定位（笔记本 ID 或文档 ID） |

### 2.5 编辑器、快捷键与导出

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `setEditorFontSize` | `setEditorFontSize(fontSize, options?)` | 设置编辑器字号，返回生效值 |
| `adjustEditorFontSize` | `adjustEditorFontSize(action, options?)` | 放大 / 缩小 / 复位字号，返回生效值 |
| `globalCommand` | `globalCommand(command, app)` | 执行全局命令（`globalSearch`、`fileTree` 等，各前端支持的命令不同） |
| `adaptHotkey` | `adaptHotkey(hotkey)` | 把快捷键文本适配到当前平台（macOS 变 `⌘`） |
| `saveExportFile` | `saveExportFile(uri, msgId?)` | 把内核导出的文件交给用户保存 |

### 2.6 运行平台

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `getFrontend` | `getFrontend()` | `"desktop"` / `"desktop-window"` / `"mobile"` / `"browser-desktop"` / `"browser-mobile"` |
| `getBackend` | `getBackend()` | `"windows"` / `"linux"` / `"darwin"` / `"docker"` / `"android"` / `"ios"` / `"harmony"` |

### 2.7 退出与锁屏

| 名字 | 签名 | 说明 |
| --- | --- | --- |
| `exitSiYuan` | `exitSiYuan(setCurrentWorkspace?)` | 退出思源；`setCurrentWorkspace` 默认 `true`，表示记住当前工作区 |
| `lockScreen` | `lockScreen()` | 锁屏；只读模式与发布服务下不生效 |

两项都不可撤销，调用前先 `confirm`，示例见 3.6。

### 2.8 宿主的对象、类与常量

| 名字 | 说明 |
| --- | --- |
| `app` | 思源应用对象；`openTab`、`openSetting` 等接口需要它 |
| `plugin` | 本插件实例，见 2.10 |
| `siyuan` | `window.siyuan`：配置、笔记本列表、当前语言 |
| `Lute` | Lute 解析器 |
| `Constants` | 思源常量表（扩展名、通道名等） |
| `platformUtils` | 平台工具：`copyPlainText` / `writeText` / `readText`、`getStorageVal` / `setStorageVal` / `getLocalStorage`、`isMac` / `isIPhone` / `isIPad` / `isInIOS` / `isInAndroid` / `isHuawei` / `isOnlyMeta` / `isNotCtrl`、`openByMobile`、`sendNotification` / `cancelNotification`、`updateHotkeyTip` |
| `Protyle` / `ProtyleMethod` / `Plugin` | 思源的类：编辑器、渲染方法、插件对象 |

### 2.9 本次点击的上下文（本插件注入）

| 名字 | 说明 |
| --- | --- |
| `protyle` | 当前按钮块所在的编辑器实例，取不到时为 `undefined` |
| `blockID` | 当前按钮块自己的块 ID |
| `isMobile` | 是否移动端 |
| `i18n` | 本插件的文案（例如 `i18n.copied`） |

### 2.10 插件实例上还能用的

- **存储**：`plugin.saveData` / `loadData` / `removeData`，落在 `/data/storage/petal/button-in-siyuan/`；
  名字可带子目录，但不能用 `..` 穿越出去。
- **密钥与变量**：`plugin.getSecret(name)` / `plugin.getVariable(name)`，见 3.5。
- **设置与身份**：`plugin.openSetting()`、`plugin.name` / `displayName` / `i18n` / `app`。
- **事件**：`plugin.eventBus.on / once / off / emit(...)`。
- **查询**：`plugin.models` / `docks` / `commands` / `getOpenedTab()`。
- **注册接口**（`addTab` / `addDock` / `addCommand` / `addTopBar` 等）：注册的 UI 要等插件卸载才消失，按钮脚本别调用。

## 3. 示例

下面几段都可以直接粘贴到「编辑按钮块 → 按钮操作 → JavaScript」里。

### 3.1 最小示例：返回值 + console

```javascript
console.log("按钮被点了");
return 1 + 1;   // 弹窗里会显示：返回值: 2
```

### 3.2 调用内核接口并处理错误

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

### 3.3 在当前文档末尾追加一段内容

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

### 3.4 记住点击次数（插件私有数据）

```javascript
// 存成对象：存储文件没有扩展名，裸数字会被当成文本，loadData 回来的是字符串（"1" + 1 = "11"）。
const saved = (await plugin.loadData("click-count")) || {};
const next = (Number(saved.count) || 0) + 1;
await plugin.saveData("click-count", {count: next});
showMessage(`这个按钮被点了 ${next} 次`);
return next;
```

### 3.5 读取思源的密钥与变量

<kbd>设置</kbd> > <kbd>密钥和变量</kbd> 里的条目可以直接读；名字没配置、或当前不是管理员角色时返回空字符串。
密钥在内核侧加密存储，前端收到的是明文，「允许主机」只约束内核自己发出的 HTTP 请求。

```javascript
const token = plugin.getSecret("api_token");
const host = plugin.getVariable("api_host");
if (!token || !host) {
    return "请先在 设置 - 密钥和变量 里配置 api_token 与 api_host";
}
const response = await fetch(`https://${host}/ping`, {headers: {Authorization: `Bearer ${token}`}});
return response.status;
```

### 3.6 退出思源或锁屏

```javascript
confirm("退出思源？", "未保存的输入可能丢失。", () => exitSiYuan());
// 锁屏同理：confirm("锁屏？", "", () => lockScreen());
return "等待确认";
```

### 3.7 自建窗口

Toast 带不了问题，结果弹窗也不是输入框：点击后要做的不止是提示一句时，就用思源自己的类把窗口建出来。
`new Dialog({…})` 返回的对象上 `element` 就是窗口的 DOM，用 `dialog.destroy()` 关掉；给自己的节点加
`data-bis` 属性，取节点时就不会撞上思源自己的 `data-type` 派发键。

```javascript
const dialog = new Dialog({
    title: "追加一行",
    width: "520px",
    content: `<div class="b3-dialog__content">
    <div class="ft__on-surface">要追加的文本</div>
    <div class="fn__hr--small"></div>
    <input class="b3-text-field fn__block" data-bis="text" value="来自按钮">
    <div class="fn__hr"></div>
    <label class="fn__flex">
        <span class="fn__flex-1 ft__on-surface">完成后弹一条 Toast</span>
        <input type="checkbox" class="b3-switch fn__flex-center" data-bis="toast" checked>
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-bis="cancel">取消</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-bis="confirm">追加</button>
</div>`,
});
const field = (type) => dialog.element.querySelector(`[data-bis="${type}"]`);
field("cancel").addEventListener("click", () => dialog.destroy());
field("confirm").addEventListener("click", async () => {
    const rootID = (protyle || getActiveEditor())?.protyle?.block?.rootID;
    if (!rootID) {
        showMessage("没有找到当前文档", 7000, "error");
        return;
    }
    const response = await fetchPost("/api/block/appendBlock", {
        dataType: "markdown",
        data: field("text").value,
        parentID: rootID,
    });
    dialog.destroy();
    if (response.code !== 0) {
        showMessage(response.msg, 7000, "error");
        return;
    }
    if (field("toast").checked) {
        showMessage("已追加");
    }
});
```

点击处理函数在用户作答之前就返回了：这时脚本的「结果」是这个窗口本身，而不是某个值。这也是唯一一种
「每次点击都该在屏幕上留点东西」的按钮 —— 插件设置里的「JavaScript 输出弹窗」管不到它。

## 4. 注意事项

- **写操作要幂等**：按钮每次点击都执行，追加、新建之类最好带时间戳或先判断。
- **`exitSiYuan` / `lockScreen` 不可逆**：调用前先 `confirm`；只读与发布服务下 `lockScreen` 不生效。
- **弹窗策略**：插件设置里的「JavaScript 输出弹窗」默认 `有输出时显示`，可改成总是 / 仅 console / 警告 / 错误 /
  从不；它只决定弹不弹窗，不影响脚本是否执行。
- **`fetchPost` 的两种写法**：`await fetchPost(url, data)` 拿响应；`fetchPost(url, data, cb)` 走回调，
  回调只在 `code >= 0` 时被调用。
- **只读状态**：发布服务与只读文档里写接口会被拒（`code` 非 0）；可先看 `window.siyuan.config.readonly`。
- **跨域**：桌面端连本地内核时可直接 `fetch("https://…")`；连远程内核时受同源限制。
- **移动端**：`openTab`、`openWindow` 是空实现，`getActiveTab` / `getAllModels` / `getAllTabs` 与 §2.4 的
  停靠栏接口不可用。
- **插件存储**：`plugin.loadData` 可能拿到字符串而不是对象，见 3.4。
- **破坏性接口**：`/api/block/deleteBlock`、`/api/filetree/removeDoc` 之类点错无法撤销。
- **调试**：`console` 输出被弹窗收走，不会留在开发者工具里；要在开发者工具里停下来就加 `debugger`。
