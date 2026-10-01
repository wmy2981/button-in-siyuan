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
```

`npm run build` 之外不要启动 watch：`dev` 只用于本机联调，产物会盖住仓库根的 index.js / index.css。

## 模块划分

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 插件入口：注册自定义块渲染器、斜杠菜单项、块菜单项 |
| `src/buttonBlock.ts` | 按钮块配置的解析/序列化、渲染、两种操作的执行 |
| `src/editDialog.ts` | 「编辑按钮块」对话框 |
| `src/icon.ts` | 图标元素、图标列表收集、图标选择对话框 |
| `src/context.ts` | 传给各模块的运行上下文（`app` / `i18n` / `isMobile`） |
| `src/i18nKeys.ts` | 文案键类型，与 `src/i18n/*.json` 一一对应 |
| `src/index.scss` | 少量自有样式（脚本输出框、图标网格） |

## 实现约定

* **块标识**：块信息的格式是 `<插件包名>/<块类型>`，两段都经 `encodeURIComponent`。本插件用
  `button-in-siyuan/button`，块类型常量是 `BUTTON_BLOCK_TYPE`；块菜单只在
  `data-info` 能解析出相同包名与块类型时出现。
* **块内容**：`data-content` 里是单行 JSON（`{"text","icon","action"}`，`action` 为
  `{"type":"link","link"}` 或 `{"type":"script","script"}`）。内容为空按默认配置渲染；不是本插件
  写入的 JSON 时原样 `<pre>` 兜底，绝不覆盖用户数据。
* **写回块**：只能先改 `data-content`，再用 `protyle.getInstance().updateTransactionElement(element, oldHTML)`
  走编辑器事务（与宿主内部 `setContent` 的路径一致），事务结束后思源会重新调用渲染器。
* **插入块**：斜杠菜单回调里用 `protyle.insert(protyle.protyle.lute.Md2BlockDOM(markdown), true)`，
  markdown 为 `;;;button-in-siyuan/button\n{JSON}\n;;;`。
* **外观**：只用思源样式类（`b3-button`、`b3-text-field`、`b3-select`、`b3-dialog__content`、
  `b3-dialog__action`、`fn__*`、`ft__*`）与 `--b3-*` 变量；自有类统一用 `bis-` 前缀。
* **图标**：从文档里的 `<symbol id="icon…">` 现取现用（内置图标集 + 图标包 + 插件图标），
  用 `<use>` 引用，元素带思源的 `.svg` 类以跟随 `currentColor`。
* **操作执行**：`siyuan://blocks/<id>` 与 `assets/<path>` 用原生接口打开（桌面端 `openTab`、
  移动端 `openMobileFileById`），其余链接交给 `window.open`。JavaScript 操作在页面上下文执行，
  执行期间临时接管 `console` 用于收集输出，`finally` 中恢复。
* **生命周期**：`onload` 注册 `click-blockicon` 监听，`onunload` 配对注销；插件不写存储，也没有
  设置项、命令、停靠栏。

## 构建产物与发布

* `dist/`、`package.zip`、仓库根的 `index.js` / `index.css` / `i18n/` 都是产物，不提交、不手改。
* 集市图片：`assets/icon.svg`、`assets/preview.html` 是图源，改完必须重跑渲染脚本；PNG 提交在
  `assets/`，打包时落到包根。
* `plugin.json` 与 `package.json` 的 `version` 必须一致，且高于最新 `v*` 标签；`minAppVersion`
  按用到的 API 定（自定义块渲染器需要 3.8.5）。
* 发布、上架集市都必须先由维护者本人测试并确认；不要自行打标签、建 Release 或改版本号。
* `.github/workflows/` 与 `scripts/` 里的 workflow、发行说明与图片脚本来自本人插件项目的通用资产，
  改动前先确认是否属于通用资产本身的问题。
