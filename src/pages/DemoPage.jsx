const demoProject = {
  name: '雾港来信',
  world:
    '雾港是一座常年潮湿的海边旧城。邮船、灯塔、档案馆和旧城区构成故事的主要舞台，所有线索都围绕一批迟到多年的信件展开。',
  characters: [
    { name: '林知夏', role: '档案馆修复员，负责整理被海水浸湿的旧信。' },
    { name: '周砚', role: '港务记录员，掌握失踪邮船最后一次靠岸记录。' },
    { name: '陈湄', role: '灯塔守望人的后代，保存着一册未公开的值班簿。' },
  ],
  chapters: [
    { title: '第一章 退潮后的邮袋', status: '已完成', words: 3260 },
    { title: '第二章 灯塔值班簿', status: '草稿', words: 1840 },
    { title: '第三章 没有寄出的回信', status: '规划中', words: 0 },
  ],
  chapterBody:
    '雨从午后一直落到傍晚。林知夏推开档案馆后门时，海风把一只旧邮袋送到台阶边。帆布已经褪成灰白色，封口处却还系着一枚完整的铅封，上面压着雾港邮政局停用多年的徽记。\n\n她本该把它登记为普通遗失物，可邮袋里第一封信的日期让她停住了手。那是二十七年前的冬天，也是雾港最后一班夜航邮船失踪的前一日。',
  materials: [
    { title: '事件卡：失踪邮船', content: '夜航邮船“白鹭号”在靠岸后没有留下完整货单，次日离港后失踪。' },
    { title: '素材：旧城区邮局', content: '邮局二楼曾作为临时档案室，墙内可能藏有未归档信件。' },
  ],
  variants: [
    { title: '候选 A：更悬疑的开场', note: '强化邮袋来源与铅封细节。' },
    { title: '候选 B：更生活化的开场', note: '先描写档案馆日常，再引出异常信件。' },
  ],
};

function DisabledAction({ children }) {
  return (
    <button className="demo-disabled-btn" type="button" disabled title={children}>
      {children}
    </button>
  );
}

function DemoPage() {
  return (
    <main className="public-page demo-page">
      <header className="demo-topbar">
        <a className="demo-brand" href="/">小墨匣</a>
        <nav className="demo-nav" aria-label="演示导航">
          <a href="/">首页</a>
          <a href="/app">进入工作台</a>
        </nav>
      </header>

      <section className="demo-layout">
        <aside className="demo-sidebar">
          <p className="public-kicker">DEMO PROJECT</p>
          <h1>{demoProject.name}</h1>
          <p>公开演示数据，仅用于展示产品结构。</p>
          <div className="demo-warning">演示环境不读取真实小说数据，不保存数据，不调用 AI。</div>
          <div className="demo-actions">
            <DisabledAction>演示环境不保存数据</DisabledAction>
            <DisabledAction>演示环境不调用 AI</DisabledAction>
            <DisabledAction>删除按钮已禁用</DisabledAction>
          </div>
        </aside>

        <section className="demo-content" aria-label="演示内容">
          <article className="demo-panel demo-wide">
            <h2>示例世界观</h2>
            <p>{demoProject.world}</p>
          </article>

          <article className="demo-panel">
            <h2>示例人物</h2>
            <div className="demo-list">
              {demoProject.characters.map((character) => (
                <div className="demo-list-item" key={character.name}>
                  <strong>{character.name}</strong>
                  <span>{character.role}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="demo-panel">
            <h2>示例章节列表</h2>
            <div className="demo-list">
              {demoProject.chapters.map((chapter) => (
                <div className="demo-list-item" key={chapter.title}>
                  <strong>{chapter.title}</strong>
                  <span>{chapter.status} · {chapter.words} 字</span>
                </div>
              ))}
            </div>
          </article>

          <article className="demo-panel demo-wide">
            <h2>示例章节正文</h2>
            <div className="demo-reading">
              {demoProject.chapterBody.split('\n\n').map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>

          <article className="demo-panel">
            <h2>示例剧情素材 / 事件卡</h2>
            <div className="demo-list">
              {demoProject.materials.map((item) => (
                <div className="demo-list-item" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.content}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="demo-panel">
            <h2>示例候选版本</h2>
            <div className="demo-list">
              {demoProject.variants.map((variant) => (
                <div className="demo-list-item" key={variant.title}>
                  <strong>{variant.title}</strong>
                  <span>{variant.note}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

export default DemoPage;
