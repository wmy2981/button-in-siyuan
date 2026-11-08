# 开发说明（button-in-siyuan）

面向本插件的维护与二次开发。这里只写「不说就会做错」的约定，且不重复 CLAUDE.md 里已有的硬规则与代码里
一眼可见的实现细节。

## 实现约定

* `siyuan` 必须保持 external，bundle 必须保持 CommonJS：思源用 `eval` 包住执行，ESM 输出会直接
  `SyntaxError: Cannot use import statement outside a module`。
* 写回块内容只能用宿主传给渲染器的 `setContent`（见 `updateButtonContent`）。自己改 `data-content`
  再提交事务不会刷新界面 —— `updateTransaction` 打的 `data-editing` 标记会让事务保留本地 DOM。
* `src/scriptApi.ts` 里注入的 `fetchPost` / `fetchGet` 是**包装过的**（宿主的回调式实现不给回调时
  Promise 解析成 `undefined`），不要删掉包装；增删注入项必须同步 `docs/javascript*.md` 第 2 节的接口清单。
* `docs/*.md` 的代码块语言统一写 `javascript`，`js` 之类会被 `scripts/check-docs.mjs` 拦下。
* 加文案键要同时改 `src/i18n/en.json`、`src/i18n/zh-CN.json` 与 `src/i18nKeys.ts`，
  `scripts/check-i18n.mjs` 要求两份同键、非空。
* **文案风格**：客观、技术化、尽量短。目录、字段名、限制条件直接写出来，不要「点一下」「一直以来」这类
  口语与冗余说明；同类失败提示统一写成「…失败，详见控制台」，不重复解释调试模式（那条规则只在设置项里写一次）。
* **Agent 文档不写界面**：`docs/skill.md` 与它的两份参考（`javascript.md`、`icons.md`）会被打包成技能交给 Agent，
  而 Agent 只能通过工具调用（`block` / `sql` / `file` / `http_request`）操作，所以这三份里不写菜单、对话框、设置项、
  编辑器面板、CSS 类名这类只有人能操作或看到的东西，只写数据结构、工具调用、接口语义与限制。`docs/javascript.zh-CN.md`
  是给用户看的（编辑器里的「查看 JavaScript 文档」），可以写界面路径，两份文案因此允许有这一处差异。
* 打开 `assets/…` 前先按宿主的 `isPreviewableAsset` 判断：不能建页签的资源交给内核
  `openPath` 通道；**不要用 `window.open`** —— 会被浏览器类插件接管，而 `wnd.addTab(undefined)`
  会弄坏页签布局。
* 块内容认不出是本插件配置（没有合法 `text` / `icon` / `action`）时**不渲染按钮、原样 `<pre>` 兜底**，
  绝不覆盖用户数据。
* **插入块**：斜杠项的 id 借用思源放行清单里的 `code`，否则主编辑器的斜杠菜单会按 id 过滤掉插件项。
  桌面端单元格里仍然没有入口（思源 3.8.6 起的单元格富文本编辑器关掉了 `pluginExtensions`，宿主限制）。
  斜杠项 html 与官方插件示例一致（`.b3-list-item__first` + `.b3-list-item__text`），移动端也交给宿主布局：
  思源修好 issue 20866 后，`.keyboard__slash-text` 里的 `.b3-list-item__first` 自带 flex 行，插件不再自己补。
* **编辑入口**：三条入口（块菜单、按钮右键、按钮长按）都走 `context.openEditor(...)`，由插件入口注入，
  免得渲染器与对话框模块互相引用成环。
