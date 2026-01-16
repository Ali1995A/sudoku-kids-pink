# sudoku-kids-pink

粉色系儿童数独（适合 Vercel 部署的纯静态网页应用）。

## 功能

- 5 个难度（默认难度 1：最简单）
- 无限制错误机会（同行/同列/同宫冲突会变红，但不会失败）
- 提示功能：优先填“只剩一个可能”的格子（否则仍会填一个正确格子）
- 笔记模式（候选数字/铅笔标记）
- 玩法说明（规则 + 新手小技巧）
- 大按钮 + 图标交互（更适合不识字的儿童）
- 针对 iPad Pro 一代 Safari / 微信内置浏览器：触控优化、避免误触缩放、适配安全区

## 本地运行

任意静态服务器都可以，例如：

```bash
cd sudoku-kids-pink
npx http-server -p 5173
```

然后打开 `http://localhost:5173/`。

## 部署到 Vercel

- 把 `sudoku-kids-pink` 作为一个独立仓库推到 GitHub（推荐）
- 在 Vercel 新建项目，选择该仓库
- Framework Preset 选 “Other”
- Build Command 留空，Output Directory 留空（或根目录）

入口文件：`index.html`

## 推送到 GitHub（示例）

```bash
cd sudoku-kids-pink
git init
git add .
git commit -m "init: pink sudoku for kids"
```
