[English](./README.md)

# 按钮块（button-in-siyuan）

在文档中插入思源原生样式的按钮块，可设置文本、内置图标，支持链接跳转或 JavaScript 操作。

![预览](https://gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@f6cae6d/assets/preview.png)

## 功能

* 按钮块是思源的自定义块，随文档保存、同步、撤销和导出。
* 按钮用思源原生样式：界面字号、悬停与按下效果都来自思源的 CSS，插件不自定义外观。
* 图标从当前界面可用的 SVG 图标里选（内置图标，以及图标包和插件注册的图标），支持搜索。
* 按钮颜色可选：线框、文本与图标共用一个颜色，取自思源内置配色，默认是思源原生蓝。
* 按钮操作可选，且只能选一项：链接跳转、运行 JavaScript，或执行一个 JavaScript 文件
  （`assets/` 下的本地文件，或 http(s) 云端地址）。
* JavaScript 代码编辑器是 CodeMirror，带行号、语法高亮、括号匹配与补全，配色跟随思源的代码高亮方案。

## 安装

1. 集市安装：<kbd>设置</kbd> > <kbd>集市</kbd> > <kbd>插件</kbd>，搜索「按钮块」。
2. 手动安装：从最新 Release 下载 `package.zip`，解压为
   `{工作空间}/data/plugins/button-in-siyuan/`，然后在
   <kbd>设置</kbd> > <kbd>集市</kbd> > <kbd>已下载</kbd> 中启用。

需要思源 3.8.6 或更新版本。

## 使用

1. 在文档里输入 `/按钮块`（或 `/button`）回车，光标处插入一个按钮块。
2. 打开「编辑按钮块」：点击该块的块图标后选 <kbd>插件</kbd> > <kbd>编辑按钮块</kbd>，
   或者在按钮上右键（桌面端）/ 长按（移动端）。
3. 在对话框里设置文本、图标和操作后确定。

## 设置项

| 设置项 | 说明 |
| --- | --- |
| 按钮文本 | 按钮上的文字，纯文本；留空时回落到默认文本。 |
| 按钮图标 | 当前界面里可用的 SVG 图标之一，也可以不设置。 |
| 按钮颜色 | 线框、文本与图标共用的颜色，从思源内置配色里选；默认是思源原生蓝。 |
| 按钮操作 | `无操作`、`链接跳转`、`JavaScript` 或 `JavaScript 文件`，只会执行其中一项。 |
| 链接地址 | 选择「链接跳转」时出现，该项必填。 |
| JavaScript 代码 | 选择「JavaScript」时出现，该项必填。 |
| JavaScript 文件路径 | 选择「JavaScript 文件」时出现，该项必填。可以填 `assets/` 下的本地 `.js` 文件，也可以填 http(s) 地址 |

## 插件设置

| 设置项 | 说明 |
| --- | --- |
| JavaScript 输出弹窗 | 点按钮执行脚本后什么时候弹结果弹窗：`总是显示`、`有输出时显示`（默认）、`仅 console 输出时显示`、`警告时显示（也包含错误）`、`错误时显示`、`始终不显示`。 |
| 调试模式 | 默认关：打开后插件自己的日志（加载、打开对话框、出错等）都输出到思源控制台，脚本里的 `console.debug` 也输出并显示在结果弹窗里。关掉时插件一条日志都不打印，控制台里只剩脚本自己的 console 输出。 |
| JavaScript 编辑器自动换行 | 超出编辑器宽度的内容是否自动换行：`跟随思源设置`（默认，与 <kbd>设置</kbd> > <kbd>编辑器</kbd> > <kbd>代码块换行</kbd> 一致）、`启用`、`禁用`。 |
| JavaScript 编辑器连字 | 是否显示连字（需要代码字体本身带连字）：`跟随思源设置`（默认，与 <kbd>设置</kbd> > <kbd>编辑器</kbd> > <kbd>代码块连字</kbd> 一致）、`启用`、`禁用`。 |
| 向 Agent 提供按钮块技能 | 默认开：把说明按钮块用法的技能写进工作空间的技能目录；关掉时会删除这个技能。 |
| 下载技能 | 点「下载技能」用思源原生的保存对话框把整份技能打包成一个 zip 存到本地。 |

## 链接地址

链接的行为与文档里的同一个链接一致，都由思源的链接处理逻辑完成：

| 链接写法 | 行为 |
| --- | --- |
| `https://…`、`mailto:…`、其他协议 | 交给宿主：桌面端是系统浏览器，移动端是对应的原生应用。 |
| `siyuan://blocks/<块 ID>` | 由思源打开（必要时缩放）该块；`siyuan://plugins/…`、`siyuan://bazaar/…` 同样可用。 |
| `assets/<资源路径>`、`file://…`、绝对路径 | 按 <kbd>设置</kbd> > <kbd>编辑器</kbd> > <kbd>资源打开方式</kbd> 打开。 |

## JavaScript

配色跟随 <kbd>设置</kbd> > <kbd>外观</kbd> > <kbd>代码高亮</kbd> 里选中的方案（明暗各一套），
是否自动换行与是否显示连字由插件设置里的「JavaScript 编辑器自动换行」「JavaScript 编辑器连字」决定。字号与思源代码片段输入框一致，输入区可以纵向拖高，
右键打开思源的文本菜单（撤销、重做、复制、剪切、粘贴、粘贴为纯文本、全选）。

点击按钮时，代码在页面上下文里执行，支持 `await`。`return` 的结果、console 输出与抛出的错误都显示在
结果弹窗里，可一键复制纯文本（console 输出同时由插件原样转交思源控制台）。弹窗时机由插件设置里的
「JavaScript 输出弹窗」决定（默认「有输出时显示」）。

脚本里可以直接调用思源给插件开放的全部接口。

完整说明与可以直接粘贴运行的示例：[docs/javascript.zh-CN.md](./docs/javascript.zh-CN.md)。

## 限制

* 发布服务上本插件被禁用（`disabledInPublish`），发布页面显示块的原始内容而不是按钮。
* 导出 PDF/HTML 时没有自定义块渲染器，导出结果里是块的原始内容。
* 用「脚本文件」操作的按钮，导出时要留意脚本文件本身：**HTML 与 Word 导出会按块里引用的相对路径把脚本
  一起复制到导出目录的 `assets/` 下**；**Markdown `.zip` 不带**（思源导出 Markdown 时只在导出后的
  Markdown 正文里找资源引用，块属性不参与，插件无法干预），需要时改用 HTML/Word 导出，或者自己把脚本
  一起复制过去。
* JavaScript 操作没有沙箱，权限与用户自己的代码片段相同，只运行可信代码。
* 图标列表来自当前界面已加载的图标，使用第三方图标包时可选图标会随之变化。
* 桌面端**在表格单元格里编辑时没有按钮块入口**：思源此时用的是不加载插件扩展的单元格编辑器
  （`tableCellRichEditor` 里 `pluginExtensions: false`），其斜杠菜单不会列出插件项。这是宿主限制，
  在正文里插入即可。单元格只能放行内内容，从单元格发起插入时按钮块会落在表格后面。

## Agent 技能

插件会把一份技能（Skill）写给思源的 Agent：`button-block`，以目录形式落在工作空间的
`data/storage/ai/agent/skills/button-block/`：

| 文件 | 内容 |
| --- | --- |
| `SKILL.md` | 按钮块是什么、块内容（`{"text","icon","color","action"}`）怎么填、怎么用思源的块接口创建与修改。 |
| `references/javascript.md` | JavaScript 操作：注入的接口、`return` / `console` / `showMessage` 各自的作用、官方端点文档在哪、可直接运行的示例。 |
| `references/icons.md` | 思源内置图标的全部 id，以及按用途挑图标的对照表。 |

两份参考文档随技能一起发布、而不是让 Agent 去插件目录里找，所以技能无论从哪里被读到都是完整的：
Agent 用 `skill` 工具按 `name: "button-block/references/javascript.md"` 载入其中一份，思源加载技能正文时
本来也会把它们列成技能的资源。javascript 文档里还给出了思源自己的 API 文档地址 —— `docs/API.md` 与
`kernel/api/router.go`，走国内可访问的 CDN，并钉在你正在用的思源版本上 —— Agent 因此查的是官方文档，
而不是这里随包带的一份副本。

每次加载插件都会用包内自带的那三份重写技能目录，手改过或旧版本留下的内容都不会保留。插件设置里的
「下载技能」会把它们打成一个 zip（`button-block/SKILL.md` 与 `button-block/references/…`）。
技能默认写入；在插件设置里关掉、禁用插件或从工作空间移除插件时都会删掉这个技能 ——
插件没在运行时，Agent 不会读到失效的技能。这几个接口需要思源启用 AI 功能。

同样这两份文档在仓库里也保留了一份，方便技能之外阅读：
[docs/javascript.md](./docs/javascript.md) 与 [docs/icons.md](./docs/icons.md)。

## 开发

```bash
npm install          # 需要 Node.js 20+
npm run check        # i18n 键校验 + tsc --noEmit + 打包构建
npm run build        # 产出 dist/ 与 package.zip
```

## 许可证

[MIT](./LICENSE)
