import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const SOCIAL_KEY = 'chronos-social-v2';
const SESSION_KEY = 'chronos-session-v2';
const emptySocial = () => ({ accounts: {}, requests: [], notifications: [], rooms: [] });
const readSocial = () => {
  try { return { ...emptySocial(), ...JSON.parse(localStorage.getItem(SOCIAL_KEY) || '{}') }; }
  catch { return emptySocial(); }
};
const accountKey = (name) => name.trim().toLowerCase();
const hashSecret = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const presenceStatus = (account) => account?.presence || (account?.online ? 'online' : 'offline');
const isRecentlyOnline = (account) => presenceStatus(account) === 'online';

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
    {username && <button className={page === 'lobby' || page === 'room' ? 'active' : ''} onClick={() => setPage('lobby')}>Lobby</button>}
  </nav><div className="header-user">{username ? <><span className="online-dot"/>{username}<button className="text-button" onClick={logout}>Exit</button></> : <span>24 hours. Intentionally.</span>}</div></header>;
}

const seedFriends = [
  { id: 'sample-1', name: 'Avery', online: true },
  { id: 'sample-2', name: 'Mika', online: false },
  { id: 'sample-3', name: 'Noah', online: true }
];

function Lobby({ username, friends, setFriends, rooms, setRooms, onEnterRoom }) {
  const [friendName, setFriendName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [selected, setSelected] = useState([]);
  const [notice, setNotice] = useState('');
  const addFriend = async (event) => {
    event.preventDefault();
    const name = friendName.trim();
    if (!name) return;
    if (friends.some((friend) => friend.name.toLowerCase() === name.toLowerCase())) return setNotice(`${name} is already in your circle.`);
    const friend = { id: crypto.randomUUID(), name, online: false };
    setFriends((current) => [...current, friend]);
    setFriendName('');
    setNotice(`${name} joined your Chronos circle.`);
  };
  const toggleInvite = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const createRoom = (event) => {
    event.preventDefault();
    const name = roomName.trim() || `${username}'s Room`;
    const nextRoom = { id: crypto.randomUUID(), name, creator: username, createdAt: new Date().toISOString(), members: friends.filter((friend) => selected.includes(friend.id)) };
    setRooms((current) => [nextRoom, ...current]);
    onEnterRoom(nextRoom);
  };
  const deleteRoom = (id) => {
    if (!confirm('Delete this room permanently?')) return;
    setRooms((current) => current.filter((item) => item.id !== id));
  };
  return <main className="lobby-page">
    <section className="lobby-hero"><div><div className="eyebrow"><span>✦</span> Chronos social lobby</div><h1>Time is better<br/><em>in good company.</em></h1><p>Build your circle, see who is around, and open a private room for the moments worth sharing.</p></div><div className="lobby-live-card"><i/><span>LOBBY LIVE</span><b>{friends.filter((friend) => friend.online).length + 1}</b><small>people online now</small></div></section>
    <section className="lobby-layout">
      <div className="friends-panel"><header><div><span>YOUR CIRCLE</span><h2>Friends</h2></div><b>{String(friends.length).padStart(2, '0')}</b></header>
        <form className="add-friend-form" onSubmit={addFriend}><label htmlFor="friend-name">Add a friend by name</label><div><input id="friend-name" value={friendName} onChange={(event) => { setFriendName(event.target.value); setNotice(''); }} placeholder="Their Chronos name" maxLength="40"/><button className="gold-button">Add friend <span>+</span></button></div>{notice && <small>{notice}</small>}</form>
        <div className="friends-grid">{friends.map((friend) => <article className={friend.online ? 'is-online' : ''} key={friend.id}><button className={`friend-select ${selected.includes(friend.id) ? 'selected' : ''}`} onClick={() => toggleInvite(friend.id)} aria-label={`${selected.includes(friend.id) ? 'Remove' : 'Invite'} ${friend.name}`}><span>{selected.includes(friend.id) ? '✓' : '+'}</span></button><div className="friend-avatar">{friend.name.slice(0, 1).toUpperCase()}<i/></div><div><h3>{friend.name}</h3><p><i/>{friend.online ? 'Online' : 'Offline'}</p></div><small>{friend.online ? 'AVAILABLE NOW' : 'LAST SEEN EARLIER'}</small></article>)}</div>
      </div>
      <aside className="room-builder"><span>PRIVATE ROOM / 01</span><h2>Create a room</h2><p>A focused place to coordinate plans, talk, and gather your people.</p><form onSubmit={createRoom}><label>Room name<input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder={`${username}'s Room`} maxLength="50"/></label><div className="invite-summary"><span>INVITED</span><b>{selected.length}</b><p>{selected.length ? friends.filter((friend) => selected.includes(friend.id)).map((friend) => friend.name).join(' · ') : 'Select friends from your circle'}</p></div><button className="gold-button room-create">Open room <span>↗</span></button></form><div className="room-sigil" aria-hidden="true"><i/><b>C</b><i/></div>
      </aside>
    </section>
    <section className="live-rooms"><header><div><span>LIVE ROOMS</span><h2>Spaces that stay open.</h2><p>Rooms remain available until their creator closes them.</p></div><b>{String(rooms.length).padStart(2, '0')}</b></header><div className="live-room-grid">{rooms.map((item, index) => <article key={item.id}><div className="live-room-orbit"><i/><i/><b>{String(index + 1).padStart(2, '0')}</b></div><span><i/> LIVE ROOM</span><h3>{item.name}</h3><p>Created by <b>{item.creator}</b></p><div className="live-room-members"><span>{item.members.slice(0, 4).map((member) => <i key={member.id}>{member.name.slice(0, 1).toUpperCase()}</i>)}</span><small>{item.members.length + 1} members</small></div><footer><button className="secondary-button" onClick={() => onEnterRoom(item)}>Enter room <span>→</span></button>{item.creator === username && <button className="delete-room" onClick={() => deleteRoom(item.id)}>Delete</button>}</footer></article>)}{!rooms.length && <div className="rooms-empty"><div className="room-sigil"><i/><b>C</b><i/></div><span>NO LIVE SIGNALS</span><h3>Your first room can stay open as long as you need it.</h3><p>Create one above and invite your circle.</p></div>}</div></section>
  </main>;
}

function SocialLobby({ username, social, updateSocial, onEnterRoom }) {
  const [friendName, setFriendName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [selected, setSelected] = useState([]);
  const [notice, setNotice] = useState('');
  const myKey = accountKey(username);
  const me = social.accounts[myKey];
  const friends = (me?.friends || []).map((key) => social.accounts[key]).filter(Boolean).map((account) => ({ id: account.id, key: accountKey(account.username), name: account.username, status: presenceStatus(account), online: isRecentlyOnline(account) }));
  useEffect(() => { document.querySelectorAll('.friends-grid article').forEach((card) => { const friend = friends.find((item) => item.name === card.querySelector('h3')?.textContent); if (friend) card.dataset.presence = friend.status; }); }, [social]);
  const requests = social.requests.filter((item) => item.to === myKey && item.status === 'pending');
  const notifications = social.notifications.filter((item) => item.to === myKey).sort((a, b) => b.createdAt - a.createdAt);
  const addFriend = async (event) => {
    event.preventDefault();
    const target = accountKey(friendName);
    if (!target) return;
    if (target === myKey) return setNotice('You cannot send a request to yourself.');
    if (me.friends?.includes(target)) return setNotice(`${social.accounts[target]?.username || friendName.trim()} is already your friend.`);
    if (social.requests.some((item) => item.from === myKey && item.to === target && item.status === 'pending')) return setNotice('Your request is already waiting.');
    try { const response = await fetch(api('/api/friend-requests'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: username, to: friendName.trim() }) }); const result = await response.json(); if (!response.ok) return setNotice(result.error || 'Could not send request.'); updateSocial((current) => ({ ...current, requests: [...current.requests, result] })); const sentName = friendName.trim(); setFriendName(''); setNotice(`Request sent to ${sentName}.`); }
    catch { setNotice('Chronos could not reach the social server.'); }
  };
  const answerRequest = async (request, accepted) => { const response = await fetch(api(`/api/friend-requests/${request.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, accepted }) }).catch(() => null); if (!response?.ok) return setNotice('Could not update that request.'); updateSocial((current) => {
    const accounts = { ...current.accounts };
    if (accepted) {
      accounts[request.from] = { ...accounts[request.from], friends: [...new Set([...(accounts[request.from].friends || []), request.to])] };
      accounts[request.to] = { ...accounts[request.to], friends: [...new Set([...(accounts[request.to].friends || []), request.from])] };
    }
    return { ...current, accounts, requests: current.requests.map((item) => item.id === request.id ? { ...item, status: accepted ? 'accepted' : 'rejected' } : item), notifications: [...current.notifications, { id: crypto.randomUUID(), type: 'friend-response', to: request.from, from: request.to, accepted, read: false, createdAt: Date.now() }] };
  }); };
  const createRoom = async (event) => {
    event.preventDefault();
    const invitees = friends.filter((friend) => selected.includes(friend.id));
    const draft = { name: roomName.trim() || `${username}'s Room`, creator: username, members: invitees };
    let room; try { const response = await fetch(api('/api/rooms'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); const result = await response.json(); if (!response.ok) return setNotice(result.error || 'Could not create room.'); room = result; } catch { return setNotice('Chronos could not reach the room server.'); }
    updateSocial((current) => ({ ...current, rooms: [room, ...current.rooms], notifications: [...current.notifications, ...invitees.map((friend) => ({ id: crypto.randomUUID(), type: 'room-invite', to: friend.key, from: myKey, roomId: room.id, read: false, createdAt: Date.now() }))] }));
    onEnterRoom(room);
  };
  const deleteRoom = async (id) => {
    if (!confirm('Delete this room permanently?')) return;
    const response = await fetch(api(`/api/rooms/${id}?creator=${encodeURIComponent(username)}`), { method: 'DELETE' }).catch(() => null); if (!response?.ok) return setNotice('Only the creator can delete this room.');
    updateSocial((current) => ({ ...current, rooms: current.rooms.filter((room) => room.id !== id), notifications: current.notifications.filter((item) => item.roomId !== id) }));
  };
  const removeFriend = async (friend) => {
    if (!confirm(`Remove ${friend.name} from your circle?`)) return;
    const response = await fetch(api(`/api/friends/${encodeURIComponent(friend.name)}?username=${encodeURIComponent(username)}`), { method: 'DELETE' }).catch(() => null);
    if (!response?.ok) return setNotice('Could not remove that friend.');
    updateSocial((current) => ({ ...current, accounts: { ...current.accounts, [myKey]: { ...current.accounts[myKey], friends: (current.accounts[myKey].friends || []).filter((key) => key !== friend.key) } } }));
    setSelected((current) => current.filter((id) => id !== friend.id)); setNotice(`${friend.name} was removed from your circle.`);
  };
  const openInvite = (notification) => {
    const room = social.rooms.find((item) => item.id === notification.roomId);
    updateSocial((current) => ({ ...current, notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, read: true } : item) }));
    room ? onEnterRoom(room) : setNotice('That room is no longer live.');
  };
  return <main className="lobby-page">
    <section className="lobby-hero"><div><div className="eyebrow"><span>✦</span> Chronos social lobby</div><h1>Your people.<br/><em>Perfectly in orbit.</em></h1><p>Approve your circle, see who is live, and gather everyone inside a room that waits for you.</p></div><div className="lobby-live-card"><i/><span>LOBBY LIVE</span><b>{friends.filter((friend) => friend.online).length + 1}</b><small>people online now</small></div></section>
    <section className="lobby-layout"><div className="friends-panel"><header><div><span>YOUR CIRCLE</span><h2>Friends</h2></div><b>{String(friends.length).padStart(2, '0')}</b></header><form className="add-friend-form" onSubmit={addFriend}><label>Find an account by username</label><div><input value={friendName} onChange={(event) => { setFriendName(event.target.value); setNotice(''); }} placeholder="Exact Chronos username"/><button className="gold-button">Send request <span>+</span></button></div>{notice && <small>{notice}</small>}</form><div className="friends-grid">{friends.map((friend) => <article className={friend.online ? 'is-online' : ''} key={friend.id}><button className={`friend-select ${selected.includes(friend.id) ? 'selected' : ''}`} onClick={() => setSelected((current) => current.includes(friend.id) ? current.filter((id) => id !== friend.id) : [...current, friend.id])}><span>{selected.includes(friend.id) ? '✓' : '+'}</span></button><button className="friend-remove" onClick={() => removeFriend(friend)} aria-label={`Remove ${friend.name}`}>×</button><div className="friend-avatar">{friend.name[0].toUpperCase()}<i/></div><div><h3>{friend.name}</h3><p><i/>{friend.online ? 'Online' : 'Offline'}</p></div><small>{friend.online ? 'AVAILABLE NOW' : 'AWAY'}</small></article>)}{!friends.length && <p className="circle-empty">Your circle is waiting for its first connection.</p>}</div></div>
      <aside className="room-builder"><span>PRIVATE ROOM / 01</span><h2>Create a room</h2><p>Select friends, open a room, and Chronos will deliver every invitation.</p><form onSubmit={createRoom}><label>Room name<input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder={`${username}'s Room`}/></label><div className="invite-summary"><span>INVITED</span><b>{selected.length}</b><p>{selected.length ? friends.filter((friend) => selected.includes(friend.id)).map((friend) => friend.name).join(' · ') : 'Select friends from your circle'}</p></div><button className="gold-button room-create">Open room <span>↗</span></button></form><div className="room-sigil"><i/><b>C</b><i/></div></aside></section>
    <section className="social-inbox"><header><div><span>SOCIAL INBOX</span><h2>Requests & invitations</h2><p>Every connection stays in your hands.</p></div><b>{String(requests.length + notifications.filter((item) => !item.read).length).padStart(2, '0')}</b></header><div className="inbox-grid"><div className="request-stack"><h3>FRIEND REQUESTS</h3>{requests.map((request) => <article key={request.id}><div className="inbox-avatar">{social.accounts[request.from]?.username[0]}</div><div><b>{social.accounts[request.from]?.username}</b><span>wants to join your circle</span></div><footer><button onClick={() => answerRequest(request, false)}>Reject</button><button className="approve" onClick={() => answerRequest(request, true)}>Approve</button></footer></article>)}{!requests.length && <p className="inbox-empty">No friend requests waiting.</p>}</div><div className="request-stack"><h3>NOTIFICATIONS</h3>{notifications.slice(0, 8).map((item) => <article className={item.read ? 'is-read' : ''} key={item.id}><div className="inbox-avatar">{social.accounts[item.from]?.username[0]}</div><div><b>{item.type === 'room-invite' ? `${social.accounts[item.from]?.username} invited you` : `${social.accounts[item.from]?.username} ${item.accepted ? 'accepted' : 'declined'}`}</b><span>{item.type === 'room-invite' ? social.rooms.find((room) => room.id === item.roomId)?.name || 'Room closed' : 'your friend request'}</span></div>{item.type === 'room-invite' && <footer><button className="approve" onClick={() => openInvite(item)}>View room</button></footer>}</article>)}{!notifications.length && <p className="inbox-empty">Your social signal is quiet.</p>}</div></div></section>
    <section className="live-rooms"><header><div><span>LIVE ROOMS</span><h2>Spaces that stay open.</h2><p>Rooms remain until their creator closes them manually.</p></div><b>{String(social.rooms.length).padStart(2, '0')}</b></header><div className="live-room-grid">{social.rooms.map((item, index) => <article key={item.id}><div className="live-room-orbit"><i/><i/><b>{String(index + 1).padStart(2, '0')}</b></div><span><i/> LIVE ROOM</span><h3>{item.name}</h3><p>Created by <b>{item.creator}</b></p><div className="live-room-members"><span>{item.members.slice(0, 4).map((member) => <i key={member.id}>{member.name[0]}</i>)}</span><small>{item.members.length + 1} members</small></div><footer><button className="secondary-button" onClick={() => onEnterRoom(item)}>Enter room <span>→</span></button>{item.creatorKey === myKey && <button className="delete-room" onClick={() => deleteRoom(item.id)}>Delete</button>}</footer></article>)}{!social.rooms.length && <div className="rooms-empty"><span>NO LIVE SIGNALS</span><h3>Your first room can stay open as long as you need it.</h3></div>}</div></section>
  </main>;
}

function RoomWelcome({ room, onComplete }) {
  useEffect(() => { const timer = window.setTimeout(onComplete, 3000); return () => window.clearTimeout(timer); }, [onComplete]);
  return <div className="room-welcome" role="status" aria-live="polite"><div className="room-welcome-grid"/><div className="room-logo-phase"><div className="room-welcome-orbit"><i/><i/><i/><b>C</b></div><span>CHRONOS</span></div><div className="room-welcome-copy"><span>ROOM ACCESS GRANTED</span><h1>Welcome to<br/><em>{room.name}</em></h1><p>Synchronizing your circle</p><div className="room-welcome-progress"><i/></div><small>03 SECONDS / CHRONOS PRIVATE</small></div></div>;
}

function LegacyRoom({ room, username, onLeave }) {
  const [welcoming, setWelcoming] = useState(true);
  const [invited, setInvited] = useState(room.members);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([{ id: 'welcome', author: 'Chronos', text: `${room.name} is ready. Make this time count.` }]);
  const [liveMembers, setLiveMembers] = useState([username]);
  const [roomNotice, setRoomNotice] = useState(null);
  useEffect(() => { fetch(api(`/api/rooms/${room.id}/messages`)).then((response) => response.ok ? response.json() : []).then((items) => { if (items.length) setMessages(items); }).catch(() => {}); }, [room.id]);
  useEffect(() => {
    const stream = new EventSource(api(`/api/rooms/${room.id}/events?username=${encodeURIComponent(username)}`));
    stream.onmessage = (event) => { const signal = JSON.parse(event.data); if (signal.payload?.members) setLiveMembers(signal.payload.members); if (signal.type === 'room-message' && signal.payload.author !== username) setMessages((current) => current.some((item) => item.id === signal.payload.id) ? current : [...current, signal.payload]); if (signal.type === 'member-joined') setRoomNotice(`${signal.payload.username} joined ${room.name}`); if (signal.type === 'member-left') setRoomNotice(`${signal.payload.username} left ${room.name}`); };
    return () => stream.close();
  }, [room.id, username]);
  if (welcoming) return <RoomWelcome room={room} onComplete={() => setWelcoming(false)}/>;
  const send = async (event) => { event.preventDefault(); if (!message.trim()) return; const optimistic = { id: crypto.randomUUID(), author: username, text: message.trim() }; setMessages((current) => [...current, optimistic]); setMessage(''); try { const response = await fetch(api(`/api/rooms/${room.id}/messages`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: username, text: optimistic.text }) }); if (response.ok) { const saved = await response.json(); setMessages((current) => current.map((item) => item.id === optimistic.id ? saved : item)); } } catch {} };
  return <main className="room-page"><section className="room-head"><button className="secondary-button" onClick={onLeave}>← Lobby</button><div><span>CHRONOS PRIVATE ROOM</span><h1>{room.name}</h1><p><i/> Room active · {invited.length + 1} members</p></div><button className="gold-button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy invite <span>↗</span></button></section><section className="room-layout"><div className="room-conversation"><header><span>ROOM SIGNAL</span><b>LIVE</b></header><div className="message-stream">{messages.map((item) => <article key={item.id} className={item.author === 'Chronos' ? 'system-message' : ''}><div>{item.author.slice(0, 1)}</div><p><b>{item.author}</b><span>{item.text}</span></p><time>now</time></article>)}</div><form onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write to the room…"/><button className="gold-button">Send <span>↗</span></button></form></div><aside className="room-members"><header><span>MEMBERS</span><b>{String(invited.length + 1).padStart(2, '0')}</b></header><article className="is-online"><div>{username.slice(0, 1)}</div><p><b>{username}</b><span><i/>Online · Host</span></p></article>{invited.map((friend) => <article className={friend.online ? 'is-online' : ''} key={friend.id}><div>{friend.name.slice(0, 1)}</div><p><b>{friend.name}</b><span><i/>{friend.online ? 'Online' : 'Invited · Offline'}</span></p><button onClick={() => setInvited((current) => current.filter((item) => item.id !== friend.id))}>×</button></article>)}<footer><span>✦</span><p>Rooms are currently saved on this device while accounts are in development.</p></footer></aside></section></main>;
}

