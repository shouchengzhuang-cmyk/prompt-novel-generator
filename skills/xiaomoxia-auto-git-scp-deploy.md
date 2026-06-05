# Skill — 小墨匣服务器部署流程

用于完成：部署小墨匣到生产服务器，包括同步源码、构建、重启、验收。

## 1. Scope

当用户说以下类似需求时使用本 skill：

- 部署
- 部署到服务器
- 更新线上
- 交代码并部署

默认项目：小墨匣 `prompt-novel-generator`。

### 一口气完成原则

用户明确要求：以后 Git 提交和服务器部署必须合在一次执行中完成，不再拆成两步。
也就是说，当用户说"交吧"或"部署"时，默认执行完整流程（commit → push → server deploy），
不需要先问"要不要也部署到服务器"。

## 2. 路径与连接信息

### 本地项目路径

```powershell
D:\Projects\prompt-novel-generator
```

### 服务器项目路径

```bash
/opt/xiaomoxia/prompt-novel-generator
```

### 服务器连接

```text
ubuntu@82.156.85.49
```

SSH 认证方式：密钥（`StrictHostKeyChecking=no`）。

### PM2 应用名

```text
xiaomoxia
```

## 3. 密码与敏感信息规则

- 不要把真实 SSH 密码写入任何仓库文件。
- 部署脚本从环境变量读取密码：

```powershell
$env:XIAOMOXIA_SSH_PASSWORD="你的真实SSH密码"
```

- 禁止提交：

  - `.env`
  - `server/.env`
  - 真实 SSH 密码
  - 真实 `SESSION_SECRET`
  - 真实 API Key
  - 私钥文件

## 4. 标准部署流程（唯一正确流程）

**原则：唯一真相源是 GitHub origin/master。所有构建必须在服务器上完成。**

禁止直接在本地构建前端并上传 dist/（见第 5 节）。

### 4.1 本地：提交并推送

```powershell
cd D:\Projects\prompt-novel-generator
git add .
git commit -m "message"
git push
```

推送后确认：

```powershell
git rev-parse --short HEAD
```

记录此 commit hash，部署后对比。

### 4.2 服务器：同步源码

```bash
ssh -o StrictHostKeyChecking=no ubuntu@82.156.85.49

cd /opt/xiaomoxia/prompt-novel-generator

git fetch origin
git reset --hard origin/master

# 验证已对齐
git rev-parse --short HEAD
git status
```

输出的 commit hash 必须与第 4.1 步一致。不一致则停止，排查原因。

### 4.3 服务器：安装依赖

```bash
cd /opt/xiaomoxia/prompt-novel-generator

npm install
```

`npm install` 每次都执行，npm 自身会判断是否需要实际下载。

### 4.4 服务器：构建前端

```bash
cd /opt/xiaomoxia/prompt-novel-generator

npm run build
```

注意 `dist/index.html` 中 JavaScript 文件的 hash 名，验收时需要对线上访问验证。

### 4.5 服务器：重启服务

```bash
pm2 restart xiaomoxia --update-env
sleep 2
pm2 list
```

确认 xiaomoxia 状态为 `online`。

### 4.6 nginx 配置检查

```bash
sudo nginx -t
```

- 语法正确 → 不需要 reload（除非配置内容有改动）。
- 语法错误 → 排查后修复，然后 `sudo nginx -s reload`。

### 4.7 线上验收

#### 基础 HTTP 验收

```bash
curl -sI http://127.0.0.1:3001        # Express 直连
curl -sI http://82.156.85.49          # nginx 反代
```

均应返回 `HTTP/1.1 200 OK`。

#### 前端 asset MIME 类型验收

从 dist/index.html 中找到构建后的 JS/CSS 实际文件名，例如 `index-DqFHGD7T.js` 和 `index-D3HC3pTK.css`，然后：

```bash
curl -sI http://82.156.85.49/assets/index-实际文件名.js
curl -sI http://82.156.85.49/assets/index-实际文件名.css
```

- JS 应返回 `Content-Type: application/javascript` 或 `text/javascript`
- CSS 应返回 `Content-Type: text/css`
- **不能**返回 `Content-Type: text/html`（说明 nginx 没找到文件，fallback 到了 HTML 入口）

#### 功能验收

