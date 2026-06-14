import MobileProjectMenuPanel from '../../components/mobile/MobileProjectMenuPanel';

export default function MobileProjectPage({
  currentProject,
  projectDetails,
  readingChapter,
  exportStatus,
  mobileMaterialsOpen,
  showSettings,
  showOutline,
  savingSettings,
  editWorld,
  editCharacters,
  editStyle,
  editSummary,
  editEditorialMemory,
  outlineText,
  outlineError,
  outlineSaving,
  mobileChapterMenu,
  mobileWorldRef,
  mobileCharactersRef,
  mobileSummaryRef,
  onBackClick,
  onExport,
  onBackup,
  onOpenSettings,
  onRefresh,
  onSetMobileMaterialsOpen,
  onSetEditWorld,
  onSetEditCharacters,
  onSetEditStyle,
  onSetEditSummary,
  onSetEditEditorialMemory,
  onSaveSettings,
  onSetShowSettings,
  onSetOutlineText,
  onSetOutlineError,
  onSaveOutline,
  onSetShowOutline,
  onOpenMobileWriting,
  onReadChapter,
  navigateTo,
  onSetMobileGenerateOpen,
  onSetMobileVariantsOpen,
  onSetMobileChapterMenu,
  onMobileDeleteChapter,
}) {
  return (
    <div className="panel mobile-project-view">
      <MobileProjectMenuPanel
        currentProject={currentProject}
        exportStatus={exportStatus}
        mobileMaterialsOpen={mobileMaterialsOpen}
        onBackClick={onBackClick}
        onExport={onExport}
        onBackup={onBackup}
        onOpenSettings={onOpenSettings}
        onRefresh={onRefresh}
        onSetMobileMaterialsOpen={onSetMobileMaterialsOpen}
      />

      {showSettings && (
        <div className="settings-panel">
          <h3>项目设定</h3>
          <label>世界观设定</label>
          <textarea className="settings-input" ref={mobileWorldRef} value={editWorld} onChange={(e) => onSetEditWorld(e.target.value)} rows={3} placeholder="世界观设定..." />
          <label>人物设定</label>
          <textarea className="settings-input" ref={mobileCharactersRef} value={editCharacters} onChange={(e) => onSetEditCharacters(e.target.value)} rows={3} placeholder="人物设定..." />
          <label>写作规则</label>
          <textarea className="settings-input" value={editStyle} onChange={(e) => onSetEditStyle(e.target.value)} rows={5} placeholder="写作规则、文风要求..." />
          <label>剧情摘要</label>
          <textarea className="settings-input" ref={mobileSummaryRef} value={editSummary} onChange={(e) => onSetEditSummary(e.target.value)} rows={5} placeholder="剧情摘要..." />
          <label>项目编辑记忆</label>
          <div className="settings-hint">记录跨章节人物关系、伏笔、长期写作风险和编辑判断。不同于剧情摘要：摘要记录剧情事实，这里记录编辑分析。</div>
          <textarea className="settings-input" value={editEditorialMemory} onChange={(e) => onSetEditEditorialMemory(e.target.value)} rows={6} placeholder="项目编辑记忆..." />
          <div className="form-actions">
            {/* 保存设定：把当前项目设定 PUT 到服务器，会覆盖该项目现有设定字段。 */}
            <button className="btn" disabled={savingSettings} onClick={onSaveSettings}>{savingSettings ? '保存中...' : '保存设定'}</button>
            {/* 关闭设定：只关闭设定面板，不会自动保存未提交内容。 */}
            <button className="btn btn-secondary" disabled={savingSettings} onClick={() => onSetShowSettings(false)}>关闭</button>
          </div>
        </div>
      )}

      {showOutline && (
        <div className="settings-panel">
          <h3>章节规划</h3>
          <p className="hint" style={{ marginBottom: 8, fontSize: 12 }}>
            JSON 数组，每项：number、goal、keyEvents、characterChanges、status。
          </p>
          <textarea
            className="settings-input"
            value={outlineText}
            onChange={(e) => { onSetOutlineText(e.target.value); onSetOutlineError(''); }}
            rows={10}
            placeholder={`[\n  {\n    "number": 1,\n    "goal": "本章目标",\n    "keyEvents": ["事件1"],\n    "characterChanges": "人物变化",\n    "status": "planned"\n  }\n]`}
          />
          {outlineError && (
            <div className={outlineError === '已保存' ? '' : 'error'} style={outlineError === '已保存' ? { color: '#52c41a', marginTop: 4, fontSize: 13 } : { marginTop: 4 }}>
              {outlineError}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 8 }}>
            {/* 保存规划：把当前大纲 JSON 保存到服务器，会覆盖当前项目的大纲内容。 */}
            <button className="btn" onClick={onSaveOutline} disabled={outlineSaving}>
              {outlineSaving ? '保存中...' : '保存规划'}
            </button>
            {/* 关闭规划：只关闭大纲编辑面板并清理错误提示，不保存文本。 */}
            <button className="btn btn-secondary" onClick={() => { onSetShowOutline(false); onSetOutlineError(''); }}>
              关闭
            </button>
          </div>
        </div>
      )}

      {!showSettings && !showOutline && !mobileMaterialsOpen && (
        /* 继续写作：进入移动端写作页准备续写，不会在点击时立即调用生成接口。 */
        <button
          className="btn mobile-project-write-btn"
          onClick={() => onOpenMobileWriting(currentProject, { kind: 'generate' })}
        >
          继续写作
        </button>
      )}

      {!showSettings && (projectDetails?.chapters && projectDetails.chapters.length > 0 ? (
        <ul className="mobile-chapter-list">
          {projectDetails.chapters.map((ch, index) => {
            const cf = ch.fileName || ch.filename;
            const key = cf || `chapter-${index}`;
            const menuOpen = mobileChapterMenu === cf;
            return (
              <li
                key={key}
                className={'mobile-chapter-item' + (cf && readingChapter === cf ? ' active' : '') + (!cf ? ' disabled' : '')}
                onClick={() => {
                  if (cf && !menuOpen) {
                    onReadChapter(cf);
                    navigateTo('chapter');
                    onSetMobileGenerateOpen(false);
                    onSetMobileVariantsOpen(false);
                  }
                }}
              >
                <span className="mobile-chapter-index">{cf ? cf.slice(0, 3) : '--'}</span>
                <span className="mobile-chapter-title">{cf ? (ch.title || cf.replace(/\.txt$/, '')) : '无效章节'}</span>
                {ch.staleAfterRewrite && <span className="chapter-stale-badge">待检查</span>}
                {cf && (
                  <>
                    {/* 章节菜单：只打开/关闭该章节的移动端操作菜单，不请求后端。 */}
                    <button
                      className="mobile-chapter-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetMobileChapterMenu(menuOpen ? null : cf);
                      }}
                    >⋯</button>
                    {menuOpen && (
                      <div className="mobile-chapter-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                        {/* 删除章节：调用后端删除当前章节文件；handler 内应有确认，避免误删正文。 */}
                        <button
                          className="mobile-chapter-menu-delete"
                          onClick={() => onMobileDeleteChapter(cf)}
                        >删除章节</button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mobile-chapter-empty">
          <p className="hint">暂无章节</p>
          {/* 开始第一章：只切换到章节/生成入口视图并打开生成面板，不会立即调用生成接口。 */}
          <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => { navigateTo('chapter'); onSetMobileGenerateOpen(true); }}>
            开始写第一章
          </button>
        </div>
      ))}
    </div>
  );
}
