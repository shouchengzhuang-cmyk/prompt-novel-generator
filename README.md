# 小墨匣

一个面向长篇小说创作的 AI 写作工作台。

## 项目结构

```
prompt-novel-generator/
├── novels/                      # 小说项目根目录（自动创建）
│   └── 项目名/
│       ├── world.md             # 世界观设定
│       ├── characters.md        # 人物设定
│       ├── style.md             # 写作风格
│       ├── summary.md           # 故事梗概（可手动更新，帮助 AI 保持连贯）
│       └── chapters/            # 生成的小说章节
│           ├── index.json       # 章节索引（标题、版本信息）
│           ├── variants/        # 重写候选版本
│           │   └── 001.json
│           ├── 001.txt
│           ├── 002.txt
│           └── ...
├── index.html                   # Vite 入口 HTML
├── vite.config.js               # Vite 配置（/api 代理到后端 3001）
├── package.json                 # 前端依赖 & 统一启动脚本
├── src/
│   ├── main.jsx                 # React 入口
│   ├── App.jsx                  # 主组件（三栏布局：项目/输入/正文）
│   ├── App.css                  # 样式
│   ├── components/              # React 组件
│   │   ├── GenerationProgress
│   │   ├── PromptPreviewPanel
│   │   ├── VaultPanel
│   │   └── WritingControlPanel
│   └── utils/
│       └── templateRenderer.js  # 模板变量替换
├── server/
│   ├── package.json             # 后端依赖
│   ├── index.js                 # Express 服务入口
│   ├── routes/
│   │   └── vault.js             # Vault 模板 CRUD 路由
│   ├── services/
│   │   └── promptBuilder.js     # Prompt 构建（Vault 模板驱动）
│   ├── data/
│   │   └── vault/
│   │       └── templates.json   # Vault 模板持久化
│   ├── .env.example             # 环境变量模板
│   └── .env                     # API Key 配置（需自行创建）
└── README.md
```

## 前置要求

- **Node.js 18+**（后端使用原生 `fetch`）
- DeepSeek API Key

## 安装

```bash
# 1. 进入项目目录
cd prompt-novel-generator

# 2. 安装前端依赖
npm install

# 3. 安装后端依赖
cd server
npm install
cd ..

# 4. 配置 API Key
copy server\.env.example server\.env
# 编辑 server/.env，填入你的 DeepSeek API Key：
# DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

## 启动

```bash
npm run dev
```

启动后：

- **前端**：http://localhost:5173
- **后端**：http://localhost:3001

## 使用方法

### 创建项目

1. 打开 http://localhost:5173
2. 点击左侧面板的「+ 创建项目」
3. 填写项目名、世界观设定、人物设定
4. 点击「创建」

### 生成小说

1. 在左侧选择已有项目
2. 在中间输入框中填写续写要求
3. 点击「生成下一段」
4. AI 会根据世界观、人物设定、故事梗概和最近 10 章内容续写
5. 生成结果显示在右侧面板，并自动保存到 `novels/项目名/chapters/` 目录
6. 每次生成新增一个编号文件：`001.txt`、`002.txt`、`003.txt`……

### 继续生成

- 修改续写要求，再次点击「生成下一段」
- AI 会读取最新 10 章内容作为上下文，保持连续性
- 右侧面板会追加显示新内容

### 管理项目

- 点击「刷新」按钮刷新项目列表和当前项目数据
- 每次生成后右侧会显示保存到的文件名

### 阅读章节

在左侧项目列表点击章节名，右侧正文区会加载该章节内容。

### 编辑章节标题

在阅读区点击「编辑标题」，修改后保存。标题会持久化到 `chapters/index.json`。

### 重写章节

阅读章节时展开「重写」面板，输入续写要求，点击「生成候选版本」。AI 会根据前文和当前设定生成一个新分支版本，不会覆盖原章节。可在候选版本列表中切换、预览、应用。

### Vault 模板系统

Vault 是 AI 写作模板管理面板。你可以为生成（`novel.generateChapter`）和重写（`novel.rewriteChapter`）分别配置 system prompt 和 user prompt 模板，支持 `{{变量名}}` 替换。未配置时使用硬编码 fallback prompt。

### 导出与备份

- **Markdown 导出**：阅读区可导出项目全文为 `.md` 文件
- **ZIP 备份**：打包下载项目所有设定和章节（含候选版本）

### 摘要自动更新

每次生成新章节后，AI 会自动将最新内容合并更新到 `summary.md`，保持剧情摘要为最新状态。你也可以在阅读区手动触发摘要重建。

## API 接口

按模块分组：

| 分组 | 方法 | 路径 | 说明 |
|------|------|------|------|
| **项目** | GET | `/api/projects` | 获取 `novels/` 下所有项目列表 |
| | POST | `/api/projects` | 创建新项目（body: projectName, world, characters, style, summary） |
| | GET | `/api/projects/:name` | 读取项目详情（设定、章节列表、最近正文） |
| | PUT | `/api/projects/:name` | 更新项目设定 |
| | DELETE | `/api/projects/:name` | 删除项目 |
| **章节** | POST | `/api/generate` | 生成下一章（body: projectName, userPrompt） |
| | GET | `/api/projects/:name/chapters/:file` | 读取单章正文 |
| | DELETE | `/api/projects/:name/chapters/:file` | 删除章节 |
| | PUT | `/api/projects/:name/chapters/:file/title` | 修改章节标题 |
| | POST | `/api/projects/:name/chapters/rebuild-index` | 重建章节索引 |
| **重写** | POST | `/api/projects/:name/chapters/:file/regenerate` | 生成候选版本 |
| | GET | `/api/projects/:name/chapters/:file/variants` | 获取候选版本列表 |
| | PUT | `/api/projects/:name/chapters/:file/variants/:id/apply` | 应用候选版本 |
| **Vault** | GET/POST | `/api/vault/templates` | 模板列表 / 创建模板 |
| | PUT/DELETE | `/api/vault/templates/:id` | 更新 / 删除模板 |
| **工具** | GET | `/api/projects/:name/export` | 导出项目为 Markdown |
| | GET | `/api/projects/:name/backup` | 下载 ZIP 备份 |
| | GET | `/api/projects/:name/prompt-preview` | 预览生成 prompt |
| | POST | `/api/projects/:name/summary/rebuild` | 重建剧情摘要 |
| | GET | `/api/editor/note` | 后台编辑备注 |

## POST /api/generate 逻辑

1. 读取项目目录的 `world.md`、`characters.md`、`style.md`、`summary.md`
2. 读取 `chapters/` 下最新 10 个 txt 文件（通过 Vault 模板或 fallback 构建 prompt）
3. 调用 DeepSeek API（默认 `deepseek-v4-flash`，可选 `deepseek-v4-pro`）
4. 生成内容自动编号保存为新 txt 文件
5. 提取标题写入 `chapters/index.json`
6. AI 自动将新章节合并更新到 `summary.md`
7. 返回 `{ content, filename, title, summaryUpdated }`

## 技术栈

- **前端**：React 18 + Vite 5
- **后端**：Node.js + Express（使用原生 fetch）
- **存储**：本地文件系统（txt / markdown）
- **API**：DeepSeek（deepseek-v4-flash / deepseek-v4-pro）
