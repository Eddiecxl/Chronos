import React, { useEffect, useState } from 'react';

const TRAINER_URL = '/pl900-trainer/index.html';

export default function PL900Trainer() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.body.classList.add('pl900-active');
    return () => document.body.classList.remove('pl900-active');
  }, []);

  return <main className="pl900-page">
    <header className="pl900-page-head">
      <div>
        <span>CHRONOS LEARNING / MICROSOFT POWER PLATFORM</span>
        <h1>PL-900 Exam Trainer</h1>
        <p>Work through the complete question bank, check answers, flag questions for review, and continue from your saved browser progress.</p>
      </div>
      <a href={TRAINER_URL} target="_blank" rel="noreferrer">Open full screen <span>↗</span></a>
    </header>
    <section className={`pl900-frame-shell ${ready ? 'is-ready' : ''}`} aria-label="PL-900 quiz trainer">
      {!ready && <div className="pl900-frame-loader" role="status"><i/><span>PREPARING TRAINER</span><p>Loading your saved question configuration…</p></div>}
      <iframe
        className="pl900-frame"
        src={TRAINER_URL}
        title="PL-900 Quiz Trainer"
        onLoad={() => setReady(true)}
        allow="clipboard-read; clipboard-write"
      />
    </section>
  </main>;
}
