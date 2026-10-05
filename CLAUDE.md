# CLAUDE.md

This file provides guidance to ANY AGENT when working with code in this repository.

思源笔记插件：把**按钮块**（思源自定义块 `button-in-siyuan/button`）插入文档
开发文档 [docs/development.md](./docs/development.md)，改动代码前必须读。

## 命令

```bash
npm run check      # 唯一完整门禁：i18n 键校验 + 文档校验 + tsc --noEmit + 打包构建
npm run typecheck
npm run build      # dist/ + package.zip
npm run dev        # watch 构建，只写仓库根的 index.js / index.css / i18n/（本机插件目录加载用）
```

* **改完只做静态验证**（`npm run check`，或 `typecheck` + `build`）。真实测试由维护者手动完成：
  不要操作维护者的本机思源与工作区，也不要写端到端测试。

## 边界

* **不要 push、不要打 tag、不要建 Release、不要改版本号**
* 开发都在 `dev` 分支，`main` 只接可发布的合并；只有 push `main` 会触发发布（CD 不监测 `dev`）。
* 包管理器是 **npm**（`package-lock.json` + CI `npm ci`），不要引入 pnpm / yarn。

## 代码风格

* 4 空格缩进、双引号、分号；源码注释与文档用中文。
* 严格 TypeScript：未引用的局部变量/参数是**构建错误**（`noUnusedLocals` / `noUnusedParameters`），
  故意保留的必须显式 export；`verbatimModuleSyntax` 下类型导入一律写 `import type`。
* UI 只用思源样式类与 `--b3-*` 变量，不硬编码思源已暴露的颜色、字号；自有类统一 `bis-` 前缀，
  自有对话框的定位属性用 `data-bis`（`data-type` 是思源自己的派发键，不要占用）。
