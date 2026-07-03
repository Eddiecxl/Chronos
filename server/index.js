import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountExists, addPlan, addRoomMessage, answerFriendRequest, createAccount, createFriendRequest, createRoom, deleteRoom, getPlans, getRoom, getRoomMessages, getSocial, initStore, kickRoomMember, loginAccount, markMessageSeen, recordUser, removeFriend, removePlan, resetAccountPin, setAccountPresence, updatePlan } from './store.js';

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim());
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); } }));
app.use(express.json());

const liveClients = new Map();
const roomClients = new Map();
const publish = (username, type, payload = {}) => {
  const message = `data: ${JSON.stringify({ type, payload, at: Date.now() })}\n\n`;
  liveClients.get(String(username).toLowerCase())?.forEach((response) => response.write(message));
};
const publishRoom = (roomId, type, payload = {}, except = null) => {
  const message = `data: ${JSON.stringify({ type, payload, at: Date.now() })}\n\n`;
  roomClients.get(roomId)?.forEach((client) => { if (client !== except) client.response.write(message); });
};
const publishRoomMember = (roomId, username, type, payload = {}) => { const message = `data: ${JSON.stringify({ type, payload, at: Date.now() })}\n\n`; roomClients.get(roomId)?.forEach((client) => { if (client.username.toLowerCase() === username.toLowerCase()) client.response.write(message); }); };

