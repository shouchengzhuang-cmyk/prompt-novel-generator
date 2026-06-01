# Skill — 小墨匣飞书回报规范

用于任务收尾后向飞书群推送状态报告。复用 `server/services/feishuNotifier.js`，不改核心业务逻辑。

## 1. 触发规则

以下场景**必须**发送飞书报告：

| 场景 | 报告内容 |
|---|---|
| build 通过 | 构建成功，产物路径，耗时 |
| build 失败 | 构建失败，错误摘要，可能原因 |
| 测试通过 | 测试类型，用例数，通过率 |
| 测试失败 | 失败用例数，失败原因摘要 |
| 部署完成 | 目标服务器，部署内容，curl 验收结果 |
| 部署失败 | 部署阶段，错误信息 |
| git commit 完成 | commit hash，改动文件数，改动摘要 |
| 重要修复完成 | 问题描述，修复方案，影响范围 |

以下场景**禁止**发送：

- 普通讨论、需求沟通
- 未执行任何操作的任务
- 中间过程碎片（如"正在编译"、"正在上传"）
- 乱码或内容不可读的消息

## 2. 统一报告格式

每条飞书消息严格按以下模板填写，不可缺项：

```
XMX_REPORT
项目：小墨匣
助手：莉莉丝
类型：收尾报告
任务：[任务简述]
结果：[通过 / 失败 / 完成 / 其他]
commit：[commit hash，无则填 -]
git status：[clean / 有未提交改动]
是否部署：[是 / 否]
备注：[补充说明，无则填 -]
```

## 3. 发送方式

### 短报告（一行消息）

```powershell
node server/scripts/report-feishu.js "任务：构建前端
结果：通过
commit：abc1234
git status：clean
是否部署：否
备注：-"
```

### 长报告（推荐）

```powershell
# 写入文件（UTF-8 编码）
@"
XMX_REPORT
项目：小墨匣
助手：莉莉丝
类型：收尾报告
任务：构建 + 部署生产
结果：通过
commit：abc1234
git status：clean
是否部署：是，已部署至 prod
备注：curl 200，首页加载 1.2s
"@ | Out-File -FilePath report.md -Encoding utf8

# 发送
node server/scripts/report-feishu.js --file report.md
```

### 测试连通性

```powershell
node server/scripts/test-feishu.js
```

## 4. 安全约束

- 禁止在报告内容中写入 Webhook URL、Secret、真实密码、API Key。
- 禁止将 `.env` 中的飞书配置写入任何文件后发送。
- 禁止在 commit message、脚本注释、日志中写入密钥。
- 环境变量缺失时只提示"请配置 server/.env"，不要求对方把密钥发过来。

## 5. Skill 入口

在 CLAUDE.md 中的 Skill Index 添加：

```
- 飞书回报、收尾报告推送：`skills/xiaomoxia-feishu-report.md`
```
