# Public repository cleanup record

本记录说明 VisionQA 从旧 SaaS/电商工作台收敛为独立视觉评审插件后的公开 Git 边界。它只记录可复现的仓库状态，不把本地模型质量、客户采用或线上部署当作证据。

## 公开 refs

审计时公开远端只保留：

- `origin/main`：独立插件根提交 `e909816` 及其公开文档更新；
- `origin/codex/visionqa-phase3-qwen`：从同一独立根提交继续的插件实现分支。

公开 `main` 树只包含 `contracts/`、`desktop/`、`docs/`、`web/` 及项目治理文件；没有旧 `data/`、客户素材、运行日志、旧登录/批次/修图工作台、客户账本或部署备份目录。公开树中的品牌 PNG 仅为产品图标，不是客户素材。

本轮没有执行无必要的强制改写：公开 `main` 已经是独立根历史，后续插件改动使用快进或普通提交推进；禁止用 `git push --all`、`git push --mirror` 或把本地 archive refs 推到公开远端。

## 本地归档边界

旧阶段仅保留在本机：

- `D:\Projects\VisionQA-local-archive-20261027.git`；
- `archive/local-pre-plugin-release-20261027`；
- `archive/local-staging-transfer-20261008`；
- `archive/local-visionqa-main-before-visual-plugin-20261022`；
- 本地 `remotes/sites/main` 旧站点引用。

这些归档可能包含历史客户素材、运行记录和旧业务代码，不能直接压缩整个 `.git`、不能上传到 GitHub，也不能作为当前产品源码分发。需要向第三方交付时，必须从公开 `main` 的干净 clone 或 release bundle 重新生成。

## 本地工作区安全提醒

当前 `D:\VisionQA` 仍可能存在被 `.gitignore` 忽略的 `data/`、`runs/`、`deploy/`、`secrets/`、`web/.env.local`、浏览器 profile 和构建产物。这些不在公开 Git 树中，但“被忽略”不等于安全：

- 不要使用 `git add -f`、`git push --all` 或从整个工作区制作发布压缩包；
- portable/Electron 产物只从受控构建目录生成，排除 `.env`、`secrets/`、客户图片和运行日志；
- 本机密钥只通过桌面应用的外部配置注入，不能写入前端、测试 fixture、文档或截图；
- 如果某个密钥曾经进入公开远端、共享压缩包或日志，应立即轮换，不能只依赖删除文件。

## 复核命令

以下命令用于复核公开 refs，而不是清理本地归档：

```powershell
git ls-remote --heads --tags origin
git ls-tree -r --name-only origin/main
git grep -n -I -E 'sk-[A-Za-z0-9._-]{12,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY' origin/main -- ':!web/package-lock.json'
git status --short --untracked-files=all
```

预期结果：公开 refs 不包含 archive 分支；公开 `main` 不包含旧客户/数据目录和真实凭据；本地忽略文件若存在，只能被列为工作区风险，不能进入提交或构建产物。
