# 开发说明（button-in-siyuan）

面向本插件的维护与二次开发。这里只写「不说就会做错」的约定：从代码里一眼能看出来的实现细节不重复。

## 实现约定

* **块标识**：块信息是 `<插件包名>/<块类型>`（两段都 `encodeURIComponent`），本插件为
  `button-in-siyuan/button`；块菜单只在包名与块类型都匹配时出现。
* **块内容**：`data-content` 是单行 JSON。内容认不出是本插件配置时**不渲染按钮、原样 `<pre>` 兜底**，
  块菜单也不提供编辑入口，绝不覆盖用户数据。
* **写回块**：只能用宿主传给渲染器的 `setContent`。自己改 `data-content` 再提交事务不会刷新界面：
  `updateTransaction` 打的 `data-editing` 标记会让事务保留本地 DOM，渲染器不会被重跑。
* **插入块**：斜杠项的 id 借用思源放行清单里的 `code`（`SLASH_ITEM_ID`），否则主编辑器的斜杠菜单会按
  id 过滤掉插件项。**即便如此，桌面端单元格里仍然没有按钮块入口**：思源 3.8.6 起单元格挂的富文本编辑器
  关掉了 `pluginExtensions` 并用自己的 `safeSlash`，插件项根本不会被构造（宿主限制）。移动端思源把插件项
  html 整个塞进 `.keyboard__slash-text`，那里没有 flex 上下文，图标与文字会叠成两行 —— 所以斜杠项 html
  带 `bis-slash-item` 标记，`index.scss` 在该槽位把 flex 补回来。
* **编辑入口**：块菜单 > 插件 > 编辑按钮块、按钮上右键（桌面端）、按钮上长按（移动端）。三条路都走
  `context.openEditor(blockID, config)`（插件入口注入），免得渲染器直接依赖对话框模块而成环。
* **外观**：只用思源样式类与 `--b3-*` 变量；自有类统一 `bis-` 前缀，自有对话框的定位属性用 `data-bis`
  （`data-type` 是思源自己的派发键，不要占用）。
* **按钮外观**：类名与思源设置面板的原生按钮一致，只额外用一条作用域规则把字号对齐界面字号、把
  `fn__size200` 的固定宽度改成宽度下限（文档里的自定义块字号是编辑器字号）。
* **按钮颜色**：存了颜色才加 `bis-button-color` 类并设 `--bis-button-color`，不存就与原生
  `.b3-button--outline` 逐像素一致。色板全部走主题变量，明暗主题与换主题都会跟着变，因此不提供任意取色的
  取色器；编号跳过 13（daylight 下等于页面底色）与 6（与默认的原生蓝同色）。
* **关窗前的「放弃修改」确认**：不是逐条拦取消 / × / `Esc` / 点遮罩，而是把实例上的 `dialog.destroy`
  换成自己的函数（宿主的四条路最后都调它）。**`disableClose` 只挡遮罩与 ×，挡不住 `Esc`**；判断
  「有没有改过」与保存必须共用同一个 `currentConfig()` 口径，否则会出现「什么都没改也弹确认」。
* **代码编辑器**：CodeMirror 6，配色从思源已加载的代码高亮主题上实测后映射，不写死。**没用 CSS 的
  `resize: vertical`**：命中区只在右下角几个像素，触摸屏抓不住，改高由编辑区下方的抓手负责。行号栏底色
  必须**不透明**：`.cm-gutters` 是 sticky 的，否则横向滚动时代码会从行号下面透出来。右键菜单把菜单项发到
  `Constants.SIYUAN_CONTEXT_MENU` 通道，与宿主对 `.b3-text-field` 的做法一致。
* **图标**：从文档里的 `<symbol id="icon…">` 现取现用，元素带思源的 `.svg` 类以跟随 `currentColor`。
  选择器里**不要改 `color`**：悬浮与选中只换底色 / 描边，否则靠 `currentColor` 上色的图标会显示成主色。
* **JavaScript 操作**：在页面上下文执行，整段包成 async 函数；执行期间接管 `console` 收集输出。接口以
  形参注入（清单在 `src/scriptApi.ts`），新增注入项要同步 `docs/javascript*.md` 的接口表。**注入的
  `fetchPost` / `fetchGet` 是包装过的**：宿主的实现是回调式的，不给回调时 Promise 解析成 `undefined`，
  脚本里 `await fetchPost(...)` 会直接报错 —— 别把包装去掉。**没有 `return`、没有 console 输出、也没有
  报错时不弹结果弹窗**（默认策略），改动要同步 `docs/javascript*.md` 的 4.15。