* **命令操作**（issue #38，`src/commands.ts`）：按钮存命令 id（不是名字），点击时执行。宿主没有给插件
  「列出并执行任意命令」的接口，所以只用两处公开能力：内置命令的清单就是 `window.siyuan.config.keymap.general`
  的键（命令面板的 core 清单正好是它减去 `openContextMenu` / `commandPanel` / `agentChat` / `agentSend`
  这四个纯输入框快捷键，见 `app/src/command/nativeCatalog.ts`），执行走插件 API 导出的 `globalCommand`
  （`app/src/boot/globalEvent/command/global.ts`），**它返回 false 就是这条命令在当前环境跑不了**；
  插件命令读 `app.plugins[].commands`，id 与命令面板同形 `plugin/<插件名>/<langKey>`
  （`app/src/plugin/commandAdapter.ts`），执行时按命令面板的先后顺序调它自己注册的回调。
  **搜索、替换、移动、插入标题/表格、折叠这类只在编辑器上下文里成立的命令没有 public 入口**
  （它们在 `nativeRuntime.ts` / `contextCommands.ts` / `insertCommands.ts` 里，插件拿不到），
  因此不列进选择窗口；用户选到跑不了的命令时只弹一条 toast。选择窗口只列命令名，**不显示快捷键**：
  `keymap.general` 里存的是宿主自己的字符串（形如 `⌥⌘M`），不经宿主那套格式化直接摆出来既不准也
  不好看，要看快捷键去「设置 - 快捷键」。
* **移动端侧栏滑动**：宿主的自定义块渲染器给挂载元素挂了一组阻断冒泡的触摸监听
  （`app/src/plugin/customBlockRender.ts` 的 `isolateEditorEvents`），而侧栏滑动是挂在 `document` 上的
  冒泡监听（`app/src/mobile/util/touch.ts`），所以任何自定义块都滑不出侧面板。`src/mobileSwipe.ts` 在
  认出横向滑动之后照宿主的桥接写法合成触摸事件派发到块元素上，方向判断、跟手位移与松手提交仍全部交给
  宿主；点击与长按不转发。**移动端插件 API 打不开侧面板**（`toggleLeftDock` / `toggleRightDock` 在移动端
  构建里直接返回 false），别改走那条路。
* **按钮外观**：类名与思源设置面板的原生按钮一致，只额外用一条作用域规则把字号对齐界面字号、把
  `fn__size200` 的固定宽度改成宽度下限（文档里的自定义块用的是编辑器字号）。
* **按钮颜色**：存了颜色才加 `bis-button-color` 类并设 `--bis-button-color`，不存就与原生
  `.b3-button--outline` 逐像素一致。色板全走主题变量（换明暗主题会跟着变），因此不提供任意取色；编号跳过
  13（daylight 下等于页面底色）与 6（与默认的原生蓝同色）。**这条规则要同时命中管理窗口里的预览**
  （`.bis-manager .b3-button.bis-button-color`）：那个窗口不在 `.protyle-wysiwyg` 里，只按块上下文限定会让
  预览退回原生蓝，与文档里的按钮对不上。
* **关窗前的「放弃修改」确认**：不是逐条拦取消 / × / `Esc` / 点遮罩，而是把实例上的 `dialog.destroy` 换成
  自己的函数（宿主这四条路最后都调它）。**`disableClose` 只挡遮罩与 ×，挡不住 `Esc`**；判断「有没有改过」
  与保存必须共用同一个 `currentConfig()` 口径，否则会出现「什么都没改也弹确认」。
* **危险操作确认**：删除按钮块、删除快捷操作、删除 JS 文件与「放弃修改」共用 `src/confirmDanger.ts`
  这一个窗口（确认按钮是红色线框 `b3-button--remove`）。**不要退回宿主的 `confirm`**：它在打开时就
  `focus()` 确认按钮（`app/src/dialog/confirmDialog.ts` 末尾），而宿主的 `.b3-button--remove` 把
  `:hover` 与 `:focus` 写成同一套样式，窗口一出现按钮就已经是「悬停」外观。正文可能是脚本路径这类
  用户数据，走 `textContent` 写入，不拼进 HTML。
* **点过的按钮不留悬停态**：同样因为宿主把 `:hover` 与 `:focus` 写成同一套，鼠标点完焦点还留在按钮上，
  按钮看起来一直在悬停。编辑窗口给 `dialog.element` 加了 `bis-editor-dialog`，`index.scss` 只在
  `:focus:not(:focus-visible)` 时把底色与描边还原成静止态 —— 键盘 Tab 过去的按钮仍保留焦点反馈；
  描边色用 `currentColor`，不重抄主题变量。**提示气泡同理**：`.b3-tooltips` 的 `::after` 在
  `:hover` 与 `:focus-within` 时出现，点完按钮提示会一直挂着（删除按钮上方的「删除快捷操作」），
  所以同一窗口里 `:focus-within:not(:focus-visible)` 时把它 `display: none`。
