const path = require('path');
const fs = require('fs/promises');

const VAULT_DIR = process.env.VAULT_DIR
  ? path.resolve(process.env.VAULT_DIR)
  : path.resolve(__dirname, '..', 'data', 'vault');
const VAULT_FILE = path.join(VAULT_DIR, 'templates.json');

// ===== Legacy fallback (when Vault template not found) =====

function buildLegacyGeneratePrompt(ctx) {
  let systemContent =
    '你是一位长篇小说写作助手。根据以下规则续写接下来的内容：\n' +
    '1. 必须遵守下面的写作规则。\n' +
    '2. 保持世界观、人物性格、叙事风格和情节发展的连续性。\n' +
    '3. 不要重复最近章节中已经写过的内容。\n' +
    '4. 不要擅自改变人物关系和核心设定。\n' +
    '5. 始终使用中文写作。';
  if (ctx.style) systemContent += `\n\n## 写作规则\n${ctx.style}`;

  let userContent = '';
  if (ctx.world) userContent += `## 世界观设定\n${ctx.world}\n\n`;
  if (ctx.characters) userContent += `## 人物设定\n${ctx.characters}\n\n`;
  if (ctx.summary) userContent += `## 故事梗概\n${ctx.summary}\n\n`;
  if (ctx.recentChapters) userContent += `## 最近章节\n${ctx.recentChapters}\n\n`;
  userContent += `## 本次续写要求\n${ctx.userPrompt}`;

  return { systemContent, userContent };
}

function buildLegacyRewritePrompt(ctx) {
  let systemContent =
    '你是一位长篇小说写作助手。你的任务是基于已有前文，生成当前章节的一个新分支版本。\n' +
    '1. 只承接前文章节和项目设定。\n' +
    '2. 不要参考旧版本章节正文。\n' +
    '3. 不要沿用旧版本的情节走向，按用户本次要求重新展开。\n' +
    '4. 保持世界观、人物性格、叙事风格一致。\n' +
    '5. 优先执行用户本次续写要求。\n' +
    '6. 只输出章节正文，不要解释说明。';
  if (ctx.style) systemContent += `\n\n## 写作规则\n${ctx.style}`;

  let userContent = '';
  if (ctx.world) userContent += `## 世界观设定\n${ctx.world}\n\n`;
  if (ctx.characters) userContent += `## 人物设定\n${ctx.characters}\n\n`;
  if (ctx.recentChapters) userContent += `## 前文章节\n${ctx.recentChapters}\n\n`;
  userContent += `## 用户本次续写要求\n${ctx.userPrompt}\n\n`;
  userContent += '请根据以上设定和前文，输出当前章节的新分支版本正文。不要做任何解释说明。';

  return { systemContent, userContent };
}

function getLegacyPrompt(taskType, ctx) {
  if (taskType === 'novel.rewriteChapter') return buildLegacyRewritePrompt(ctx);
  return buildLegacyGeneratePrompt(ctx);
}

// ===== Template reading =====

async function readTemplates() {
  const raw = await fs.readFile(VAULT_FILE, 'utf-8');
  return JSON.parse(raw);
}

// ===== Variable replacement =====

function renderTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }
  return result;
}

// ===== Main entry =====

async function buildPrompt(taskType, context) {
  let templates;
  try {
    templates = await readTemplates();
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[PromptBuilder] templates.json 不存在，使用旧硬编码 prompt (taskType=${taskType})`);
      return {
        ...getLegacyPrompt(taskType, context),
        taskType,
        templateId: null,
        templateTitle: null,
        usedFallback: true,
      };
    }
    // JSON parse error — improve error message for debugging
    if (err instanceof SyntaxError) {
      throw new Error(`templates.json 解析失败: ${err.message}`);
    }
    // Other IO error — let caller handle
    throw err;
  }

  const tpl = templates.find((t) => t.taskType === taskType);
  if (!tpl) {
    console.warn(`[PromptBuilder] 未找到 taskType=${taskType} 的模板，使用旧硬编码 prompt`);
    return {
      ...getLegacyPrompt(taskType, context),
      taskType,
      templateId: null,
      templateTitle: null,
      usedFallback: true,
    };
  }

  return {
    systemContent: renderTemplate(tpl.systemTemplate, context),
    userContent: renderTemplate(tpl.userTemplate, context),
    taskType,
    templateId: tpl.id,
    templateTitle: tpl.title,
    usedFallback: false,
  };
}

module.exports = { buildPrompt };
