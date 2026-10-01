# button-in-siyuan

思源笔记插件：在文档里插入思源原生样式的**按钮块**（思源自定义块）。

## 命令

```bash
npm install      # 需要 Node.js 20+
npm run dev      # watch 构建：只写仓库根的 index.js / index.css / i18n/，供本机插件目录加载
npm run build    # 打包构建：写 dist/ 与 package.zip
npm run typecheck
npm run check    # typecheck + build
node scripts/render-icon.mjs      # assets/icon.svg    → assets/icon.png（160×160，≤64 KiB）
node scripts/render-preview.mjs   # assets/preview.html → assets/preview.png（1024×768，≤512 KiB）
node scripts/snapshot-editor.mjs  # 把真实 CodeMirror 的 CSS/DOM 快照写回 assets/preview.html
```

`npm run build` 之外不要启动 watch：`dev` 只用于本机联调，产物会盖住仓库根的 index.js / index.css。
改了 `src/codeEditor.ts` 的外观后，先跑 `snapshot-editor.mjs` 再跑 `render-preview.mjs`，否则预览图
里的编辑器还是旧样式。

## 模块划分

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 插件入口：注册自定义块渲染器、斜杠菜单项、块菜单项 |
| `src/buttonBlock.ts` | 按钮块配置的解析/序列化、渲染、两种操作的执行 |
| `src/editDialog.ts` | 「编辑按钮块」对话框 |
| `src/codeEditor.ts` | JavaScript 代码编辑器（CodeMirror，配色取自用户的代码高亮主题） |
| `src/icon.ts` | 图标元素、图标列表收集、图标选择对话框 |
| `src/logger.ts` | 分级日志（`console.debug/info/warn/error`，统一 `[button-in-siyuan][模块]` 前缀） |
| `src/context.ts` | 传给各模块的运行上下文（`app` / `i18n` / `isMobile`） |
| `src/i18nKeys.ts` | 文案键类型，与 `src/i18n/*.json` 一一对应 |
| `src/index.scss` | 少量自有样式（按钮块按钮的字号/宽度下限、脚本输出框、图标网格） |

## 实现约定

* **块标识**：块信息的格式是 `<插件包名>/<块类型>`，两段都经 `encodeURIComponent`。本插件用
  `button-in-siyuan/button`，块类型常量是 `BUTTON_BLOCK_TYPE`；块菜单只在
  `data-info` 能解析出相同包名与块类型时出现。
* **块内容**：`data-content` 里是单行 JSON（`{"text","icon","action"}`，`action` 为
  `{"type":"link","link"}` 或 `{"type":"script","script"}`）。内容为空按默认配置渲染；内容不是本插件
  配置（认不出 `text`/`icon`/合法 `action`）时不渲染按钮、原样 `<pre>` 兜底，块菜单也不提供编辑入口，
  绝不覆盖用户自己的数据。
* **写回块**：只能通过宿主传给渲染器的 `setContent`（渲染器按块 ID 记下它，见 `updateButtonContent`）：
  宿主会做兜底、写回 `data-content`、提交事务并**强制重新渲染**。自己改 `data-content` 再提交事务
  不会刷新界面 —— `updateTransaction` 打的 `data-editing` 标记会让事务保留本地 DOM，渲染器不会被重跑。
* **插入块**：斜杠菜单回调里用 `protyle.insert(protyle.protyle.lute.Md2BlockDOM(markdown), true)`，
  markdown 为 `;;;button-in-siyuan/button\n{JSON}\n;;;`。
* **外观**：只用思源样式类（`b3-button`、`b3-text-field`、`b3-select`、`b3-dialog__content`、
  `b3-dialog__action`、`fn__*`、`ft__*`）与 `--b3-*` 变量；自有类统一用 `bis-` 前缀，
  自有对话框里的定位属性统一用 `data-bis`（`data-type` 是思源自己的派发键，不要占用）。
* **按钮外观**：渲染出的按钮类名与思源设置面板里的原生按钮完全一致 ——
  `b3-button b3-button--outline fn__size200`，宽度、圆角、悬浮与按下效果全部由思源 CSS 提供。
  只额外用 `index.scss` 里一条作用域规则把字号对齐到界面字号 `--b3-font-size`（文档里的自定义块
  字号是编辑器字号），并把 `fn__size200` 的固定 200px 改成 200px 的宽度下限，避免长文案溢出按钮。