* **代码编辑器**：CodeMirror 6，配色从思源已加载的代码高亮主题实测后映射，不写死。改高沿用思源原生
  textarea 那套（`.cm-editor` 上的 `resize: vertical`），命中区由浏览器给定：鼠标 **16×16**、触屏约
  **30×30**（本机 Chromium 实测，`::-webkit-resizer` 的宽高与滚动条宽度都改不动它），鼠标那份从角外擦过
  就抓不住，所以 `createCornerPad` 在角的外侧补了一块同样大小的透明命中区；**原生角本身一点不动**，两块
  区域不重叠，触屏按 `(pointer: coarse)` 把补丁藏掉。
* **弹窗不抢焦点**：插件自己的对话框打开时不聚焦输入框或编辑区（宿主 `Dialog` 本来只聚焦容器，Tab 与
  `Esc` 照常），免得顺手敲键盘就改掉了原来的内容。
  **移动端这一条是硬性的**：App 里 `HTMLElement.prototype.focus` 被宿主重写成不判 `isConnected` 就经原生桥接
  调 `showKeyboard()`（`app/src/mobile/index.ts`），键盘引起的 adjustResize 会改 WebView 高度、整页重排，
  打开的那一刻就闪一帧。所以图标选择窗口在移动端不聚焦搜索框；设置面板是宿主的 `Setting`，它在 `open()` 末尾
  会对正文里第一个 `input, textarea` 补一次 `focus()`（`app/src/plugin/Setting.ts`），输入项还会被
  `Dialog.bindInput` 在插入文档**之前**先聚焦一次（`app/src/dialog/index.ts`）—— 那次元素还游离在文档外，
  事后 `blur()` 和按祖先节点判断都拦不住。`index.ts` 的 `openSetting()` 因此在移动端于同步的 `open` 期间按
  元素类型接管 `HTMLElement.prototype.focus`，`finally` 里立刻还原；用户随后点输入框不经过这个重写，照常能编辑。
  校验不通过时的 `focus()` 与「载入示例」之后的聚焦是用户点出来的，保留。
* **对话框不重建合成层**：插件自己的对话框一律用 `src/dialog.ts` 的 `createDialog()` 创建，给外壳挂
  `bis-dialog-warm`；`index.scss` 让容器与 `.b3-dialog__content` 常驻 `will-change: transform`（设置面板在
  `openSetting()` 里补同一个类）。宿主的 `scale` +
  `opacity` 入场过渡（`component/_dialog.scss`）在起点与终点都会新建、销毁合成层，App 的 WebView 在那一帧
  只能提交旧的页面纹理 —— 打开面板时插一帧整屏旧画面。**过渡本身一点不动**：时长、曲线与
  `b3-dialog--open` 的切换时序都还是宿主那份，只把图层提前准备好。正文也要预热：只处理外壳时，滚动正文会
  单独混入旧画面。
  **满屏页面（管理窗口、JavaScript 文件页、快捷操作面板）例外**：它们走 `makeFullscreenDialog()`，
  入场同样预热，但入场结束（400ms）后把 `bis-dialog-warm` 收回来 —— 满屏页面会一直开着，常驻的整屏合成层
  没有意义，而预热只对入场那一刻有用。释放用固定时钟而不是 `transitionend`：宿主的容器同时过渡
  `transform` 与 `opacity`，两条事件先后到达，按事件释放有可能在 `transform` 还没走完时就把图层提前拆掉。
