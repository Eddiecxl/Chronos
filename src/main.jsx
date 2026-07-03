import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = (path) => `${API_URL}${path}`;
const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';
const currentMalaysiaTime = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: MALAYSIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
}).format(new Date());

const Icons = {
  arrow: '↗', check: '✓', clock: '◷', plus: '+', trash: '×', spark: '✦', calendar: '□'
};

function Logo() {
  return <div className="logo"><span className="logo-mark">C</span><span>CHRONOS</span></div>;
}

function IntroSequence({ onComplete }) {
  const [departing, setDeparting] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.add('intro-active');
    const departureTimer = window.setTimeout(() => setDeparting(true), reduced ? 180 : 4200);
    const completeTimer = window.setTimeout(onComplete, reduced ? 700 : 5000);
    return () => {
      window.clearTimeout(departureTimer);
      window.clearTimeout(completeTimer);
      document.body.classList.remove('intro-active');
    };
  }, [onComplete]);
  useEffect(() => {
    if (departing) document.body.classList.remove('intro-active');
  }, [departing]);
  const skip = () => {
    setDeparting(true);
    window.setTimeout(onComplete, 650);
  };
  return <div className={`intro-screen ${departing ? 'intro-departing' : ''}`} role="dialog" aria-label="Welcome to Chronos" aria-modal="true">
    <div className="intro-panel intro-panel-left"/><div className="intro-panel intro-panel-right"/>
    <div className="intro-atmosphere" aria-hidden="true"><i/><i/><i/></div>
    <div className="intro-crosshair" aria-hidden="true"><i/><i/></div>
    <div className="intro-content">
      <div className="intro-overline"><span>PRECISION</span><i/> <span>INTENTION</span></div>
      <div className="intro-crest"><div className="intro-orbit-mark"/><div className="intro-diamond"><span>C</span></div></div>
      <div className="intro-wordmark">CHRONOS</div>
      <p>Your time. <em>Elevated.</em></p>
      <div className="intro-coordinate"><span>KUALA LUMPUR</span><b>{currentMalaysiaTime()} MYT</b></div>
    </div>
    <div className="intro-footer"><span>ENTERING YOUR TIME</span><div className="intro-progress"><i/></div><b>05</b></div>
    <button className="intro-skip" onClick={skip}>Skip intro <span>↗</span></button>
  </div>;
}

function Header({ page, setPage, username, logout }) {
  return <header className="header"><Logo/><nav>
    <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Overview</button>
    {username && <button className={page === 'planner' ? 'active' : ''} onClick={() => setPage('planner')}>Planner</button>}
  </nav><div className="header-user">{username ? <><span className="online-dot"/>{username}<button className="text-button" onClick={logout}>Exit</button></> : <span>24 hours. Intentionally.</span>}</div></header>;
}

