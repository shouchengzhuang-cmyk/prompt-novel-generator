const ALLOWED_GENERATION_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const DEFAULT_GENERATION_MODEL = 'deepseek-v4-flash';

function resolveGenerationModel(model) {
  return ALLOWED_GENERATION_MODELS.includes(model) ? model : DEFAULT_GENERATION_MODEL;
}

function getNextChapterNumber(fileNames) {
  const numbers = fileNames
    .filter((fileName) => /^\d+\.txt$/.test(fileName))
    .map((fileName) => parseInt(fileName, 10));
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

function formatChapterFileName(chapterNumber) {
  return `${String(chapterNumber).padStart(3, '0')}.txt`;
}

function buildGeneratedChapterIndexEntry({ fileName, title, userPrompt, wordCount, createdAt }) {
  return {
    fileName,
    title,
    createdAt,
    userPrompt,
    activeVersionId: 'v-original',
    wordCount,
    versions: [
      {
        id: 'v-original',
        title,
        userPrompt,
        createdAt,
      },
    ],
  };
}

function appendAndExtractSseLines(buffer, textChunk) {
  const lines = `${buffer}${textChunk}`.split('\n');
  return { lines: lines.slice(0, -1), buffer: lines.at(-1) || '' };
}

function parseDeepSeekSseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data: ')) return null;

  const payload = trimmed.slice(6);
  if (payload === '[DONE]') return { done: true };

  try {
    const parsed = JSON.parse(payload);
    const content = parsed.choices?.[0]?.delta?.content;
    return content ? { done: false, content } : null;
  } catch {
    return null;
  }
}

module.exports = {
  resolveGenerationModel,
  getNextChapterNumber,
  formatChapterFileName,
  buildGeneratedChapterIndexEntry,
  appendAndExtractSseLines,
  parseDeepSeekSseLine,
};