* **移动端底部抽屉**：`src/bottomSheet.ts` 给宿主对话框挂 `mobile-bottom-sheet-dialog` /
  `mobile-bottom-sheet` 与抓手，**入场与收起的时序照 `app/src/mobile/util/bindBottomSheetDialog.ts`
  逐步实现**（issue #46，此前动画与原生对不上、滑动收起时没有过渡）：
  - 建好面板先写 `transition: none` + `translateY(100%)` + `visibility: hidden`，谁也不抢跑；
  - 宿主加上 `b3-dialog--open`、并且键盘与视口都稳定之后（`waitForSheetViewport`：没有键盘下一帧就开，
    有键盘等它收起并稳定 32ms，最多等 1s），才放开 `visibility`、刷一次布局、恢复 `.mobile-bottom-sheet`
    自己那份 `.15s` 过渡、再改成 `translateY(0)`；
  - 收起时宿主先标 `data-dialog-closing` 再摘打开类，`updateOpen` 里冻住面板高度并清掉拖动留下的行内
    `transition` / `transform`，同一份过渡把面板整块送出屏幕。宿主的 `destroy()` 190ms 之后才移除 DOM，
    正好够这段过渡跑完；不清行内位移的话面板会停在手指松开的位置被直接抽走，就是「卡一下然后收起」。

  位置与尺寸只在入场那一次按可见视口算好（`top` / `bottom` / `height`），之后只有视口真的变了（键盘弹出、
  旋转、分屏）才重算，不在打开过程中跟着 `visualViewport` 的每个事件写。容器常驻 `bis-bottom-sheet` 的
  `will-change: transform` 预热图层。
  下拉关闭的阈值与宿主相同（120px / 面板高度的 1/4 / 0.6px/ms）；抓手只用于下拉关闭，不接管宿主那份
  「拖抓手改高度」，面板高度由调用方决定。这一整套 web 端复现不出来（`npm run check` 与浏览器验证都证明
  不了），只能由维护者在移动端 App 上复测。
* **App 里压着满屏窗口再开对话框会卡死（安全模式）**：满屏对话框（管理窗口、JavaScript 文件页）还挂在
  屏幕上时新建第二个对话框，App 的 WebView 会整帧卡死并重载前端。真机现象很具体：插件的 JS 38ms 就跑完
  （`editor: ready`），之后宿主 50ms 的打开类、200ms 的定时器都不再执行，第二个窗口一帧都没画出来。
  **抽屉、图层预热、CodeMirror 都不是原因**：去掉抽屉、去掉 `will-change`、不建 CodeMirror 都照样卡；
  把下层窗口从渲染树里摘掉（`display: none`）就完全正常。这是宿主/WebView 侧的问题，而摘掉下层窗口
  意味着打开期间看不到它，所以做成**默认关闭的可选安全模式**（`src/safeMode.ts`）：
  - 开关在插件设置面板里，值只写 `localStorage`，**不进插件设置、不跟随思源同步**，默认关闭；
  - 关闭时行为与以前完全一致；
  - 打开时走 `hideWhileOpening()`（`src/dialog.ts`）：两个管理窗口（`buttonManager.ts` / `topBar.ts`）
    在移动端打开编辑窗口前先藏起自己，编辑窗口的 `onClosed` 里恢复；编辑窗口打开 JavaScript 文件页时
    把 `dialog.element` 交给 `openScriptFileEditor({hideBelow})`，那个页面关掉时恢复。
  新增「从某个窗口再开一个窗口」的入口时按同样方式接安全模式，不要无条件藏窗口。
* **图标**：从文档里的 `<symbol id="icon…">` 现取现用，元素带思源的 `.svg` 类以跟随 `currentColor`。
  选择器里**不要改 `color`**：悬浮与选中只换底色 / 描边，否则靠 `currentColor` 上色的图标会显示成主色。
* **JavaScript 操作**：在页面上下文里整段包成 async 函数执行，执行期间接管 `console` 收集输出；弹窗策略
  改动时要同步 `docs/javascript*.md` 第 4 节。接管的同时把每一行原样放回宿主控制台，所以脚本的输出既在
  弹窗里、也在思源控制台里；`console.debug` 一档受设置里的「调试模式」控制，关着时既不进弹窗也不进控制台。
  **脚本开头的 `@bis-*` 声明**（`src/scriptMeta.ts`，issue #21）在每次执行前解析：`@bis-output` 覆盖这一次的
  弹窗策略；`@bis-frontends` / `@bis-backends` 用集市包同名列表的取值，当前环境不在列表里时只弹 Toast、
  不执行代码也不弹结果弹窗。声明只认第一行代码之前的 `//` 注释，取值非法时输出策略回落设置、环境列表
  退化成「哪儿都不能跑」（与集市包「列表非空且不匹配」的语义一致）。