const cleanUsername = (value) => String(value || '').trim().slice(0, 40);
const validPin = (value) => /^\d{3}$/.test(String(value || ''));
const validUsername = (value) => /^[A-Za-z0-9_.-]{3,24}$/.test(value);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: process.env.MONGODB_URI ? 'mongodb' : 'local', timeZone: 'Asia/Kuala_Lumpur' }));
app.post('/api/users', async (req, res) => {
  const username = String(req.body.username || '').trim().slice(0, 40);
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  await recordUser(username);
  res.status(201).json({ username });
});
app.post('/api/accounts/register', async (req, res) => {
  const username = cleanUsername(req.body.username); const password = String(req.body.password || ''); const pin = String(req.body.pin || '');
  if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3–24 characters with no spaces. Use letters, numbers, _, - or .' });
  if (password.length < 6 || !validPin(pin)) return res.status(400).json({ error: 'A 6+ character password and a 3-digit PIN are required.' });
  try { res.status(201).json(await createAccount({ username, password, pin })); }
  catch (error) { if (error?.code === 11000) return res.status(409).json({ error: 'That username is already taken.' }); throw error; }
});
app.post('/api/accounts/login', async (req, res) => {
  const username = cleanUsername(req.body.username); const pin = String(req.body.pin || '');
  if (!validUsername(username) || !validPin(pin)) return res.status(400).json({ error: 'Enter a valid username and 3-digit PIN.' });
  const account = await loginAccount(username, pin);
  if (!account) return res.status(401).json({ error: 'Username or PIN is incorrect.' });
  res.json(account);
});
app.post('/api/accounts/reset-pin', async (req, res) => {
  const username = cleanUsername(req.body.username); const password = String(req.body.password || ''); const pin = String(req.body.pin || '');
  if (!validUsername(username) || !password || !validPin(pin)) return res.status(400).json({ error: 'Complete all reset fields with a valid username.' });
  if (!(await resetAccountPin(username, password, pin))) return res.status(401).json({ error: 'Password is incorrect.' });
  res.status(204).end();
});
app.get('/api/accounts/:username/exists', async (req, res) => res.json({ exists: validUsername(cleanUsername(req.params.username)) && await accountExists(cleanUsername(req.params.username)) }));
app.get('/api/events/:username', async (req, res) => {
  const usernameKey = cleanUsername(req.params.username).toLowerCase();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write(`data: ${JSON.stringify({ type: 'connected', at: Date.now() })}\n\n`);
  const clients = liveClients.get(usernameKey) || new Set(); clients.add(res); liveClients.set(usernameKey, clients);
  const presence = await setAccountPresence(usernameKey, 'online'); if (presence.changed) presence.friends.forEach((friend) => publish(friend, 'presence', { username: usernameKey, status: 'online' }));
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
  req.on('close', async () => { clearInterval(heartbeat); clients.delete(res); if (!clients.size) { liveClients.delete(usernameKey); const presence = await setAccountPresence(usernameKey, 'offline'); if (presence.changed) presence.friends.forEach((friend) => publish(friend, 'presence', { username: usernameKey, status: 'offline' })); } });
});
app.post('/api/presence', async (req, res) => { const username = cleanUsername(req.body.username); const status = ['online', 'idle'].includes(req.body.status) ? req.body.status : null; if (!username || !status) return res.status(400).json({ error: 'Valid presence is required.' }); const presence = await setAccountPresence(username, status); if (presence.changed) presence.friends.forEach((friend) => publish(friend, 'presence', { username, status })); res.status(204).end(); });
app.get('/api/rooms/:id/events', (req, res) => {
  const username = cleanUsername(req.query.username); const roomId = req.params.id;
  if (!username) return res.status(400).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
  const clients = roomClients.get(roomId) || new Set(); const client = { username, response: res }; clients.add(client); roomClients.set(roomId, clients);
  res.write(`data: ${JSON.stringify({ type: 'room-connected', payload: { members: [...new Set([...clients].map((item) => item.username))] }, at: Date.now() })}\n\n`);
  publishRoom(roomId, 'member-joined', { username, members: [...new Set([...clients].map((item) => item.username))] }, client);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
  req.on('close', () => { clearInterval(heartbeat); clients.delete(client); if (!clients.size) roomClients.delete(roomId); else publishRoom(roomId, 'member-left', { username, members: [...new Set([...clients].map((item) => item.username))] }); });
});
app.get('/api/social/:username', async (req, res) => {
  const social = await getSocial(cleanUsername(req.params.username));
  if (!social) return res.status(404).json({ error: 'Account not found.' });
  res.json(social);
});
app.post('/api/friend-requests', async (req, res) => {
  const from = cleanUsername(req.body.from).toLowerCase(); const to = cleanUsername(req.body.to).toLowerCase();
  if (!from || !to || from === to) return res.status(400).json({ error: 'Choose another valid account.' });
  const request = await createFriendRequest(from, to);
  if (!request) return res.status(404).json({ error: 'That account does not exist.' });
  publish(to, 'friend-request', { from: request.fromName, requestId: request.id }); res.status(201).json(request);
});
app.patch('/api/friend-requests/:id', async (req, res) => {
  const request = await answerFriendRequest(req.params.id, cleanUsername(req.body.username), Boolean(req.body.accepted));
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  publish(request.from, 'friend-response', { from: request.toName || request.to, accepted: Boolean(req.body.accepted) });
  res.status(204).end();
});
app.delete('/api/friends/:friend', async (req, res) => {
  const username = cleanUsername(req.query.username); const friend = cleanUsername(req.params.friend);
  if (!username || !friend || !(await removeFriend(username, friend))) return res.status(404).json({ error: 'Friend not found.' });
  publish(friend, 'friend-removed', { by: username.toLowerCase() }); res.status(204).end();
});
app.post('/api/rooms', async (req, res) => {
  const creator = cleanUsername(req.body.creator); const name = String(req.body.name || '').trim().slice(0, 60);
  if (!creator || !name) return res.status(400).json({ error: 'Creator and room name are required.' });
  const room = { id: crypto.randomUUID(), name, creator, creatorKey: creator.toLowerCase(), members: Array.isArray(req.body.members) ? req.body.members.slice(0, 100) : [] };
  const saved = await createRoom(room); room.members.forEach((member) => publish(member.key || member.name, 'room-invite', { from: room.creator, roomId: room.id, roomName: room.name })); res.status(201).json(saved);
});
app.delete('/api/rooms/:id', async (req, res) => {
  const room = await getRoom(req.params.id); const creatorKey = cleanUsername(req.query.creator).toLowerCase();
  if (!room || room.creatorKey !== creatorKey || !(await deleteRoom(req.params.id, creatorKey))) return res.status(403).json({ error: 'Only the creator can delete this room.' });
  publishRoom(req.params.id, 'room-deleted', { roomName: room.name, by: room.creator }); room.members.forEach((member) => publish(member.key || member.name, 'room-deleted', { roomName: room.name, by: room.creator }));
  res.status(204).end();
});
app.delete('/api/rooms/:id/members/:member', async (req, res) => {
  const creator = cleanUsername(req.query.creator).toLowerCase(); const member = cleanUsername(req.params.member); const memberKey = member.toLowerCase();
  if (!(await kickRoomMember(req.params.id, creator, memberKey))) return res.status(403).json({ error: 'Only the room owner can remove members.' });
  publishRoomMember(req.params.id, member, 'member-kicked', { username: member, by: cleanUsername(req.query.creator) }); publish(member, 'member-kicked', { roomId: req.params.id, by: cleanUsername(req.query.creator) }); publishRoom(req.params.id, 'member-removed', { username: member, by: cleanUsername(req.query.creator) }); res.status(204).end();
});
app.post('/api/rooms/:id/typing', (req, res) => { const username = cleanUsername(req.body.username); if (username) publishRoom(req.params.id, 'typing', { username, typing: Boolean(req.body.typing) }); res.status(204).end(); });
app.get('/api/rooms/:id/messages', async (req, res) => res.json(await getRoomMessages(req.params.id)));
app.post('/api/rooms/:id/messages', async (req, res) => {
  const author = cleanUsername(req.body.author); const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!author || !text) return res.status(400).json({ error: 'Author and message are required.' });
  const saved = await addRoomMessage({ id: crypto.randomUUID(), roomId: req.params.id, author, text }); publishRoom(req.params.id, 'room-message', saved); res.status(201).json(saved);
});
app.post('/api/rooms/:id/messages/:messageId/seen', async (req, res) => { const username = cleanUsername(req.body.username); const seen = username && await markMessageSeen(req.params.id, req.params.messageId, username); if (seen) publishRoom(req.params.id, 'message-seen', { messageId: req.params.messageId, ...seen }); res.status(204).end(); });
app.get('/api/plans', async (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  res.json(await getPlans(username));
});
app.post('/api/plans', async (req, res) => {
  const { username, title, date, startTime, endTime, category = 'Focus', status = 'Busy', priority = 'Medium', notes = '', location = '' } = req.body;
  if (![username, title, date, startTime, endTime].every(Boolean)) return res.status(400).json({ error: 'Please complete all required fields.' });
  const plan = { id: crypto.randomUUID(), username, title: String(title).slice(0, 80), date, startTime, endTime, category, status, priority, notes: String(notes).slice(0, 300), location: String(location).trim().slice(0, 100), completed: false, timeZone: 'Asia/Kuala_Lumpur' };
  res.status(201).json(await addPlan(plan));
});
app.patch('/api/plans/:id', async (req, res) => {
  const plan = await updatePlan(req.params.id, { completed: Boolean(req.body.completed) });
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });
  res.json(plan);
});
app.delete('/api/plans/:id', async (req, res) => {
  if (!(await removePlan(req.params.id))) return res.status(404).json({ error: 'Plan not found.' });
  res.status(204).end();
});

app.use(express.static(dist));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

initStore().then(() => app.listen(port, '0.0.0.0', () => console.log(`Chronos API running on port ${port}`))).catch((error) => {
  console.error('Failed to initialize storage:', error);
  process.exit(1);
});
