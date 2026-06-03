import { useState, useEffect, useCallback, useRef } from 'react';
import * as ProjectsApi from '../../api/projectsApi';

/**
 * 剧情素材面板 — 事件卡管理
 * 自包含组件：列表 / 编辑器 / 新建表单 / 导入
 */
export default function MaterialPanel({ currentProject, onNotify, onNavigateToChapter }) {
  const [view, setView] = useState('list');    // list | editor | create | importing
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Editor
  const [currentCard, setCurrentCard] = useState(null);
  const [editContent, setEditContent] = useState('');

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newCardName, setNewCardName] = useState('');

  // Import
  const [importMode, setImportMode] = useState('paste'); // paste | file
  const [importContent, setImportContent] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef(null);

  const loadCards = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    setError('');
    try {
      const data = await ProjectsApi.fetchEventCards(currentProject);
      setCards(data.cards || []);
    } catch (err) {
      setError(err.message || '加载事件卡失败');
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  // Auto-load when entering list view
  useEffect(() => {
    if (view === 'list') loadCards();
  }, [view, loadCards]);

  const handleOpenCard = useCallback(async (cardName) => {
    setError('');
    try {
      const data = await ProjectsApi.fetchEventCard(currentProject, cardName);
      setCurrentCard(data);
      setEditContent(data.content);
      setView('editor');
    } catch (err) {
      setError(err.message || '读取事件卡失败');
    }
  }, [currentProject]);

  const handleSaveCard = useCallback(async () => {
    if (!currentCard) return;
    setSaving(true);
    setError('');
    try {
      const data = await ProjectsApi.updateEventCard(currentProject, currentCard.cardName, editContent);
      setCurrentCard(data);
      onNotify?.({ title: '保存成功', message: `事件卡「${data.title}」已保存` });
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [currentCard, currentProject, editContent, onNotify]);

  const handleDeleteCard = useCallback(async (cardName) => {
    if (!window.confirm('确定要删除这张事件卡吗？它将移至回收站。')) return;
    setError('');
    try {
      await ProjectsApi.deleteEventCard(currentProject, cardName);
      onNotify?.({ title: '已删除', message: '事件卡已移至回收站' });
      setCards((prev) => prev.filter((c) => c.cardName !== cardName));
      if (currentCard?.cardName === cardName) {
        setView('list');
        setCurrentCard(null);
        setEditContent('');
      }
    } catch (err) {
      setError(err.message || '删除失败');
    }
  }, [currentProject, currentCard, onNotify]);

  const handleCreateCard = useCallback(async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data = await ProjectsApi.createEventCard(currentProject, {
        title: newTitle.trim(),
        cardName: newCardName.trim() || undefined,
      });
      onNotify?.({ title: '创建成功', message: `事件卡「${data.title}」已创建` });
      setNewTitle('');
      setNewCardName('');
      setView('list');
      loadCards();
    } catch (err) {
      setError(err.message || '创建失败');
    } finally {
      setSaving(false);
    }
  }, [currentProject, newTitle, newCardName, onNotify, loadCards]);

  const handleImportCard = useCallback(async () => {
    if (!importContent.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data = await ProjectsApi.importEventCard(currentProject, {
        content: importContent.trim(),
        cardName: importFileName.trim() || undefined,
      });
      onNotify?.({ title: '导入成功', message: `事件卡「${data.title}」已导入` });
      setImportContent('');
      setImportFileName('');
      setView('list');
      loadCards();
    } catch (err) {
      setError(err.message || '导入失败');
    } finally {
      setSaving(false);
    }
  }, [currentProject, importContent, importFileName, onNotify, loadCards]);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.md')) {
      setError('只支持 .md 文件');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportContent(ev.target?.result || '');
      if (!importFileName.trim()) {
        setImportFileName(file.name);
      }
    };
    reader.readAsText(file);
  }, [importFileName]);

  const handleBackToList = useCallback(() => {
    setView('list');
    setCurrentCard(null);
    setEditContent('');
    setError('');
    setImportContent('');
    setImportFileName('');
    setImportMode('paste');
  }, []);

  // ===== List View =====
  if (view === 'list') {
    return (
      <section className="material-panel">
        <div className="material-panel-head">
          <h2>剧情素材</h2>
          <button className="btn" onClick={() => setView('create')} disabled={!currentProject}>
            ＋ 新建事件卡
          </button>
          <button className="btn btn-secondary" onClick={() => { setError(''); setView('importing'); setImportContent(''); setImportFileName(''); }} disabled={!currentProject}>
            ↑ 导入 Markdown
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {loading ? (
          <p className="hint">加载中...</p>
        ) : cards.length === 0 ? (
          <div className="material-empty">
            <p>还没有剧情素材。你可以先新建一张事件卡。</p>
          </div>
        ) : (
          <div className="material-card-list">
            {cards.map((card) => (
              <div key={card.cardName} className="material-card-item">
                <button
                  className="material-card-item-main"
                  onClick={() => handleOpenCard(card.cardName)}
                >
                  <strong>{card.title}</strong>
                  <span className="material-card-meta">
                    {card.cardName} · {new Date(card.updatedAt).toLocaleString('zh-CN')} · {(card.size / 1024).toFixed(1)} KB
                  </span>
                  {card.usage && card.usage.status === 'used' ? (
                    <span className="material-card-usage used">
                      已用于 {card.usage.chapters.length} 个章节
                      <span className="material-card-chapters">
                        {card.usage.chapters.map((ch) => (
                          <span
                            key={ch.chapter}
                            className="material-card-chapter-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToChapter?.(ch.chapter, ch.title);
                            }}
                            title={`跳转到「${ch.title}」`}
                          >
                            {ch.chapter.replace('.txt', '')}
                          </span>
                        ))}
                      </span>
                    </span>
                  ) : (
                    <span className="material-card-usage unused">未使用</span>
                  )}
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDeleteCard(card.cardName)}
                  title="删除事件卡"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  // ===== Create View =====
  if (view === 'create') {
    return (
      <section className="material-panel">
        <div className="material-panel-head">
          <h2>新建事件卡</h2>
          <button className="btn btn-secondary" onClick={handleBackToList}>
            ← 返回列表
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="material-create-form">
          <label>事件标题 *</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="输入事件标题"
            autoFocus
          />
          <label>文件名（可选）</label>
          <input
            value={newCardName}
            onChange={(e) => setNewCardName(e.target.value)}
            placeholder="留空则根据标题自动生成，如：2026-06-03-xxx.md"
          />
          <p className="hint">文件名以 .md 结尾，只允许字母、数字、中文和连字符</p>
          <button className="btn" onClick={handleCreateCard} disabled={saving || !newTitle.trim()}>
            {saving ? '创建中...' : '创建事件卡'}
          </button>
        </div>
      </section>
    );
  }

  // ===== Import View =====
  if (view === 'importing') {
    return (
      <section className="material-panel">
        <div className="material-panel-head">
          <h2>导入事件卡</h2>
          <button className="btn btn-secondary" onClick={handleBackToList}>
            ← 返回列表
          </button>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="material-import-tabs">
          <button
            className={`tab-btn ${importMode === 'paste' ? 'active' : ''}`}
            onClick={() => setImportMode('paste')}
          >
            粘贴导入
          </button>
          <button
            className={`tab-btn ${importMode === 'file' ? 'active' : ''}`}
            onClick={() => setImportMode('file')}
          >
            文件导入
          </button>
        </div>

        <div className="material-import-form">
          {importMode === 'paste' ? (
            <div className="material-import-paste">
              <label>粘贴 Markdown 内容 *</label>
              <textarea
                className="material-editor-textarea material-import-textarea"
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                placeholder={`# 对话事件卡\n\n## 事件标题\n战败的女战士\n\n## 事件摘要\n...`}
                autoFocus
              />
            </div>
          ) : (
            <div className="material-import-file">
              <label>选择 .md 文件</label>
              <div className="file-input-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,text/markdown"
                  onChange={handleFileSelected}
                  className="file-input-hidden"
                />
                <button
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </button>
                <span className="file-name-hint">
                  {importContent ? `已选择文件（${importContent.length} 字符）` : '未选择文件'}
                </span>
              </div>
              {importContent && (
                <div className="material-import-preview">
                  <label>内容预览</label>
                  <pre className="import-preview-text">{importContent.slice(0, 500)}{importContent.length > 500 ? '...' : ''}</pre>
                </div>
              )}
            </div>
          )}

          <label>文件名（可选）</label>
          <input
            value={importFileName}
            onChange={(e) => setImportFileName(e.target.value)}
            placeholder="留空则根据标题自动生成，如：2026-06-03-xxx.md"
          />
          <p className="hint">文件名以 .md 结尾，只允许字母、数字、中文和连字符</p>

          <div className="material-import-actions">
            <button
              className="btn"
              onClick={handleImportCard}
              disabled={saving || !importContent.trim()}
            >
              {saving ? '导入中...' : '导入事件卡'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ===== Editor View =====
  return (
    <section className="material-panel">
      <div className="material-panel-head">
        <div className="material-editor-head-left">
          <button className="btn btn-secondary" onClick={handleBackToList}>
            ← 返回列表
          </button>
          <h2>{currentCard?.title || '编辑事件卡'}</h2>
        </div>
        <div className="material-editor-head-actions">
          <button className="btn" onClick={handleSaveCard} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleDeleteCard(currentCard?.cardName)}
            disabled={!currentCard}
          >
            删除
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="material-editor-body">
        <textarea
          className="material-editor-textarea"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="在此编辑事件卡 Markdown 内容..."
        />
      </div>
    </section>
  );
}
