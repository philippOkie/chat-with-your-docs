const milestones = [
  {
    eyebrow: "Available now",
    title: "Reliable foundation",
    description:
      "The web app, PostgreSQL vector store, migrations, worker, typed configuration, and structured logs start together.",
    status: "Ready",
  },
  {
    eyebrow: "Up next",
    title: "Document library",
    description:
      "Upload PDF, TXT, and Markdown files and follow each document from queued through ready or failed.",
    status: "Phase 2",
  },
  {
    eyebrow: "Planned",
    title: "Grounded conversations",
    description:
      "Select ready documents, ask conversational questions, and inspect exact source excerpts under every answer.",
    status: "Phases 3–4",
  },
] as const;

export default function Home() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Chat With Your Docs home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Chat With Your Docs</span>
        </a>
        <span className="phase-pill">
          <span className="phase-dot" /> Phase 1
        </span>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">A source-first document workspace</p>
          <h1>
            Your documents.
            <br />
            <span>Your answers.</span>
          </h1>
          <p className="lede">
            Build a reusable library, choose exactly what belongs in each
            conversation, and understand where every grounded answer came from.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#roadmap">
              View build roadmap
              <span aria-hidden="true">→</span>
            </a>
            <a className="secondary-action" href="/api/health">
              Check system health
            </a>
          </div>
        </div>

        <div className="answer-preview" aria-label="Answer source preview">
          <div className="preview-topline">
            <span>Answer preview</span>
            <span className="grounded-badge">Grounded</span>
          </div>
          <div className="question-bubble">
            What does the proposal say about launch timing?
          </div>
          <div className="answer-block">
            <span className="answer-spark" aria-hidden="true">
              ✦
            </span>
            <div>
              <p>
                The proposal targets a controlled launch after the reliability
                review, with the pilot group expanding in two measured stages.
              </p>
              <div className="source-row">
                <span className="source-number">1</span>
                <span>
                  <strong>launch-proposal.pdf</strong>
                  <small>Page 8 · Rollout plan</small>
                </span>
              </div>
            </div>
          </div>
          <p className="preview-note">
            Source excerpts are loaded from stored chunks—not written by the
            model.
          </p>
        </div>
      </section>

      <section className="roadmap" id="roadmap">
        <div className="section-heading">
          <p className="kicker">Build status</p>
          <h2>A sturdy base before the clever parts.</h2>
        </div>
        <div className="milestone-grid">
          {milestones.map((milestone, index) => (
            <article className="milestone" key={milestone.title}>
              <div className="milestone-meta">
                <span>0{index + 1}</span>
                <span>{milestone.status}</span>
              </div>
              <p className="milestone-eyebrow">{milestone.eyebrow}</p>
              <h3>{milestone.title}</h3>
              <p>{milestone.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
