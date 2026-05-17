# AI 小说项目管理器

本地运行的 AI 小说项目管理工具。创建世界观项目，AI 根据设定和已有进度续写小说，每次生成自动保存为本地 txt 文件。

## 项目结构

```
prompt-novel-generator/
├── novels/                  # 小说项目根目录（自动创建）
│   └── 项目名/
│       ├── world.md         # 世界观设定
│       ├── characters.md    # 人物设定
│       ├── summary.md       # 故事梗概（可手动更新，帮助 AI 保持连贯）
│       └── chapters/        # 生成的小说章节
│           001.txt
│           002.txt
│           ...
├── index.html               # Vite 入口 HTML
├── vite.config.js           # Vite 配置（/api 代理到后端 3001）
├── package.json             # 前端依赖 & 统一启动脚本
├── src/
│   ├── main.jsx             # React 入口
│   ├── App.jsx              # 主组件（三栏布局：项目/输入/正文）
│   └── App.css              # 样式
├── server/
│   ├── package.json         # 后端依赖
│   ├── index.js             # Express 服务（4 个 API 接口）
│   ├── .env.example         # 环境变量模板
│   └── .env                 # API Key 配置（需自行创建）
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
4. AI 会根据世界观、人物设定、故事梗概和最近 3 章内容续写
5. 生成结果显示在右侧面板，并自动保存到 `novels/项目名/chapters/` 目录
6. 每次生成新增一个编号文件：`001.txt`、`002.txt`、`003.txt`……

### 继续生成

- 修改续写要求，再次点击「生成下一段」
- AI 会读取最新 3 章内容作为上下文，保持连续性
- 右侧面板会追加显示新内容

### 管理项目

- 点击「刷新」按钮刷新项目列表和当前项目数据
- 每次生成后右侧会显示保存到的文件名

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 获取 novels/ 下所有项目列表 |
| POST | `/api/projects` | 创建新项目（body: projectName, world, characters） |
| GET | `/api/projects/:name` | 读取项目详情（设定、章节列表、最近正文） |
| POST | `/api/generate` | 生成小说（body: projectName, userPrompt） |

## POST /api/generate 逻辑

1. 读取项目目录的 `world.md`、`characters.md`、`summary.md`
2. 读取 `chapters/` 下最新 3 个 txt 文件
3. 将所有上下文 + userPrompt 拼入 messages 数组
4. 调用 DeepSeek Chat API（模型 `deepseek-chat`）
5. 生成内容自动编号保存为新 txt 文件
6. 返回 `{ content, filename }`

## 技术栈

- **前端**：React 18 + Vite 5
- **后端**：Node.js + Express（使用原生 fetch）
- **存储**：本地文件系统（txt / markdown）
- **API**：DeepSeek Chat（deepseek-chat）
