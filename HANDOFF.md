# Bases Data Studio 项目交接

最后更新：2026-11-06

## 项目与目标

- 项目：Obsidian 社区插件 Bases Data Studio，插件 ID `bases-data-studio`。
- 仓库：https://github.com/xiaofeialen/bases-data-studio
- 当前正式 GitHub Release：https://github.com/xiaofeialen/bases-data-studio/releases/tag/0.2.0
- 用户希望将插件提交到 Obsidian 社区插件目录，并继续开发。
- 规划：V1 CSV/JSON 导入；V1.5 增量导入与冲突处理；V2 持续同步；V3 图表和报表。V1 免费，未来可能探索付费功能。
- 技术：TypeScript、Obsidian Plugin API、Papa Parse；本地处理，不依赖服务器。许可为官方模板自带的 0-BSD。

## 当前状态

0.2.0 已公开发布，Release 包含 `main.js`、`manifest.json` 和 `styles.css`。最低 Obsidian 版本为 1.15.0。社区目录是否已经完成提交或审核**未确认**：用户曾表示已登录，但云端会话无法访问用户的浏览器登录状态，也未能代为提交。不要假定已经上架。

当前功能：CSV/JSON 导入、字段映射和类型推断、唯一键、导入预览、创建 Markdown/YAML、按来源筛选的 Bases 视图、日志和冲突保护。新笔记的来源和键记录在 `bases_data_studio_source` 和 `bases_data_studio_key` 中，使保留这些属性的笔记被移动或重命名后仍可识别。同一目标文件夹表示一个数据集；更换文件夹视为新数据集。

0.1.0 可能转换或裁剪 CSV 唯一键，原始值不总能恢复。0.2.0 将可能匹配的旧记录标记为冲突并跳过，需按 README 人工核对；插件不会覆盖旧笔记或旧 `.base` 视图。已存在的笔记目前不自动更新。删除或破坏保留属性后无法保证识别。

## 验证

- 已运行 `npm run lint`、`npm test` 和 `npm run build`，均通过。
- 在隔离的真实 Obsidian 1.15.0 中测试了 CSV/JSON 导入、移动/重命名后的去重、不同来源同键隔离、旧版冲突保护、Bases 视图和日志。
- 0.2.0 发布附件的 SHA-256 与在 Obsidian 中验证的构建一致（`13b17abc35dfbb0e5c43b331bb67165c76e10a3e9eae2591e07bc94703f60033`）。
- 尚未验证移动端；不要声称所有平台和场景均已测试。

## 本地继续

在终端执行：

```bash
git clone https://github.com/xiaofeialen/bases-data-studio.git
cd bases-data-studio
npm install
npm test
npm run build
```

已克隆过则在项目目录运行 `git pull`。在本地 Codex 中打开该文件夹，要求读取 `HANDOFF.md` 和 `README.md` 后继续。

## 社区目录提交

官方当前流程是登录 https://community.obsidian.md，在个人资料中通过 GitHub → Connect 关联 GitHub，然后到 Plugins → New plugin，填写仓库 URL 和 Owner，阅读政策与维护承诺并提交。目录会检查默认分支的 manifest 和对应版本的 GitHub Release。提交状态和反馈须在用户的社区目录账户中确认。登录、授权及政策确认应由用户本人完成；不要索要密码或验证码。详情以 Obsidian 官方最新提交文档为准。
