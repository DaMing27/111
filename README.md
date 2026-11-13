# 三张活地图 · 数学与算法基础（GitHub Pages 独立版）

这是从 WorkBuddy 发布页剥离出来的静态站点，不依赖 WorkBuddy 云 SDK、数据库或账号。

- **网站**：<https://daming27.github.io/111/>
- **仓库**：<https://github.com/DaMing27/111>
- **反馈**：<https://github.com/DaMing27/111/issues>

> 仓库名 `111` 是临时名。把仓库改名为 `three-living-maps` 后，网站地址会变成
> <https://daming27.github.io/three-living-maps/>；同时把
> `site/js/feedback.js` 里的 `FEEDBACK_REPO` 改成 `DaMing27/three-living-maps` 并重新推送。

## 目录结构

```text
.
├── .github/workflows/publish.yml   # 推送 main 后把 site/ 发布到 gh-pages
├── site/                           # 唯一发布目录
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── data.js                 # 内容主文件：条目、关系、版本记录
│       ├── app.js                  # 地图与关系网络
│       └── feedback.js             # GitHub Issues 反馈（无后端）
├── index.txt                       # 仓库原有文件，未改动
└── README.md
```

## 发布方式

- `main` 是源码分支；`site/` 是唯一发布目录。
- 推送 `main` 后，Actions 工作流 **Publish site to gh-pages** 会把 `site/` 发布到 `gh-pages` 分支。
- GitHub Pages 从 `gh-pages` 分支根目录提供服务，地址保持不变。
- **不要直接编辑 `gh-pages`**：它由工作流生成，会被覆盖。要改内容请改 `main/site/`。
- 如果 Pages 没有更新：打开 **Settings → Pages**，把 Source 设为 **Deploy from a branch**，分支选 **gh-pages**，目录 **/(root)**；然后在 **Actions** 里重新运行发布工作流。

## 日常修改

1. 编辑 `site/js/data.js`：新增条目、补充 `relations`、更新 `VERSIONS`。
2. 修改 `site/index.html` 时同步首页版本号与日期。
3. 提交并推送到 `main`：

```bash
git add .
git commit -m "Update domain map"
git push origin main
```

Actions 会把 `site/` 自动发布到 `gh-pages`；通常 1 分钟内生效。

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
3. 也可以让对方 fork 仓库，改完发起 PR。

网页访客不需要账号或权限；只有「修改仓库」需要协作者权限。

## 与 WorkBuddy 的关系

- 站点文件、地图数据和反馈逻辑都已独立，不加载 WorkBuddy SDK，也不需要 WorkBuddy 账号。
- 旧的 WorkBuddy 发布链接可以保留作历史版本；后续更新以本仓库和上面的 GitHub Pages 地址为准。
