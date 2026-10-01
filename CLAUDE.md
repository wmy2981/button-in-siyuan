# button-in-siyuan

思源笔记插件：在文档里插入思源原生样式的**按钮块**（思源自定义块）。

## 命令

```bash
npm install      # 需要 Node.js 20+
npm run dev      # watch 构建：只写仓库根的 index.js / index.css / i18n/，供本机插件目录加载
npm run build    # 打包构建：写 dist/ 与 package.zip
npm run typecheck
npm run check    # i18n 键校验 + 文档校验 + typecheck + build
node scripts/check-i18n.mjs       # 单独校验文案键：i18nKeys.ts 与 src/i18n/*.json 必须同键、非空
node scripts/check-docs.mjs       # 单独校验文档：代码块语言与示例语法 + 接口表与 src/scriptApi.ts 的注入清单一致
node scripts/render-icon.mjs      # src/buttonIcon.ts → assets/icon.svg + icon.png（160×160，≤64 KiB）
node scripts/render-preview.mjs   # assets/preview.html → assets/preview.png（1024×768，≤512 KiB）
node scripts/snapshot-editor.mjs  # 把真实 CodeMirror 的 CSS/DOM 快照写回 assets/preview.html
```

`npm run build` 之外不要启动 watch：`dev` 只用于本机联调，产物会盖住仓库根的 index.js / index.css。
改了 `src/codeEditor.ts` 的外观后，先跑 `snapshot-editor.mjs` 再跑 `render-preview.mjs`，否则预览图
里的编辑器还是旧样式。改了 `src/buttonIcon.ts` 的图形后跑 `render-icon.mjs`（它会重写 `assets/icon.svg`）。

## 模块划分

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 插件入口：注册自定义块渲染器、斜杠菜单项、块菜单项，拼装运行上下文 |
| `src/buttonBlock.ts` | 按钮块配置的解析/序列化、渲染、链接操作、右键/长按入口 |
| `src/buttonIcon.ts` | 按钮块图标的唯一来源（市集图标与斜杠菜单图标都由它生成） |
| `src/editDialog.ts` | 「编辑按钮块」对话框 |
| `src/codeEditor.ts` | JavaScript 代码编辑器（CodeMirror，配色取自用户的代码高亮主题） |
| `src/scriptRunner.ts` | 执行脚本：注入接口、接管 console、把结果交给结果弹窗 |
| `src/scriptApi.ts` | 脚本能直接调用的思源接口清单（注入进 `new Function` 的形参） |
| `src/scriptOutput.ts` | 结果弹窗：分级前缀、ANSI 彩色输出、复制纯文本 |
| `src/scriptDocs.ts` | 内置 JavaScript 文档的弹窗（按界面语言选文档，用 Lute 渲染） |
| `src/icon.ts` | 图标元素、图标列表收集、图标选择对话框 |
| `src/logger.ts` | 分级日志（`console.debug/info/warn/error`，统一 `[button-in-siyuan][模块]` 前缀） |
| `src/electron.ts` | 桌面端 Electron 能力的取用口（`getIpcRenderer`） |
| `src/context.ts` | 传给各模块的运行上下文（`app` / `plugin` / `i18n` / `isMobile` / `openEditor`） |
| `src/i18nKeys.ts` | 文案键类型，与 `src/i18n/*.json` 一一对应 |
| `src/index.scss` | 少量自有样式（按钮块按钮的字号/宽度下限、文档入口、文档弹窗、脚本输出框、图标网格） |
| `docs/*.md` | 面向用户的 JavaScript 文档，构建时内嵌进 index.js，也随包发布 |

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
  markdown 为 `;;;button-in-siyuan/button\n{JSON}\n;;;`；新建的块默认带 `iconCirclePlay`
  （`DEFAULT_BUTTON_ICON`）。斜杠菜单的图标是本插件自绘的图形（`createButtonBlockIconHtml()`）。