* **JavaScript 文件操作**：每次点击都重新取代码（本地走 `/api/file/getFile`，云端用 `fetch` 重新下载），
  再交给与内联脚本同一个 `runScript`；取不到只提示、不执行。**这几个内核文件接口没有用宿主的
  `fetchPost`**：`getFile` 成功时回裸字节、出错才是 JSON 信封，而宿主对 `code < 0` 只弹提示、不调回调，
  403/404 拿不到 —— 那正是判断「文件不存在」要用的。写接口用 `fetchSyncPost` 并关掉 `processMessage`。
  文件名先在本地按内核 `FilterUploadFileName` 的规则拦一遍；新建 / 重命名窗口的输入框只填名字，后缀由
  `toAssetScriptPath` 补（宿主的 `openInputDialog` 没有后缀槽位，是把输入框挪进 `fn__flex` 行里挂的，
  挪动会失焦，最后要重新 focus）。**云端脚本必须二次确认**：可放弃、直接使用，或下载到 `assets/` 之后与
  云端再无关系；只有本地文件才提供编辑 / 改名 / 删除。脚本文件读写一律不走 `plugin.loadData`（那是插件
  私有数据）。**按钮里存的 `assets/xxx.js` 不能直接喂给 `/api/file/*`**：`assets/…` 相对的是数据目录，
  而文件接口的 path 相对工作空间根，所以统一用 `toWorkspacePath()` 补 `data/` 前缀；少了它文件会落到
  工作空间根下另建的 `assets/`，插件自己读写正常，但那个目录不在数据目录里，不进资源索引、也不会被同步。
* **链接操作**（`src/openLink.ts`）：效果要与文档里点 `[]()` 链接一致，即对齐宿主的
  `app/src/editor/openLink.ts`。非本地地址一律交给 `platformUtils.openByMobile`（宿主 `openLink` 用的
  同一个函数，`siyuan://` 与插件事件也在里面处理）；本地路径按 `window.siyuan.config.editor.assetOpen`
  算动作（`assetOpen.ts` 是宿主同名模块的移植），修饰键来自点击事件，所以渲染器要把 MouseEvent 一路传到
  `openLink()`；移动端与宿主一致，不认配置。**打开之前必须先把 `open-asset` / `open-link` 发给其他插件**
  （`emitToPlugins`，宿主没暴露，只能照它的做法遍历 `app.plugins` 的 eventBus）：这两个是可取消事件，接管
  资源打开的插件（如 editor-siyuan）靠 `preventDefault()` 顶掉默认行为；漏掉这一步的表现是「文档里点链接
  会被接管、从按钮点却不会」。两个已知差距：`new-window` 回落成当前页签（宿主的实现走 Electron 专用通道，
  插件 API 没有入口）；远端内核（`--remote`）下宿主认为不是本地文件系统，插件仍按前端判断。
* **资源页签的坑**：`openTab({asset})` 只在资源是图片 / 音视频 / PDF 且不带 `download=true` 时建页签，
  其他资源会让宿主的 `newTab` 返回 `undefined`，`wnd.addTab(undefined)` 直接把页签布局搞坏。所以交给
  `openTab` 前先按同样的条件判断（`openLink.ts` 的 `isPreviewableAsset`）；不能建页签的经
  `Constants.SIYUAN_CMD` 的 `openPath` 交给系统。**不要用 `window.open`**：会被浏览器类插件接管，思源
  本身也打不开这类资源。
* **脚本文件别被当成未引用资源**：按钮的引用关系写在块内容里，思源的引用扫描只看文档链接与块属性，看不到
  它，用户一「清理未引用资源」按钮就点不动了。所以把脚本路径写成块属性
  `custom-data-assets-button-in-siyuan`（思源把所有 `custom-data-assets` 开头的属性算作资源引用，用自己的
  名字是为了不覆盖用户自己写的）。保存按钮块时立刻写，插件加载时再跑一次 `syncAssetReferences()`，与
  `ial` 比对、只在不一致时写回，稳定状态下没有写操作；属性值以块内容为准。
* **i18n**：面向用户的文案都走 `src/i18n/*.json`（键类型在 `src/i18nKeys.ts`），思源自带的取
  `window.siyuan.languages`；`scripts/check-i18n.mjs` 要求两份文案同键、非空，加键别忘另一份。
