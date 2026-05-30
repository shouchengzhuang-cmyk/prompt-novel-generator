export default function HomePage({
  showCreateForm,
  creating,
  newProjectName,
  newWorld,
  newCharacters,
  newStyle,
  newSummary,
  createError,
  featuredProject,
  featuredChapterLabel,
  featuredUpdatedLabel,
  recentHomeProjects,
  hasHomeProjects,
  fallbackRecentProjects,
  onNavigate,
  onHomeProjectOpen,
  onOpenAllProjects,
  onMobileQuickAction,
  onOpenMobileSearch,
  onCreateProject,
  onCancelCreate,
  onOpenCreate,
  onNewProjectNameChange,
  onNewWorldChange,
  onNewCharactersChange,
  onNewStyleChange,
  onNewSummaryChange,
  formatProjectUpdatedAt,
  getProjectChapterCount,
}) {
  return (
    <div className="panel mobile-shelf-view">
      {showCreateForm ? (
        <div className="create-panel">
          <h2>创建新项目</h2>
          <label>项目名</label>
          <input value={newProjectName} onChange={(e) => onNewProjectNameChange(e.target.value)} placeholder="输入项目名称" />
          <label>世界观设定</label>
          <textarea value={newWorld} onChange={(e) => onNewWorldChange(e.target.value)} placeholder="描述世界观设定..." rows={4} />
          <label>人物设定</label>
          <textarea value={newCharacters} onChange={(e) => onNewCharactersChange(e.target.value)} placeholder="描述主要人物..." rows={4} />
          <label>写作规则 / 风格要求</label>
          <textarea value={newStyle} onChange={(e) => onNewStyleChange(e.target.value)} placeholder="文风要求、篇幅要求、写作规则…" rows={4} />
          <label>剧情摘要（可选）</label>
          <textarea value={newSummary} onChange={(e) => onNewSummaryChange(e.target.value)} placeholder="剧情摘要…" rows={3} />
          {createError && <div className="error">{createError}</div>}
          <div className="form-actions">
            <button className="btn" disabled={creating} onClick={onCreateProject}>{creating ? '创建中...' : '创建'}</button>
            <button className="btn btn-secondary" disabled={creating} onClick={onCancelCreate}>取消</button>
          </div>
        </div>
      ) : (
        <>
          <header className="mobile-home-header">
            <div>
              <h2 className="shelf-title">小墨匣</h2>
              <p className="shelf-subtitle">把灵感写成长篇</p>
            </div>
            <div className="mobile-home-actions" aria-label="首页操作">
              <button className="mobile-icon-btn" type="button" aria-label="搜索项目" data-action="search" onClick={onOpenMobileSearch}>⌕</button>
              <button
                className="mobile-icon-btn mobile-icon-btn-primary"
                type="button"
                aria-label="新增项目"
                data-action="create-project"
                onClick={onOpenCreate}
              >
                +
              </button>
            </div>
          </header>

          <section className="mobile-current-card" aria-label="当前项目">
            <div className="mobile-current-card-glow" />
            <div className="mobile-current-card-content">
              <span className="mobile-card-kicker"><i />当前项目</span>
              <h3>{featuredProject.name}</h3>
              <p>{featuredChapterLabel}</p>
              <p className="mobile-current-updated">{featuredUpdatedLabel}</p>
              <div className="mobile-current-actions">
                <button
                  className="mobile-primary-action"
                  type="button"
                  data-action="continue-writing"
                  aria-label="继续写作"
                  onClick={() => onMobileQuickAction('continue', featuredProject.name)}
                >
                  <span>✎</span>继续写作
                </button>
              </div>
            </div>
          </section>

          <section className="mobile-home-section">
            <h3 className="mobile-section-title">快捷入口</h3>

            {/* 写作 - 主卡 */}
            <button
              className="mobile-shortcut-card-primary"
              type="button"
              data-action="writing"
              aria-label="打开写作"
              onClick={() => onMobileQuickAction('writing', featuredProject.name)}
            >
              <span className="mobile-shortcut-primary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
              </span>
              <span className="mobile-shortcut-primary-copy">
                <strong>写作</strong>
                <span>继续章节 · 生成下一段</span>
              </span>
              <span className="mobile-shortcut-primary-arrow">›</span>
            </button>

            {/* 其余四个 - 2列小卡 */}
            <div className="mobile-shortcut-subgrid">
              {[
                ['world', '世界观', '设定世界、势力、规则', 'world'],
                ['character', '人物卡', '角色关系与人设', 'characters'],
                ['outline', '大纲', '剧情摘要与章节规划', 'outline'],
                ['materials', '素材库', '备份、导入、资料', 'materials'],
              ].map(([icon, label, desc, type]) => (
                <button
                  key={label}
                  className="mobile-shortcut-card"
                  type="button"
                  data-action={type}
                  aria-label={label}
                  onClick={() => onMobileQuickAction(type, featuredProject.name)}
                >
                  <span className="mobile-shortcut-icon">
                    {icon === 'world' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <line x1="12" y1="2" x2="12" y2="22"/>
                        <ellipse cx="12" cy="12" rx="4" ry="10"/>
                      </svg>
                    )}
                    {icon === 'character' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4"/>
                        <path d="M4 22c0-4.418 3.582-8 8-8s8 3.582 8 8"/>
                      </svg>
                    )}
                    {icon === 'outline' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"/>
                        <line x1="8" y1="12" x2="21" y2="12"/>
                        <line x1="8" y1="18" x2="21" y2="18"/>
                        <line x1="3" y1="6" x2="3.01" y2="6"/>
                        <line x1="3" y1="12" x2="3.01" y2="12"/>
                        <line x1="3" y1="18" x2="3.01" y2="18"/>
                      </svg>
                    )}
                    {icon === 'materials' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    )}
                  </span>
                  <span className="mobile-shortcut-card-copy">
                    <strong>{label}</strong>
                    <span>{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mobile-home-section">
            <div className="mobile-section-heading">
              <h3 className="mobile-section-title">最近项目</h3>
              <button className="mobile-all-projects-btn" type="button" data-action="all-projects" onClick={onOpenAllProjects}>全部项目 ›</button>
            </div>
            <div className="mobile-recent-list">
              {hasHomeProjects ? recentHomeProjects.map((p, index) => {
              const count = getProjectChapterCount(p);
              return (
              <button key={p.name} className="mobile-recent-item" type="button" data-action="open-project" aria-label={p.name} onClick={() => onHomeProjectOpen(p.name)}>
                <span className={`mobile-recent-thumb tone-${(index % 3) + 1}`}>
                  <span>{p.name.charAt(0)}</span>
                </span>
                <span className="mobile-recent-copy">
                  <strong>{p.name}</strong>
                  <span>{formatProjectUpdatedAt(p.updatedAt)} ｜ 第 {count || 0} 章</span>
                </span>
                <span className="mobile-recent-arrow">›</span>
              </button>
              );
            }) : fallbackRecentProjects.map((p, index) => (
              <div key={p.name} className="mobile-recent-item mobile-recent-item-fallback">
                <div className={`mobile-recent-thumb tone-${(index % 3) + 1}`}><span>{p.name.charAt(0)}</span></div>
                <div className="mobile-recent-copy">
                  <strong>{p.name}</strong>
                  <span>{p.meta}</span>
                </div>
                <span className="mobile-recent-arrow">›</span>
              </div>
            ))}
            </div>
          </section>

          <section className="mobile-inspiration-card">
            <div className="mobile-inspiration-icon">✺</div>
            <div>
              <h3>今日灵感</h3>
              <p>先写最想写的那一幕，故事就会自己长出来。</p>
            </div>
          </section>

          <nav className="mobile-bottom-nav" aria-label="底部导航">
            {[
              ['▣', '项目', 'shelf', null],
              ['✎', '写作', null, 'writing'],
              ['▤', '素材', null, 'materials'],
              ['●', '我的', null, null],
            ].map(([icon, label, view, type]) => (
              <button
                key={label}
                className={view === 'shelf' ? 'active' : ''}
                type="button"
                data-action={type || 'tab-' + label}
                aria-label={label}
                onClick={() => {
                  if (view) { onNavigate(view); return; }
                  if (type) onMobileQuickAction(type, featuredProject.name);
                }}
              >
                <span>{icon}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