function LiveRoomBase({ room, username, onLeave }) {
  const [welcoming, setWelcoming] = useState(true);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [liveMembers, setLiveMembers] = useState([username]);
  const [roomNotice, setRoomNotice] = useState(null);
  useEffect(() => { fetch(api(`/api/rooms/${room.id}/messages`)).then((response) => response.ok ? response.json() : []).then(setMessages).catch(() => {}); }, [room.id]);
  useEffect(() => {
    const stream = new EventSource(api(`/api/rooms/${room.id}/events?username=${encodeURIComponent(username)}`));
    stream.onmessage = (event) => { const signal = JSON.parse(event.data); if (signal.payload?.members) setLiveMembers(signal.payload.members); if (signal.type === 'room-message' && signal.payload.author !== username) setMessages((current) => current.some((item) => item.id === signal.payload.id) ? current : [...current, signal.payload]); if (signal.type === 'member-joined') setRoomNotice(`${signal.payload.username} joined ${room.name}`); if (signal.type === 'member-left') setRoomNotice(`${signal.payload.username} left ${room.name}`); };
    return () => stream.close();
  }, [room.id, username]);
  const send = async (event) => { event.preventDefault(); const text = message.trim(); if (!text) return; setMessage(''); const response = await fetch(api(`/api/rooms/${room.id}/messages`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: username, text }) }).catch(() => null); if (response?.ok) { const saved = await response.json(); setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]); } };
  if (welcoming) return <RoomWelcome room={room} onComplete={() => setWelcoming(false)}/>;
  const invited = room.members || [];
  return <main className="room-page"><section className="room-head"><button className="secondary-button" onClick={onLeave}>← Lobby</button><div><span>CHRONOS PRIVATE ROOM</span><h1>{room.name}</h1><p><i/> Room active · {liveMembers.length} live now</p></div><button className="gold-button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy invite <span>↗</span></button></section><section className="room-layout"><div className="room-conversation"><header><span>ROOM SIGNAL</span><b>LIVE</b></header><div className="message-stream">{messages.map((item) => <article key={item.id} className={`${item.author === username ? 'my-message' : 'their-message'} ${item.author === 'Chronos' ? 'system-message' : ''}`}><div>{item.author.slice(0, 1).toUpperCase()}</div><p><b>{item.author === username ? 'You' : item.author}</b><span>{item.text}</span></p><time>now</time></article>)}{!messages.length && <div className="room-chat-empty"><span>✦</span><b>No messages yet</b><p>Start the room conversation.</p></div>}</div><form onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write to the room…"/><button className="gold-button">Send <span>↗</span></button></form></div><aside className="room-members"><header><span>LIVE MEMBERS</span><b>{String(liveMembers.length).padStart(2, '0')}</b></header>{liveMembers.map((name) => <article className="is-online" key={name}><div>{name.slice(0, 1).toUpperCase()}</div><p><b>{name}</b><span><i/>Online {name === room.creator ? '· Host' : ''}</span></p></article>)}{invited.filter((friend) => !liveMembers.includes(friend.name)).map((friend) => <article key={friend.id}><div>{friend.name.slice(0, 1).toUpperCase()}</div><p><b>{friend.name}</b><span><i/>Invited · Offline</span></p></article>)}</aside></section>{roomNotice && <button className="room-live-notice" onClick={() => setRoomNotice(null)}><i/><span><small>ROOM UPDATE</small><b>{roomNotice}</b></span><strong>×</strong></button>}</main>;
}

