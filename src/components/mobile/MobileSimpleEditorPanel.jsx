export default function MobileSimpleEditorPanel({
  isMobile,
  showMobileEdit,
  readingChapterTitle,
  readingContent,
  mobileEditTitle,
  mobileEditContent,
  mobileEditSaving,
  setShowMobileEdit,
  setMobileEditTitle,
  setMobileEditContent,
  handleMobileSaveEdit,
}) {
  if (!isMobile) return null;

  if (!showMobileEdit) {
    return (
      <div style={{ marginTop: 12 }}>
        {/* 编辑本文：把当前章节标题和正文复制到移动端临时编辑表单，不会立即保存。 */}
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => {
            setMobileEditTitle(readingChapterTitle);
            setMobileEditContent(readingContent);
            setShowMobileEdit(true);
          }}
        >
          编辑本文
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-simple-edit" style={{ marginTop: 12, padding: '12px', border: '1px solid #eee', borderRadius: 8 }}>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>编辑本章</h3>
      <label>标题</label>
      <input
        type="text"
        value={mobileEditTitle}
        onChange={(e) => setMobileEditTitle(e.target.value)}
        placeholder="章节标题"
        style={{ width: '100%', marginBottom: 12 }}
      />
      <label>正文</label>
      <textarea
        value={mobileEditContent}
        onChange={(e) => setMobileEditContent(e.target.value)}
        rows={20}
        placeholder="章节正文..."
        style={{ width: '100%', marginBottom: 12 }}
      />
      <div className="form-actions">
        {/* 保存正文：把移动端编辑表单内容保存到服务器当前章节，会覆盖该章节正文。 */}
        <button className="btn" onClick={handleMobileSaveEdit} disabled={mobileEditSaving}>
          {mobileEditSaving ? '保存中...' : '保存'}
        </button>
        {/* 取消编辑：只关闭移动端临时编辑表单，不保存输入内容。 */}
        <button className="btn btn-secondary" onClick={() => setShowMobileEdit(false)}>
          取消
        </button>
      </div>
    </div>
  );
}