* **JavaScript 文件操作**：每次点击都重新取代码（本地走 `/api/file/getFile`，云端重新下载）再交给同一个
  `runScript`，取不到只提示、不执行。**这几个内核文件接口没有用宿主的 `fetchPost`**：`getFile` 成功时回裸
  字节、出错才是 JSON 信封，而宿主对 `code < 0` 只弹提示、不调回调，403/404 拿不到 —— 那正是判断「文件
  不存在」要用的；写接口用 `fetchSyncPost` 并关掉 `processMessage`。**按钮里的 `file` 字段从 issue #20 起
  统一存工作空间相对路径**：`data/assets/x.js` 或 `data/storage/petal/button-in-siyuan/scripts/x.js`，
  与 `/api/file/*` 和 Agent 的 `file` 工具同一个口径；旧按钮里的 `assets/x.js` 由 `normalizeScriptPath()`
  补成 `data/assets/x.js` 继续读取，编辑保存时升级。路径只允许落在这两个脚本目录（`src/pluginPaths.ts`），
  不在别处读写 `.js`。**云端脚本必须二次确认**（可放弃 / 直接使用 / 下载到 `data/assets/` 之后与云端再无
  关系）；只有本地文件才提供编辑代码、编辑文件信息（改名 / 移动）与删除；脚本文件读写一律不走
  `plugin.loadData`。用户资源目录里的脚本仍要写 `custom-data-assets-button-in-siyuan` 属性，但内核的
  `IsAssetLinkDest` 只认 `assets/` 前缀，所以属性值由 `assetPathOf()` 从完整路径转回 `assets/…`；
  插件 `scripts/` 下的脚本不是资源，属性会被清掉。
* **顶栏快捷操作**（issue #30）：在 `onload` 里 `addTopBar` 注册一个 `iconZap` 条目，`onunload`
  用 `removeTopBar` 配对移除；带 icon 的条目在桌面端是顶栏图标，移动端由宿主放进顶栏的「插件」菜单。点击时现读
  `data/storage/petal/button-in-siyuan/topbar/`（`src/topBar.ts`）：一个快捷操作一个 JSON 文件，按文件名排序，
  内容与块 payload 同形但丢掉 `color`（只允许文本、图标与操作，配色不可改）；文件内容非法或没有认识字段的跳过并记日志。
  菜单每次展开都重新列目录，Agent 新建 / 编辑文件后无需重载。**菜单只执行、末尾只给一个「管理」入口**，
  新建与编辑都在管理面板里；面板的加号是思源原生图标按钮（`b3-button--outline b3-button--icon`），
  列表与预览只用图标 + 文本，不套按钮外观（`bis-manager__row-icon` / `bis-manager__action`）。
  编辑器复用那个编辑窗口，把保存 / 删除 / 运行换成文件操作，并隐藏配色；新建时 `deletable: false`，
  初始图标用 `DEFAULT_BUTTON_ICON`（`iconCirclePlay`，与新建按钮块一致），编辑时沿用文件里的图标，
  删除会删掉对应文件。执行走同一个 `runAction`，但没有块上下文（`blockID` 为空串、`protyle` 为 undefined）。
  **文案口径**：同一个窗口服务两种对象，快捷操作传 `quickAction: true`，字段标题、空文本回落值、「放弃修改」
  的提示都换成快捷操作那一套（`topBarTextLabel` / `topBarIconLabel` / `topBarActionLabel` /
  `topBarDiscardChangesTip`），不再出现「按钮块」。保存失败时窗口不再补一条 `blockNotEditable` ——
  快捷操作的保存出口自己已经给了提示。
