export default function DesktopTopBar({
  searchInputRef,
  searchQuery,
  searchLoading,
  searchResults,
  showDesktopSearch,
  onSearchQueryChange,
  onOpenDesktopSearch,
  onCloseDesktopSearch,
  onSearchResultClick,
  onSetShowCreateForm,
  onSetCreateError,
  onHandleLogout,
}) {
  return (
    <header className="desktop-topbar">
      <div className="desktop-brand">
        <span className="desktop-logo" aria-hidden="true"></span>
        <span>小墨匣</span>
      </div>
      <div className="desktop-search">
        <span>⌕</span>
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onFocus={onOpenDesktopSearch}
          placeholder="搜索项目 / 章节 / 角色 / 世界观"
        />
        <kbd>⌘ K</kbd>
        {showDesktopSearch && (
          <div className="desktop-search-results" onClick={(e) => e.stopPropagation()}>
            {searchLoading ? (
              <div className="desktop-search-status">正在搜索...</div>
            ) : !searchQuery.trim() ? (
              <div className="desktop-search-status">输入关键词搜索项目名、章节、设定</div>
            ) : searchResults.length === 0 ? (
              <div className="desktop-search-status">没有找到匹配结果</div>
            ) : (
              <div className="desktop-search-list">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.projectName}-${r.type}-${r.fileName || r.settingKey || i}`}
                    className="desktop-search-result"
                    type="button"
                    onClick={() => onSearchResultClick(r)}
                  >
                    <span className="desktop-search-tag">
                      {r.type === 'project' ? '项目' : r.type === 'chapter' ? '章节' : '设定'}
                    </span>
                    <strong>{r.projectName}{r.title ? ` · ${r.title}` : ''}</strong>
                    {r.snippet && <span className="desktop-search-snippet">{r.snippet}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showDesktopSearch && <div className="desktop-search-backdrop" onClick={onCloseDesktopSearch} />}
      </div>
      <div className="desktop-top-actions">
        {/* 新建项目：只打开桌面创建表单并清理创建错误，不会立即调用后端。 */}
        <button className="desktop-action primary" type="button" onClick={() => { onSetShowCreateForm(true); onSetCreateError(''); }}>＋ 新建项目</button>
        {/* 退出登录：调用父级退出流程，预期会请求认证退出接口并回到登录状态。 */}
        <button className="desktop-avatar" type="button" onClick={onHandleLogout} title="退出登录">墨</button>
      </div>
    </header>
  );
}