function Room({ room, username, onLeave }) {
  const [welcoming, setWelcoming] = useState(true);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [liveMembers, setLiveMembers] = useState([username]);
  const [typing, setTyping] = useState([]);
  const [roomNotice, setRoomNotice] = useState(null);
  const typingTimer = useRef(null);
  const isOwner = accountKey(username) === room.creatorKey;
  const markSeen = (item) => item.author !== username && fetch(api(`/api/rooms/${room.id}/messages/${item.id}/seen`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }).catch(() => {});
  useEffect(() => { fetch(api(`/api/rooms/${room.id}/messages`)).then((response) => response.ok ? response.json() : []).then((items) => { setMessages(items); items.forEach(markSeen); }).catch(() => {}); }, [room.id]);
  useEffect(() => {
    const stream = new EventSource(api(`/api/rooms/${room.id}/events?username=${encodeURIComponent(username)}`));
    stream.onmessage = (event) => {
      const signal = JSON.parse(event.data); const payload = signal.payload || {};
      if (payload.members) setLiveMembers(payload.members);
      if (signal.type === 'room-message' && payload.author !== username) { setMessages((current) => current.some((item) => item.id === payload.id) ? current : [...current, payload]); markSeen(payload); }
      if (signal.type === 'message-seen') setMessages((current) => current.map((item) => item.id === payload.messageId && !(item.seenBy || []).some((seen) => seen.username === payload.username) ? { ...item, seenBy: [...(item.seenBy || []), { username: payload.username, seenAt: payload.seenAt }] } : item));
      if (signal.type === 'typing' && payload.username !== username) setTyping((current) => payload.typing ? [...new Set([...current, payload.username])] : current.filter((name) => name !== payload.username));
      if (signal.type === 'member-joined') setRoomNotice(`${payload.username} joined ${room.name}`);
      if (signal.type === 'member-left' || signal.type === 'member-removed') setRoomNotice(`${payload.username} left ${room.name}`);
      if (signal.type === 'room-deleted') { alert(`${payload.by} deleted ${payload.roomName}. The room is now closed.`); onLeave(); }
      if (signal.type === 'member-kicked' && accountKey(payload.username) === accountKey(username)) { alert(`You were removed from ${room.name} by ${payload.by}.`); onLeave(); }
    };
    return () => { stream.close(); clearTimeout(typingTimer.current); };
  }, [room.id, username]);
  const changeMessage = (value) => { setMessage(value); fetch(api(`/api/rooms/${room.id}/typing`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, typing: Boolean(value.trim()) }) }).catch(() => {}); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => fetch(api(`/api/rooms/${room.id}/typing`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, typing: false }) }).catch(() => {}), 1300); };
  const send = async (event) => { event.preventDefault(); const text = message.trim(); if (!text) return; changeMessage(''); const response = await fetch(api(`/api/rooms/${room.id}/messages`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: username, text }) }).catch(() => null); if (response?.ok) { const saved = await response.json(); setMessages((current) => [...current, saved]); } };
  const kick = async (name) => { if (!confirm(`Remove ${name} from ${room.name}?`)) return; const response = await fetch(api(`/api/rooms/${room.id}/members/${encodeURIComponent(name)}?creator=${encodeURIComponent(username)}`), { method: 'DELETE' }).catch(() => null); if (!response?.ok) return setRoomNotice('Only the room owner can remove members.'); setLiveMembers((current) => current.filter((member) => member !== name)); };
  if (welcoming) return <RoomWelcome room={room} onComplete={() => setWelcoming(false)}/>;
  const invited = room.members || [];
  return <main className="room-page"><section className="room-head"><button className="secondary-button" onClick={onLeave}>← Lobby</button><div><span>CHRONOS PRIVATE ROOM</span><h1>{room.name}</h1><p><i/> Room active · {liveMembers.length} live now</p></div><button className="gold-button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy invite <span>↗</span></button></section><section className="room-layout"><div className="room-conversation"><header><span>ROOM SIGNAL</span><b>LIVE</b></header><div className="message-stream">{messages.map((item) => { const receipts = (item.seenBy || []).filter((seen) => seen.username !== username); return <article key={item.id} className={item.author === username ? 'my-message' : 'their-message'}><div>{item.author[0].toUpperCase()}</div><p><b>{item.author === username ? 'You' : item.author}</b><span>{item.text}</span>{item.author === username && <small className="read-receipt">{receipts.length ? `Seen by ${receipts.map((seen) => seen.username).join(', ')} · ${new Date(receipts.at(-1).seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sent · not seen yet'}</small>}</p><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>})}{!messages.length && <div className="room-chat-empty"><span>✦</span><b>No messages yet</b><p>Start the room conversation.</p></div>}</div><div className={`typing-signal ${typing.length ? 'visible' : ''}`}><i/><span>{typing.length === 1 ? `${typing[0]} is typing` : typing.length ? `${typing.join(', ')} are typing` : 'No one is typing'}</span><b/><b/><b/></div><form onSubmit={send}><input value={message} onChange={(event) => changeMessage(event.target.value)} placeholder="Write to the room…"/><button className="gold-button">Send <span>↗</span></button></form></div><aside className="room-members"><header><span>LIVE MEMBERS</span><b>{String(liveMembers.length).padStart(2, '0')}</b></header>{liveMembers.map((name) => <article className="is-online" key={name}><div>{name[0].toUpperCase()}</div><p><b>{name}</b><span><i/>Online {accountKey(name) === room.creatorKey ? '· Host' : ''}</span></p>{isOwner && accountKey(name) !== room.creatorKey && <button onClick={() => kick(name)} title={`Remove ${name}`}>×</button>}</article>)}{invited.filter((friend) => !liveMembers.includes(friend.name)).map((friend) => <article key={friend.id}><div>{friend.name[0].toUpperCase()}</div><p><b>{friend.name}</b><span><i/>Invited · Offline</span></p>{isOwner && <button onClick={() => kick(friend.name)} title={`Remove ${friend.name}`}>×</button>}</article>)}</aside></section>{roomNotice && <button className="room-live-notice" onClick={() => setRoomNotice(null)}><i/><span><small>ROOM UPDATE</small><b>{roomNotice}</b></span><strong>×</strong></button>}</main>;
}

