import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const READER_KEY = 'chronos-novel-reader-v1';
const themes = [
  { id: 'paper', label: 'Paper' },
  { id: 'mint', label: 'Focus' },
  { id: 'night', label: 'Night' }
];

const readProgress = () => {
  try { return { chapter: 0, page: 0, fontSize: 20, theme: 'paper', ...JSON.parse(localStorage.getItem(READER_KEY) || '{}') }; }
  catch { return { chapter: 0, page: 0, fontSize: 20, theme: 'paper' }; }
};

export default function NovelReader() {
  const saved = useMemo(readProgress, []);
  const [novel, setNovel] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [chapterIndex, setChapterIndex] = useState(saved.chapter);
  const [pageIndex, setPageIndex] = useState(saved.page);
  const [pageCount, setPageCount] = useState(1);
  const [fontSize, setFontSize] = useState(saved.fontSize);
  const [theme, setTheme] = useState(saved.theme);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState('');
  const viewportRef = useRef(null);
  const flowRef = useRef(null);
  const gestureRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const pendingLastPageRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/novel.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Reader library returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setNovel(data);
        setChapterIndex((current) => Math.min(Math.max(current, 0), data.chapters.length - 1));
      })
      .catch(() => active && setLoadError('The novel library could not be opened. Please refresh and try again.'));
    return () => { active = false; };
  }, []);

  const chapter = novel?.chapters?.[chapterIndex];
  const paragraphs = useMemo(() => chapter?.content?.split(/\n\s*\n/).filter(Boolean) || [], [chapter]);

  const measurePages = () => {
    const viewport = viewportRef.current;
    const flow = flowRef.current;
    if (!viewport || !flow || !chapter) return;
    const width = viewport.clientWidth;
    if (!width) return;
    const count = Math.max(1, Math.ceil((flow.scrollWidth - 1) / width));
    setPageCount(count);
    setPageIndex((current) => {
      const next = pendingLastPageRef.current ? count - 1 : Math.min(current, count - 1);
      pendingLastPageRef.current = false;
      requestAnimationFrame(() => { viewport.scrollLeft = next * width; });
      return next;
    });
  };

  useLayoutEffect(() => {
    if (!chapter) return undefined;
    const frame = requestAnimationFrame(measurePages);
    const observer = new ResizeObserver(() => requestAnimationFrame(measurePages));
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [chapter, fontSize]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ left: pageIndex * viewport.clientWidth, behavior: 'smooth' });
    localStorage.setItem(READER_KEY, JSON.stringify({ chapter: chapterIndex, page: pageIndex, fontSize, theme }));
  }, [chapterIndex, pageIndex, fontSize, theme]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (panel) return;
      if (event.key === 'ArrowLeft') previousPage();
      if (event.key === 'ArrowRight') nextPage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const openChapter = (index, atEnd = false) => {
    if (!novel?.chapters?.[index]) return;
    pendingLastPageRef.current = atEnd;
    setChapterIndex(index);
    setPageIndex(0);
    setPanel('');
  };

  const nextPage = () => {
    if (pageIndex + 1 < pageCount) setPageIndex((current) => current + 1);
    else openChapter(chapterIndex + 1);
  };

  const previousPage = () => {
    if (pageIndex > 0) setPageIndex((current) => current - 1);
    else openChapter(chapterIndex - 1, true);
  };

  const nextChapter = () => openChapter(chapterIndex + 1);
  const previousChapter = () => openChapter(chapterIndex - 1);

  const handlePageClick = (event) => {
    if (suppressClickRef.current || panel) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width;
    if (position < .38) previousPage();
    else if (position > .62) nextPage();
    else setChrome((current) => !current);
  };

  const startGesture = (event) => {
    gestureRef.current = { x: event.clientX, y: event.clientY };
    suppressClickRef.current = false;
  };

  const finishGesture = (event) => {
    const dx = event.clientX - gestureRef.current.x;
    const dy = event.clientY - gestureRef.current.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    suppressClickRef.current = true;
    if (dx < 0) nextChapter();
    else previousChapter();
    window.setTimeout(() => { suppressClickRef.current = false; }, 80);
  };

  if (loadError) return <main className="novel-reader-state"><b>LIBRARY OFFLINE</b><h1>We could not open the book.</h1><p>{loadError}</p></main>;
  if (!novel || !chapter) return <main className="novel-reader-state"><div className="reader-loader"/><b>OPENING LIBRARY</b><p>Preparing your saved page…</p></main>;

  const overallProgress = Math.round(((chapterIndex + (pageIndex + 1) / pageCount) / novel.chapters.length) * 100);

  return <main className="novel-reader" data-reader-theme={theme} style={{ '--reader-font-size': `${fontSize}px` }}>
    <div className={`reader-chrome reader-chrome-top ${chrome ? '' : 'is-hidden'}`}>
      <button onClick={() => setPanel('contents')} aria-label="Open table of contents"><span>☰</span><small>Contents</small></button>
      <div><small>{novel.volume}</small><h1>第 {chapter.number} 章　{chapter.title}</h1></div>
      <button onClick={() => setPanel('settings')} aria-label="Open reading settings"><span>Aa</span><small>Reading</small></button>
    </div>

    <section
      className="reader-page-stage"
      onClick={handlePageClick}
      onPointerDown={startGesture}
      onPointerUp={finishGesture}
      aria-label={`Reading ${chapter.title}, page ${Math.min(pageIndex + 1, pageCount)} of ${pageCount}`}
    >
      <div className="reader-page-viewport" ref={viewportRef}>
        <article className="reader-flow" ref={flowRef}>
          {paragraphs.map((paragraph, index) => <p key={`${chapter.number}-${index}`}>{paragraph}</p>)}
        </article>
      </div>
      <div className="reader-tap-hint" aria-hidden="true"><i>‹</i><span>Tap pages · Swipe chapters</span><i>›</i></div>
    </section>

    <div className={`reader-chrome reader-chrome-bottom ${chrome ? '' : 'is-hidden'}`}>
      <span>{overallProgress}%</span>
      <div><i style={{ width: `${overallProgress}%` }}/></div>
      <span>{Math.min(pageIndex + 1, pageCount)} / {pageCount}</span>
    </div>

    {panel && <div className="reader-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(''); }}>
      <section className="reader-panel" role="dialog" aria-modal="true" aria-label={panel === 'contents' ? 'Table of contents' : 'Reading settings'}>
        <header><div><small>CHRONOS READER</small><h2>{panel === 'contents' ? novel.volume : 'Reading settings'}</h2></div><button onClick={() => setPanel('')} aria-label="Close">×</button></header>
        {panel === 'contents' ? <div className="reader-contents">
          {novel.chapters.map((item, index) => <button className={index === chapterIndex ? 'active' : ''} key={item.number} onClick={() => openChapter(index)}><span>{String(item.number).padStart(2, '0')}</span><b>{item.title}</b>{index === chapterIndex && <i>READING</i>}</button>)}
        </div> : <div className="reader-settings">
          <label><span>Text size</span><output>{fontSize}px</output><input type="range" min="16" max="30" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}/></label>
          <div><span>Reading theme</span><div className="reader-theme-options">{themes.map((item) => <button className={theme === item.id ? 'active' : ''} data-theme-preview={item.id} key={item.id} onClick={() => setTheme(item.id)}><i/> {item.label}</button>)}</div></div>
          <p><b>Tap</b> the left or right side to turn a page. <b>Swipe</b> horizontally to move between chapters. Your place is saved automatically.</p>
        </div>}
      </section>
    </div>}
  </main>;
}