function Home({ onEnter, onViewFriend }) {
  const [name, setName] = useState('');
  const [friend, setFriend] = useState('');
  const [error, setError] = useState('');
  const [liveTime, setLiveTime] = useState(currentMalaysiaTime);
  useEffect(() => {
    const timer = window.setInterval(() => setLiveTime(currentMalaysiaTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Tell us what we should call you.');
    try {
      await fetch(api('/api/users'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name.trim() }) });
    } catch { /* Local UI remains usable if API is temporarily unavailable. */ }
    onEnter(name.trim());
  };
  return <main>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span>{Icons.spark}</span> Personal time intelligence</div>
        <h1>Your day deserves<br/><em>better architecture.</em></h1>
        <p>Chronos turns a crowded day into a calm, deliberate system. See every hour, protect your focus, and move with intention.</p>
        <form className="entry-form" onSubmit={submit}>
          <label htmlFor="username">Enter your name to begin</label>
          <div className="input-row"><input id="username" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Your name" maxLength="40" autoComplete="name"/><button className="gold-button" type="submit">Enter planner <span>{Icons.arrow}</span></button></div>
          {error && <span className="form-error">{error}</span>}<small>No account. No password. Just your personal planning space.</small>
        </form>
        <form className="friend-lookup" onSubmit={(e) => { e.preventDefault(); if (friend.trim()) onViewFriend(friend.trim()); }}>
          <span>Looking for a friend?</span><div><input value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="Enter their Chronos name"/><button type="submit">View schedule {Icons.arrow}</button></div>
        </form>
        <div className="hero-proof"><div><b>24</b><span>hours, composed</span></div><div><b>MYT</b><span>Malaysia precise</span></div><div><b>LIVE</b><span>shared availability</span></div></div>
      </div>
      <div className="hero-visual" aria-label="Planner preview">
        <div className="chrono-halo"/><div className="clock-ticks"/><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="time-core"><i className="live-pulse"/><span>{liveTime}</span><small>MALAYSIA TIME</small></div>
        <div className="float-card card-a"><span className="card-icon">◉</span><div><small>DEEP WORK</small><b>Design review</b></div><time>09:00</time></div>
        <div className="float-card card-b"><span className="card-icon">◇</span><div><small>PERSONAL</small><b>Evening reset</b></div><time>19:30</time></div>
        <div className="float-stat"><b>86%</b><span>day clarity</span></div>
        <div className="chrono-signature"><span>CHRONOS / 01</span><i/></div>
      </div>
    </section>
    <div className="luxury-marquee" aria-hidden="true"><div><span>INTENTION</span><i>✦</i><span>CLARITY</span><i>✦</i><span>FOCUS</span><i>✦</i><span>CONNECTION</span><i>✦</i><span>INTENTION</span><i>✦</i><span>CLARITY</span><i>✦</i><span>FOCUS</span><i>✦</i><span>CONNECTION</span><i>✦</i></div></div>
    <section className="statement"><div className="statement-gem">C</div><span>THE CHRONOS METHOD</span><h2>Less scheduling.<br/>More <em>living on purpose.</em></h2><p>A refined view of the one resource you cannot replenish.</p><div className="statement-rule"><i/><span>EST. 2026</span><i/></div></section>
    <section className="features">
      {[['01','Map every hour','A complete 24-hour canvas makes the invisible visible.'],['02','Protect your energy','Balance focused work, recovery, and everything between.'],['03','Finish with clarity','Track progress without turning your life into a spreadsheet.']].map(([n,t,d]) => <article key={n}><span>{n}</span><div className="feature-line"/><h3>{t}</h3><p>{d}</p></article>)}
    </section>
  </main>;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: MALAYSIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const emptyForm = () => ({ title: '', date: today(), startTime: '20:00', endTime: '22:00', category: 'Gaming', status: 'Gaming', priority: 'Medium', notes: '', location: '' });
const mins = (time) => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
const formatTime = (time) => new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const shiftDate = (date, days) => new Date(new Date(`${date}T12:00:00+08:00`).getTime() + days * 86400000).toISOString().slice(0,10);
const minuteLabel = (value) => `${String(Math.floor(value / 60) % 24).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`;
const currentMalaysiaMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: MALAYSIA_TIME_ZONE, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour')?.value || 0) * 60 + Number(parts.find((p) => p.type === 'minute')?.value || 0);
};

function PlanModal({ close, save, existing }) {
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const update = (key, value) => setForm({ ...form, [key]: value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Give this plan a name.');
    if (mins(form.endTime) <= mins(form.startTime)) return setError('End time must be later than start time.');
    const conflict = existing.some((p) => p.date === form.date && mins(form.startTime) < mins(p.endTime) && mins(form.endTime) > mins(p.startTime));
    if (conflict && !confirm('This overlaps another plan. Add it anyway?')) return;
    save({ ...form, title: form.title.trim() });
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <button className="modal-close" onClick={close}>×</button><div className="eyebrow"><span>{Icons.spark}</span> Compose your time</div><h2>Create a new plan</h2><p>Give this block a clear purpose. Your future self will thank you.</p>
    <form onSubmit={submit}><label className="wide">What are you planning?<input autoFocus value={form.title} onChange={(e) => { update('title',e.target.value); setError(''); }} placeholder="e.g. Finalize project proposal"/></label>
      <div className="form-grid"><label>Date<input type="date" value={form.date} onChange={(e) => update('date',e.target.value)}/></label><label>Category<select value={form.category} onChange={(e) => update('category',e.target.value)}><option>Gaming</option><option>Focus</option><option>Meeting</option><option>Personal</option><option>Health</option><option>Learning</option></select></label><label>Starts (MYT)<input type="time" value={form.startTime} onChange={(e) => update('startTime',e.target.value)}/></label><label>Ends (MYT)<input type="time" value={form.endTime} onChange={(e) => update('endTime',e.target.value)}/></label></div>
      <label>What should friends see?<div className="status-picker">{['Busy','Free','Gaming'].map((status) => <button type="button" key={status} className={`status-${status.toLowerCase()} ${form.status === status ? 'selected' : ''}`} onClick={() => update('status',status)}><i/>{status}</button>)}</div></label>
      <label>Priority<div className="priority-picker">{['Low','Medium','High'].map((p) => <button type="button" key={p} className={form.priority === p ? 'selected' : ''} onClick={() => update('priority',p)}>{p}</button>)}</div></label>
      <label>Location <span>(optional)</span><input value={form.location} onChange={(e) => update('location',e.target.value)} placeholder="e.g. Discord, KLCC, Home" maxLength="100"/></label>
      <label>Notes <span>(optional)</span><textarea value={form.notes} onChange={(e) => update('notes',e.target.value)} placeholder="Add useful context…" maxLength="300"/></label>{error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="gold-button">Add to my day <span>{Icons.arrow}</span></button></div>
    </form>
  </section></div>;
}

function Planner({ username, viewOnly = false, onBack, compareUser = '' }) {
  const [plans, setPlans] = useState([]);
  const [comparePlans, setComparePlans] = useState([]);
  const [compareName, setCompareName] = useState(compareUser);
  const [compareInput, setCompareInput] = useState('');
  const [selectedDate, setSelectedDate] = useState(today());
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  useEffect(() => { fetch(api(`/api/plans?username=${encodeURIComponent(username)}`)).then((r) => r.ok ? r.json() : []).then(setPlans).catch(() => setPlans([])); }, [username]);
  useEffect(() => { if (compareUser) fetch(api(`/api/plans?username=${encodeURIComponent(compareUser)}`)).then((r) => r.ok ? r.json() : []).then(setComparePlans).catch(() => setComparePlans([])); }, [compareUser]);
  const dayPlans = useMemo(() => plans.filter((p) => p.date === selectedDate && (filter === 'All' || p.category === filter) && p.title.toLowerCase().includes(search.toLowerCase())).sort((a,b) => a.startTime.localeCompare(b.startTime)), [plans, selectedDate, filter, search]);
  const fullDayPlans = plans.filter((p) => p.date === selectedDate).sort((a,b) => a.startTime.localeCompare(b.startTime));
  const compareDayPlans = comparePlans.filter((p) => p.date === selectedDate).sort((a,b) => a.startTime.localeCompare(b.startTime));
  const completed = fullDayPlans.filter((p) => p.completed).length;
  const focused = fullDayPlans.reduce((sum,p) => sum + (mins(p.endTime)-mins(p.startTime)), 0);
  const notify = (message) => { setToast(message); setTimeout(() => setToast(''), 2400); };
  const add = async (form) => {
    const optimistic = { ...form, username, id: crypto.randomUUID(), completed: false };
    setPlans((p) => [...p, optimistic]); setModal(false); setSelectedDate(form.date); notify('Plan added to your day');
    try { const r = await fetch(api('/api/plans'), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...form, username }) }); if (r.ok) { const saved = await r.json(); setPlans((p) => p.map((x) => x.id === optimistic.id ? saved : x)); } } catch {}
  };
  const toggle = async (plan) => { setPlans((ps) => ps.map((p) => p.id === plan.id ? { ...p, completed: !p.completed } : p)); await fetch(api(`/api/plans/${plan.id}`), { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ completed: !plan.completed }) }).catch(()=>{}); };
  const remove = async (id) => { setPlans((ps) => ps.filter((p) => p.id !== id)); notify('Plan removed'); await fetch(api(`/api/plans/${id}`), { method:'DELETE' }).catch(()=>{}); };
  const copyShare = async () => { const url = `${window.location.origin}${window.location.pathname}?view=${encodeURIComponent(username)}`; await navigator.clipboard.writeText(url); notify('Friend link copied'); };
  const loadComparison = async (event) => {
    event.preventDefault(); const name = compareInput.trim(); if (!name) return;
    try { const r = await fetch(api(`/api/plans?username=${encodeURIComponent(name)}`)); setComparePlans(r.ok ? await r.json() : []); setCompareName(name); setCompareInput(''); notify(`${name} added to the Orbit`); } catch { notify('Could not load that schedule'); }
  };
  const removeComparison = () => { const removed = compareName; setCompareName(''); setComparePlans([]); notify(`${removed}'s Orbit removed`); };
  const sharedWindow = useMemo(() => {
    if (!compareName) return null;
    const blocked = (items, at) => items.some((p) => mins(p.startTime) <= at && mins(p.endTime) > at && (p.status || 'Busy') === 'Busy');
    let bestStart = 1080, bestEnd = 1080, runStart = null;
    for (let at = 1080; at <= 1440; at += 30) {
      const open = at < 1440 && !blocked(fullDayPlans, at) && !blocked(compareDayPlans, at);
      if (open && runStart === null) runStart = at;
      if ((!open || at === 1440) && runStart !== null) { if (at - runStart > bestEnd - bestStart) { bestStart = runStart; bestEnd = at; } runStart = null; }
    }
    return bestEnd > bestStart ? `${minuteLabel(bestStart)}–${minuteLabel(bestEnd)}` : 'No shared night window';
  }, [compareName, fullDayPlans, compareDayPlans]);
  const dateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' });
  const rows = [{ name: viewOnly ? username : 'You', sub: viewOnly ? 'SHARED SCHEDULE' : username, plans: fullDayPlans, primary:true }, ...(compareName ? [{ name: viewOnly ? 'You' : compareName, sub: viewOnly ? compareName : 'FRIEND', plans:compareDayPlans }] : [])];
  const nowPosition = selectedDate === today() ? `${currentMalaysiaMinutes()/1440*100}%` : null;
  const globePositions = [{x:31,y:22},{x:68,y:28},{x:26,y:58},{x:72,y:62},{x:49,y:13},{x:50,y:73}];
  const worldPlans = fullDayPlans.slice(0, globePositions.length);
  return <main className="planner-page">
    <section className="planner-head"><div><div className="eyebrow"><span>{Icons.spark}</span> {viewOnly ? 'Friend availability' : 'Your time command'} <b className="timezone-pill">MYT · UTC+8</b></div><h1>{viewOnly ? <>Viewing <em>{username}.</em></> : <>Good day, <em>{username}.</em></>}</h1><p>{viewOnly ? `See ${username}'s entire day at once—and where your free time aligns.` : 'Your whole day, one Orbit. Compare schedules without calendar clutter.'}</p></div><div className="head-actions">{viewOnly ? <button className="secondary-button" onClick={onBack}>← My planner</button> : <><button className="secondary-button share-button" onClick={copyShare}>Share with friends {Icons.arrow}</button><button className="gold-button add-main" onClick={() => setModal(true)}><span>{Icons.plus}</span> New plan</button></>}</div></section>
    <section className="metrics"><article><span>PLANNED TIME</span><b>{Math.floor(focused/60)}<small>h</small> {focused%60}<small>m</small></b><i>across {fullDayPlans.length} blocks</i></article><article><span>{viewOnly ? 'GAMING BLOCKS' : 'COMPLETED'}</span><b>{viewOnly ? fullDayPlans.filter((p)=>p.status === 'Gaming').length : completed}<small>{viewOnly ? '' : ` / ${fullDayPlans.length}`}</small></b><i>{viewOnly ? 'ready to squad up' : `${fullDayPlans.length ? Math.round(completed/fullDayPlans.length*100) : 0}% of your day`}</i></article><article><span>UNPLANNED HOURS</span><b>{Math.max(0,24-Math.round(focused/60))}<small>h</small></b><i>potential free time</i></article><article className="availability-legend"><span><i className="dot-free"/>Free</span><span><i className="dot-busy"/>Busy</span><span><i className="dot-gaming"/>Gaming</span></article></section>
    <section className="planner-tools"><div className="date-control"><button onClick={() => setSelectedDate(shiftDate(selectedDate,-1))}>‹</button><label><span>{Icons.calendar}</span><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}/><b>{dateLabel}</b></label><button onClick={() => setSelectedDate(shiftDate(selectedDate,1))}>›</button></div><div className="search-filter"><input aria-label="Search plans" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search plans…"/><select aria-label="Filter category" value={filter} onChange={(e)=>setFilter(e.target.value)}><option>All</option><option>Gaming</option><option>Focus</option><option>Meeting</option><option>Personal</option><option>Health</option><option>Learning</option></select></div></section>
    <section className="orbit-console">
      <div className="orbit-console-head"><div><span className="orbit-kicker">CHRONOS ORBIT / 24H</span><h2>Every hour. One glance.</h2></div>{!viewOnly && <form className="compare-form" onSubmit={loadComparison}><input aria-label="Compare friend" value={compareInput} onChange={(e)=>setCompareInput(e.target.value)} placeholder="Friend's Chronos name"/><button>Compare orbit <span>+</span></button></form>}{compareName && <div className="shared-window"><div><span>BEST SHARED NIGHT WINDOW</span><b>{sharedWindow} <small>MYT</small></b></div><button className="remove-orbit" onClick={removeComparison} aria-label={`Remove ${compareName}'s Orbit`}>{viewOnly ? 'Hide my Orbit' : 'Remove Orbit'} <i>×</i></button></div>}</div>
      <div className="orbit-ruler"><span/><div>{Array.from({length:9},(_,i)=><b key={i}>{String(i*3).padStart(2,'0')}</b>)}</div></div>
      <div className="orbit-lanes"><div className="night-field"><span>NIGHT / GAMING ZONE</span></div>{rows.map((row,rowIndex)=><div className={`orbit-lane ${row.primary?'primary':''}`} key={`${row.name}-${rowIndex}`}><header><b>{row.name}</b><span>{row.sub}</span></header><div className="orbit-track">{Array.from({length:24},(_,i)=><i className="orbit-hour" key={i}/>)}{nowPosition&&<i className="now-beam" style={{left:nowPosition}}>{rowIndex===0&&<span>NOW</span>}</i>}{row.plans.map((plan)=>{const status=(plan.status||'Busy').toLowerCase();return <article title={`${plan.title}, ${formatTime(plan.startTime)} to ${formatTime(plan.endTime)}`} className={`orbit-block status-${status}`} style={{left:`${mins(plan.startTime)/1440*100}%`,width:`${Math.max((mins(plan.endTime)-mins(plan.startTime))/1440*100,1.7)}%`}} key={plan.id}><span>{plan.title}</span><small>{plan.startTime}</small></article>})}{!row.plans.length&&<em>Open orbit</em>}</div></div>)}</div>
      {!compareName && !viewOnly && <div className="orbit-invitation"><span>◎</span><p><b>Layer another orbit.</b> Enter a friend's name to reveal when both of you are free tonight.</p></div>}
    </section>
    <section className="agenda-section"><div className="agenda-heading"><div><span>DAY DETAILS</span><h2>{dayPlans.length ? `${dayPlans.length} moments in focus` : 'An open day'}</h2></div><i>{dateLabel}</i></div><div className="agenda-grid">{dayPlans.map((plan)=>{const status=(plan.status||'Busy').toLowerCase();return <article className={`agenda-card status-${status} ${plan.completed?'done':''}`} key={plan.id}><div className="agenda-time"><b>{plan.startTime}</b><i/><span>{plan.endTime}</span></div><div className="agenda-copy"><span>{plan.status||'Busy'} · {plan.category}</span><h3>{plan.title}</h3><p>{plan.notes||'No additional notes'}</p></div>{!viewOnly&&<div className="agenda-actions"><button onClick={()=>toggle(plan)}>{plan.completed?'Completed':'Mark done'}</button><button aria-label={`Delete ${plan.title}`} onClick={()=>remove(plan.id)}>×</button></div>}</article>})}{!dayPlans.length&&<div className="agenda-empty"><span>{Icons.clock}</span><h3>{viewOnly ? 'Nothing shared for this date.' : 'Your Orbit is clear.'}</h3><p>{viewOnly ? `${username} has no visible blocks here.` : 'A rare luxury: time with no claims on it.'}</p>{!viewOnly&&<button className="secondary-button" onClick={()=>setModal(true)}>Compose a plan</button>}</div>}</div></section>
    <section className="world-section"><div className="world-heading"><div><span>CHRONOS WORLD / PLACES</span><h2>Where your time will take you.</h2><p>Every plan becomes a point in your world.</p></div><b>{String(worldPlans.length).padStart(2,'0')} <small>LOCATIONS</small></b></div><div className="world-stage"><div className="chrono-globe" aria-hidden="true"><div className="globe-aura"/><div className="globe-sphere"><i className="longitude long-a"/><i className="longitude long-b"/><i className="longitude long-c"/><i className="latitude lat-a"/><i className="latitude lat-b"/><i className="latitude lat-c"/><span className="globe-shine"/></div><div className="globe-ring ring-a"/><div className="globe-ring ring-b"/></div><div className="world-flags">{worldPlans.map((plan,index)=>{const point=globePositions[index];return <article className={`world-flag ${index%2?'card-left':'card-right'}`} style={{left:`${point.x}%`,top:`${point.y}%`,'--flag-delay':`${index*-.7}s`}} key={plan.id}><div className="flag-pin"><i/><span>{index+1}</span></div><div className="world-card"><span>{plan.status||'Busy'} · {plan.category}</span><h3>{plan.title}</h3><p><b>{plan.date}</b><i>{plan.startTime}–{plan.endTime} MYT</i></p><footer>⌖ {plan.location||'Location to be decided'}</footer></div></article>})}</div>{!worldPlans.length&&<div className="world-empty"><span>⌖</span><b>No flags placed yet</b><p>Add a plan with a location to mark your world.</p></div>}</div>{fullDayPlans.length>worldPlans.length&&<p className="world-more">Showing the first {worldPlans.length} of {fullDayPlans.length} plans on the globe.</p>}</section>
    {modal && !viewOnly && <PlanModal close={()=>setModal(false)} save={add} existing={plans}/>} {toast && <div className="toast"><span>{Icons.check}</span>{toast}</div>}
  </main>;
}

