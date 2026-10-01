# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

思源笔记插件：把**按钮块**（思源自定义块 `button-in-siyuan/button`）插入文档，文本、图标与点击操作
都在思源原生对话框里编辑。本文件只写「不说就会做错」的约定；模块划分、实现细节、发布与集市图片
的说明在 [docs/development.md](./docs/development.md)，改动相关模块前读它。

## 命令

```bash
npm run check      # 唯一完整门禁：i18n 键校验 + 文档校验 + tsc --noEmit + 打包构建
npm run typecheck
npm run build      # dist/ + package.zip
npm run dev        # watch 构建，只写仓库根的 index.js / index.css / i18n/（本机插件目录加载用）
```

* **改完只做静态验证**（`npm run check`，或 `typecheck` + `build`）。真实测试由维护者手动完成：
  不要操作维护者的本机思源与工作区，也不要写端到端测试。
* 不要为了跑构建而启动 `dev`：它是常驻 watch，产物落在仓库根，会盖住同名产物。
* 改了图源必须重渲染，否则集市图标与预览图还是旧的：`node scripts/render-icon.mjs`、
  `node scripts/render-preview.mjs`（首次需 `npx playwright install chromium`）；改动
  `src/codeEditor.ts` 的外观要先跑 `node scripts/snapshot-editor.mjs` 写回 `assets/preview.html`。

## 边界

* **不要 push、不要打 tag、不要建 Release、不要改版本号**：发布与上架集市必须由维护者测试并确认。
* 开发都在 `dev` 分支，`main` 只接可发布的合并；只有 push `main` 会触发发布（CD 不监测 `dev`）。
* 包管理器是 **npm**（`package-lock.json` + CI `npm ci`），不要引入 pnpm / yarn。
* `dist/`、`package.zip`、仓库根的 `index.js` / `index.css` / `i18n/` 是产物：不提交、不手改。

## 代码风格（与语言默认不同）

* 4 空格缩进、双引号、分号；源码注释与文档用中文。
* 严格 TypeScript：未引用的局部变量/参数是**构建错误**（`noUnusedLocals` / `noUnusedParameters`），
  故意保留的必须显式 export；`verbatimModuleSyntax` 下类型导入一律写 `import type`。
* UI 只用思源样式类与 `--b3-*` 变量，不硬编码思源已暴露的颜色、字号；自有类统一 `bis-` 前缀，
  自有对话框的定位属性用 `data-bis`（`data-type` 是思源自己的派发键，不要占用）。

## 容易踩的坑

* `siyuan` 必须保持 external，bundle 必须保持 CommonJS：思源用 `eval` 包住执行，ESM 输出会直接
  `SyntaxError: Cannot use import statement outside a module`。
* 写回块内容只能用宿主传给渲染器的 `setContent`（见 `updateButtonContent`）。自己改 `data-content`
  再提交事务不会刷新界面 —— `updateTransaction` 打的 `data-editing` 标记会让事务保留本地 DOM。
* `src/scriptApi.ts` 里注入的 `fetchPost` / `fetchGet` 是**包装过的**（宿主的回调式实现不给回调时
  Promise 解析成 `undefined`），不要删掉包装；增删注入项必须同步 `docs/javascript*.md` 的接口表。
* `docs/*.md` 的代码块语言统一写 `javascript`，`js` 之类会被 `scripts/check-docs.mjs` 拦下。
* 加文案键要同时改 `src/i18n/en.json`、`src/i18n/zh-CN.json` 与 `src/i18nKeys.ts`，
  `scripts/check-i18n.mjs` 要求两份同键、非空。
* 打开 `assets/…` 前先按宿主的 `isPreviewableAsset` 判断：不能建页签的资源交给内核
  `openPath` 通道；**不要用 `window.open`** —— 会被浏览器类插件接管，而 `wnd.addTab(undefined)`
  会直接弄坏页签布局。
* 块内容认不出是本插件配置（没有合法 `text` / `icon` / `action`）时**不渲染按钮、原样 `<pre>` 兜底**，
  绝不覆盖用户数据。
* 斜杠菜单项 html 必须带 `bis-slash-item` 标记，`index.scss` 靠它在移动端斜杠菜单里补 flex：思源把
  插件项 html 塞进 `.keyboard__slash-text`（插件项没有图标槽），去掉标记或那条规则，移动端图标与文字
  会叠成两行（细节见 `docs/development.md` 的「插入块」）。
* 脚本既没有 `return`、没有 console 输出、也没有报错时**不弹结果弹窗**（静默执行），别改成每次都弹。
* README 里的预览图 URL 固定到提交 SHA（jsdelivr 对分支别名缓存 12 小时以上），换图要更新 SHA。
