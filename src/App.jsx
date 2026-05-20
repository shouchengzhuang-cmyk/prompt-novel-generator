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

function normalizeChapters(chapters) {
  if (!Array.isArray(chapters)) return chapters;
  return chapters.map((ch) => {
    if (!ch.fileName && ch.filename) ch.fileName = ch.filename;
    if (!ch.filename && ch.fileName) ch.filename = ch.fileName;
    return ch;
  });
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
  const [readingChapterTitle, setReadingChapterTitle] = useState('');
  const [readingContent, setReadingContent] = useState('');

  // Project settings editor
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editWorld, setEditWorld] = useState('');
  const [editCharacters, setEditCharacters] = useState('');
  const [editStyle, setEditStyle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editEditorialMemory, setEditEditorialMemory] = useState('');
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

  // Bottom-right notification card
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 10000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Browser title during generation / rewrite
  useEffect(() => {
    const busy = loading || regenerating;
    document.title = busy ? '生成中...' : '小墨匣';
    return () => { document.title = '小墨匣'; };
  }, [loading, regenerating]);

  // Editor Note
  const [editorNoteLoading, setEditorNoteLoading] = useState(false);
  const [editorNoteError, setEditorNoteError] = useState('');
  const [editorNoteResult, setEditorNoteResult] = useState('');
  const editorNoteReqId = useRef(0);

  // Editor room
  const [editorRoomTab, setEditorRoomTab] = useState('notes');
  const [editorNotes, setEditorNotes] = useState([]);
  const [editorChats, setEditorChats] = useState([]);
  const [editorChatInput, setEditorChatInput] = useState('');
  const [editorChatSending, setEditorChatSending] = useState(false);
  const [editorChatError, setEditorChatError] = useState('');
  const [savingEditorNoteId, setSavingEditorNoteId] = useState('');

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

  const resetEditorRoom = () => {
    setEditorRoomTab('notes');
    setEditorNotes([]);
    setEditorChats([]);
    setEditorChatInput('');
    setEditorChatError('');
    setSavingEditorNoteId('');
    setEditorNoteResult('');
    setEditorNoteError('');
    setEditorNoteLoading(false);
    editorNoteReqId.current++;
  };

  // ---- Select a project ----
  const handleSelectProject = async (name) => {
    setCurrentProject(name);
    setError('');
    setLastFilename('');
    setUserPrompt('');
    setReadingChapter(null);
    setReadingChapterTitle('');
    setReadingContent('');
    setVariants([]);
    setVariantPreview(null);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setShowSettings(false);
    setEditingProjectName(null);
    setDebugPromptInfo(null);
    resetEditorRoom();
    setWritingPrefs({ style: '', paragraph: 'normal', pace: 'normal', characterConsistency: 'strict' });
    setEditWorld('');
    setEditCharacters('');
    setEditStyle('');
    setEditSummary('');
    setEditEditorialMemory('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`);
      // Normalize: ensure chapters have fileName regardless of backend field name
      if (data.chapters) data.chapters = normalizeChapters(data.chapters);
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
    if (loading || regenerating) return;
    if (!currentProject) {
      setError('请先选择一个项目');
      return;
    }
    if (!userPrompt.trim()) {
      setError('请输入生成要求');
      return;
    }

    const chapters = projectDetails?.chapters || [];
    const lastChapter = chapters[chapters.length - 1];
    if (lastChapter?.staleAfterRewrite) {
      const message = '当前后续章节可能基于旧版本，建议先确认保留或重写。';
      setError(message);
      setNotification({ title: '请先检查后续章节', message });
      return;
    }

    setError('');
    setLoading(true);
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
      setReadingChapterTitle(data.title || '');
      setReadingContent(data.content);
      // Refresh chapter list (don't let failure affect success state)
      try {
        const refreshData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}`);
        if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
        setProjectDetails(refreshData);
      } catch (refreshErr) {
        console.warn('刷新章节列表失败:', refreshErr);
      }
      setGenProgress(prev => ({ ...prev, status: 'success' }));
      setNotification({ title: '这一章写好了', message: `新章节已保存（${fileName}）` });
    } catch (err) {
      setGenProgress({ visible: true, mode: 'generate', status: 'error', errorMessage: err.message });
      setNotification({ title: '生成失败', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ---- Read a chapter ----
  const handleReadChapter = async (filename) => {
    setError('');
    setDebugPromptInfo(null);
    resetEditorRoom();
    // Clear previous chapter state before loading new one
    setVariantPreview(null);
    setVariants([]);
    setShowRewriteInput(false);
    setRewritePrompt('');
    setReadingContent('');
    try {
      const url = `/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(filename)}`;
      const data = await safeJsonFetch(url);
      console.log('章节接口返回的数据:', data);
      if (typeof data.fileName !== 'string' || typeof data.content !== 'string') {
        throw new Error('章节读取失败：后端未返回有效数据');
      }
      setReadingChapter(data.fileName);
      setReadingChapterTitle(data.title || '');
      setReadingContent(data.content === '' ? '章节为空' : data.content);
      setEditorNotes(Array.isArray(data.editorNotes) ? data.editorNotes : []);
      setEditorChats(Array.isArray(data.editorChats) ? data.editorChats : []);
      setProjectDetails((prev) => {
        if (!prev?.chapters) return prev;
        const chapters = prev.chapters.map((ch) =>
          (ch.fileName || ch.filename) === data.fileName
            ? {
                ...ch,
                staleAfterRewrite: data.staleAfterRewrite === true,
                staleReason: data.staleReason || '',
                staleFromFileName: data.staleFromFileName || '',
                staleAt: data.staleAt || null,
              }
            : ch
        );
        return { ...prev, chapters };
      });
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
      if (refreshData.chapters) refreshData.chapters = normalizeChapters(refreshData.chapters);
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
        resetEditorRoom();
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
        setEditEditorialMemory('');
        resetEditorRoom();
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
    setEditEditorialMemory(projectDetails.editorialMemory || '');
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
          editorialMemory: editEditorialMemory,
        }),
      });
      // Sync projectDetails
      setProjectDetails((prev) => prev ? {
        ...prev,
        world: data.project?.world ?? editWorld,
        characters: data.project?.characters ?? editCharacters,
        style: data.project?.style ?? editStyle,
        summary: data.project?.summary ?? editSummary,
        editorialMemory: data.project?.editorialMemory ?? editEditorialMemory,
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
      if (data.chapters) data.chapters = normalizeChapters(data.chapters);
      setProjectDetails((prev) => prev ? { ...prev, chapters: data.chapters } : prev);
      // If the reading chapter no longer exists, clear reading
      if (readingChapter && !data.chapters.find((ch) => ch.fileName === readingChapter)) {
        setReadingChapter(null);
        setReadingContent('');
        resetEditorRoom();
      }
      setError('索引已重建');
      setTimeout(() => setError(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ---- Edit chapter title ----
  const handleStartEditTitle = () => {
    setEditTitleValue(readingChapterTitle);
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
      setReadingChapterTitle(trimmed);
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
    if (loading || regenerating) return;
    if (!currentProject || !readingChapter) return;
    const trimmed = rewritePrompt.trim();
    if (!trimmed) {
      setError('续写要求不能为空');
      return;
    }
    setRegenerating(true);
    setError('');
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
      setNotification({ title: '候选版本写好了', message: '可以查看并决定是否采用。' });
    } catch (err) {
      setGenProgress({ visible: true, mode: 'rewrite', status: 'error', errorMessage: err.message });
      setNotification({ title: '生成失败', message: err.message });
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
      // Update reading content and title
      setReadingContent(data.content);
      if (data.title) setReadingChapterTitle(data.title);
      setVariantPreview(null);
      // Update projectDetails chapters to reflect new activeVersionId and title
      if (data.chapters) {
        const chapters = normalizeChapters(data.chapters);
        setProjectDetails((prev) => prev ? { ...prev, chapters } : prev);
      } else if (data.activeVersionId) {
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

      // Auto-rebuild summary after variant is applied
      let summaryFailed = false;
      try {
        const summaryData = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/summary/rebuild`, {
          method: 'POST',
        });
        setProjectDetails((prev) => prev ? { ...prev, summary: summaryData.summary } : prev);
      } catch (summaryErr) {
        summaryFailed = true;
        console.error('摘要更新失败:', summaryErr);
      }

      if (summaryFailed) {
        setNotification({ title: '重写完成', message: '章节已重写，但摘要更新失败，请稍后再试。' });
      } else {
        setNotification({ title: '重写完成', message: '重写完成，摘要已同步更新。' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplyingVariant(false);
    }
  };

  const handleConfirmKeepChapter = async () => {
    if (!currentProject || !readingChapter) return;
    setError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/stale/confirm`, {
        method: 'PUT',
      });
      if (data.chapters) {
        const chapters = normalizeChapters(data.chapters);
        setProjectDetails((prev) => prev ? { ...prev, chapters } : prev);
      } else if (data.chapter) {
        setProjectDetails((prev) => {
          if (!prev?.chapters) return prev;
          const chapters = prev.chapters.map((ch) =>
            (ch.fileName || ch.filename) === readingChapter ? { ...ch, ...data.chapter } : ch
          );
          return { ...prev, chapters };
        });
      }
      setNotification({ title: '已确认保留', message: '当前章节已恢复为可用正史。' });
    } catch (err) {
      setError(err.message);
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
  const readingChapterRecord = useMemo(
    () => projectDetails?.chapters?.find((ch) => (ch.fileName || ch.filename) === readingChapter) || null,
    [projectDetails, readingChapter]
  );

  const handleGenProgressDone = useCallback(() => {
    setGenProgress({ visible: false, mode: 'generate', status: 'running', errorMessage: '' });
  }, []);

  // ---- Editor Note ----
  const syncCurrentChapterEditorData = (notes, chats) => {
    setProjectDetails((prev) => {
      if (!prev || !readingChapter) return prev;
      const chapters = prev.chapters?.map((ch) =>
        (ch.fileName || ch.filename) === readingChapter
          ? {
              ...ch,
              editorNotes: notes ?? ch.editorNotes ?? [],
              editorChats: chats ?? ch.editorChats ?? [],
            }
          : ch
      );
      return { ...prev, chapters };
    });
  };

  const handleEditorNote = async () => {
    if (!currentProject || !readingChapter) {
      setEditorNoteError('请先选择项目并阅读章节');
      return;
    }

    setEditorRoomTab('notes');
    const reqId = ++editorNoteReqId.current;
    setEditorNoteLoading(true);
    setEditorNoteError('');
    setEditorNoteResult('');

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

  const handleEditorChatKeyDown = (event) => {
    if (event.nativeEvent?.isComposing || event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!editorChatInput.trim() || editorChatSending) return;
      handleSendEditorChat();
    }
  };

  const handleSendEditorChat = async () => {
    if (editorChatSending || !currentProject || !readingChapter) return;
    const trimmed = editorChatInput.trim();
    if (!trimmed) {
      setEditorChatError('');
      return;
    }

    const userMsg = { id: `local-${Date.now()}-user`, role: 'user', content: trimmed, createdAt: Date.now() };
    const chatsWithUser = [...editorChats, userMsg];

    setEditorChats(chatsWithUser);
    setEditorChatInput('');
    setEditorChatSending(true);
    setEditorChatError('');
    try {
      const data = await safeJsonFetch('/api/editor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: currentProject,
          chapterId: readingChapter,
          fileName: readingChapter,
          message: trimmed,
        }),
      });
      const finalChats = Array.isArray(data.editorChats)
        ? data.editorChats
        : [...chatsWithUser, { id: `local-${Date.now()}-editor`, role: 'editor', content: data.reply || '', createdAt: Date.now() }];
      setEditorChats(finalChats);
      syncCurrentChapterEditorData(editorNotes, finalChats);
    } catch (err) {
      setEditorChatError(err.message);
    } finally {
      setEditorChatSending(false);
    }
  };

  const handleClearEditorChats = async () => {
    if (!currentProject || !readingChapter || editorChatSending) return;
    if (!confirm('确定清空当前章节的编辑对话吗？此操作不可恢复。')) return;

    setEditorChatError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/editor-chats`, {
        method: 'DELETE',
      });
      const nextChats = Array.isArray(data.editorChats) ? data.editorChats : [];
      setEditorChats(nextChats);
      syncCurrentChapterEditorData(editorNotes, nextChats);
    } catch (err) {
      setEditorChatError(err.message);
    }
  };

  const handleSaveEditorNote = async (content, sourceId = 'generated-note') => {
    if (!currentProject || !readingChapter || !content?.trim()) return;
    setSavingEditorNoteId(sourceId);
    setEditorNoteError('');
    setEditorChatError('');
    try {
      const data = await safeJsonFetch(`/api/projects/${encodeURIComponent(currentProject)}/chapters/${encodeURIComponent(readingChapter)}/editor-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const nextNotes = Array.isArray(data.editorNotes) ? data.editorNotes : [...editorNotes, data.note].filter(Boolean);
      setEditorNotes(nextNotes);
      syncCurrentChapterEditorData(nextNotes, editorChats);
      setEditorRoomTab('notes');
      setNotification({ title: '已保存为备注', message: '这条编辑建议已经追加到当前章节。' });
    } catch (err) {
      setEditorNoteError(err.message);
      setEditorChatError(err.message);
    } finally {
      setSavingEditorNoteId('');
    }
  };

  return (
    <div className="app">
      <h1>小墨匣</h1>
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
                              <span className="chapter-name">
                                <span className="chapter-name-text">{cf ? `${cf.slice(0, 3)} ${ch.title || cf.replace(/\.txt$/, '')}` : '无效章节'}</span>
                                {ch.staleAfterRewrite && <span className="chapter-stale-badge">待检查</span>}
                              </span>
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
                  <label>项目编辑记忆</label>
                  <div className="settings-hint">记录跨章节人物关系、伏笔、长期写作风险和编辑判断。不同于剧情摘要：摘要记录剧情事实，这里记录编辑分析。</div>
                  <textarea
                    className="settings-input"
                    value={editEditorialMemory}
                    onChange={(e) => setEditEditorialMemory(e.target.value)}
                    rows={6}
                    placeholder="项目编辑记忆..."
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

              <button className="btn" onClick={handleGenerate} disabled={loading || regenerating}>
                {loading ? '生成中...' : '生成下一段'}
              </button>
              <GenerationProgress
                visible={genProgress.visible && genProgress.mode === 'generate'}
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
                    <div className="reading-title-row">
                      {editingTitle ? (
                        <div className="reading-title-edit">
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            className="reading-title-input"
                            autoFocus
                          />
                          <button className="btn" onClick={handleSaveTitle}>保存</button>
                          <button className="btn btn-secondary" onClick={handleCancelEditTitle}>取消</button>
                        </div>
                      ) : (
                        <h3>
                          {readingChapterTitle || readingChapter}
                          <span className="reading-filename">{readingChapter}</span>
                          <button className="btn-link reading-title-edit-btn" onClick={handleStartEditTitle}>编辑标题</button>
                        </h3>
                      )}
                    </div>
                    <div className="reading-actions">
                      <button className="btn" onClick={() => { if (showRewriteInput) { setShowRewriteInput(false); setRewritePrompt(''); } else { handleLoadRewritePrompt(); } }}>
                        {showRewriteInput ? '取消重写' : '重写本章'}
                      </button>
                      <button className="btn btn-success" onClick={handleCopyChapter}>
                        {copied ? '已复制' : '复制本章'}
                      </button>
                      {displayContent && (
                        <button className="btn btn-success" onClick={handleCopyFull}>
                          复制全文
                        </button>
                      )}
                      <button className="btn btn-secondary" onClick={() => { setReadingChapter(null); setReadingChapterTitle(''); setReadingContent(''); setVariants([]); setVariantPreview(null); setShowRewriteInput(false); setRewritePrompt(''); setDebugPromptInfo(null); resetEditorRoom(); }}>
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
                      <button className="btn" onClick={handleRegenerate} disabled={regenerating || loading}>
                        {regenerating ? '重写中...' : '生成候选版本'}
                      </button>
                      <GenerationProgress
                        visible={genProgress.visible && genProgress.mode === 'rewrite'}
                        mode="rewrite"
                        status={genProgress.status}
                        errorMessage={genProgress.errorMessage}
                        onComplete={handleGenProgressDone}
                      />
                    </div>
                  )}

                  {readingChapterRecord?.staleAfterRewrite && !variantPreview && (
                    <div className="stale-chapter-notice">
                      <div>
                        <strong>这章生成于前文重写之前，可能与当前剧情不连续。</strong>
                        {readingChapterRecord.staleReason && <span>{readingChapterRecord.staleReason}</span>}
                      </div>
                      <div className="stale-chapter-actions">
                        <button className="btn btn-secondary" onClick={handleConfirmKeepChapter}>确认保留</button>
                        <button className="btn" onClick={() => { if (!showRewriteInput) handleLoadRewritePrompt(); }}>重写本章</button>
                      </div>
                    </div>
                  )}

                  <div className="reading-content">{variantPreview ? variantPreview.content : readingContent}</div>

                  <div className="editor-room">
                    <div className="editor-room-header">
                      <h3>编辑室</h3>
                      <div className="editor-room-tabs">
                        <button
                          className={'editor-room-tab' + (editorRoomTab === 'notes' ? ' active' : '')}
                          onClick={() => setEditorRoomTab('notes')}
                        >
                          编辑备注
                        </button>
                        <button
                          className={'editor-room-tab' + (editorRoomTab === 'chat' ? ' active' : '')}
                          onClick={() => setEditorRoomTab('chat')}
                        >
                          编辑对话
                        </button>
                      </div>
                    </div>

                    {editorRoomTab === 'notes' && (
                      <div className="editor-room-notes">
                        <div className="editor-room-toolbar">
                          <button className="btn btn-ai" onClick={handleEditorNote} disabled={editorNoteLoading}>
                            {editorNoteLoading ? '生成中...' : '生成本章编辑备注'}
                          </button>
                        </div>
                        {editorNoteError && <div className="error">{editorNoteError}</div>}
                        {editorNoteLoading && (
                          <div className="editor-note-loading editor-note-loading-inline">
                            <div className="editor-note-loading-spinner"></div>
                            <span>正在生成编辑备注...</span>
                          </div>
                        )}
                        {!editorNoteLoading && editorNoteResult && (
                          <div className="editor-note-draft">
                            <div className="editor-note-text">{editorNoteResult}</div>
                            <button
                              className="btn btn-secondary"
                              disabled={savingEditorNoteId === 'generated-note'}
                              onClick={() => handleSaveEditorNote(editorNoteResult, 'generated-note')}
                            >
                              {savingEditorNoteId === 'generated-note' ? '保存中...' : '保存为备注'}
                            </button>
                          </div>
                        )}
                        <div className="editor-notes-list">
                          {editorNotes.length > 0 ? (
                            editorNotes.map((note, index) => (
                              <div className="editor-note-saved" key={`${readingChapter}-note-${index}`}>
                                {note}
                              </div>
                            ))
                          ) : (
                            <p className="hint">暂无编辑备注。可以生成一条，或从编辑对话中保存编辑回复。</p>
                          )}
                        </div>
                      </div>
                    )}

                    {editorRoomTab === 'chat' && (
                      <div className="editor-room-chat">
                        <div className="editor-chat-toolbar">
                          <span className="hint">当前章节独立保存，共 {editorChats.length} 条消息。</span>
                          <button className="btn btn-secondary" onClick={handleClearEditorChats} disabled={editorChatSending || editorChats.length === 0}>
                            清空对话
                          </button>
                        </div>
                        <div className="editor-chat-messages">
                          {editorChats.length > 0 ? (
                            editorChats.map((chat) => (
                              <div className={`editor-chat-row ${chat.role}`} key={chat.id}>
                                <div className="editor-chat-bubble">
                                  <div className="editor-chat-meta">
                                    {chat.role === 'user' ? '你' : '随书编辑'} · {new Date(chat.createdAt).toLocaleString()}
                                  </div>
                                  <div className="editor-chat-content">{chat.content}</div>
                                  {chat.role === 'editor' && (
                                    <button
                                      className="btn btn-secondary editor-chat-save"
                                      disabled={savingEditorNoteId === chat.id}
                                      onClick={() => handleSaveEditorNote(chat.content, chat.id)}
                                    >
                                      {savingEditorNoteId === chat.id ? '保存中...' : '保存为备注'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="hint editor-chat-empty">还没有对话。可以问编辑：这一章节奏是否太慢？人物动机是否站得住？</p>
                          )}
                          {editorChatSending && (
                            <div className="editor-chat-row editor">
                              <div className="editor-chat-bubble">
                                <div className="editor-note-loading editor-note-loading-inline">
                                  <div className="editor-note-loading-spinner"></div>
                                  <span>编辑正在回复...</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {editorChatError && <div className="error">{editorChatError}</div>}
                        <div className="editor-chat-input-row">
                          <div className="editor-chat-input-wrap">
                            <textarea
                              value={editorChatInput}
                              onChange={(e) => setEditorChatInput(e.target.value)}
                              onKeyDown={handleEditorChatKeyDown}
                              placeholder="和随书编辑聊聊这一章……"
                              rows={3}
                              disabled={editorChatSending}
                            />
                            <span className="editor-chat-hint">Enter 发送，Shift + Enter 换行</span>
                          </div>
                          <button className="btn" onClick={handleSendEditorChat} disabled={editorChatSending || !editorChatInput.trim()}>
                            {editorChatSending ? '发送中...' : '发送'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

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

      {notification && (
        <div className="notification-card">
          <div className="notification-header">
            <span className="notification-title">{notification.title}</span>
            <button className="notification-close" onClick={() => setNotification(null)}>×</button>
          </div>
          <div className="notification-body">{notification.message}</div>
        </div>
      )}
    </div>
  );
}

export default App;
