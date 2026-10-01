[English](./README.md)

# 按钮块（button-in-siyuan）

在思源文档里插入思源原生样式的按钮块：按钮文本、图标和点击后的操作都在思源原生对话框里设置。

![预览](https://gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@d75c77e/assets/preview.png)

## 功能

* 按钮块是思源的自定义块（Markdown 围栏为 `;;;button-in-siyuan/button`），随文档保存、同步、
  撤销和导出。
* 按钮用的就是思源设置面板里那套原生按钮样式
  （`b3-button b3-button--outline fn__size200`）：宽 200px、界面字号，悬停与按下效果全部由
  思源自身的 CSS 提供，插件不自定义按钮外观。
* 图标从当前界面可用的 SVG 图标里选（内置图标集，以及图标包和插件注册的图标），带搜索框。
* 按钮操作可选，只能是一件事：链接跳转，或运行 JavaScript。
* JavaScript 代码编辑器是 CodeMirror，带行号、语法高亮、括号匹配与补全，配色跟随思源的代码高亮设置。
* 所有对话框、菜单与表单控件都是思源原生 UI。

## 安装

1. 集市安装（上架后）：<kbd>设置</kbd> > <kbd>集市</kbd> > <kbd>下载</kbd>，搜索「按钮块」。
2. 手动安装：从最新 Release 下载 `package.zip`，解压为
   `{工作空间}/data/plugins/button-in-siyuan/`，然后在
   <kbd>设置</kbd> > <kbd>集市</kbd> > <kbd>已下载</kbd> 中启用。

需要思源 3.8.5 或更新版本。

## 使用

1. 在文档里输入 `/按钮块`（或 `/button`）回车，光标处插入一个按钮块。
2. 点击该块的块图标打开块菜单，选择 <kbd>插件</kbd> > <kbd>编辑按钮块</kbd>。
3. 在对话框里设置文本、图标和操作后确定。

块内容本身是一段纯 JSON，只有插件启用时才会渲染成按钮。

## 设置项

| 设置项 | 说明 |
| --- | --- |
| 按钮文本 | 按钮上的文字，纯文本；留空时回落到默认文本。 |
| 按钮图标 | 当前界面里可用的 SVG 图标之一，也可以不设置。 |
| 按钮操作 | `无操作`、`链接跳转` 或 `JavaScript`，只会执行其中一项。 |
| 链接地址 | 选择「链接跳转」时出现，该项必填。 |
| JavaScript 代码 | 选择「JavaScript」时出现，该项必填。 |

## 链接地址

| 链接写法 | 行为 |
| --- | --- |
| `https://…`、`mailto:…`、其他协议 | 交给系统默认处理，与在思源里点击链接一致。 |
| `siyuan://blocks/<块 ID>` | 在思源里打开（必要时缩放到）该块。 |
| `assets/<资源路径>` | 图片、音视频与 PDF 在思源页签里打开；思源没有对应页签渲染器的资源（如压缩包）交给系统处理。 |

其余写法统一交给 `window.open`，因此系统已注册的协议（比如某个应用的自定义协议）同样可用。

## JavaScript

代码编辑器是 CodeMirror：带行号、语法高亮、括号匹配与补全，配色跟随
<kbd>设置</kbd> > <kbd>外观</kbd> > <kbd>代码高亮</kbd> 里选中的方案（明暗模式各一套），
代码块自动折行设置同样生效。

点击按钮时代码在页面上下文里执行，能力与思源的 JavaScript 代码片段一致
（可以访问 `window.siyuan`、编辑器 DOM 和内核 HTTP 接口）。支持 `await`；`return` 的结果、
执行期间的 `console.log/info/warn/error` 输出，以及抛出的错误都会显示在结果弹窗里。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 插入按钮块 | 斜杠菜单 `/按钮块`（无独立快捷键） |
| 编辑按钮块 | 无（块菜单 > <kbd>插件</kbd> > <kbd>编辑按钮块</kbd>） |

## 限制

* 发布服务上本插件被禁用（`disabledInPublish`），发布页面显示块的原始内容而不是按钮。
* 导出 PDF/HTML 时同样没有自定义块渲染器，导出结果里是块的原始内容。
* JavaScript 操作没有沙箱，权限与用户自己的代码片段相同，只运行可信代码。
* 图标列表来自当前界面已加载的图标，使用第三方图标包时可选图标会随之变化。

## 开发

```bash
npm install          # 需要 Node.js 20+
npm run typecheck    # tsc --noEmit
npm run build        # 产出 dist/ 与 package.zip
```

`npm run dev` 是 watch 构建，只写仓库根的 `index.js`、`index.css`、`i18n/`，供本机
`data/plugins/button-in-siyuan` 符号链接直接加载；`npm run build` 才是打包构建。
图标与预览图分别由 `node scripts/render-icon.mjs`、`node scripts/render-preview.mjs` 生成
（后者首次需要执行一次 `npx playwright install chromium`）；改了代码编辑器的外观后，先跑
`node scripts/snapshot-editor.mjs` 把真实 CodeMirror 的样式与 DOM 快照写回 `assets/preview.html`。

## 许可证

[MIT](./LICENSE)
