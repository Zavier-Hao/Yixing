# 弈星作品集与聊天 Demo

静态作品集加同源 Node.js 后端。第 05 页可真实调用硅基流动千问模型，第 06 页为技术文档与愿景。

## 本地运行

需要 Node.js 22 及以上版本，无需安装第三方依赖。

1. 复制 `.env.example` 为 `.env`，在本机文件中填入 `SILICONFLOW_API_KEY`。
2. `npm start`
3. 打开 http://127.0.0.1:5050/#demo 。直接打开 `dist/index.html` 可以查看作品集，真实聊天需从 HTTP 服务打开。
4. `npm test` 运行模拟模型测试，不消耗服务商额度。

密钥只由服务端读取，`.env` 已加入 Git 忽略。不要把 `.env` 复制到 `dist/` 或把密钥填入浏览器代码。后端只公开 `dist/`，不公开 `server/`、`data/` 或环境文件。对话历史由当前网页维护，刷新后清空，不在服务器保存聊天记录。

## 模型与接口

- 实际模型：`Qwen/Qwen3.5-27B`，可通过环境变量替换。
- `/api/health`：返回服务配置状态、资料快照版本与数据来源，不返回密钥。
- `/api/session`：同源会话及 CSRF token。
- `/api/chat`：POST JSON `{ "messages": [{ "role": "user", "content": "..." }] }`。SSE 返回 meta、delta、done 或 error 事件。
- 输入最多 12 条历史、每条 2000 字；单次输出最多 900 token。UI 支持停止生成、新对话、来源链接和多轮追问。
- 默认每 IP 每小时 15 次、全站每小时 60 次、最多 3 个并发请求，可通过 `.env.example` 中的设置调整。反向代理部署需按下面配置可信的真实 IP。
- 内置超时、客户端断连取消、服务商错误脱敏、跨源校验和会话并发限制。

## 攻略资料与边界

核验日期 2026-11-07，S18 攻略标注 18.6。CommunityDragon 的客户端版本标识为 16.22 系列，保留在数据元信息中，不冒充 TFT 补丁编号。

- `data/knowledge.json`：74 条有羁绊棋子记录（含形态变体）、36 条羁绊、183 条通用装备目录。数据文件中的通用装备条目不等于全部都在当前掉落池。
- `data/guide-snapshot.json`：TFT Coach 的 311 个阵容名称索引、65 个英雄的配装统计条目。配装页仍为 18.5 快照，严格标注上一补丁参考。
- 已逐条尝试目录内的 311 个阵容链接，导入 129 份能够读取的成型棋子与主 C 配装快照。其中 30 份明确标注 18.6，99 份未明确标注补丁（归档，不进入当前推荐）。部分详情无法读取或无公开缓存，只保留索引，不能当成完整运营攻略。覆盖统计位于 `coverage`，不宣称全部现版本攻略已完整导入。
- 资料中的技能描述可能含 Riot 参数占位符；保留数值变量，不让模型自行编造缺失参数。
- 检索按用户所提英雄、装备和羁绊选择相关记录，另附完整棋子名单与明确的羁绊成员表。系统提示区分事实、旧版参考和条件化建议。
- 不读取真实棋盘，不访问用户游戏账号，不具备实际 OCR 或历史战绩接入。展示页的 OCR 和复盘场景仍是作品集演示。

刷新 CommunityDragon：`npm run knowledge:refresh`。攻略快照需重新核验后更新 `data/guide-snapshot.json` 并执行 `python scripts/build_knowledge.py`。刷新脚本不会谎称自动抓全攻略；攻略站直接请求返回 429 时没有绕过限制，目录及事实字段来自可公开阅读的页面。每份只保存阵容、配装等事实字段，不镜像攻略全文。快照不会自动变成实时资料。

来源：
- https://communitydragon.org/docs/assets
- https://raw.communitydragon.org/latest/cdragon/tft/zh_cn.json
- https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-6/
- https://tftcoach.com/comps
- https://tftcoach.com/champions
- https://docs.siliconflow.cn/docs/api/chat-completions-post

## 网页桌宠

使用用户提供的两张透明立绘，实现自编写的状态机、按帧间隔积分的重力/反弹/摩擦、边界回转、拖拽抛落、跑动起伏、完整翻滚，以及看书姿态切换。模型思考时看书、流式回答时跃动，支持触控拖拽和键盘操作；滚出页面后停止逐帧更新。是网页内桌宠，不是操作系统独立窗口或逐帧重绘角色动画。

交互方向参考开源 Webmeji（https://github.com/lars-rooij/webmeji，Unlicense）的状态切换与拖放设计；未引入其角色素材或整套代码。当前实现位于 `dist/pet.js`，物理行为具有测试。

## 现有服务器部署准备

本轮只启动本地预览，不自动改动已上线的网站。

后续发布需服务器装有 Node.js 22+，以 `yixing-deploy` 用户运行后端 127.0.0.1:5050。Nginx 仍通过 5000 端口提供公开访问，在现有 `server` 内加入 `deploy/nginx-api-location.conf` 的 API 代理配置。root 管理员安装 `deploy/yixing.service` 并创建 `/etc/yixing.env`（仅服务端保存真实密钥），即可由 systemd 保持服务运行。现有静态根目录继续使用 `/var/www/yixing-live/dist`。
