export default function MobileProjectMenuPanel({
  currentProject,
  exportStatus,
  mobileMaterialsOpen,
  onBackClick,
  onExport,
  onBackup,
  onOpenSettings,
  onRefresh,
  onSetMobileMaterialsOpen,
}) {
  return (
    <>
      {/* 返回书架：走应用内返回逻辑，可能清理当前项目/章节状态，不会自动保存正文。 */}
      <button className="mobile-back-btn" onClick={onBackClick}>
        ← 返回书架
      </button>
      <h2 className="mobile-project-title">{currentProject}</h2>
      <div className="mobile-project-tools">
        {/* 导出全文：调用后端导出当前项目全文，不修改项目内容。 */}
        <button className="btn" onClick={onExport} disabled={exportStatus === 'exporting'}>
          {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
        </button>
        {/* 导出备份：调用后端备份接口下载当前项目数据，不修改服务器内容。 */}
        <button className="btn btn-secondary" onClick={onBackup}>导出备份</button>
        {/* 编辑设定：打开当前项目设定面板，只切换编辑状态，不会立即保存。 */}
        <button className="btn btn-secondary" onClick={onOpenSettings}>编辑设定</button>
        {/* 刷新：重新请求当前项目详情/章节列表，不保存当前编辑器内容。 */}
        <button className="btn btn-secondary" onClick={onRefresh}>刷新</button>
      </div>

      {mobileMaterialsOpen && (
        <div className="mobile-materials-panel">
          <div>
            <h3>素材与备份</h3>
            <p>当前版本先接入可用的导出、备份和刷新能力，便于整理项目资料。</p>
          </div>
          <div className="mobile-materials-actions">
            {/* 导出备份：调用后端备份接口下载当前项目数据，不修改服务器内容。 */}
            <button className="btn" onClick={onBackup}>导出备份</button>
            {/* 导出全文：调用后端导出当前项目全文，不修改项目内容。 */}
            <button className="btn btn-secondary" onClick={onExport} disabled={exportStatus === 'exporting'}>
              {exportStatus === 'exporting' ? '导出中...' : '导出全文'}
            </button>
            {/* 刷新项目：重新请求当前项目详情/章节列表，不保存当前编辑器内容。 */}
            <button className="btn btn-secondary" onClick={onRefresh}>刷新项目</button>
            {/* 关闭素材面板：只切换前端显示状态，不请求后端。 */}
            <button className="btn btn-secondary" onClick={() => onSetMobileMaterialsOpen(false)}>关闭</button>
          </div>
        </div>
      )}
    </>
  );
}