* **编辑入口**：块菜单 > 插件 > 编辑按钮块、按钮上右键（桌面端）、按钮上长按 500ms（移动端，之后补发的
  click 要吞掉，别把操作也执行了）。三条路都走 `context.openEditor(blockID, config)` —— 由插件入口注入，
  这样渲染器不必直接依赖对话框模块（对话框要写回块内容，互相引用会成环）。
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
  外观对齐思源的代码片段输入框（`.b3-text-field`）：字号固定 14px、同样的描边与聚焦效果、
  `resize: vertical` 可纵向拖拽、初始高 100px。行号栏底色必须**不透明**（等于代码块底色）：
  `.cm-gutters` 是 sticky 的，透明底色时横向滚动的代码会从行号下面透出来。
  右键菜单走思源的原生文本菜单：把菜单项发到 `Constants.SIYUAN_CONTEXT_MENU` 通道
  （与宿主 `menus/index.ts` 对 `.b3-text-field` 的做法一致），菜单文案取 `window.siyuan.languages`。
* **图标**：从文档里的 `<symbol id="icon…">` 现取现用（内置图标集 + 图标包 + 插件图标），
  用 `<use>` 引用，元素带思源的 `.svg` 类以跟随 `currentColor`。选择器里**不要改 `color`**：
  悬浮与选中只换底色/描边（与思源表情面板一致），否则靠 `currentColor` 上色的图标（如 `iconLiandi`）
  会显示成主色；编辑窗口里已选中的图标用 `.bis-icon-button` 把它拉回正文色。
* **操作执行**：`siyuan://blocks/<id>` 用原生接口打开（桌面端 `openTab`、移动端 `openMobileFileById`）；
  `assets/<path>` 先按宿主的 `isPreviewableAsset` 判断（图片/音视频/PDF 且满足 HEIF 的 `download` 条件）
  才建资源页签，其余用系统默认程序打开；其他链接交给 `window.open`。
* **JavaScript 操作**：在页面上下文执行，整段包成 async 函数（可用 `await` / `return`）。执行期间接管
  `console`（`log/info/debug/warn/error/table/dir`）收集输出，`finally` 里恢复。思源接口作为形参注入
  （清单在 `src/scriptApi.ts`，注入的是宿主 `plugin/API.ts` 里除 `exitSiYuan`/`lockScreen` 之外的全部能力，
  外加 `siyuan`/`Lute`/`protyle`/`blockID`/`i18n` 等上下文）；新增注入项要同步 `docs/javascript*.md` 的接口表。
  **`fetchPost` / `fetchGet` 注入的是包装过的版本**：宿主的这两个是回调式的（不给回调时返回的 Promise
  解析成 `undefined`，见 `app/src/util/fetch.ts`），脚本里 `await fetchPost(...)` 会拿到 `undefined` 再
  `response.code` 直接报错，所以 `src/scriptApi.ts` 里做了补全 —— 传了回调走宿主原实现，没传回调改用
  `fetchSyncPost` / 原生 `fetch` 拿响应。改这里时别把包装去掉。
  结果弹窗按级别给前缀配色，正文支持 ANSI 转义（16 色/256 色/真彩/加粗下划线等），复制时去掉转义。
  **没有 `return`、没有 console 输出、也没有报错时不弹结果弹窗**（静默执行，「点一下做件事」的按钮不该
  每次都被空弹窗挡住）；有输出或报错照常弹窗，别把错误吞掉。改动这条要同步 `docs/javascript*.md` 的 4.15。
* **资源链接的坑**：`openTab({asset})` 只在资源是图片/音视频/PDF（宿主的
  `Constants.SIYUAN_ASSETS_EXTS`）且不带 `download=true` 时才会建页签，其他资源会让宿主的
  `newTab` 返回 `undefined`，`wnd.addTab(undefined)` 直接把页签布局搞坏（思源整窗报错）。
  所以打开 `assets/…` 前必须先按同样的条件判断；不能建页签的用宿主自己的路子交给系统：
  `fetchPost("/api/asset/resolveAssetPath")` 拿绝对路径，再经 `Constants.SIYUAN_CMD` 的 `openPath`
  通道（与宿主 `useShell` 一致）。**不要**用 `window.open` 打开资源地址 —— 会被浏览器类插件接管，
  而且思源本身也打不开这类资源。