* **Agent 技能**：`src/agentSkill.ts` 把 `docs/skill.md`（构建时内嵌）写成
  `data/storage/ai/agent/skills/button-block/SKILL.md`。技能正文要求 Agent 去读包内的
  `docs/javascript.md` 与 `docs/icons.md`，所以包内 `docs/` 的位置不能改。每次加载都**无条件覆盖写入**
  （技能由插件维护，目录里的副本可能是旧版本或被手改过）。删除只写在 `onunload` 一处：禁用、重载与卸载
  都会先跑它，只有卸载才接着补跑 `uninstall`。AI 功能被关掉时接口直接失败，只记日志、不弹提示。
  设置面板里的「下载 SKILL.md」走宿主的 `saveExportFile`，而它只肯复制 `<工作空间>/temp/export/` 下的
  文件，所以先把正文 `putFile` 到那里再交给它 —— 保存对话框里的默认文件名就是那个文件名。
* **内置文档**：`docs/*.md` 由 webpack 的 `asset/source` 内嵌进 index.js，入口用 Lute 的富文本预览渲染器
  转成 HTML（代码块靠 `ProtyleMethod.highlightRender` 上色），按界面语言选文档。**代码块语言统一写
  `javascript`**；预览输出的代码块结构是 `<pre class="code-block" data-language="javascript">`，
  `scriptDocs.ts` 按这个结构给每个示例套一层并加「载入 / 复制」按钮。改了文档跑
  `node scripts/check-docs.mjs`（代码块语言、示例语法、接口表都在那里校验）。
* **日志**：每个模块 `createLogger("<模块名>")`，**日志文案一律英文**（面向排查，不参与 i18n），源码注释
  仍用中文。`debug` 记过程细节、`info` 记用户可见动作、`warn` 记能继续跑但不符合预期的情况、`error` 记
  真正出错；不要直接用 `console.log` 打日志。
* **生命周期**：`onload` 注册块图标菜单、斜杠菜单项与设置面板，`onunload` 配对注销并删掉写给 Agent 的
  技能。异步的设置与技能放到 `initSettings()` 里后跑，免得拖慢文档渲染。写盘只有插件设置
  （`data/storage/petal/button-in-siyuan/settings`）与技能目录两处。
* **设置**：字段都要过 `mergeSettings`（缺字段 / 非法值回落默认），`saveSettings` 写完读回校验（宿主的
  `saveData` 在落盘前就可能 resolve，也不看 `response.code`），失败提示用户重试。面板**不传
  `openInWindow`**（当前窗口里的面板）；`addItem` 没有 `type` 字段，控件自己造 —— 输出策略是
  `direction: "row"` 的 `<select class="b3-select">`（row 模式占满整行，长选项不会被切掉），技能开关是
  `b3-switch`。`confirmCallback` 不等异步逻辑就关窗，保存与副作用都在 `saveSetting()` 里自己处理。输出
  策略在 `shouldShowOutput` 里生效，设置每次现取、不持有快照（渲染器与菜单项是加载时注册的）。**设置必须
  存成对象**：插件存储文件没有扩展名，内核按内容嗅探 Content-Type，只有 `{…}` / `[…]` 才解析回对象，
  裸数字会变成字符串。

## 构建产物与发布

* `npm run dev` 是 watch 构建（只写仓库根的 `index.js` / `index.css` / `i18n/`）；`npm run build` 才是
  打包构建（写 `dist/` 与 `package.zip`）。不要为了构建启动 watch。
* 集市图片的图源是手绘的 `assets/icon.svg` 与 `assets/preview.html`，改完必须重跑渲染脚本：`icon.png`
  由 `render-icon.mjs` 栅格化，`preview.html` 的编辑器部分由 `snapshot-editor.mjs` 真挂载一次 CodeMirror
  抓回 CSS 与 DOM，写进 `editor-css` / `editor-dom` 标记之间 —— 手改这两个标记之间的内容会被覆盖。
  界面里显示的图标来自 `src/buttonIcon.ts` 里的另一份图形，与集市图标各自独立。
* README 的预览图 URL 固定到**提交 SHA** 而不是分支别名（jsdelivr 对分支别名缓存很久），换图要更新 SHA。
* `plugin.json` 与 `package.json` 的 `version` 必须一致且高于最新 `v*` 标签。注意 `semver.Compare`：
  `3.8.6` 比 `3.8.6-alpha.5` **大**，写错了会拦住安装。
* 发布、上架集市必须先由维护者本人测试并确认；不要自行打标签、建 Release 或改版本号。
* `.github/workflows/` 与 `scripts/` 里的 workflow、发行说明与图片脚本是多个插件仓库共用的资产。
