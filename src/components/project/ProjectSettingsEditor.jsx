export default function ProjectSettingsEditor({
  settingsDraft,
  onSave,
  variant = 'mobile',
  fieldRefs = {},
  onClose,
  children,
}) {
  const {
    editWorld,
    setEditWorld,
    editCharacters,
    setEditCharacters,
    editStyle,
    setEditStyle,
    editSummary,
    setEditSummary,
    editEditorialMemory,
    setEditEditorialMemory,
    savingSettings,
  } = settingsDraft;

  if (variant === 'desktop') {
    return (
      <div className="desktop-settings-wrapper">
        <div className="desktop-settings-grid">
          <div className="desktop-settings-field">
            <label>世界观设定</label>
            <textarea className="settings-input" value={editWorld} onChange={(e) => setEditWorld(e.target.value)} />
          </div>
          <div className="desktop-settings-field">
            <label>人物设定</label>
            <textarea className="settings-input" value={editCharacters} onChange={(e) => setEditCharacters(e.target.value)} />
          </div>
          <div className="desktop-settings-field">
            <label>写作规则</label>
            <textarea className="settings-input" value={editStyle} onChange={(e) => setEditStyle(e.target.value)} />
          </div>
          <div className="desktop-settings-field">
            <label>剧情摘要</label>
            <textarea className="settings-input" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />
          </div>
        </div>
        <div className="desktop-settings-footer">
          <button className="btn" disabled={savingSettings} onClick={onSave}>{savingSettings ? '保存中...' : '保存设定'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <h3>项目设定</h3>
      <label>世界观设定</label>
      <textarea
        className="settings-input"
        ref={fieldRefs.world}
        value={editWorld}
        onChange={(e) => setEditWorld(e.target.value)}
        rows={3}
        placeholder="世界观设定..."
      />
      <label>人物设定</label>
      <textarea
        className="settings-input"
        ref={fieldRefs.characters}
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
        ref={fieldRefs.summary}
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
      {children}
      <div className="form-actions">
        {/* 保存设定：把当前项目设定 PUT 到服务器，会覆盖该项目现有设定字段。 */}
        <button className="btn" disabled={savingSettings} onClick={onSave}>
          {savingSettings ? '保存中...' : '保存设定'}
        </button>
        {/* 关闭设定：只关闭设定面板，不会自动保存未提交内容。 */}
        <button className="btn btn-secondary" disabled={savingSettings} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
