import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmpDir;
let request;
let app;
let agent;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-rebuild-index-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.SESSION_SECRET = 'rebuild-index-test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ pin: '0000' });
});

beforeEach(async () => {
  const entries = await fs.readdir(tmpDir);
  await Promise.all(entries.map((entry) => fs.rm(path.join(tmpDir, entry), {
    recursive: true,
    force: true,
  })));
});

afterAll(async () => {
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createProject(projectName, { chapters = true } = {}) {
  const projectDir = path.join(tmpDir, projectName);
  await fs.mkdir(projectDir, { recursive: true });
  if (!chapters) return { projectDir };

  const chaptersDir = path.join(projectDir, 'chapters');
  await fs.mkdir(chaptersDir, { recursive: true });
  return { projectDir, chaptersDir };
}

describe('POST /api/projects/:projectName/chapters/rebuild-index', () => {
  it('rebuilds the index and preserves existing version, event-card, and stale metadata', async () => {
    const { chaptersDir } = await createProject('rebuild-success');
    await Promise.all([
      fs.writeFile(path.join(chaptersDir, '001.txt'), 'original chapter', 'utf8'),
      fs.writeFile(path.join(chaptersDir, '002.txt'), 'new chapter', 'utf8'),
      fs.writeFile(path.join(chaptersDir, 'notes.md'), 'ignored', 'utf8'),
      fs.mkdir(path.join(chaptersDir, 'variants'), { recursive: true }),
    ]);
    await fs.writeFile(path.join(chaptersDir, 'variants', '001.json'), JSON.stringify({
      fileName: '001.txt',
      variants: [{ id: 'v-2', title: 'Candidate', content: 'candidate content' }],
    }), 'utf8');

    const existingEntry = {
      fileName: '001.txt',
      title: 'Existing title',
      createdAt: '2026-01-01T00:00:00.000Z',
      wordCount: 321,
      activeVersion: 'v-2',
      activeVersionId: 'v-2',
      versions: [{ id: 'v-original' }, { id: 'v-2' }],
      usedEventCards: ['card-a'],
      staleAfterRewrite: true,
      staleReason: 'existing stale reason',
      staleFromFileName: '000.txt',
      staleAt: 123456,
    };
    await fs.writeFile(
      path.join(chaptersDir, 'index.json'),
      JSON.stringify([existingEntry, { fileName: '999.txt', title: 'removed file' }]),
      'utf8',
    );

    const response = await agent
      .post('/api/projects/rebuild-success/chapters/rebuild-index')
      .send();

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.chapters).toHaveLength(2);
    expect(response.body.chapters[0]).toEqual(existingEntry);
    expect(response.body.chapters[1]).toMatchObject({
      fileName: '002.txt',
      title: '第2章',
      activeVersionId: 'v-original',
      versions: [],
    });
    expect(response.body.chapters[1].createdAt).toEqual(expect.any(String));

    const savedIndex = JSON.parse(await fs.readFile(path.join(chaptersDir, 'index.json'), 'utf8'));
    expect(savedIndex).toEqual(response.body.chapters);
    expect(JSON.parse(await fs.readFile(path.join(chaptersDir, 'variants', '001.json'), 'utf8')))
      .toEqual({
        fileName: '001.txt',
        variants: [{ id: 'v-2', title: 'Candidate', content: 'candidate content' }],
      });
  });

  it('keeps the existing 404 behavior when the project has no chapters directory or text files', async () => {
    await createProject('missing-chapters', { chapters: false });
    await createProject('empty-chapters');

    const missingDirectory = await agent
      .post('/api/projects/missing-chapters/chapters/rebuild-index')
      .send();
    expect(missingDirectory.status).toBe(404);
    expect(missingDirectory.body).toHaveProperty('error');

    const emptyDirectory = await agent
      .post('/api/projects/empty-chapters/chapters/rebuild-index')
      .send();
    expect(emptyDirectory.status).toBe(404);
    expect(emptyDirectory.body).toHaveProperty('error');
  });

  it('keeps missing-project and project path validation responses unchanged', async () => {
    const missingProject = await agent
      .post('/api/projects/not-found/chapters/rebuild-index')
      .send();
    expect(missingProject.status).toBe(404);
    expect(missingProject.body).toHaveProperty('error');

    const invalidProject = await agent
      .post('/api/projects/..%2Foutside/chapters/rebuild-index')
      .send();
    expect(invalidProject.status).toBe(400);
    expect(invalidProject.body).toHaveProperty('error');
  });
});
