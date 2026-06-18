export default function LoginScreen({
  checkingAuth = false,
  loginPassword = '',
  setLoginPassword,
  showPassword = false,
  setShowPassword,
  loginError = '',
  setLoginError,
  loggingIn = false,
  handleLogin,
}) {
  const isForgeSplash = window.location.pathname.replace(/\/+$/, '') === '/forge';

  if (checkingAuth) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-text">小墨匣</div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-library">
          <span className="auth-shelf auth-shelf-one" />
          <span className="auth-shelf auth-shelf-two" />
          <span className="auth-shelf auth-shelf-three" />
          <span className="auth-ink-stream" />
          <span className="auth-light-door" />
          <span className="auth-page-float auth-page-float-one" />
          <span className="auth-page-float auth-page-float-two" />
          <span className="auth-page-float auth-page-float-three" />
          <span className="auth-page-float auth-page-float-four" />
        </div>
        <div className="auth-visual-copy">
          <p className="auth-kicker">{isForgeSplash ? 'PERSONA FORGE WORKBENCH' : 'WRITE IN THE QUIET DARK'}</p>
          <h2>
            {isForgeSplash ? (
              <>
                灵格工坊
                <br />
                人格档案与长期对话工作台
                <br />
                灵犀成档，照见古今
                <br />
                格中真意，栩栩如生
              </>
            ) : (
              <>
                墨色藏灯，照夜成章
                <br />
                匣中收梦，落笔生花
              </>
            )}
          </h2>
          <p>{isForgeSplash ? '以档为骨，以话养心。' : '以墨为舟，收万象于匣中。'}</p>
        </div>
      </section>

      <section className="auth-panel-wrap" aria-label={isForgeSplash ? '灵格工坊登录' : '小墨匣登录'}>
        <div className="auth-box">
          <div className="auth-logo" aria-hidden="true" />
          <h1 className="auth-title">{isForgeSplash ? '灵格工坊' : '小墨匣'}</h1>
          <p className="auth-subtitle">
            {isForgeSplash ? '人格档案 · 长期对话 · 事件沉淀' : '专属写作空间 · 记录你的故事'}
          </p>

          <div className="auth-divider" aria-hidden="true">
            <span />
          </div>

          <label className="auth-label" htmlFor="auth-pin-input">请输入访问密码</label>
          <div className={`auth-input-shell${loginError ? ' has-error' : ''}`}>
            <svg className="auth-input-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 10V8a5 5 0 0 1 10 0v2" />
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M12 14v2" />
            </svg>
            <input
              id="auth-pin-input"
              className="auth-pin-input"
              type={showPassword ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={loginPassword}
              onChange={(event) => {
                setLoginPassword(event.target.value.replace(/\D/g, '').slice(0, 4));
                setLoginError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && loginPassword.length === 4 && !loggingIn) {
                  handleLogin();
                }
              }}
              autoFocus
              disabled={loggingIn}
              placeholder={isForgeSplash ? '请输入访问密码' : '····'}
            />
            <button
              type="button"
              className="auth-eye-btn"
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={loggingIn}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
                {showPassword && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
          {loginError && <p className="auth-error">{loginError}</p>}
          {/* 进入：调用认证登录接口校验 PIN，成功后切换到已登录状态。 */}
          <button
            className="auth-btn"
            onClick={handleLogin}
            disabled={loginPassword.length !== 4 || loggingIn}
          >
            {loggingIn ? '验证中...' : '进入'}
          </button>

          <p className="auth-footnote">
            <span aria-hidden="true">◇</span>
            {isForgeSplash ? '本地优先存档，你的人格工程属于你' : '本地加密存储 · 你的内容只属于你'}
          </p>
        </div>
      </section>
    </div>
  );
}