function Footer() { return <footer><Logo/><p>Make time feel like yours again.</p><span>© 2026 Chronos</span></footer>; }

function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [username, setUsername] = useState(() => localStorage.getItem('chronos-user') || '');
  const sharedName = new URLSearchParams(window.location.search).get('view');
  const [viewing, setViewing] = useState(sharedName || '');
  const [page, setPage] = useState(() => sharedName ? 'friend' : (localStorage.getItem('chronos-user') ? 'planner' : 'home'));
  const enter = (name) => { localStorage.setItem('chronos-user', name); setUsername(name); setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage('planner'); };
  const viewFriend = (name) => { setViewing(name); window.history.replaceState({}, '', `${window.location.pathname}?view=${encodeURIComponent(name)}`); setPage('friend'); };
  const backToMine = () => { setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage(username ? 'planner' : 'home'); };
  const logout = () => { localStorage.removeItem('chronos-user'); setUsername(''); setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage('home'); };
  return <div className="app-shell">{showIntro && <IntroSequence onComplete={() => setShowIntro(false)}/>}<div className="ambient-stage" aria-hidden="true"><i className="aurora aurora-a"/><i className="aurora aurora-b"/><i className="light-beam"/><i className="film-grain"/></div><Header page={page} setPage={(next) => { setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage(next); }} username={username} logout={logout}/>{page === 'friend' && viewing ? <Planner username={viewing} viewOnly onBack={backToMine} compareUser={username && username.toLowerCase() !== viewing.toLowerCase() ? username : ''}/> : page === 'planner' && username ? <Planner username={username}/> : <Home onEnter={enter} onViewFriend={viewFriend}/>}<Footer/></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
