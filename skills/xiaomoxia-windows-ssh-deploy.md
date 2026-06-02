# Skill — Windows 环境下 SSH/SCP 自动部署方案

记录在 Windows 上对小墨匣服务器（Ubuntu）执行 SSH/SCP 自动部署时遇到的困难和已落地的解决方案。

## 背景

本地开发环境：Windows 11（PowerShell 5.1），无 WSL、无 Cygwin。
目标服务器：Ubuntu，地址 `82.156.85.49`。
认证方式：密码认证（未部署 SSH 密钥时）。

## 问题清单

### 1. Windows 无 `sshpass`

**现象：** `sshpass` 命令不存在。
**原因：** `sshpass` 是 Linux 工具，不在 Windows OpenSSH 中。Chocolatey 无对应包，MSYS2/Git Bash 未预装，GitHub 下载受阻（网络不通）。
**解决：** 用 SSH_ASKPASS + CREATE_NO_WINDOW 替代。

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
**解决：** 用 Python 的 `subprocess.Popen(creationflags=0x08000000)` 创建无窗口子进程，SSH 检测不到控制台后自动调用 SSH_ASKPASS。

### 5. SSH 对 `-o` 参数值的 `=` 号处理

**现象：** `ssh -o StrictHostKeyChecking=no` 工作正常。
**结论：** 无问题，仅记录使用方式。

## 已落地方案

### SSH 密钥首次部署（密码 → 密钥）

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

### SCP 上传文件

```powershell
# 上传单个文件
scp -o StrictHostKeyChecking=no local/path user@host:/remote/path

# 上传目录
scp -r -o StrictHostKeyChecking=no local/dir/* user@host:/remote/dir/
```

### 服务器端验收

```bash
cd /opt/xiaomoxia/prompt-novel-generator
pm2 restart xiaomoxia --update-env
sleep 2
curl -sI http://127.0.0.1:3001    # 验证 Express
curl -sI http://82.156.85.49      # 验证 Nginx 反代
pm2 list                          # 查看进程状态
```

### 部署流程（已有密钥时）

1. `npm run build`（本地）
2. `scp -r dist/* user@host:/remote/dist/`
3. `scp server/index.js user@host:/remote/server/index.js`
4. SSH 执行 `pm2 restart` + curl 验证
5. 如 `package.json` 变化，在服务器上额外执行 `npm install`

## 边界情况

- 服务器 PIN 与本地不同：生产环境不应使用默认 `0000`，已在 `server/.env` 中配置。
- `dist/` 只需在有前端变更时上传；仅改 `server/` 则只需上传对应文件。
- 网络不通时无法下载工具：应优先使用系统已安装的工具（Python、Node.js、curl.exe），不依赖外部下载。
