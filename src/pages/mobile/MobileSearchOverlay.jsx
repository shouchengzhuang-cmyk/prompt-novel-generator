export default function MobileSearchOverlay({
  inputRef,
  query,
  onQueryChange,
  loading,
  results,
  onClose,
  onResultClick,
}) {
  return (
    <div className="mobile-search-overlay">
      <div className="mobile-search-panel">
        <div className="mobile-search-bar">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索项目、章节、设定..."
          />
          {/* 取消搜索：只关闭移动端搜索浮层并清理搜索关键词，不保存任何内容。 */}
          <button type="button" onClick={onClose}>取消</button>
        </div>
        <div className="mobile-search-body">
          {loading ? (
            <div className="mobile-search-empty">正在整理搜索索引...</div>
          ) : !query.trim() ? (
            <div className="mobile-search-empty">输入关键词，搜索项目名、章节标题和项目设定。</div>
          ) : results.length === 0 ? (
            <div className="mobile-search-empty">没有找到匹配内容</div>
          ) : (
            <div className="mobile-search-results">
              {['project', 'chapter', 'setting'].map((type) => {
                const group = results.filter((item) => item.type === type);
                if (group.length === 0) return null;
                const label = type === 'project' ? '项目' : type === 'chapter' ? '章节' : '设定';
                return (
                  <section className="mobile-search-group" key={type}>
                    <h3>{label}</h3>
                    {group.map((item, index) => (
                      /* 搜索结果：根据结果类型加载项目/章节或定位设定，会改变当前移动端视图。 */
                      <button
                        key={`${item.type}-${item.projectName}-${item.fileName || item.settingKey || index}`}
                        className="mobile-search-result"
                        type="button"
                        onClick={() => onResultClick(item)}
                      >
                        <span>{label}</span>
                        <strong>{item.title}</strong>
                        <em>{item.subtitle}</em>
                        {item.snippet && <small>{item.snippet}</small>}
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
