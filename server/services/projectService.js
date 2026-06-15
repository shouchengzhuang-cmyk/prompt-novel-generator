const path = require('path');
const fs = require('fs/promises');
const storage = require('./storage');

class ProjectServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createProjectService({
  novelsDir,
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  extractTitleFromContent,
  readEditorialMemory,
  withProjectLock,
}) {
  function resolveProjectDir(projectName) {
    try {
      return safeProjectDir(projectName);
    } catch (err) {
      throw new ProjectServiceError(err.message, 400);
    }
  }

  async function requireProjectDir(projectName, notFoundMessage = '项目不存在') {
    const projectDir = resolveProjectDir(projectName);
    try {
      await fs.access(projectDir);
    } catch {
      throw new ProjectServiceError(notFoundMessage, 404);
    }
    return projectDir;
  }

  async function collectProjectStats(projectDir) {
    let totalSize = 0;
    let latestMtime = 0;
    const entries = await fs.readdir(projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(projectDir, entry.name);
      if (entry.isDirectory()) {
        const sub = await collectProjectStats(fullPath);
        totalSize += sub.totalSize;
        if (sub.latestMtime > latestMtime) latestMtime = sub.latestMtime;
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          totalSize += stat.size;
          if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
        } catch {
          // Skip unreadable files.
        }
      }
    }
    return { totalSize, latestMtime };
  }

  async function listProjects() {
    await fs.mkdir(novelsDir, { recursive: true });
    const entries = await fs.readdir(novelsDir, { withFileTypes: true });
    const projectNames = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);

    return Promise.all(projectNames.map(async (name) => {
      const projectDir = path.join(novelsDir, name);
      try {
        const keyFiles = [
          path.join(projectDir, 'chapters', 'index.json'),
          path.join(projectDir, 'summary.md'),
          path.join(projectDir, 'world.md'),
          path.join(projectDir, 'characters.md'),
          path.join(projectDir, 'style.md'),
          path.join(projectDir, 'editorial-memory.md'),
        ];
        const mtimes = await Promise.all(keyFiles.map((f) =>
          fs.stat(f).then((s) => s.mtimeMs).catch(() => 0)
        ));
        const updatedAt = Math.max(...mtimes);

        let chapterCount = 0;
        let totalWords = 0;
        let intro = '';
        try {
          const chaptersDir = path.join(projectDir, 'chapters');
          const indexEntries = await readChapterIndex(chaptersDir);
          if (indexEntries.length > 0) {
            chapterCount = indexEntries.length;
            totalWords = indexEntries.reduce((sum, entry) => sum + (Number(entry.wordCount) || 0), 0);
          } else {
            const chapterFiles = await fs.readdir(chaptersDir).catch(() => []);
            chapterCount = chapterFiles.filter((file) => isValidChapterFileName(file)).length;
          }
        } catch {
          chapterCount = 0;
        }

        try {
          const summaryRaw = await fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
          const worldRaw = summaryRaw.trim() ? summaryRaw : await fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => '');
          intro = worldRaw.replace(/\s+/g, ' ').trim().slice(0, 48);
        } catch {
          intro = '';
        }

        return { name, size: 0, updatedAt, chapterCount, totalWords, intro };
      } catch {
        return { name, size: 0, updatedAt: 0, chapterCount: 0, totalWords: 0, intro: '' };
      }
    }));
  }

  async function createProject({ projectName, world, characters, style, summary }) {
    if (!projectName || !projectName.trim()) {
      throw new ProjectServiceError('项目名不能为空', 400);
    }

    const name = projectName.trim();
    const projectDir = resolveProjectDir(name);
    try {
      await fs.access(projectDir);
      throw new ProjectServiceError('项目名已存在，请换一个名称。', 409);
    } catch (err) {
      if (err instanceof ProjectServiceError) throw err;
    }

    await fs.mkdir(path.join(projectDir, 'chapters'), { recursive: true });
    await storage.writeText(path.join(projectDir, 'world.md'), world || '');
    await storage.writeText(path.join(projectDir, 'characters.md'), characters || '');
    await storage.writeText(path.join(projectDir, 'summary.md'), typeof summary === 'string' ? summary : '');
    await storage.writeText(path.join(projectDir, 'style.md'), style || '');
    return { success: true, projectName: name };
  }

  async function getProject(projectName) {
    const projectDir = await requireProjectDir(projectName);
    const [world, characters, summary, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);
    const editorialMemory = await readEditorialMemory(projectName);
    const chaptersDir = path.join(projectDir, 'chapters');
    let chapters = [];
    let recentContent = '';

    try {
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((file) => file.endsWith('.txt')).sort();
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexMap = {};
      for (const entry of indexEntries) indexMap[entry.fileName] = entry;

      chapters = txtFiles.map((fileName) => ({
        ...(indexMap[fileName] || {}),
        filename: fileName,
        fileName,
        title: indexMap[fileName]?.title || extractTitleFromContent('', parseInt(fileName, 10)),
        userPrompt: indexMap[fileName]?.userPrompt || '',
        activeVersionId: indexMap[fileName]?.activeVersionId || 'v-original',
      }));

      const contents = await Promise.all(chapters.slice(-10).map((chapter) =>
        fs.readFile(path.join(chaptersDir, chapter.filename), 'utf-8')
          .then((text) => ({ fn: chapter.filename, text }))
      ));
      if (chapters.length > 10) {
        recentContent = `…（共 ${chapters.length} 章，显示最近 10 章）\n\n`;
      }
      recentContent += contents.map((content) => `--- ${content.fn} ---\n${content.text}`).join('\n\n');
    } catch {
      // Older projects may not have a chapters directory yet.
    }

    const totalWords = chapters.reduce((sum, chapter) => sum + (Number(chapter.wordCount) || 0), 0);
    return { projectName, world, characters, summary, style, editorialMemory, chapters, recentContent, totalWords };
  }

  async function deleteProject(projectName) {
    const projectDir = resolveProjectDir(projectName);
    if (projectDir === novelsDir) {
      throw new ProjectServiceError('不能删除根目录', 400);
    }
    await requireProjectDir(projectName);
    await fs.rm(projectDir, { recursive: true, force: false });
    return { ok: true, message: '项目已删除', projectName };
  }

  async function renameProject(projectName, newName) {
    if (!newName || !newName.trim()) {
      throw new ProjectServiceError('新项目名不能为空', 400);
    }
    const trimmed = newName.trim();
    if (/[/\\:*?"<>|]/.test(trimmed)) {
      throw new ProjectServiceError('项目名包含非法字符（/ \\ : * ? " < > |）', 400);
    }

    const oldDir = resolveProjectDir(projectName);
    const newDir = resolveProjectDir(trimmed);
    try {
      await fs.access(oldDir);
    } catch {
      throw new ProjectServiceError('原项目不存在', 404);
    }
    try {
      await fs.access(newDir);
      throw new ProjectServiceError(`项目「${trimmed}」已存在`, 409);
    } catch (err) {
      if (err instanceof ProjectServiceError) throw err;
    }

    await withProjectLock(projectName, 'rename-project', async () => {
      await fs.rename(oldDir, newDir);
    });
    return { ok: true, projectName: trimmed, oldName: projectName };
  }

  async function saveProject(projectName, { world, characters, style, summary, editorialMemory }) {
    const projectDir = await requireProjectDir(projectName);
    const project = {
      world: typeof world === 'string' ? world : '',
      characters: typeof characters === 'string' ? characters : '',
      style: typeof style === 'string' ? style : '',
      summary: typeof summary === 'string' ? summary : '',
      editorialMemory: typeof editorialMemory === 'string' ? editorialMemory : undefined,
    };

    await withProjectLock(projectName, 'save-settings', async () => {
      const writes = [
        storage.writeText(path.join(projectDir, 'world.md'), project.world),
        storage.writeText(path.join(projectDir, 'characters.md'), project.characters),
        storage.writeText(path.join(projectDir, 'style.md'), project.style),
        storage.writeText(path.join(projectDir, 'summary.md'), project.summary),
      ];
      if (project.editorialMemory !== undefined) {
        writes.push(storage.writeText(path.join(projectDir, 'editorial-memory.md'), project.editorialMemory));
      }
      await Promise.all(writes);
    });
    return { ok: true, message: '设定已保存', project };
  }

  return {
    collectProjectStats,
    listProjects,
    createProject,
    getProject,
    deleteProject,
    renameProject,
    saveProject,
  };
}

module.exports = { ProjectServiceError, createProjectService };