* **i18n**：所有面向用户的文案都走 `src/i18n/*.json`（键类型在 `src/i18nKeys.ts`）；思源自带的文案
  直接取 `window.siyuan.languages`（原生右键菜单就是这么做的）。`npm run check` 会跑
  `scripts/check-i18n.mjs`，两份文案必须同键、非空，加键时别忘了另一份。
* **内置文档**：`docs/*.md` 由 webpack 的 `asset/source` 内嵌进 index.js，编辑窗口里的入口用
  `Lute.New().ProtylePreviewStr("", markdown)`（思源的富文本预览渲染器）转成 HTML，放进
  `.b3-typography` 容器，再调 `ProtyleMethod.highlightRender` 让代码块按 `data-language` 上色
  （思源对 `.b3-typography` 走的就是这条「预览」分支，`app/src/protyle/render/highlightRender.ts`）；
  按 `window.siyuan.config.lang` 选中文或英文文档。文档同时随包发布到
  `docs/`。**代码块语言统一写 `javascript`**（`js` 之类会被 hljs 当别名，但不与思源代码块的语言名一致）。
  改了文档跑 `node scripts/check-docs.mjs`：代码块语言（统一 `javascript`，不用缩写 `js`）、
  示例语法、接口表与注入清单都在那里校验。
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
  **图形只写在 `src/buttonIcon.ts` 一处**：`render-icon.mjs` 用它生成 `assets/icon.svg` 与 `icon.png`，
  斜杠菜单里的图标（`createButtonBlockIconHtml()`）用的是同一份图形（改成 `currentColor`、viewBox 收紧）。
* 预览图是一个真实的思源主窗口（1024×768）：顶栏、页签栏、面包屑、正文、状态栏，正文取
  「已滚动到文档末尾」的视图（`.protyle-content` 用 flex 贴底），中间是「编辑按钮块」对话框
  （JavaScript 操作 + CodeMirror 编辑器 + 文档入口）。对话框里的编辑器**不是手写 HTML**：
  `scripts/snapshot-editor.mjs` 会用 esbuild 打包 `src/codeEditor.ts`（`siyuan` 换成临时替身）、
  在 Chromium 里真挂载一次，把 CodeMirror 自己注入的 CSS 与渲染出的 DOM 抓回来，写进 `preview.html`
  的 `editor-css` / `editor-dom` 标记之间，保证预览里的行号、缩进、配色与插件里逐像素一致；
  手改这两个标记之间的内容会在下次跑脚本时被覆盖。对话框其余部分（图标按钮、文档入口）是手写的，
  改了 `editDialog.ts` 的结构或 `index.scss` 里对话框用到的规则要同步改。
* README 里的预览图是远程链接（RULES 39 要求）。URL 固定到**提交 SHA** 而不是分支别名：
  `gcore.jsdelivr.net/gh/wmy2981/button-in-siyuan@<sha>/assets/preview.png`。原因是 jsdelivr 对分支别名
  的缓存很久（gcore 上实测 12 小时不更新，purge API 只覆盖 CF/FY，清不掉 gcore），浏览器还会再按
  `max-age=604800` 缓存 7 天，用 `@dev` 换图后读者很久都看不到新图。换了 `preview.png` 就把 SHA
  更新成包含新图的提交。集市卡片用的是包里的 `preview.png`，不受这套缓存影响。
* `plugin.json` 与 `package.json` 的 `version` 必须一致，且高于最新 `v*` 标签；`minAppVersion`
  当前是 3.8.6（自定义块渲染器需要 3.8.5，之后为用到的更新 API 抬过一次）。
* 包里除 `index.js` / `index.css` / `icon.png` / `preview.png` / `plugin.json` / `i18n/` / README
  之外还带 `docs/`：文档虽然已内嵌进 index.js，但原文件一并给用户翻。
* 发布、上架集市都必须先由维护者本人测试并确认；不要自行打标签、建 Release 或改版本号。
* `.github/workflows/` 与 `scripts/` 里的 workflow、发行说明与图片脚本来自本人插件项目的通用资产，
  改动前先确认是否属于通用资产本身的问题。
