import { useState, useEffect } from 'react';
import './App.css';

async function safeJsonFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('接口返回了非 JSON，可能是 Vite 代理或后端路由未命中');
  }

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

function App() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [projectDetails, setProjectDetails] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create project form
  const [newProjectName, setNewProjectName] = useState('');
  const [newWorld, setNewWorld] = useState('');
  const [newCharacters, setNewCharacters] = useState('');
  const [newStyle, setNewStyle] = useState('');

  // Create project form error (separate from main error to show it in the left panel)
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Generation
  const [model, setModel] = useState('deepseek-chat');
  const [userPrompt, setUserPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [lastFilename, setLastFilename] = useState('');
  const [copied, setCopied] = useState(false);

  // Reading
  const [readingChapter, setReadingChapter] = useState(null);
  const [readingContent, setReadingContent] = useState('');

  // Project settings editor
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editWorld, setEditWorld] = useState('');
  const [editCharacters, setEditCharacters] = useState('');
  const [editStyle, setEditStyle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(null);

  // ---- Fetch project list ----
  const fetchProjects = async () => {
    try {
      const data = await safeJsonFetch('/api/projects');
      setProjects(data.projects || []);
    } catch {
      setError('获取项目列表失败');
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // ---- Select a project ----
  const handleSelectProject = async (name) => {
    setCurrentProject(name);
    setError('');
    setLastFilename('');
    setUserPrompt('');
    setReadingChapter(null);
    setReadingContent('');
    setShowSettings(false);
    setEditingProjectName(null);
    setEditWorld('');
    setEditCharacters('');
    setEditStyle('');
    setEditSummary('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`);
      setProjectDetails(data);
      setDisplayContent(data.recentContent || '');
    } catch (err) {
      setError(err.message);
      setProjectDetails(null);
      setDisplayContent('');
    }
  };

  const ILLEGAL_CHARS = /[/\\:*?"<>|]/;

  // ---- Create a project ----
  const handleCreateProject = async () => {
    const name = newProjectName.trim();

    if (!name) {
      setCreateError('项目名不能为空');
      return;
    }
    if (ILLEGAL_CHARS.test(name)) {
      setCreateError('项目名不能包含 / \\ : * ? " < > | 等字符');
      return;
    }

    setCreateError('');
    setCreating(true);
    try {
      await safeJsonFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: name,
          world: newWorld,
          characters: newCharacters,
          style: newStyle,
        }),
      });

      setShowCreateForm(false);
      setNewProjectName('');
      setNewWorld('');
      setNewCharacters('');
      setNewStyle('');
      setCreateError('');
      await fetchProjects();
      await handleSelectProject(name);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // ---- Generate ----
  const handleGenerate = async () => {
    if (!currentProject) {
      setError('请先选择一个项目');
      return;
    }
    if (!userPrompt.trim()) {
      setError('请输入生成要求');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await safeJsonFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: currentProject,
          userPrompt: userPrompt.trim(),
          model,
        }),
      });
      const fileName = data.fileName || data.filename;

      setDisplayContent((prev) => {
        const sep = prev ? '\n\n' : '';
        return prev + sep + '--- ' + fileName + ' ---\n' + data.content;
      });
      setLastFilename(fileName);
      setUserPrompt('');
      // Auto-select the new chapter for reading
      setReadingChapter(fileName);
      setReadingContent(data.content);
      // Refresh chapter list (merge title into local state immediately)
      const refreshData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`);
      setProjectDetails(refreshData);
      if (data.summaryUpdated) {
        setError(`已保存到：${fileName}，摘要已更新`);
      } else {
        setError(`章节已保存到：${fileName}，但摘要更新失败：${data.summaryError || '未知错误'}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Read a chapter ----
  const handleReadChapter = async (filename) => {
    setError('');
    try {
      const url = `/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}`;
      const data = await safeJsonFetch(url);
      console.log('章节接口返回的数据:', data);
      if (typeof data.fileName !== 'string' || typeof data.content !== 'string') {
        throw new Error('章节读取失败：后端未返回有效数据');
      }
      setReadingChapter(data.fileName);
      setReadingContent(data.content === '' ? '章节为空' : data.content);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Delete a chapter ----
  const handleDeleteChapter = async (filename, e) => {
    e.stopPropagation();
    const ch = projectDetails?.chapters?.find((c) => c.filename === filename);
    const label = ch?.title || filename;
    if (!confirm(`确定删除章节【${label}】吗？此操作不可恢复。`)) return;
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      // Refresh chapter list
      const refreshData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`);
      setProjectDetails(refreshData);
      setDisplayContent(refreshData.recentContent || '');
      // If reading the deleted chapter, close it
      if (readingChapter === filename) {
        setReadingChapter(null);
        setReadingContent('');
      }
      setError('章节已删除');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Delete a project ----
  const handleDeleteProject = async (name, e) => {
    e.stopPropagation();
    if (!confirm(`确定删除项目【${name}】吗？这会删除该项目的所有章节和设定，且不可恢复。`)) return;
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      // If deleting the current project, clear all state
      if (currentProject === name) {
        setCurrentProject(null);
        setProjectDetails(null);
        setDisplayContent('');
        setReadingChapter(null);
        setReadingContent('');
        setLastFilename('');
        setUserPrompt('');
        setShowSettings(false);
        setEditingProjectName(null);
        setEditWorld('');
        setEditCharacters('');
        setEditStyle('');
        setEditSummary('');
      }
      await fetchProjects();
      setError('项目已删除');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Copy full text ----
  const handleCopyFull = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败');
    }
  };

  // ---- Copy current chapter ----
  const handleCopyChapter = async () => {
    try {
      await navigator.clipboard.writeText(readingContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败');
    }
  };

  // ---- Open settings ----
  const handleOpenSettings = () => {
    if (!projectDetails) return;
    setEditWorld(projectDetails.world || '');
    setEditCharacters(projectDetails.characters || '');
    setEditStyle(projectDetails.style || '');
    setEditSummary(projectDetails.summary || '');
    setEditingProjectName(currentProject);
    setShowSettings(true);
    setError('');
  };

  // ---- Save settings ----
  const handleSaveSettings = async () => {
    if (editingProjectName !== currentProject) {
      setError('当前项目已切换，请重新打开编辑设定后再保存。');
      setShowSettings(false);
      return;
    }

    setError('');
    setSavingSettings(true);
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: editWorld,
          characters: editCharacters,
          style: editStyle,
          summary: editSummary,
        }),
      });
      // Sync projectDetails
      setProjectDetails((prev) => prev ? {
        ...prev,
        world: data.project?.world ?? editWorld,
        characters: data.project?.characters ?? editCharacters,
        style: data.project?.style ?? editStyle,
        summary: data.project?.summary ?? editSummary,
      } : prev);
      setError('设定已保存');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // ---- Refresh ----
  const handleRefresh = async () => {
    setError('');
    await fetchProjects();
    if (currentProject) {
      await handleSelectProject(currentProject);
    }
  };

  return (
    <div className="app">
      <h1>AI 小说项目管理器</h1>
      <div className="container">
        {/* ===== Left Panel: Projects ===== */}
        <div className="panel panel-left">
          <div className="panel-header">
            <h2>项目</h2>
            <button className="btn btn-sm" onClick={handleRefresh}>刷新</button>
          </div>

          <div className="project-list">
            {projects.length === 0 && (
              <p className="hint">暂无项目，请创建一个</p>
            )}
            {projects.map((name) => (
              <div key={name} className="project-item-wrap">
                <div
                  className={'project-item' + (currentProject === name ? ' active' : '')}
                  onClick={() => handleSelectProject(name)}
                >
                  <span className="project-name">{name}</span>
                </div>
                <button className="delete-btn project-delete" onClick={(e) => handleDeleteProject(name, e)}>删除</button>
              </div>
            ))}
          </div>

          {showCreateForm ? (
            <div className="create-form">
              <h3>创建新项目</h3>
              <label>项目名</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="输入项目名称"
              />
              <label>世界观设定</label>
              <textarea
                value={newWorld}
                onChange={(e) => setNewWorld(e.target.value)}
                rows={4}
                placeholder="描述世界观设定..."
              />
              <label>人物设定</label>
              <textarea
                value={newCharacters}
                onChange={(e) => setNewCharacters(e.target.value)}
                rows={4}
                placeholder="描述主要人物..."
              />
              <label>写作规则 / 风格要求</label>
              <textarea
                value={newStyle}
                onChange={(e) => setNewStyle(e.target.value)}
                rows={4}
                placeholder="文风要求、篇幅要求、写作规则…例如：情色文学，需重点描写人物身体和谈吐，篇幅2000字以上"
              />
              {createError && <div className="error create-error">{createError}</div>}
              <div className="form-actions">
                <button className="btn btn-sm" disabled={creating} onClick={handleCreateProject}>
                  {creating ? '创建中...' : '创建'}
                </button>
                <button className="btn btn-sm btn-secondary" disabled={creating} onClick={() => { setShowCreateForm(false); setCreateError(''); }}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm btn-secondary" onClick={() => setShowCreateForm(true)}>
              + 创建项目
            </button>
          )}

          {projectDetails && (
            <div className="chapters-list">
              <h3>章节列表</h3>
              {projectDetails.chapters && projectDetails.chapters.length > 0 ? (
                <ul>
                  {projectDetails.chapters.map((ch) => (
                    <li key={ch.filename} className="chapter-item-wrap">
                      <div
                        className={'chapter-item' + (readingChapter === ch.filename ? ' active' : '')}
                        onClick={() => handleReadChapter(ch.filename)}
                      >
                        <span className="chapter-name">{ch.filename.slice(0, 3)} {ch.title || ch.filename}</span>
                      </div>
                      <button className="delete-btn chapter-delete" onClick={(e) => handleDeleteChapter(ch.filename, e)}>删除</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">暂无章节</p>
              )}
            </div>
          )}
        </div>

        {/* ===== Main Panel: Generate + Reading ===== */}
        <div className="panel panel-main">
          <h2>生成小说</h2>

          {currentProject ? (
            <>
              <div className="current-project-label">
                当前项目：<strong>{currentProject}</strong>
                <button className="btn-link" onClick={handleOpenSettings}>编辑设定</button>
              </div>

              {/* Settings Editor */}
              {showSettings && (
                <div className="settings-panel">
                  <h3>项目设定</h3>
                  <label>世界观设定 world.md</label>
                  <textarea
                    className="settings-input"
                    value={editWorld}
                    onChange={(e) => setEditWorld(e.target.value)}
                    rows={3}
                    placeholder="世界观设定..."
                  />
                  <label>人物设定 characters.md</label>
                  <textarea
                    className="settings-input"
                    value={editCharacters}
                    onChange={(e) => setEditCharacters(e.target.value)}
                    rows={3}
                    placeholder="人物设定..."
                  />
                  <label>写作规则 style.md</label>
                  <textarea
                    className="settings-input"
                    value={editStyle}
                    onChange={(e) => setEditStyle(e.target.value)}
                    rows={5}
                    placeholder="写作规则、文风要求..."
                  />
                  <label>剧情摘要 summary.md</label>
                  <textarea
                    className="settings-input"
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    rows={5}
                    placeholder="剧情摘要..."
                  />
                  <div className="form-actions">
                    <button className="btn btn-sm" disabled={savingSettings} onClick={handleSaveSettings}>
                      {savingSettings ? '保存中...' : '保存设定'}
                    </button>
                    <button className="btn btn-sm btn-secondary" disabled={savingSettings} onClick={() => setShowSettings(false)}>
                      关闭
                    </button>
                  </div>
                </div>
              )}

              <label>续写要求</label>
              <textarea
                className="prompt-input"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="请输入本次生成要求，例如：写一段主角在废墟中发现神秘遗迹的情节"
                rows={6}
              />

              <div className="model-select">
                <label className={'model-option' + (model === 'deepseek-chat' ? ' active' : '')}>
                  <input
                    type="radio"
                    name="model"
                    value="deepseek-chat"
                    checked={model === 'deepseek-chat'}
                    onChange={() => setModel('deepseek-chat')}
                  />
                  <span className="model-option-text">
                    <span className="model-option-title">快速模式</span>
                    <span className="model-option-sub">deepseek-chat · 速度更快，适合日常续写</span>
                  </span>
                </label>
                <label className={'model-option' + (model === 'deepseek-reasoner' ? ' active' : '')}>
                  <input
                    type="radio"
                    name="model"
                    value="deepseek-reasoner"
                    checked={model === 'deepseek-reasoner'}
                    onChange={() => setModel('deepseek-reasoner')}
                  />
                  <span className="model-option-text">
                    <span className="model-option-title">深度模式</span>
                    <span className="model-option-sub">deepseek-reasoner · 复杂剧情与长线伏笔</span>
                  </span>
                </label>
              </div>

              <button className="btn" onClick={handleGenerate} disabled={loading}>
                {loading ? '生成中...' : '生成下一段'}
              </button>
              {loading && <div className="loading">正在调用 DeepSeek API，请稍候...</div>}
              {error && <div className="error">{error}</div>}

              {/* Reading Section */}
              {readingChapter && (
                <div className="reading-section">
                  <div className="reading-header">
                    <h3>
                      {(() => {
                        const ch = projectDetails?.chapters?.find((c) => c.filename === readingChapter);
                        return ch?.title || readingChapter;
                      })()}
                      <span style={{ fontSize: 12, color: '#aaa', fontWeight: 400, marginLeft: 10 }}>{readingChapter}</span>
                    </h3>
                    <div className="reading-actions">
                      <button className="btn btn-sm copy-btn" onClick={handleCopyChapter}>
                        {copied ? '已复制' : '复制本章'}
                      </button>
                      {displayContent && (
                        <button className="btn btn-sm copy-btn" onClick={handleCopyFull}>
                          复制全文
                        </button>
                      )}
                      <button className="btn btn-sm btn-secondary" onClick={() => { setReadingChapter(null); setReadingContent(''); }}>
                        关闭阅读
                      </button>
                    </div>
                  </div>
                  <div className="reading-content">{readingContent}</div>
                </div>
              )}
            </>
          ) : (
            <p className="hint">请先从左侧选择一个项目，或创建一个新项目。</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