function AuthScreen({ social, updateSocial, onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', pin: '', newPin: '' });
  const [error, setError] = useState('');
  const update = (key, value) => setForm((current) => ({ ...current, [key]: key.includes('pin') || key === 'pin' ? value.replace(/\D/g, '').slice(0, 3) : key === 'username' ? value.replace(/\s/g, '').slice(0, 24) : value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    const key = accountKey(form.username);
    if (!form.username.trim()) return setError('Enter your username.');
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(form.username)) return setError('Use 3–24 letters, numbers, _, - or . with no spaces.');
    if (mode === 'register') {
      if (form.password.length < 6) return setError('Use at least 6 characters for your password.');
      if (!/^\d{3}$/.test(form.pin)) return setError('Your login PIN must be exactly 3 numbers.');
      try {
        const response = await fetch(api('/api/accounts/register'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username.trim(), password: form.password, pin: form.pin }) });
        const result = await response.json(); if (!response.ok) return setError(result.error || 'Could not create account.');
        const next = { ...result, friends: result.friends || [], online: true, lastSeen: Date.now() };
        updateSocial((current) => ({ ...current, accounts: { ...current.accounts, [key]: next } })); onLogin(next.username); return;
      } catch { return setError('Chronos could not reach the server. Start Chronos again, then retry.'); }
    }
    if (mode === 'reset') {
      if (!/^\d{3}$/.test(form.newPin)) return setError('Choose exactly 3 numbers.');
      try { const response = await fetch(api('/api/accounts/reset-pin'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username.trim(), password: form.password, pin: form.newPin }) }); if (!response.ok) { const result = await response.json(); return setError(result.error || 'Could not reset PIN.'); } }
      catch { return setError('Chronos could not reach the server. Start Chronos again, then retry.'); }
      setMode('login'); setForm((current) => ({ ...current, pin: current.newPin, password: '', newPin: '' })); setError('PIN reset. You can sign in now.'); return;
    }
    if (!/^\d{3}$/.test(form.pin)) return setError('Username or 3-number PIN is incorrect.');
    try { const response = await fetch(api('/api/accounts/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username.trim(), pin: form.pin }) }); const result = await response.json(); if (!response.ok) return setError(result.error || 'Could not sign in.'); updateSocial((current) => ({ ...current, accounts: { ...current.accounts, [key]: { ...result, lastSeen: Date.now() } } })); onLogin(result.username); }
    catch { setError('Chronos could not reach the server. Start Chronos again, then retry.'); }
  };
  return <main className="auth-page"><section className="auth-visual"><div className="auth-orbit"><i/><i/><b>C</b></div><span>CHRONOS IDENTITY</span><h1>Your time.<br/><em>Your circle.</em></h1><p>One private identity for plans, friendships, invitations, and every room in your orbit.</p><div className="auth-trust"><b>03</b><span>numbers unlock your everyday Chronos</span></div></section><section className="auth-card"><div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div><span>{mode === 'register' ? 'CREATE YOUR CHRONOS ID' : mode === 'reset' ? 'SECURE PIN RESET' : 'WELCOME BACK'}</span><h2>{mode === 'register' ? 'Begin your orbit.' : mode === 'reset' ? 'Choose new numbers.' : 'Enter Chronos.'}</h2><form onSubmit={submit}><label>Display username<input autoComplete="username" value={form.username} onChange={(event) => update('username', event.target.value)} placeholder="Your unique name" maxLength="40"/></label>{mode === 'register' && <label>Password<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="At least 6 characters"/></label>}{mode === 'reset' && <><label>Account password<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="Verify your password"/></label><label>New 3-number PIN<input className="pin-input" inputMode="numeric" type="password" value={form.newPin} onChange={(event) => update('newPin', event.target.value)} placeholder="•••"/></label></>}{mode !== 'reset' && <label>Your 3-number PIN<input className="pin-input" inputMode="numeric" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.pin} onChange={(event) => update('pin', event.target.value)} placeholder="•••"/></label>}{error && <div className={error.startsWith('PIN reset') ? 'form-success' : 'form-error'}>{error}</div>}<button className="gold-button auth-submit">{mode === 'register' ? 'Create account' : mode === 'reset' ? 'Reset PIN' : 'Sign in'} <span>↗</span></button></form>{mode === 'login' && <button className="forgot-pin" onClick={() => { setMode('reset'); setError(''); }}>Forgot your 3 numbers? Reset with password</button>}{mode === 'reset' && <button className="forgot-pin" onClick={() => setMode('login')}>← Back to sign in</button>}<small>Your password is used only for PIN recovery. Your everyday login is username + 3 numbers.</small></section></main>;
}

