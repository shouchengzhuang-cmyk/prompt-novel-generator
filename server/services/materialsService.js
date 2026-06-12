const path = require('path');
const fs = require('fs/promises');
const storage = require('./storage');

const EVENT_CARD_TEMPLATE = `# 对话事件卡

## 事件标题

## 参与角色

## 事件摘要

## 关键对白

## 情绪变化

## 关系变化

## 新增事实

## 可小说化方向

## 给小墨匣的写作提示词
`;

class MaterialsServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getEventCardsDir(projectDir) {
  return path.join(projectDir, 'materials', 'event-cards');
}

function getEventCardTrashDir(projectDir) {
  return path.join(projectDir, 'materials', '.trash', 'event-cards');
}

function safeCardName(cardName) {
  const name = String(cardName || '').trim();
  if (!name || name === '.' || name === '..') throw new MaterialsServiceError('非法的文件名', 400);
  if (/[/\\]/.test(name)) throw new MaterialsServiceError('文件名包含非法字符', 400);
  if (!name.endsWith('.md')) throw new MaterialsServiceError('只允许 .md 文件', 400);
  return name;
}

function extractTitleFromMarkdown(content) {
  const eventTitleMatch = content.match(/^##\s*事件标题\s*\n\s*([^\n]+)/m);
  if (eventTitleMatch) {
    const title = eventTitleMatch[1].trim();
    if (title) return title;
  }

  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) {
    const title = h1Match[1].trim();
    if (title) return title;
  }
  return null;
}

function generateSafeFileName(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const now = new Date().toISOString().slice(0, 10);
  return `${now}-${slug || 'event-card'}.md`;
}

async function computeEventCardUsage(projectDir) {
  const indexPath = path.join(projectDir, 'chapters', 'index.json');
  const usageMap = {};
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return usageMap;

    for (const entry of entries) {
      const usedCards = entry.usedEventCards;
      if (!Array.isArray(usedCards) || usedCards.length === 0) continue;
      const chapterFileName = entry.fileName || '';
      const chapterTitle = entry.title || chapterFileName.replace(/\.txt$/, '');
      const usedAt = entry.updatedAt || entry.createdAt || null;

      for (const cardName of usedCards) {
        if (typeof cardName !== 'string') continue;
        if (!usageMap[cardName]) usageMap[cardName] = { count: 0, chapters: [] };
        usageMap[cardName].count++;
        usageMap[cardName].chapters.push({ chapter: chapterFileName, title: chapterTitle, usedAt });
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[事件卡使用统计] 读取 index.json 失败:', err.message);
  }
  return usageMap;
}

async function listEventCards(projectDir) {
  const cardsDir = getEventCardsDir(projectDir);
  try {
    await fs.mkdir(cardsDir, { recursive: true });
  } catch {
    // Preserve the existing best-effort directory creation behavior.
  }

  const files = await fs.readdir(cardsDir);
  const mdFiles = files.filter((fileName) => fileName.endsWith('.md'));
  const usageMap = await computeEventCardUsage(projectDir);
  const cards = await Promise.all(mdFiles.map(async (cardName) => {
    const filePath = path.join(cardsDir, cardName);
    try {
      const [content, stats] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
      ]);
      const title = extractTitleFromMarkdown(content) || cardName.replace(/\.md$/, '');
      const usage = usageMap[cardName];
      return {
        cardName,
        title,
        updatedAt: stats.mtime.toISOString(),
        size: stats.size,
        usage: usage
          ? { status: 'used', count: usage.count, chapters: usage.chapters }
          : { status: 'unused', count: 0, chapters: [] },
      };
    } catch {
      return null;
    }
  }));

  return cards.filter(Boolean);
}

async function getEventCard(projectDir, cardName) {
  const safeName = safeCardName(cardName);
  const filePath = path.join(getEventCardsDir(projectDir), safeName);
  try {
    const [content, stats] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath),
    ]);
    const title = extractTitleFromMarkdown(content) || safeName.replace(/\.md$/, '');
    return { cardName: safeName, title, content, updatedAt: stats.mtime.toISOString() };
  } catch (err) {
    if (err.code === 'ENOENT') throw new MaterialsServiceError('事件卡不存在', 404);
    throw err;
  }
}

async function createEventCard(projectDir, { title, cardName, content }) {
  const hasContent = content !== undefined && content !== null && content.trim() !== '';
  if (!hasContent && !title && !cardName) {
    throw new MaterialsServiceError('标题或文件名至少提供一个', 400);
  }
  if (content !== undefined && content !== null && content.trim() === '') {
    throw new MaterialsServiceError('内容不能为空', 400);
  }

  const cardsDir = getEventCardsDir(projectDir);
  await fs.mkdir(cardsDir, { recursive: true });
  const effectiveTitle = title || (hasContent ? extractTitleFromMarkdown(content) : title);
  const fileName = cardName && cardName.trim()
    ? safeCardName(cardName.trim())
    : generateSafeFileName(effectiveTitle);
  const filePath = path.join(cardsDir, fileName);

  try {
    await fs.access(filePath);
    throw new MaterialsServiceError(`事件卡「${fileName}」已存在`, 409);
  } catch (err) {
    if (err instanceof MaterialsServiceError) throw err;
  }

  const finalContent = content !== undefined && content !== null ? content : EVENT_CARD_TEMPLATE;
  await storage.writeText(filePath, finalContent);
  const stats = await fs.stat(filePath);
  const cardTitle = extractTitleFromMarkdown(finalContent) || fileName.replace(/\.md$/, '');
  return { cardName: fileName, title: cardTitle, content: finalContent, updatedAt: stats.mtime.toISOString() };
}

async function updateEventCard(projectDir, cardName, content) {
  if (content === undefined || content === null) {
    throw new MaterialsServiceError('内容不能为空', 400);
  }

  const safeName = safeCardName(cardName);
  const filePath = path.join(getEventCardsDir(projectDir), safeName);
  try {
    await fs.access(filePath);
  } catch {
    throw new MaterialsServiceError('事件卡不存在', 404);
  }

  await storage.writeText(filePath, content);
  const stats = await fs.stat(filePath);
  const title = extractTitleFromMarkdown(content) || safeName.replace(/\.md$/, '');
  return { cardName: safeName, title, content, updatedAt: stats.mtime.toISOString() };
}

async function deleteEventCard(projectDir, cardName) {
  const safeName = safeCardName(cardName);
  const sourcePath = path.join(getEventCardsDir(projectDir), safeName);
  try {
    await fs.access(sourcePath);
  } catch {
    throw new MaterialsServiceError('事件卡不存在', 404);
  }

  const trashDir = getEventCardTrashDir(projectDir);
  await fs.mkdir(trashDir, { recursive: true });
  let trashPath = path.join(trashDir, safeName);
  let counter = 0;
  while (true) {
    try {
      await fs.access(trashPath);
      counter++;
      const base = safeName.replace(/\.md$/, '');
      trashPath = path.join(trashDir, `${base}-${counter}.md`);
    } catch {
      break;
    }
  }

  await fs.rename(sourcePath, trashPath);
  return { ok: true, cardName: safeName, message: '事件卡已移至回收站' };
}

module.exports = {
  EVENT_CARD_TEMPLATE,
  MaterialsServiceError,
  getEventCardsDir,
  getEventCardTrashDir,
  safeCardName,
  extractTitleFromMarkdown,
  generateSafeFileName,
  computeEventCardUsage,
  listEventCards,
  getEventCard,
  createEventCard,
  updateEventCard,
  deleteEventCard,
};
