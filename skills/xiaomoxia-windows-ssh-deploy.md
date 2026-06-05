# Skill — Windows 环境下 SSH/SCP 自动部署方案（参考）

记录在 Windows 上对小墨匣服务器（Ubuntu）执行 SSH/SCP 自动部署时遇到的困难和已落地的解决方案。
作为 `xiaomoxia-auto-git-scp-deploy.md` 的配套文档，仅用于辅助 SSH 连接和认证问题。

## 背景

本地开发环境：Windows 11（PowerShell 5.1），无 WSL、无 Cygwin。
目标服务器：Ubuntu，地址 `82.156.85.49`。
认证方式：SSH 密钥（已部署）。

## 问题清单

### 1. Windows 无 `sshpass`

**现象：** `sshpass` 命令不存在。
**原因：** `sshpass` 是 Linux 工具，不在 Windows OpenSSH 中。Chocolatey 无对应包，MSYS2/Git Bash 未预装，GitHub 下载受阻（网络不通）。
**解决：** 已部署 SSH 密钥，不再依赖 sshpass。直接使用 `ssh -o StrictHostKeyChecking=no`。

### 2. PowerShell 的 `curl` 别名劫持

**现象：** `curl -s http://...` 报错 `Missing mandatory parameters: Uri`。
**原因：** PowerShell 将 `curl` 定义为 `Invoke-WebRequest` 的别名，语法完全不同。
**解决：** 始终使用 `curl.exe` 显式调用原生 curl。

### 3. Python `-c` 内联代码 + PowerShell here-string 引号冲突

**现象：** `SyntaxError: invalid syntax`。
**原因：** PowerShell 的 `@'...'@` here-string 嵌套 `python -c` 时，字符串定界符互相干扰。
**解决：** 复杂 Python 代码写 .py 文件执行，不用 `-c`。

### 4. SSH_ASKPASS 在 Windows 上不被触发

**现象：** 即使设置了 `SSH_ASKPASS` 和 `SSH_ASKPASS_REQUIRE=force`，SSH 仍提示输入密码。
**原因：** Windows OpenSSH 检测到进程关联了控制台（console），会忽略 SSH_ASKPASS，直接读取 `/dev/tty`。
**解决：** 已部署 SSH 密钥，不再需要 SSH_ASKPASS。如果仍遇到密码提示，用 Python 的
`subprocess.Popen(creationflags=0x08000000)` 创建无窗口子进程。

### 5. SSH 对 `-o` 参数值的 `=` 号处理

**现象：** `ssh -o StrictHostKeyChecking=no` 工作正常。
**结论：** 无问题，仅记录使用方式。

## SSH 密钥首次部署（密码 → 密钥）

```python
import subprocess, os

# 1. 创建 SSH_ASKPASS 脚本（回显密码）
#    脚本路径: C:\Users\scz\AppData\Local\Temp\ssh-askpass.cmd
#    内容: @echo off\necho <密码>

os.environ['SSH_ASKPASS'] = '<askpass脚本路径>'
os.environ['SSH_ASKPASS_REQUIRE'] = 'force'

# 2. 用 CREATE_NO_WINDOW 标志启动 SSH
proc = subprocess.Popen(
    ['ssh', '-o', 'StrictHostKeyChecking=no', 'user@host',
     'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    creationflags=0x08000000  # CREATE_NO_WINDOW
)
proc.communicate(input=pubkey.encode())
```

部署一次后，后续直接用密钥认证（无需密码）。

## 标准部署流程（幂等命令）

以下命令按顺序执行，每步可独立重跑：

### 1. 推送本地代码

```powershell
cd D:\Projects\prompt-novel-generator
git add .
git commit -m "message"
git push
git rev-parse --short HEAD
```

### 2. 服务器同步源码

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@82.156.85.49 "`
  cd /opt/xiaomoxia/prompt-novel-generator && `
  git fetch origin && `
  git reset --hard origin/master && `
  git rev-parse --short HEAD`
"
```

### 3. 服务器构建 + 重启

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@82.156.85.49 "`
  cd /opt/xiaomoxia/prompt-novel-generator && `
  npm install && `
  npm run build && `
  pm2 restart xiaomoxia --update-env`
"
```

### 4. 线上验收

```powershell
# 基础 HTTP
curl.exe -sI http://82.156.85.49/
curl.exe -sI http://127.0.0.1:3001/

# 前端 asset MIME
curl.exe -sI http://82.156.85.49/assets/index-DqFHGD7T.js
curl.exe -sI http://82.156.85.49/assets/index-D3HC3pTK.css
```

## 边界情况

- `dist/` 由服务器构建生成，本地不需要 `npm run build`。
- 仅改 `server/` 时同样走完整流程（同步源码 → 构建 → 重启），不单独 SCP。
- 网络不通时无法 SSH：先确认服务器可达，或联系运维排查。
