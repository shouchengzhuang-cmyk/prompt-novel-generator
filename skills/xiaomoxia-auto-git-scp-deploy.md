# Skill — 小墨匣自动 Git + SCP 部署

用于自动完成：本地检查、Git 提交、push、SCP 上传、服务器构建、PM2 重启、curl 验收。

## 1. Scope

当用户说以下类似需求时使用本 skill：

- 自动提交
- 上 Git
- push 后走 SCP
- 部署到服务器
- 自动上传服务器
- 服务器 build 重启

默认项目：小墨匣 `prompt-novel-generator`。

## 2. Paths

本地项目路径：

```powershell
D:\Projects\prompt-novel-generator
```

服务器项目路径：

```bash
/opt/xiaomoxia/prompt-novel-generator
```

服务器用户与地址：

```text
ubuntu@82.156.85.49
```

PM2 应用名：

```text
xiaomoxia
```

## 3. Password Rule

不要把真实 SSH 密码写入任何仓库文件。

部署脚本从环境变量读取密码：

```powershell
$env:XIAOMOXIA_SSH_PASSWORD="你的真实SSH密码"
```

示例里的 `1234` 只能作为占位符，不得提交真实密码。

禁止提交：

- `.env`
- `server/.env`
- 真实 SSH 密码
- 真实 `SESSION_SECRET`
- 真实 API Key
- 私钥文件

### 密码缺失时的交互流程

由于 `Read-Host` 在 CC 的 Bash tool 中无法交互，密码缺失时按以下流程处理：

1. 脚本检测 `$env:XIAOMOXIA_SSH_PASSWORD` 为空 → 报错退出，提示"密码未设置"
2. CC 看到报错 → 你问用户："哥哥，SSH 密码是什么？"
3. 用户告诉 CC 密码
4. CC 执行 `$env:XIAOMOXIA_SSH_PASSWORD = "用户给的密码"`（仅当前会话有效，不落盘）
5. CC 重新执行部署命令，继续后续流程

密码不进 Git、不进文件、不进记忆系统，只在当前 PowerShell 会话存活。

## 4. Required Flow

自动部署必须按顺序执行：

1. 进入本地项目目录；
2. 检查 Git 状态；
3. 运行 `npm run build`；
4. 检查敏感文件；
5. `git add .`；
6. `git commit -m "message"`；
7. `git push`；
8. 检查 `$env:XIAOMOXIA_SSH_PASSWORD`，为空则按第 3 节的交互流程获取密码；
9. 用 SCP 上传必要文件或目录（使用 `sshpass -p $env:XIAOMOXIA_SSH_PASSWORD` 传递密码）；
10. SSH 登录服务器执行命令（同样使用 `sshpass`）；
11. 服务器执行 `npm install`（如依赖变化）和 `npm run build`；
12. `pm2 restart xiaomoxia --update-env`；
13. `curl -I http://127.0.0.1:3001`；
14. `curl -I http://82.156.85.49`；
15. 输出验收结果。

任何一步失败都必须停止，不能假装成功。

## 5. Recommended Script Location

脚本放在：

```text
scripts/deploy-scp.ps1
```

## 6. Verification Commands On Server

```bash
cd /opt/xiaomoxia/prompt-novel-generator
npm run build
pm2 restart xiaomoxia --update-env
sleep 2
curl -I http://127.0.0.1:3001
curl -I http://82.156.85.49
pm2 logs xiaomoxia --lines 30
```

## 7. Final Report Format

```md
哥哥，自动提交和 SCP 部署跑完了。

## Git
- commit: xxx
- push: 成功 / 失败

## SCP
- 上传文件：xxx
- 结果：成功 / 失败

## Server
- build: 通过 / 失败
- pm2 restart: 成功 / 失败
- curl 127.0.0.1:3001: 200 OK / 异常
- curl 82.156.85.49: 200 OK / 异常

## 注意
- 是否发现敏感文件：无 / 有
```