1. **小墨匣首页**：浏览器打开 https://xiaomoxia.cn，确认加载正常、无白屏/报错。
2. **左侧导航入口完整**：项目工作台左侧应看到"◇ 素材"入口。
3. **/forge/**：确认 persona-forge 应用仍正常响应。
4. **生成流式输出**：发起一次生成，确认结果是逐块出现，不是一次性显示。
5. **剧情素材池**：进入项目后点击侧边栏"素材"，确认面板正常打开。

## 5. 禁止流程（务必遵守）

以下流程**禁止使用**。原因：曾因该流程导致线上素材池入口不可见的回归事故。

```text
① 本地 npm run build           ← 禁止
② SCP dist/ 到服务器          ← 禁止
③ 服务器 npm run build        ← 禁止
```

**事故经过：**
- 本地已 push 最新 master，也 SCP 上传了正确 dist/
- 但服务器 git master 停留在旧 commit
- 部署流程随后在服务器执行 `npm run build`，服务器用旧 src/ 重建 dist，覆盖了刚上传的正确 dist
- 结果：线上前端回退到旧版本，素材池入口丢失

**不再接受以下状态：**
- "服务器 git 停留在旧 commit，但运行代码靠 SCP 覆盖"
- "本地构建了，上传到服务器了，但在服务器又 build 了一遍"

## 6. 临时热修流程

如果因线上紧急 bug 需要 SCP 单文件修复：

1. **先在本地修复并测试**。
2. **SCP 到服务器覆盖文件**。
3. **重启 PM2**（仅 server/ 文件改动时需要）。
4. **必须在回报中明确标注**：
   - 这是临时热修
   - 哪些文件被 SCP 覆盖
   - 是否已同步回 GitHub
   - 什么时候恢复标准 git 部署流程
5. **尽快走标准部署流程**（第 4 节）把热修同步到 GitHub 并重新部署。

## 7. 运维注意事项

### nginx 流式响应配置

`/etc/nginx/sites-enabled/xiaomoxia` 中 `/` location **必须包含**：

```nginx
proxy_buffering off;
proxy_cache off;
```

**原因：** `POST /api/generate-stream` 和 `POST /api/projects/:projectName/chapters/:fileName/regenerate-stream`
依赖分块输出（SSE）。如果 nginx 缓冲开启，浏览器可能表现为生成完成后一次性显示，而不是逐字流式输出。

**历史：** 2026-06-05 线上曾因缺少此配置导致流式输出退化。

### 服务器 git 状态要求

服务器 `git rev-parse --short HEAD` 必须始终对齐到 GitHub `origin/master`。

如果因特殊原因出现偏离，在下次部署时必须先执行 `git fetch origin && git reset --hard origin/master`，
确认对齐后才能继续构建和重启。

## 8. 验收失败处理

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| curl 返回 502/503 | PM2 未启动 / 端口错误 | `pm2 list` 检查进程状态 |
| JS/CSS 返回 text/html | nginx 找不到 asset 文件 | 检查 dist/ 是否存在、nginx root 路径是否正确 |
| 页面白屏 / 报错 | asset hash 不匹配 | 确认 dist/index.html 中的 hash 与服务器文件一致 |
| 生成无流式效果 | nginx proxy_buffering 未关闭 | 检查 nginx 配置是否包含 `proxy_buffering off;` |
| 素材入口不可见 | dist 构建自旧源码 | 检查 `git rev-parse --short HEAD` 是否为最新 |

## 9. 最终报告格式

```md
## Git
- 本地 commit: xxx
- push: 成功 / 失败
- 服务器 HEAD: xxx（应与本地一致）

## Server Build
- npm install: 通过 / 跳过
- npm run build: 通过 / 失败
- pm2 restart: 成功 / 失败

## 线上验收
- curl 127.0.0.1:3001: 200 OK / 异常
- curl 82.156.85.49: 200 OK / 异常
- JS MIME: application/javascript / 异常
- CSS MIME: text/css / 异常
- 首页加载: 正常 / 异常
- 素材入口: 可见 / 不可见
- 流式生成: 流式 / 一次性
- /forge/: 正常 / 异常

## 注意
- 是否涉及热修：是 / 否
- nginx 配置是否改动：是 / 否
