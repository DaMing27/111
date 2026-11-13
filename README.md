# 三张活地图 · 数学与算法基础（GitHub Pages 独立版）

这是从 WorkBuddy 发布页剥离出来的静态版本，不再依赖 WorkBuddy 云 SDK。

- **网站**：<https://daming27.github.io/111/>
- **仓库**：<https://github.com/DaMing27/111>

> 仓库名 `111` 是临时名。把仓库改名为 `three-living-maps` 后，网站地址会变成
> <https://daming27.github.io/three-living-maps/>；同时把
> `site/js/feedback.js` 里的 `FEEDBACK_REPO` 改成 `DaMing27/three-living-maps` 并重新推送即可。

## 目录结构

```text
.
├── .github/workflows/pages.yml   # 推送到 main 后自动部署到 GitHub Pages
├── site/                         # 只把这一目录发布为网站
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── data.js               # 内容主文件：条目、关系、版本记录
│       ├── app.js                # 地图与关系网络
│       └── feedback.js           # GitHub Issues 反馈（无后端）
└── README.md
```

## 日常修改

1. 编辑 `site/js/data.js`：新增条目、补充 `relations`、更新 `VERSIONS`。
2. 修改 `site/index.html` 时同步首页版本号与日期。
3. 提交并推送到 `main`：

```bash
git add .
git commit -m "Update domain map"
git push origin main
```

GitHub Actions 会自动把 `site/` 部署到 Pages；通常 1 分钟内生效。

## 本地预览

```bash
python -m http.server 4173 --bind 127.0.0.1 --directory site
```

打开 <http://127.0.0.1:4173/#domain>。

## 反馈机制

- 反馈页把内容整理成一条预填的 GitHub Issue，访问者登录 GitHub 后提交。
- 页面的「已有反馈」通过 GitHub 公开 API 读取标题以 `[反馈]` 开头的 Issue。
- 没有 GitHub 账号的访问者可以点「复制反馈内容」，把文本发给小组。
- 反馈是公开的；请勿在 Issue 中填写隐私信息。

## 让其他人一起维护

1. 仓库 **Settings → Collaborators → Add people**，邀请组员（需要对方的 GitHub 账号）。
2. 组员克隆仓库后修改 `site/js/data.js`，推送或提交 Pull Request。
3. 也可以直接让对方 fork 仓库，改完发起 PR。

网页访客不需要账号或权限；只有「修改仓库」需要协作者权限。

## 如果 Pages 没有自动发布

1. 打开 **Settings → Pages**。
2. 把 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 重新运行 **Actions → Deploy site to GitHub Pages → Re-run all jobs**，或再推送一次。

## 与 WorkBuddy 的关系

- 站点文件、地图数据和反馈逻辑都已独立，不加载 WorkBuddy SDK，也不需要 WorkBuddy 账号。
- 旧的 WorkBuddy 发布链接可以保留作历史版本，但后续更新以本仓库为准。