* **按钮块管理**（issue #28）：入口是设置面板里的一个按钮，窗口在 `src/buttonManager.ts`。列表用一条 SQL
  取 `type = 'custom' AND markdown LIKE ';;;button-in-siyuan/button%'` 的块（显式 `LIMIT`，理由同
  `assetReference.ts`），同时取 `box` 与 `hpath`：`hpath` 是内核按文档整篇写进每个块的
  （`kernel/sql/database.go` 的 `batchUpdateHPath`），笔记本名字去宿主的 `window.siyuan.notebooks` 里按 box
  换（它本身就是 `lsNotebooks` 的结果），不用再发请求。逐条过 `parseButtonConfig`，不是本插件配置的块跳过；
  搜索与操作类型筛选都在内存里做。**列表第一行是笔记名字**（不重复按钮上的文本），第二行是「笔记本 · hPath」
  的灰色小字，行与行之间留 6px 间距。行内的按钮只是外观示意（`pointer-events: none`）：**固定宽度
  132px、内容靠左，文本单独包一层出省略号** —— 之前允许收缩、又是宿主默认的 `justify-content: center`，
  溢出部分会被两边一起裁掉，图标先没。详情复用 `createButtonElement()` 造出的**真按钮**，点它等于在
  文档里点这个块（`runAction`），其余是操作摘要、块 ID、笔记 hPath、所在笔记本，不再显示 `.sy` 路径。
  **块可能没在当前窗口渲染**，保存时
  `updateButtonContentAsync()` 在拿不到宿主 `setContent` 的情况下回落到 `/api/block/updateBlock`（markdown
  围栏整体替换，块 ID 不变）。**编辑 / 删除之后的刷新不能先清空列表**：清空再等查询会让窗口闪一下、滚动位置
  也被带回顶部，所以只有第一次打开才显示「正在读取」，其余刷新在同一个任务里重画并把 `scrollTop` 写回去
  （issue #34）；原来的块被删掉时右侧回到空状态，不能留着已经不存在的项。
* **在文档中定位**：跳转走 `siyuan://blocks/<id>`（宿主的 `processSiYuanUri` 负责打开所在文档、滚动到块并
  高亮），但**跳转前要先关掉管理窗口与设置面板**：管理窗口自己 `destroy()`，设置面板由入口通过
  `IButtonBlockManagerOptions.onLocate` 关 —— 插件拿到的 `siyuan` 类型里 `Setting` 还没有 `close()`，入口按
  实例从 `window.siyuan.dialogs` 里找回那个面板再 `destroy()`（与用户关窗同一条路径），否则文档上会压着两层窗口。
* **编辑窗口的运行与删除**（issue #27）：左下角两个纯图标按钮，运行用 `runAction()` 走与点击按钮块同一条
  路径（表单当前值，不要求先保存；链接、内联脚本、脚本文件都一样），删除走 `/api/block/deleteBlock` 并
  先二次确认。删除成功后把 `saved` 置真再关窗，避免「放弃修改」再拦一次；笔记锁定时只禁用删除，运行照旧，
  因为直接点击锁定笔记里的按钮块本来就会执行。**按钮尺寸不要自己写死**：宿主的 `.b3-dialog__action` 是
  `align-items: center`，只有图标的按钮会缩到「16px 图标 + 8px 内边距」＝ 24px 高，图标因此显得偏大、按钮
  也不方正；同一窗口的 JS 文件路径行是 28×28，因为那圈 `.fn__flex`（`display: flex`，默认 stretch）把它
  拉到了与输入框同高。`.bis-action-start` 因此用 `align-self: stretch` 撑满整行，外观仍然全部来自
  `.b3-button--icon`。
* **脚本数据文件**（issue #25）：注入给脚本的 `plugin` 是插件实例的代理（`src/scriptStorage.ts`），只把
  `saveData` / `loadData` / `removeData` 的名字改写到插件目录下的 `storage/` 子目录，其余属性与方法原样
  转发，方法都绑回真实实例（宿主的生命周期检查按实例身份判断）。旧版本写在插件目录根的数据文件在第一次
  读取时迁到 `storage/` 并删掉旧文件；写入时也会清掉旧位置的同名文件。插件自己的设置仍走原路径，不经过
  这层代理。
* **链接操作**（`src/openLink.ts`）：效果要与文档里点 `[]()` 链接一致，即对齐宿主的
  `app/src/editor/openLink.ts`。非本地地址一律交给 `platformUtils.openByMobile`（宿主用的同一个函数，
  `siyuan://` 与插件事件也在里面处理）；本地路径按 `window.siyuan.config.editor.assetOpen` 算动作，移动端
  与宿主一致、不认配置。**打开之前必须先把 `open-asset` / `open-link` 发给其他插件**（`emitToPlugins`，
  宿主没暴露，只能照它的做法遍历 `app.plugins` 的 eventBus）：这两个是可取消事件，接管资源打开的插件
  （如 editor-siyuan）靠 `preventDefault()` 顶掉默认行为；漏掉这一步的表现是「文档里点链接会被接管、从
  按钮点却不会」。两个已知差距：`new-window` 回落成当前页签（宿主走 Electron 专用通道，插件 API 没有
  入口）；远端内核（`--remote`）下宿主认为不是本地文件系统，插件仍按前端判断。