function Home({ username, onEnter, onViewFriend, onOpenPlanner, onOpenLobby }) {
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
        {username ? <div className="entry-form home-welcome"><label>WELCOME BACK, {username.toUpperCase()}</label><div className="input-row"><button className="gold-button" onClick={onOpenPlanner}>Open my planner <span>{Icons.arrow}</span></button><button className="secondary-button" onClick={onOpenLobby}>Enter social lobby <span>{Icons.arrow}</span></button></div><small>Your Chronos account is active and synchronized.</small></div> : <form className="entry-form" onSubmit={submit}>
          <label htmlFor="username">Enter your name to begin</label>
          <div className="input-row"><input id="username" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Your name" maxLength="40" autoComplete="name"/><button className="gold-button" type="submit">Enter planner <span>{Icons.arrow}</span></button></div>
          {error && <span className="form-error">{error}</span>}<small>No account. No password. Just your personal planning space.</small>
        </form>}
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
    try { const existsResponse = await fetch(api(`/api/accounts/${encodeURIComponent(name)}/exists`)); const found = existsResponse.ok && (await existsResponse.json()).exists; if (!found) { setComparePlans([]); setCompareName(''); return notify(`No Chronos account named ${name}`); } const r = await fetch(api(`/api/plans?username=${encodeURIComponent(name)}`)); setComparePlans(r.ok ? await r.json() : []); setCompareName(name); setCompareInput(''); notify(`${name} added to the Orbit`); } catch { notify('Could not load that schedule'); }
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
  const [social, setSocial] = useState(readSocial);
  const [username, setUsername] = useState(() => localStorage.getItem(SESSION_KEY) || '');
  const sharedName = new URLSearchParams(window.location.search).get('view');
  const [viewing, setViewing] = useState(sharedName || '');
  const [page, setPageState] = useState(() => sharedName ? 'friend' : (localStorage.getItem(SESSION_KEY) ? 'home' : 'auth'));
  const [room, setRoom] = useState(null);
  const [liveNotice, setLiveNotice] = useState(null);
  const idleTimer = useRef(null);
  const lastPresencePing = useRef(0);
  const setPage = (next) => { setPageState(next); if (next === 'lobby' && liveNotice) window.setTimeout(() => document.querySelector(liveNotice.type === 'room-invite' ? '.live-rooms' : '.social-inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180); };
  const updateSocial = (update) => setSocial((current) => { const next = typeof update === 'function' ? update(current) : update; localStorage.setItem(SOCIAL_KEY, JSON.stringify(next)); return next; });
  const syncSocial = () => {
    if (!username) return Promise.resolve();
    return fetch(api(`/api/social/${encodeURIComponent(username)}`)).then((response) => response.ok ? response.json() : null).then((remote) => {
      if (!remote) return;
      updateSocial((current) => { const accounts = { ...current.accounts, [accountKey(remote.account.username)]: { ...remote.account, lastSeen: new Date(remote.account.lastSeen).getTime() } }; [...remote.friends, ...(remote.requesters || [])].forEach((friend) => { accounts[accountKey(friend.username)] = { ...friend, lastSeen: new Date(friend.lastSeen).getTime() }; }); return { ...current, accounts, requests: remote.requests, rooms: remote.rooms, notifications: remote.notifications || [] }; });
    }).catch(() => {});
  };
  useEffect(() => {
    if (!username) return undefined;
    const key = accountKey(username);
    const pulse = () => updateSocial((current) => current.accounts[key] ? ({ ...current, accounts: { ...current.accounts, [key]: { ...current.accounts[key], online: true, lastSeen: Date.now() } } }) : current);
    pulse(); const timer = window.setInterval(pulse, 30000);
    return () => window.clearInterval(timer);
  }, [username]);
  useEffect(() => {
    if (!username) return;
    const sendPresence = (status) => { if (status === 'online' && Date.now() - lastPresencePing.current < 25000) return; lastPresencePing.current = Date.now(); fetch(api('/api/presence'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, status }) }).catch(() => {}); };
    const active = () => { sendPresence('online'); clearTimeout(idleTimer.current); idleTimer.current = setTimeout(() => sendPresence('idle'), 300000); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']; events.forEach((name) => window.addEventListener(name, active, { passive: true })); document.addEventListener('visibilitychange', active); active();
    return () => { clearTimeout(idleTimer.current); events.forEach((name) => window.removeEventListener(name, active)); document.removeEventListener('visibilitychange', active); };
  }, [username]);
  useEffect(() => {
    if (!username) return;
    syncSocial(); const timer = window.setInterval(syncSocial, 15000); return () => window.clearInterval(timer);
  }, [username]);
  useEffect(() => {
    if (!username) return;
    const stream = new EventSource(api(`/api/events/${encodeURIComponent(username)}`));
    stream.onmessage = (event) => { const signal = JSON.parse(event.data); if (signal.type === 'connected') return; syncSocial(); if (signal.type === 'presence') return; const copy = signal.type === 'friend-request' ? `${signal.payload.from} sent you a friend request.` : signal.type === 'room-invite' ? `${signal.payload.from} invited you to ${signal.payload.roomName}.` : signal.type === 'friend-response' ? `${signal.payload.from} ${signal.payload.accepted ? 'accepted' : 'declined'} your request.` : signal.type === 'friend-removed' ? `${signal.payload.by} removed you from their circle.` : signal.type === 'room-deleted' ? `${signal.payload.by} deleted ${signal.payload.roomName}.` : signal.type === 'member-kicked' ? `${signal.payload.by} removed you from a room.` : 'Your Chronos circle just changed.'; setLiveNotice({ ...signal, copy }); };
    return () => stream.close();
  }, [username]);
  useEffect(() => { const sync = (event) => { if (event.key === SOCIAL_KEY) setSocial(readSocial()); }; window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync); }, []);
  const enter = (name) => { localStorage.setItem(SESSION_KEY, name); setUsername(name); setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage('home'); };
  const backToMine = () => { setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage(username ? 'home' : 'auth'); };
  const logout = () => { const key = accountKey(username); updateSocial((current) => current.accounts[key] ? ({ ...current, accounts: { ...current.accounts, [key]: { ...current.accounts[key], online: false, lastSeen: Date.now() } } }) : current); localStorage.removeItem(SESSION_KEY); setUsername(''); setViewing(''); setRoom(null); window.history.replaceState({}, '', window.location.pathname); setPage('auth'); };
  const navigate = (next) => { setViewing(''); window.history.replaceState({}, '', window.location.pathname); setPage(next); };
  return <div className="app-shell">{showIntro && <IntroSequence onComplete={() => setShowIntro(false)}/>}<div className="ambient-stage" aria-hidden="true"><i className="aurora aurora-a"/><i className="aurora aurora-b"/><i className="light-beam"/><i className="film-grain"/></div>{page !== 'room' && <Header page={page} setPage={navigate} username={username} logout={logout}/>} {page === 'friend' && viewing ? <Planner username={viewing} viewOnly onBack={backToMine} compareUser={username && username.toLowerCase() !== viewing.toLowerCase() ? username : ''}/> : page === 'room' && room && username ? <Room room={room} username={username} onLeave={() => setPage('lobby')}/> : page === 'lobby' && username ? <SocialLobby username={username} social={social} updateSocial={updateSocial} onEnterRoom={(nextRoom) => { setRoom(nextRoom); setPage('room'); }}/> : page === 'planner' && username ? <Planner username={username}/> : page === 'home' && username ? <Home username={username} onViewFriend={(name) => { setViewing(name); setPage('friend'); }} onOpenPlanner={() => setPage('planner')} onOpenLobby={() => setPage('lobby')}/> : <AuthScreen social={social} updateSocial={updateSocial} onLogin={enter}/>} {liveNotice && <button className="live-notification" onClick={() => { setPage('lobby'); setLiveNotice(null); }}><i/><span><small>LIVE CHRONOS SIGNAL</small><b>{liveNotice.copy}</b><em>Open Social Inbox →</em></span><strong onClick={(event) => { event.stopPropagation(); setLiveNotice(null); }}>×</strong></button>} {page !== 'room' && <Footer/>}</div>;
}

createRoot(document.getElementById('root')).render(<App/>);