* **代码编辑器**：CodeMirror 6（`codemirror` + `@codemirror/lang-javascript`）提供行号、高亮、
  括号匹配与补全。配色不写死：`readCodeTheme` 在离屏 `.code-block` / `.hljs-*` 探针上读取思源已加载的
  代码高亮主题（`#protyleHljsStyle`）的实际颜色，再映射到 CodeMirror 的标记（`@lezer/highlight`）；
  明暗模式取自 `data-theme-mode`，自动折行跟随 `window.siyuan.config.editor.codeLineWrap`。
* **图标**：从文档里的 `<symbol id="icon…">` 现取现用（内置图标集 + 图标包 + 插件图标），
  用 `<use>` 引用，元素带思源的 `.svg` 类以跟随 `currentColor`。
* **操作执行**：`siyuan://blocks/<id>` 与 `assets/<path>` 用原生接口打开（桌面端 `openTab`、
  移动端 `openMobileFileById`），其余链接交给 `window.open`。JavaScript 操作在页面上下文执行，
  执行期间临时接管 `console` 用于收集输出，`finally` 中恢复。
* **资源链接的坑**：`openTab({asset})` 只在资源是图片/音视频/PDF（宿主的
  `Constants.SIYUAN_ASSETS_EXTS`）且不带 `download=true` 时才会建页签，其他资源会让宿主的
  `newTab` 返回 `undefined`，`wnd.addTab(undefined)` 直接把页签布局搞坏（思源整窗报错）。
  所以打开 `assets/…` 前必须先按同样的条件判断，不满足的交给系统打开。
* **日志**：每个模块 `createLogger("<模块名>")` 建一个 logger，前缀形如 `[button-in-siyuan][buttonBlock]`，
  第二个参数传结构化细节对象。分级约定：`debug` 走 `console.debug`（浏览器默认归到 Verbose，不打扰用户）
  记渲染、菜单命中、主题探针等过程细节；`info` 记加载/卸载、打开对话框、保存、执行操作等用户可见动作；
  `warn` 记能继续跑但不符合预期的情况（内容认不出、资源没有页签、保存被拒绝）；`error` 记真正出错
  （JavaScript 抛异常、写回失败）。不要用 `console.log` 直接打日志。
* **生命周期**：`onload` 注册 `click-blockicon` 监听，`onunload` 配对注销；插件不写存储，也没有
  设置项、命令、停靠栏。

## 构建产物与发布

* `dist/`、`package.zip`、仓库根的 `index.js` / `index.css` / `i18n/` 都是产物，不提交、不手改。
* 集市图片：`assets/icon.svg`、`assets/preview.html` 是图源，改完必须重跑渲染脚本；PNG 提交在
  `assets/`，打包时落到包根。图标是白底方形（不切圆角）加思源蓝 `#3575F0` 的线稿图形。
* 预览图是一个真实的思源主窗口（1024×768）：顶栏、页签栏、面包屑、正文、状态栏，正文取
  「已滚动到文档末尾」的视图（`.protyle-content` 用 flex 贴底），中间是「编辑按钮块」对话框
  （JavaScript 操作 + CodeMirror 编辑器）。对话框里的编辑器**不是手写 HTML**：`scripts/snapshot-editor.mjs`
  会用 esbuild 打包 `src/codeEditor.ts`、在 Chromium 里真挂载一次，把 CodeMirror 自己注入的 CSS 与渲染出的
  DOM 抓回来，写进 `preview.html` 的 `editor-css` / `editor-dom` 标记之间，保证预览里的行号、缩进、配色
  与插件里逐像素一致；手改这两个标记之间的内容会在下次跑脚本时被覆盖。
* README 里的预览图是远程链接（RULES 39 要求）。URL 固定到**提交 SHA** 而不是分支别名：
  `gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@<sha>/assets/preview.png`。原因是 jsdelivr 对分支别名
  的缓存很久（gcore 上实测 12 小时不更新，purge API 只覆盖 CF/FY，清不掉 gcore），浏览器还会再按
  `max-age=604800` 缓存 7 天，用 `@dev` 换图后读者很久都看不到新图。换了 `preview.png` 就把 SHA
  更新成包含新图的提交。集市卡片用的是包里的 `preview.png`，不受这套缓存影响。
* `plugin.json` 与 `package.json` 的 `version` 必须一致，且高于最新 `v*` 标签；`minAppVersion`
  按用到的 API 定（自定义块渲染器需要 3.8.5）。
* 发布、上架集市都必须先由维护者本人测试并确认；不要自行打标签、建 Release 或改版本号。
* `.github/workflows/` 与 `scripts/` 里的 workflow、发行说明与图片脚本来自本人插件项目的通用资产，
  改动前先确认是否属于通用资产本身的问题。
