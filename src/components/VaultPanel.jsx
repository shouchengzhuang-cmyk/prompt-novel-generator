import { useState, useEffect, useCallback } from 'react';
import { renderTemplate, extractVariables } from '../utils/templateRenderer';
import { apiFetch, safeJsonFetch } from '../api';

export default function VaultPanel() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVars, setPreviewVars] = useState({});
  const [renderedSystem, setRenderedSystem] = useState('');
  const [renderedUser, setRenderedUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await safeJsonFetch('/api/vault/templates');
      setTemplates(data.templates || []);
    } catch {
      setError('获取模板列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const selectTemplate = (id) => {
    setSelectedId(id);
    setPreviewOpen(false);
    setRenderedSystem('');
    setRenderedUser('');
    setPreviewVars({});
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setEditForm(JSON.parse(JSON.stringify(tpl)));
  };

  const newTemplate = () => {
    setSelectedId(null);
    setPreviewOpen(false);
    setRenderedSystem('');
    setRenderedUser('');
    setPreviewVars({});
    setEditForm({
      id: '',
      title: '',
      description: '',
      category: '',
      tags: [],
      taskType: '',
      defaultModel: 'deepseek-v4-flash',
      systemTemplate: '',
      userTemplate: '',
      variables: [],
    });
  };

  const handleChange = (field, value) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  // Determine which variables appear in the combined template text
  const detectedNames = editForm
    ? extractVariables(`${editForm.systemTemplate}\n${editForm.userTemplate}`)
    : [];

  const mergedVariables = detectedNames.map((name) => {
    const existing = editForm?.variables?.find((v) => v.name === name);
    return existing || { name, label: name, type: 'text', source: 'user' };
  });

  const updateVariable = (name, field, value) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const vars = mergedVariables.map((v) =>
        v.name === name ? { ...v, [field]: value } : v
      );
      return { ...prev, variables: vars };
    });
  };

  const handleSave = async () => {
    if (!editForm?.title?.trim()) { setError('标题不能为空'); return; }
    if (!editForm.systemTemplate?.trim()) { setError('systemTemplate 不能为空'); return; }
    if (!editForm.userTemplate?.trim()) { setError('userTemplate 不能为空'); return; }
    setSaving(true);
    setError('');
    try {
      const method = selectedId ? 'PUT' : 'POST';
      const url = selectedId ? `/api/vault/templates/${selectedId}` : '/api/vault/templates';
      const body = {
        ...editForm,
        tags: typeof editForm.tags === 'string' ? editForm.tags.split(',').map((s) => s.trim()).filter(Boolean) : editForm.tags,
        variables: mergedVariables,
      };
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '保存失败' }));
        throw new Error(errData.error || '保存失败');
      }
      const data = await res.json();
      setMessage('已保存');
      setTimeout(() => setMessage(''), 2000);
      await fetchTemplates();
      if (!selectedId) {
        // POST 新建成功后切换到编辑模式
        setSelectedId(data.id);
        setEditForm(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('确定删除此模板？')) return;
    setError('');
    try {
      const res = await apiFetch(`/api/vault/templates/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setSelectedId(null);
      setEditForm(null);
      setPreviewOpen(false);
      setMessage('已删除');
      setTimeout(() => setMessage(''), 2000);
      await fetchTemplates();
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePreview = () => {
    if (!editForm) return;
    const vars = { ...previewVars };
    // Fill missing detected vars with placeholder text so preview is readable
    for (const v of mergedVariables) {
      if (!vars[v.name]) vars[v.name] = `{{${v.name}}}`;
    }
    setRenderedSystem(renderTemplate(editForm.systemTemplate, vars));
    setRenderedUser(renderTemplate(editForm.userTemplate, vars));
  };

  // ——— Render ———

  if (loading && templates.length === 0) {
    return <div className="vault-panel panel"><p className="hint">加载中...</p></div>;
  }

  return (
    <div className="vault-panel panel">
      <div className="vault-header">
        <h2>Prompt 模板</h2>
        <div className="vault-header-actions">
          {message && <span className="vault-message">{message}</span>}
          {/* 新建模板：只在前端初始化空模板编辑表单，不会立即写入后端。 */}
          <button className="btn" onClick={newTemplate}>+ 新建模板</button>
        </div>
      </div>

      {/* Template pills */}
      <div className="vault-tabs">
        {templates.length === 0 && <span className="hint" style={{ padding: '8px 0' }}>暂无模板</span>}
        {templates.map((t) => (
          <button
            key={t.id}
            className={'vault-tab' + (selectedId === t.id ? ' active' : '')}
            onClick={() => selectTemplate(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>

      {/* Editor */}
      {editForm && (
        <div className="vault-editor">
          <div className="vault-editor-row">
            <div className="vault-field">
              <label>标题</label>
              <input value={editForm.title} onChange={(e) => handleChange('title', e.target.value)} placeholder="模板标题" />
            </div>
            <div className="vault-field">
              <label>分类</label>
              <input value={editForm.category} onChange={(e) => handleChange('category', e.target.value)} placeholder="分类" />
            </div>
            <div className="vault-field">
              <label>taskType</label>
              <input value={editForm.taskType} onChange={(e) => handleChange('taskType', e.target.value)} placeholder="novel-generate" />
            </div>
            <div className="vault-field">
              <label>默认模型</label>
              <select value={editForm.defaultModel} onChange={(e) => handleChange('defaultModel', e.target.value)}>
                <option value="deepseek-v4-flash">deepseek-v4-flash</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro</option>
              </select>
            </div>
          </div>

          <div className="vault-field">
            <label>描述</label>
            <input value={editForm.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="简要描述模板用途" />
          </div>

          <div className="vault-field">
            <label>标签（逗号分隔）</label>
            <input
              value={Array.isArray(editForm.tags) ? editForm.tags.join(', ') : editForm.tags}
              onChange={(e) => handleChange('tags', e.target.value)}
              placeholder="续写, 小说"
            />
          </div>

          <div className="vault-field">
            <label>systemTemplate</label>
            <textarea
              className="vault-code-input"
              value={editForm.systemTemplate}
              onChange={(e) => handleChange('systemTemplate', e.target.value)}
              rows={6}
              placeholder="系统提示词模板，使用 {{变量名}} 占位"
              spellCheck={false}
            />
          </div>

          <div className="vault-field">
            <label>userTemplate</label>
            <textarea
              className="vault-code-input"
              value={editForm.userTemplate}
              onChange={(e) => handleChange('userTemplate', e.target.value)}
              rows={8}
              placeholder="用户提示词模板，使用 {{变量名}} 占位"
              spellCheck={false}
            />
          </div>

          {/* Variables table */}
          {mergedVariables.length > 0 && (
            <div className="vault-field">
              <label>变量（从模板中自动检测）</label>
              <div className="vault-var-table">
                <div className="vault-var-header">
                  <span className="vault-var-cell">变量名</span>
                  <span className="vault-var-cell">标签</span>
                  <span className="vault-var-cell">类型</span>
                  <span className="vault-var-cell">来源</span>
                </div>
                {mergedVariables.map((v) => (
                  <div key={v.name} className="vault-var-row">
                    <span className="vault-var-cell vault-var-name">{v.name}</span>
                    <input
                      className="vault-var-cell"
                      value={v.label}
                      onChange={(e) => updateVariable(v.name, 'label', e.target.value)}
                    />
                    <select
                      className="vault-var-cell"
                      value={v.type}
                      onChange={(e) => updateVariable(v.name, 'type', e.target.value)}
                    >
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                    </select>
                    <select
                      className="vault-var-cell"
                      value={v.source}
                      onChange={(e) => updateVariable(v.name, 'source', e.target.value)}
                    >
                      <option value="user">user</option>
                      <option value="project">project</option>
                      <option value="system">system</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="vault-editor-actions">
            {/* 保存模板：根据是否已有 selectedId 调用后端 POST/PUT，会覆盖服务器上的模板内容。 */}
            <button className="btn" disabled={saving} onClick={handleSave}>
              {saving ? '保存中...' : '保存'}
            </button>
            {selectedId && (
              /* 删除模板：调用后端 DELETE 删除当前模板；handler 内已有 confirm 二次确认。 */
              <button className="btn btn-danger" onClick={handleDelete}>删除</button>
            )}
            {/* 预览 Prompt：只切换本地预览面板状态，不会保存模板或请求生成接口。 */}
            <button
              className={'btn btn-secondary' + (previewOpen ? ' active' : '')}
              onClick={() => setPreviewOpen((p) => !p)}
            >
              {previewOpen ? '收起预览' : '预览完整 Prompt'}
            </button>
            {error && <span className="error" style={{ margin: 0, flex: 1 }}>{error}</span>}
          </div>
        </div>
      )}

      {/* Preview panel */}
      {previewOpen && editForm && (
        <div className="vault-preview">
          <h3>变量值填写</h3>
          <div className="vault-preview-vars">
            {mergedVariables.map((v) => (
              <div key={v.name} className="vault-preview-var">
                <label>{v.label || v.name}</label>
                {v.source === 'user' ? (
                  v.type === 'textarea' ? (
                    <textarea
                      value={previewVars[v.name] || ''}
                      onChange={(e) => setPreviewVars((p) => ({ ...p, [v.name]: e.target.value }))}
                      placeholder={`输入 ${v.label || v.name}`}
                      rows={3}
                    />
                  ) : (
                    <input
                      value={previewVars[v.name] || ''}
                      onChange={(e) => setPreviewVars((p) => ({ ...p, [v.name]: e.target.value }))}
                      placeholder={`输入 ${v.label || v.name}`}
                    />
                  )
                ) : (
                  <input className="vault-auto-var" value={v.source === 'project' ? '将自动从当前项目读取' : '系统自动生成'} disabled />
                )}
              </div>
            ))}
          </div>
          {/* 渲染预览：只用当前表单变量在前端渲染模板，不会调用后端或覆盖模板。 */}
          <button className="btn" onClick={handlePreview}>渲染预览</button>

          {renderedSystem && (
            <>
              <h3 style={{ marginTop: 16 }}>System Prompt</h3>
              <pre className="vault-preview-code">{renderedSystem}</pre>
            </>
          )}
          {renderedUser && (
            <>
              <h3 style={{ marginTop: 16 }}>User Prompt</h3>
              <pre className="vault-preview-code">{renderedUser}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
