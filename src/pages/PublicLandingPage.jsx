const featureCards = [
  '项目管理',
  '世界观 / 人物 / 文风管理',
  '章节写作与 AI 候选',
  '剧情素材池 / 事件卡',
  '备份与导出',
];

function PublicLandingPage() {
  return (
    <main className="public-page public-landing">
      <section className="public-hero">
        <div className="public-shell">
          <p className="public-kicker">PRIVATE NOVEL WORKBENCH</p>
          <h1>小墨匣</h1>
          <p className="public-lead">私人长篇小说创作工作台</p>
          <div className="public-actions" aria-label="主要入口">
            <a className="public-btn public-btn-primary" href="/demo">查看演示</a>
            <a className="public-btn public-btn-secondary" href="/app">进入工作台</a>
          </div>
        </div>
      </section>

      <section className="public-section" aria-labelledby="features-title">
        <div className="public-shell">
          <h2 id="features-title">功能概览</h2>
          <div className="public-feature-grid">
            {featureCards.map((feature) => (
              <article className="public-feature-card" key={feature}>
                <span className="public-card-mark" aria-hidden="true" />
                <h3>{feature}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default PublicLandingPage;
