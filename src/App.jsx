import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import VaultPanel from './components/VaultPanel';
import PromptPreviewPanel from './components/PromptPreviewPanel';
import WritingControlPanel from './components/WritingControlPanel';
import GenerationProgress from './components/GenerationProgress';

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

  const [newSummary, setNewSummary] = useState('');

  // Create project form error (separate from main error to show it in the left panel)
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Generation
  const [model, setModel] = useState('deepseek-v4-flash');
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

  // Export
  const [exportStatus, setExportStatus] = useState('');
  const [rebuildingSummary, setRebuildingSummary] = useState(false);

  // Chapter title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Variants (regenerated chapter candidates)
  const [variants, setVariants] = useState([]);
  const [regenerating, setRegenerating] = useState(false);
  const [variantPreview, setVariantPreview] = useState(null);
  const [applyingVariant, setApplyingVariant] = useState(false);
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState('');

  // Sidebar layout
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [isChaptersCollapsed, setIsChaptersCollapsed] = useState(false);

  // Writing preferences
  const [writingPrefs, setWritingPrefs] = useState({
    style: '',
    paragraph: 'normal',
    pace: 'normal',
    characterConsistency: 'strict',
  });

  // Debug: current generation template info
  const [debugPromptInfo, setDebugPromptInfo] = useState(null);

  // Generation progress
  const [genProgress, setGenProgress] = useState({ visible: false, mode: 'generate', status: 'running', errorMessage: '' });

  // Toast notification
  const [toast, setToast] = useState(null); // { text, type }
  const titleTimeoutRef = useRef(null);
  const originalTitleRef = useRef(document.title);

  // Set document.title and optionally schedule restoration after ms
  function setTemporaryTitle(title, restoreMs) {
    clearTimeout(titleTimeoutRef.current);
    document.title = title;
    if (restoreMs) {
      titleTimeoutRef.current = setTimeout(() => {
        document.title = originalTitleRef.current;
      }, restoreMs);
    }
  }

  // Editor Note
  const [showEditorNote, setShowEditorNote] = useState(false);
  const [editorNoteLoading, setEditorNoteLoading] = useState(false);
  const [editorNoteError, setEditorNoteError] = useState('');
  const [editorNoteResult, setEditorNoteResult] = useState('');
  const editorNoteReqId = useRef(0);

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
    setVariants([]);
    setVariantPreview(null);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setShowSettings(false);
    setEditingProjectName(null);
    setDebugPromptInfo(null);
    // Clear Editor Note state
    setShowEditorNote(false);
    setEditorNoteResult('');
    setEditorNoteError('');
    setEditorNoteLoading(false);
    editorNoteReqId.current++;
    setWritingPrefs({ style: '', paragraph: 'normal', pace: 'normal', characterConsistency: 'strict' });
    setEditWorld('');
    setEditCharacters('');
    setEditStyle('');
    setEditSummary('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`);
      // Normalize: ensure chapters have fileName regardless of backend field name
      if (data.chapters) {
        data.chapters = data.chapters.map((ch) => {
          if (!ch.fileName && ch.filename) ch.fileName = ch.filename;
          return ch;
        });
      }
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
          summary: newSummary,
        }),
      });

      setShowCreateForm(false);
      setNewProjectName('');
      setNewWorld('');
      setNewCharacters('');
      setNewStyle('');
      setNewSummary('');
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
    setToast(null);
    setTemporaryTitle('写作中… - 小说生成器');
    setGenProgress({ visible: true, mode: 'generate', status: 'running', errorMessage: '' });
    try {
      const data = await safeJsonFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: currentProject,
          userPrompt: enhancedPrompt,
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
      // Debug template info
      setDebugPromptInfo(data.debugPromptInfo || null);
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
      setGenProgress(prev => ({ ...prev, status: 'success' }));
      setToast({ text: '这一章写好了', type: 'success' });
      setTemporaryTitle('已写好！ - 小说生成器', 3000);
    } catch (err) {
      setError(err.message);
      setGenProgress({ visible: true, mode: 'generate', status: 'error', errorMessage: err.message });
      setToast({ text: '生成失败，请查看错误提示', type: 'error' });
      setTemporaryTitle('生成失败 - 小说生成器', 3000);
    } finally {
      setLoading(false);
    }
  };

  // ---- Read a chapter ----
  const handleReadChapter = async (filename) => {
    setError('');
    setDebugPromptInfo(null);
    // Clear Editor Note state to prevent stale results from interfering
    setShowEditorNote(false);
    setEditorNoteResult('');
    setEditorNoteError('');
    setEditorNoteLoading(false);
    editorNoteReqId.current++;
    try {
      const url = `/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}`;
      const data = await safeJsonFetch(url);
      console.log('章节接口返回的数据:', data);
      if (typeof data.fileName !== 'string' || typeof data.content !== 'string') {
        throw new Error('章节读取失败：后端未返回有效数据');
      }
      setReadingChapter(data.fileName);
      setReadingContent(data.content === '' ? '章节为空' : data.content);
      // Load variants for this chapter
      handleLoadVariants(data.fileName);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Delete a chapter ----
  const handleDeleteChapter = async (filename, e) => {
    e.stopPropagation();
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === filename);
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
        setVariants([]);
        setVariantPreview(null);
        setShowRewriteInput(false);
        setRewritePrompt('');
        setDebugPromptInfo(null);
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
        setVariants([]);
        setVariantPreview(null);
        setShowRewriteInput(false);
        setRewritePrompt('');
        setLastFilename('');
        setUserPrompt('');
        setShowSettings(false);
        setEditingProjectName(null);
        setDebugPromptInfo(null);
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

  // ---- Export full text ----
  const handleExport = async () => {
    if (!currentProject) return;
    setExportStatus('exporting');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/export`);
      const blob = new Blob([data.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName || `${currentProject}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus('success');
      setTimeout(() => setExportStatus(''), 3000);
    } catch (err) {
      setExportStatus('error');
      setError('导出失败：' + err.message);
      setTimeout(() => { setExportStatus(''); }, 3000);
    }
  };

  // ---- Backup project ----
  const handleBackup = async () => {
    if (!currentProject) return;
    setError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(currentProject)}/backup`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '备份下载失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const match = disposition && disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? decodeURIComponent(match[1]) : `${currentProject}-backup.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setError('备份已下载');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Rebuild summary ----
  const handleRebuildSummary = async () => {
    if (!currentProject) return;
    setError('');
    setRebuildingSummary(true);
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/summary/rebuild`, {
        method: 'POST',
      });
      // Update local projectDetails summary
      setProjectDetails((prev) => prev ? { ...prev, summary: data.summary } : prev);
      setError('摘要已重建');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    } finally {
      setRebuildingSummary(false);
    }
  };

  // ---- Rebuild chapter index ----
  const handleRebuildIndex = async () => {
    if (!currentProject) return;
    if (!confirm('确定要重建章节索引吗？已有章节标题会尽量保留。')) return;
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/rebuild-index`, {
        method: 'POST',
      });
      // Update projectDetails chapters
      if (data.chapters) {
        data.chapters = data.chapters.map((ch) => {
          if (!ch.fileName && ch.filename) ch.fileName = ch.filename;
          return ch;
        });
      }
      setProjectDetails((prev) => prev ? { ...prev, chapters: data.chapters } : prev);
      // If the reading chapter no longer exists, clear reading
      if (readingChapter && !data.chapters.find((ch) => ch.fileName === readingChapter)) {
        setReadingChapter(null);
        setReadingContent('');
      }
      setError('索引已重建');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Edit chapter title ----
  const handleStartEditTitle = () => {
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
    setEditTitleValue(ch?.title || '');
    setEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitleValue.trim();
    if (!trimmed) {
      setError('标题不能为空');
      return;
    }
    setError('');
    try {
      await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      // Update local state
      setProjectDetails((prev) => {
        if (!prev) return prev;
        const updated = prev.chapters?.map((ch) =>
          ch.fileName === readingChapter ? { ...ch, title: trimmed } : ch
        );
        return { ...prev, chapters: updated };
      });
      setEditingTitle(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setEditTitleValue('');
  };

  // ---- Variants (regenerate chapter) ----
  const handleLoadVariants = async (filename) => {
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}/variants`);
      setVariants(data.variants || []);
    } catch {
      setVariants([]);
    }
  };

  const handleLoadRewritePrompt = () => {
    if (!currentProject || !readingChapter) return;
    // Get saved userPrompt from projectDetails, fallback to "继续写"
    const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
    const saved = ch?.userPrompt || '继续写';
    setRewritePrompt(saved);
    setShowRewriteInput(true);
  };

  const handleRegenerate = async () => {
    if (!currentProject || !readingChapter) return;
    const trimmed = rewritePrompt.trim();
    if (!trimmed) {
      setError('续写要求不能为空');
      return;
    }
    setRegenerating(true);
    setError('');
    setToast(null);
    setTemporaryTitle('写作中… - 小说生成器');
    setGenProgress({ visible: true, mode: 'rewrite', status: 'running', errorMessage: '' });
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, userPrompt: enhancedRewritePrompt }),
      });
      // Add new variant to list, embedding debug prompt info for display
      setVariants((prev) => [...prev, { ...data.variant, _debugPromptInfo: data.debugPromptInfo }]);
      setShowRewriteInput(false);
      setRewritePrompt('');
      setGenProgress(prev => ({ ...prev, status: 'success' }));
      setError('候选版本已生成');
      setTimeout(() => setError(''), 3000);
      setToast({ text: '这一章写好了', type: 'success' });
      setTemporaryTitle('已写好！ - 小说生成器', 3000);
    } catch (err) {
      setError(err.message);
      setGenProgress({ visible: true, mode: 'rewrite', status: 'error', errorMessage: err.message });
      setToast({ text: '生成失败，请查看错误提示', type: 'error' });
      setTemporaryTitle('生成失败 - 小说生成器', 3000);
    } finally {
      setRegenerating(false);
    }
  };

  const handleApplyVariant = async (variantId) => {
    if (!currentProject || !readingChapter) return;
    setApplyingVariant(true);
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/variants/${encodeURIComponent(variantId)}/apply`, {
        method: 'PUT',
      });
      // Update reading content
      setReadingContent(data.content);
      setVariantPreview(null);
      // Update projectDetails chapters to reflect new activeVersionId and title
      if (data.activeVersionId) {
        setProjectDetails((prev) => {
          if (!prev) return prev;
          const chapters = prev.chapters?.map((ch) =>
            (ch.fileName || ch.filename) === readingChapter
              ? { ...ch, activeVersionId: data.activeVersionId, title: data.title || ch.title }
              : ch
          );
          return { ...prev, chapters };
        });
      }
      setError('已设为主线，建议重算摘要');
      setTimeout(() => setError(''), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplyingVariant(false);
    }
  };

  const handlePreviewVariant = (variant) => {
    setVariantPreview(variantPreview?.id === variant.id ? null : variant);
  };

  // Build enhanced prompt by appending writing preferences
  function buildEnhancedPrompt(basePrompt, prefs) {
    const lines = [];
    if (prefs.style?.trim()) lines.push(`- 文风：${prefs.style.trim()}`);

    const paragraphMap = { short: '短段，加快叙事节奏', normal: '自然段', long: '长段，展开细节描写' };
    lines.push(`- 段落：${paragraphMap[prefs.paragraph] || paragraphMap.normal}`);

    const paceMap = { slow: '慢热，铺垫细节', normal: '正常推进', fast: '快一点，减少冗余描写' };
    lines.push(`- 剧情推进：${paceMap[prefs.pace] || paceMap.normal}`);

    const charMap = { strict: '严格保持既有人物性格和关系', natural: '允许人物自然发展' };
    lines.push(`- 人设：${charMap[prefs.characterConsistency] || charMap.strict}`);

    return basePrompt + '\n\n【本次写作偏好】\n' + lines.join('\n');
  }

  const enhancedPrompt = useMemo(() => buildEnhancedPrompt(userPrompt.trim(), writingPrefs), [userPrompt, writingPrefs]);
  const enhancedRewritePrompt = useMemo(() => buildEnhancedPrompt((rewritePrompt || '').trim(), writingPrefs), [rewritePrompt, writingPrefs]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Component unmount cleanup: clear title timeout and restore title
  useEffect(() => {
    return () => {
      clearTimeout(titleTimeoutRef.current);
      document.title = originalTitleRef.current;
    };
  }, []);

  const handleGenProgressDone = useCallback(() => {
    setGenProgress({ visible: false, mode: 'generate', status: 'running', errorMessage: '' });
  }, []);

  // ---- Editor Note ----
  const handleEditorNote = async () => {
    if (!currentProject || !readingChapter) {
      setEditorNoteError('请先选择项目并阅读章节');
      return;
    }

    const reqId = ++editorNoteReqId.current;
    setEditorNoteLoading(true);
    setEditorNoteError('');
    setEditorNoteResult('');
    setShowEditorNote(true);

    try {
      const url = `/api/editor/note?projectName=${encodeURIComponent(currentProject)}&chapterFileName=${encodeURIComponent(readingChapter)}`;
      const data = await safeJsonFetch(url);
      if (reqId !== editorNoteReqId.current) return;
      setEditorNoteResult(data.note || '（无备注内容）');
    } catch (err) {
      if (reqId !== editorNoteReqId.current) return;
      setEditorNoteError(err.message);
    } finally {
      if (reqId === editorNoteReqId.current) {
        setEditorNoteLoading(false);
      }
    }
  };

  const handleCloseEditorNote = () => {
    setShowEditorNote(false);
    setEditorNoteResult('');
    setEditorNoteError('');
    setEditorNoteLoading(false);
    editorNoteReqId.current++;
  };

  return (
    <div className="app">
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.text}
        </div>
      )}
      <h1>AI 写作工作台</h1>
      <div className={`container app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        {/* ===== Left Panel: Projects ===== */}
        {isSidebarCollapsed ? (
          <button
            className="sidebar-collapsed-toggle"
            onClick={() => setIsSidebarCollapsed(false)}
            title="展开侧栏"
          >
            ›
          </button>
        ) : (
          <aside className="panel panel-left sidebar">
            <button
              className="sidebar-collapsed-toggle sidebar-collapse-button"
              onClick={() => setIsSidebarCollapsed(true)}
              title="收起侧栏"
            >
              ‹
            </button>

            <section className="sidebar-section">
              <div className="sidebar-section-header">
                <h2>项目</h2>
                <div className="sidebar-section-actions">
                  {!isProjectsCollapsed && <button className="btn" onClick={handleRefresh}>刷新</button>}
                  <button className="btn btn-secondary" onClick={() => setIsProjectsCollapsed((prev) => !prev)}>
                    {isProjectsCollapsed ? '展开' : '收起'}
                  </button>
                </div>
              </div>

              {!isProjectsCollapsed && (
                <div className="sidebar-section-body">
                  <div className="project-list project-list-scroll">
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

                  <button className="btn btn-secondary" onClick={() => { setShowCreateForm(true); setCreateError(''); }}>
                    + 创建项目
                  </button>
                </div>
              )}
            </section>

            {projectDetails && (
              <section className="sidebar-section chapters-list">
                <div className="sidebar-section-header">
                  <h3>章节列表</h3>
                  <div className="sidebar-section-actions">
                    {!isChaptersCollapsed && (
                      <>
                        <button className="btn" onClick={handleExport} disabled={exportStatus === 'exporting'}>
                          {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
                        </button>
                        <details className="project-tools">
                          <summary className="project-tools-summary">项目工具</summary>
                          <div className="project-tools-body">
                            <button className="btn" onClick={handleRebuildIndex}>重建索引</button>
                            <button className="btn btn-secondary" onClick={handleBackup}>
                              导出项目备份
                            </button>
                          </div>
                        </details>
                      </>
                    )}
                    <button className="btn btn-secondary" onClick={() => setIsChaptersCollapsed((prev) => !prev)}>
                      {isChaptersCollapsed ? '展开' : '收起'}
                    </button>
                  </div>
                </div>

                {!isChaptersCollapsed && (
                  <div className="sidebar-section-body chapter-list-scroll">
                    {projectDetails.chapters && projectDetails.chapters.length > 0 ? (
                      <ul>
                        {projectDetails.chapters.map((ch, index) => {
                          const cf = ch.fileName || ch.filename;
                          const key = cf || `chapter-${index}`;
                          return (
                          <li key={key} className={`chapter-item-wrap${!cf ? ' disabled' : ''}`}>
                            <div
                              className={'chapter-item' + (cf && readingChapter === cf ? ' active' : '')}
                              onClick={() => cf && handleReadChapter(cf)}
                            >
                              <span className="chapter-name">{cf ? `${cf.slice(0, 3)} ${ch.title || cf.replace(/\.txt$/, '')}` : '无效章节'}</span>
                            </div>
                            <button className="delete-btn chapter-delete" disabled={!cf} onClick={(e) => cf && handleDeleteChapter(cf, e)}>删除</button>
                          </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="hint">暂无章节</p>
                    )}
                  </div>
                )}
              </section>
            )}
          </aside>
        )}

        {/* ===== Main Panel: Generate + Reading ===== */}
        <div className="panel panel-main">
          {showCreateForm ? (
            <div className="create-panel">
              <h2>创建新项目</h2>

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
                placeholder="描述世界观设定..."
                rows={6}
              />

              <label>人物设定</label>
              <textarea
                value={newCharacters}
                onChange={(e) => setNewCharacters(e.target.value)}
                placeholder="描述主要人物..."
                rows={6}
              />

              <label>写作规则 / 风格要求</label>
              <textarea
                value={newStyle}
                onChange={(e) => setNewStyle(e.target.value)}
                placeholder="文风要求、篇幅要求、写作规则…"
                rows={8}
              />

              <label>剧情摘要（可选）</label>
              <textarea
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="剧情摘要…"
                rows={5}
              />

              {createError && <div className="error">{createError}</div>}

              <div className="form-actions">
                <button className="btn" disabled={creating} onClick={handleCreateProject}>
                  {creating ? '创建中...' : '创建'}
                </button>
                <button className="btn btn-secondary" disabled={creating} onClick={() => { setShowCreateForm(false); setCreateError(''); setNewProjectName(''); setNewWorld(''); setNewCharacters(''); setNewStyle(''); setNewSummary(''); }}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2>生成小说</h2>

              {currentProject ? (
            <>
              <div className="current-project-label">
                当前项目：<strong>{currentProject}</strong>
                <button className="btn-link" onClick={handleOpenSettings}>编辑设定</button>
                <button className="btn-link" onClick={handleRebuildSummary} disabled={rebuildingSummary}>
                  {rebuildingSummary ? '重算中...' : '重算摘要'}
                </button>
              </div>

              {/* Settings Editor */}
              {showSettings && (
                <div className="settings-panel">
                  <h3>项目设定</h3>
                  <label>世界观设定</label>
                  <textarea
                    className="settings-input"
                    value={editWorld}
                    onChange={(e) => setEditWorld(e.target.value)}
                    rows={3}
                    placeholder="世界观设定..."
                  />
                  <label>人物设定</label>
                  <textarea
                    className="settings-input"
                    value={editCharacters}
                    onChange={(e) => setEditCharacters(e.target.value)}
                    rows={3}
                    placeholder="人物设定..."
                  />
                  <label>写作规则</label>
                  <textarea
                    className="settings-input"
                    value={editStyle}
                    onChange={(e) => setEditStyle(e.target.value)}
                    rows={5}
                    placeholder="写作规则、文风要求..."
                  />
                  <label>剧情摘要</label>
                  <textarea
                    className="settings-input"
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    rows={5}
                    placeholder="剧情摘要..."
                  />
                  <div className="form-actions">
                    <button className="btn" disabled={savingSettings} onClick={handleSaveSettings}>
                      {savingSettings ? '保存中...' : '保存设定'}
                    </button>
                    <button className="btn btn-secondary" disabled={savingSettings} onClick={() => setShowSettings(false)}>
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
                <label className={'model-option' + (model === 'deepseek-v4-flash' ? ' active' : '')}>
                  <input
                    type="radio"
                    name="model"
                    value="deepseek-v4-flash"
                    checked={model === 'deepseek-v4-flash'}
                    onChange={() => setModel('deepseek-v4-flash')}
                  />
                  <span className="model-option-text">
                    <span className="model-option-title">快速模式</span>
                    <span className="model-option-sub">deepseek-v4-flash · 速度更快，适合日常续写</span>
                  </span>
                </label>
                <label className={'model-option' + (model === 'deepseek-v4-pro' ? ' active' : '')}>
                  <input
                    type="radio"
                    name="model"
                    value="deepseek-v4-pro"
                    checked={model === 'deepseek-v4-pro'}
                    onChange={() => setModel('deepseek-v4-pro')}
                  />
                  <span className="model-option-text">
                    <span className="model-option-title">深度模式</span>
                    <span className="model-option-sub">deepseek-v4-pro · 复杂剧情与长线伏笔</span>
                  </span>
                </label>
              </div>

              <WritingControlPanel
                prefs={writingPrefs}
                onChange={setWritingPrefs}
              />

              <details className="advanced-options">
                <summary className="advanced-options-summary">
                  <span className="advanced-options-title">高级选项</span>
                  <span className="advanced-options-arrow">▶</span>
                </summary>
                <div className="advanced-options-body">
                  <PromptPreviewPanel
                    taskType="novel.generateChapter"
                    projectDetails={projectDetails}
                    userPrompt={enhancedPrompt}
                  />
                  <details className="advanced-options-sub">
                    <summary className="advanced-options-sub-summary">
                      高级模板设置
                    </summary>
                    <div className="advanced-options-sub-body">
                      <p className="hint" style={{ fontSize: 12, marginBottom: 8 }}>
                        一般不用改。只有在你想调整 AI 底层写作模板时再打开。
                      </p>
                      <VaultPanel />
                    </div>
                  </details>
                </div>
              </details>

              <button className="btn" onClick={handleGenerate} disabled={loading}>
                {loading ? '生成中...' : '生成下一段'}
              </button>
              {loading && (
                <div className="generating-notice">
                  <span className="generating-spinner"></span>
                  正在生成章节…
                </div>
              )}
              <GenerationProgress
                visible={genProgress.visible}
                mode={genProgress.mode}
                status={genProgress.status}
                errorMessage={genProgress.errorMessage}
                onComplete={handleGenProgressDone}
              />
              {error && <div className="error">{error}</div>}

              {/* Reading Section */}
              {readingChapter && (
                <div className="reading-section">
                  <div className="reading-header">
                    <h3>
                      {editingTitle ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            style={{ fontSize: 14, padding: '4px 8px', flex: 1, minWidth: 280, borderRadius: 4, border: '1px solid #d9d9d9' }}
                            autoFocus
                          />
                          <button className="btn" onClick={handleSaveTitle}>保存</button>
                          <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                        </span>
                      ) : (
                        <>
                          {(() => {
                            const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
                            return ch?.title || readingChapter;
                          })()}
                          <span style={{ fontSize: 12, color: '#aaa', fontWeight: 400, marginLeft: 10 }}>{readingChapter}</span>
                          <button className="btn-link" style={{ marginLeft: 8, fontSize: 12 }} onClick={handleStartEditTitle}>编辑标题</button>
                        </>
                      )}
                    </h3>
                    <div className="reading-actions">
                      <button className="btn" onClick={() => { if (showRewriteInput) { setShowRewriteInput(false); setRewritePrompt(''); } else { handleLoadRewritePrompt(); } }}>
                        {showRewriteInput ? '取消重写' : '重写本章'}
                      </button>
                      <button className="btn btn-ai" onClick={handleEditorNote}>
                        编辑备注
                      </button>
                      <button className="btn btn-success" onClick={handleCopyChapter}>
                        {copied ? '已复制' : '复制本章'}
                      </button>
                      {displayContent && (
                        <button className="btn btn-success" onClick={handleCopyFull}>
                          复制全文
                        </button>
                      )}
                      <button className="btn btn-secondary" onClick={() => { setReadingChapter(null); setReadingContent(''); setVariants([]); setVariantPreview(null); setShowRewriteInput(false); setRewritePrompt(''); setDebugPromptInfo(null); }}>
                        关闭阅读
                      </button>
                    </div>
                  </div>

                  {/* Debug template info */}
                  {debugPromptInfo && (
                    <div className="debug-prompt-info">
                      {debugPromptInfo.usedFallback
                        ? '本次使用模板：旧版内置 Prompt（Vault 模板未命中）'
                        : `本次使用模板：${debugPromptInfo.templateTitle || '未知'}`}
                    </div>
                  )}

                  {/* Rewrite input */}
                  {showRewriteInput && (
                    <div className="rewrite-input-area">
                      <h3 style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>本次重写要求</h3>
                      <p style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>你可以在原续写要求基础上修改，只影响这次候选版本生成。</p>
                      <textarea
                        className="prompt-input"
                        value={rewritePrompt}
                        onChange={(e) => setRewritePrompt(e.target.value)}
                        placeholder="继续写"
                        rows={4}
                        style={{ marginBottom: 8 }}
                      />
                      <PromptPreviewPanel
                        taskType="novel.rewriteChapter"
                        projectDetails={projectDetails}
                        userPrompt={enhancedRewritePrompt}
                        fileName={readingChapter}
                      />
                      <button className="btn" onClick={handleRegenerate} disabled={regenerating}>
                        {regenerating ? '重写中...' : '生成候选版本'}
                      </button>
                      {regenerating && (
                        <div className="generating-notice">
                          <span className="generating-spinner"></span>
                          正在生成候选版本…
                        </div>
                      )}
                      <GenerationProgress
                        visible={genProgress.visible && genProgress.mode === 'rewrite'}
                        mode="rewrite"
                        status={genProgress.status}
                        errorMessage={genProgress.errorMessage}
                        onComplete={handleGenProgressDone}
                      />
                    </div>
                  )}

                  <div className="reading-content">{variantPreview ? variantPreview.content : readingContent}</div>

                  {/* Chapter bottom navigation */}
                  {(() => {
                    if (!projectDetails?.chapters) return null;
                    const chapters = projectDetails.chapters;
                    const idx = chapters.findIndex((ch) => (ch.fileName || ch.filename) === readingChapter);
                    if (idx === -1) return null;
                    const prev = idx > 0 ? chapters[idx - 1] : null;
                    const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
                    const prevFn = prev ? (prev.fileName || prev.filename) : null;
                    const nextFn = next ? (next.fileName || next.filename) : null;
                    return (
                      <div className="chapter-bottom-nav">
                        <button className="btn" disabled={!prev} onClick={() => prevFn && handleReadChapter(prevFn)}>
                          上一章
                        </button>
                        <button className="btn btn-secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                          回目录
                        </button>
                        <button className="btn" disabled={!next} onClick={() => nextFn && handleReadChapter(nextFn)}>
                          下一章
                        </button>
                      </div>
                    );
                  })()}

                  {/* Variants list */}
                  {variants.length > 0 && (
                    <div className="variants-section">
                      <div className="panel-header" style={{ marginTop: 16 }}>
                        <h3>候选版本（{variants.length}）</h3>
                      </div>
                      {(() => {
                        const ch = projectDetails?.chapters?.find((c) => (c.fileName || c.filename) === readingChapter);
                        const activeVersionId = ch?.activeVersionId || 'v-original';
                        return variants.map((v, index) => {
                          const versionLabel = v.id === 'v-original'
                            ? '第一版 / 原始版'
                            : `第${index + 1}版 / 候选版`;
                          const promptSummary = v.userPrompt || '继续写';
                          return (
                          <div key={v.id}>
                            <div className={'variant-item' + (v.id === activeVersionId ? ' active' : '')}>
                              <div className="variant-info">
                                <span className="variant-meta">
                                  {v.id === activeVersionId && <span style={{ color: '#52c41a', fontWeight: 600, marginRight: 8 }}>● 当前主线</span>}
                                  {versionLabel} · {new Date(v.createdAt).toLocaleString()} · {v.model || '原始版'}
                                </span>
                                {v.title && v.title !== ch?.title && (
                                  <span className="variant-instruction" style={{ color: '#4a6cf7' }}>
                                    标题：{v.title.slice(0, 80)}{v.title.length > 80 ? '...' : ''}
                                  </span>
                                )}
                                <span className="variant-instruction">
                                  续写要求：{promptSummary.slice(0, 100)}{promptSummary.length > 100 ? '...' : ''}
                                </span>
                                {v._debugPromptInfo && (
                                  <span className="debug-prompt-info debug-prompt-info-inline">
                                    {v._debugPromptInfo.usedFallback
                                      ? '旧版内置 Prompt（Vault 模板未命中）'
                                      : `模板：${v._debugPromptInfo.templateTitle || '未知'}`}
                                  </span>
                                )}
                              </div>
                              <div className="variant-actions">
                                <button
                                  className={'btn' + (variantPreview?.id === v.id ? ' active' : '')}
                                  onClick={() => handlePreviewVariant(v)}
                                >
                                  {variantPreview?.id === v.id ? '关闭正文' : '查看正文'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  disabled={applyingVariant || v.id === activeVersionId}
                                  onClick={() => handleApplyVariant(v.id)}
                                >
                                  {v.id === activeVersionId ? '当前主线' : (applyingVariant ? '应用中...' : '沿此版本继续')}
                                </button>
                              </div>
                            </div>
                          </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="hint">请先从左侧选择一个项目，或创建一个新项目。</p>
          )}
            </>
          )}
          </div>
        </div>

      {/* ===== Editor Note Overlay ===== */}
      {showEditorNote && (
        <div className="editor-note-overlay" onClick={handleCloseEditorNote}>
          <div className="editor-note-panel" onClick={(e) => e.stopPropagation()}>
            <div className="editor-note-header">
              <h3>编辑备注</h3>
              <span className="editor-note-role">后台编辑 → 生成模型</span>
              <button className="btn btn-secondary" onClick={handleCloseEditorNote}>关闭</button>
            </div>
            <div className="editor-note-body">

              {/* Loading state */}
              {editorNoteLoading && (
                <div className="editor-note-loading">
                  <div className="editor-note-loading-spinner"></div>
                  <span>正在生成编辑备注...</span>
                </div>
              )}

              {/* Error state */}
              {editorNoteError && <div className="error">{editorNoteError}</div>}

              {/* Result */}
              {!editorNoteLoading && editorNoteResult && (
                <div className="editor-note-text">{editorNoteResult}</div>
              )}

              {/* Empty state */}
              {!editorNoteLoading && !editorNoteResult && !editorNoteError && (
                <div className="editor-note-empty">
                  <p>点击"编辑备注"查看后台给生成模型的内部提醒。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