* **脚本文件别被当成未引用资源**：按钮的引用关系写在块内容里，思源的引用扫描只看文档链接与块属性，看不到
  它，用户一「清理未引用资源」按钮就点不动了。所以把脚本路径写成块属性
  `custom-data-assets-button-in-siyuan`（思源把所有 `custom-data-assets` 开头的属性算作资源引用，用插件
  自己的名字是为了不覆盖用户写的）。三条路都要写：编辑窗口保存时、渲染按钮块时对齐一次（Agent 用块接口建
  的块与同步过来的文档都不经过编辑窗口，只有渲染器当场看得见）、插件加载时整库补一次
  （`syncAssetReferences()` 与 `ial` 比对，只在不一致时写回）。`syncAssetReferences()` 里那条 SQL 必须带
  显式 `LIMIT`：内核给 `/api/query/sql` 套了用户设置的搜索条数上限（默认 64），不写会被静默截断。**导出时
  只在收集原始树资源的格式里生效**：HTML 与 Word 会把资源目录里的脚本按相对路径复制到导出目录的 `assets/`
  下；插件 `scripts/` 下的脚本不是资源，任何导出都不会带走它。Markdown `.zip` 与 Pandoc 是导出后重新解析
  正文再收集，块属性已经丢掉，所以 `.zip` 里也没有 `data/assets/` 的脚本（README 的「限制」写明了）；
  `.sy.zip` 按思源自身的设计不带资源。
* **Agent 技能**：技能是**一个目录**，由 `src/agentSkill.ts` 写成
  `data/storage/ai/agent/skills/button-block/`：正文来自 `docs/skill.md`，两份参考文档来自
  `docs/javascript.md` 与 `docs/icons.md`。正文走内核的 `/api/ai/agent/saveSkill`（它只肯写 `SKILL.md`，
  会顺手建好技能目录），附件走 `/api/file/putFile`（自动建出 `references/`，对已存在的文件是无条件覆盖），
  写入与打包下载共用 `buildSkill()` 一处渲染。写正文时还会在 frontmatter 里补 `metadata.skill_version`，
  版本现读安装目录的 `plugin.json`（思源只从 frontmatter 取 `name` / `description`，多这一段不影响索引）。
  每次加载都**无条件覆盖写入**（技能由插件维护，盘上的副本可能是旧版本或被手改过）；删除只写在 `onunload`
  一处，禁用、重载与卸载都会先跑它。内核的 `removeSkill` 是整目录 `RemoveAll`，但它按「目录里有没有
  SKILL.md」认技能，正文被手删过就只会报 `skill not found`、附件留在盘上，所以失败后确认目录还在时先补写
  正文再删一次。AI 功能被关掉时接口直接失败，只记日志、不弹提示。设置面板里的「下载技能」先用
  `/api/archive/zip` 压成 `button-block.zip`，再交给宿主的 `saveExportFile`；而它只肯复制
  `<工作空间>/temp/export/` 下的文件，所以三个文件与压缩包都先写进那个目录，保存对话框里的默认文件名就是
  压缩包名；内容取包内自带的那份，技能开关关着也能导出。
* **内置文档**：`docs/*.md` 由 webpack 的 `asset/source` 内嵌进 index.js，入口用 Lute 的富文本预览渲染器
  转成 HTML，按界面语言选文档；`scriptDocs.ts` 按预览输出的
  `<pre class="code-block" data-language="javascript">` 结构给每个示例套一层并加「载入 / 复制」按钮。正文
  里的 `{{siyuan-ref}}`（常量在 `src/siyuanRef.ts`）是官方 API 文档链接的版本占位符：渲染文档与写技能时
  都替换成 `v<内核版本>`（优先 `window.siyuan.config.system.kernelVersion`，回落 `/api/system/version`，
  都取不到时换成 `dev`），要指向本机思源版本。改了文档跑 `node scripts/check-docs.mjs`（示例语法、接口
  清单、版本占位符都在那里校验）。
* **日志**：每个模块 `createLogger("<模块名>")`，**日志文案一律英文**（面向排查，不参与 i18n），源码注释
  仍用中文。`debug` 记过程细节、`info` 记用户可见动作、`warn` 记能继续跑但不符合预期的情况、`error` 记
  真正出错；不要直接用 `console.log`。**插件的日志一条都不常开**：所有级别只在设置里的「调试模式」打开时
  输出，所以日志文案不必自己判断开关；关着时思源控制台里只该有脚本自己的 console 输出（由 `scriptRunner.ts`
  转交，不经过这里）。开关由 `settings.ts` 在读到设置时（`setDebugEnabled`）、以及插件入口在保存设置后应用，
  **设置读出来之前的调用会被丢掉**，所以「插件已加载」这类启动信息放在 `initSettings()` 里打。
* **生命周期**：`onload` 注册块图标菜单、斜杠菜单项与设置面板，`onunload` 配对注销并删掉写给 Agent 的
  技能（禁用、重载、卸载都会跑到）。异步的设置与技能放到 `initSettings()` 里后跑，免得拖慢文档渲染；写盘
  只有插件设置（`data/storage/petal/button-in-siyuan/settings`）与技能目录两处。`uninstall` 只在从工作
  空间移除插件时运行，只删 `settings`（issue #26）：`scripts/`、`storage/` 与 `topbar/` 都是用户内容，
  保留。清理走 `plugin.removeData`：它带发起窗口的 app id，裸调 `/api/file/removeFile` 会让本窗口收到
  storage 变更、在卸载过程中重载插件。先禁用再卸载时没有实例，宿主不调用任何钩子，设置会留下。
* **设置**：字段都要过 `mergeSettings`（缺字段 / 非法值回落默认），`saveSettings` 写完读回校验（宿主的
  `saveData` 在落盘前就可能 resolve，也不看 `response.code`），失败提示用户重试。面板**不传
  `openInWindow`**；三个下拉列表都不传 `direction`：思源对 `<select>` 自己判成 column（标题在左、控件在
  右），窗口窄于 750px 时再由它的响应式规则换成标题下面占满整行。`confirmCallback` 不等异步逻辑就关窗，
  保存与副作用都在 `saveSetting()` 里自己处理；设置每次现取、不持有快照（渲染器与菜单项是加载时注册的）。
  **设置必须存成对象**：插件存储文件没有扩展名，内核按内容嗅探 Content-Type，只有 `{…}` / `[…]` 才解析回
  对象，裸数字会变成字符串。

## 测试

* `npm test` 跑 `tests/` 下的 vitest 单元测试（jsdom 环境）。`vitest.config.mts` 把 `siyuan` 指到
  `tests/mocks/siyuan.ts`，宿主对象、内核接口与对话框都有可控替身，测试不会启动思源、也不碰本机工作区。
* 测试文件按 `src/` 模块一一对应；`npm run typecheck:tests` 用 `tsconfig.tests.json` 单独检查测试类型
  （`tsconfig.json` 仍只覆盖 `src/`，打包与插件类型不受影响）。
* CI 的 `test` job 跑 `npm test`；`check` job 的 `npm run check` 还包含测试类型检查与打包构建。

## 构建产物与发布

* 集市图片的图源是手绘的 `assets/icon.svg` 与 `assets/preview.html`，改完必须重跑渲染脚本：`icon.png` 由
  `render-icon.mjs` 栅格化；`preview.html` 的编辑器部分由 `snapshot-editor.mjs` 真挂载一次 CodeMirror 抓回
  CSS 与 DOM，写进 `editor-css` / `editor-dom` 标记之间，手改这两段会被覆盖。
* README 里的预览图 URL 固定到提交 SHA（jsdelivr 对分支别名缓存 12 小时以上），换图要更新 SHA。
* `plugin.json` 与 `package.json` 的 `version` 必须一致且高于最新 `v*` 标签。注意 `semver.Compare`：
  `3.8.6` 比 `3.8.6-alpha.5` **大**，写错了会拦住安装。