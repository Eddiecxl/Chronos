import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { accountExists, addPlan, addRoomMessage, answerFriendRequest, areFriends, clearAccountLocation, clearNotifications, clearRoomMessages, createAccount, createFriendRequest, createRoom, deleteRoom, deleteRoomAny, dismissNotification, getAdminDashboard, getCachedGeocode, getLiveLocations, getPlans, getRoom, getRoomMessages, getSocial, initStore, kickRoomMember, loginAccount, markMessageSeen, recordUser, removeFriend, removePlan, resetAccountPin, saveCachedGeocode, setAccountPresence, updateAccountLocation, updatePlan, verifyAdminPin } from './store.js';

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim());
const sessionSecret = process.env.SESSION_SECRET || randomBytes(48).toString('base64url');
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;

app.disable('x-powered-by');
app.use((_, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'geolocation=(self), notifications=(self)' });
  next();
});
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); } }));
app.use(express.json({ limit: '120kb' }));

const liveClients = new Map();
const roomClients = new Map();
const accountKey = (value) => String(value || '').trim().toLowerCase();
const cleanUsername = (value) => String(value || '').trim().slice(0, 40);
const validPin = (value) => /^\d{3}$/.test(String(value || ''));
const validUsername = (value) => /^[A-Za-z0-9_.-]{3,24}$/.test(value);
const roomMemberKeys = (room) => [...new Set([room.creatorKey, ...(room.members || []).map((member) => accountKey(member.key || member.name || member)).filter(Boolean)])];
const roomAccess = (room, usernameKey) => Boolean(room && roomMemberKeys(room).includes(usernameKey));
const roomActiveKeys = (roomId) => new Set([...(roomClients.get(roomId) || [])].map((client) => client.username.toLowerCase()));
const publish = (username, type, payload = {}) => {
  const message = `data: ${JSON.stringify({ type, payload, at: Date.now() })}\n\n`;
  liveClients.get(accountKey(username))?.forEach((response) => response.write(message));
};
const publishRoom = (roomId, type, payload = {}, except = null) => {
  const message = `data: ${JSON.stringify({ type, payload, at: Date.now() })}\n\n`;
  roomClients.get(roomId)?.forEach((client) => { if (client !== except) client.response.write(message); });
};
const publishRoomMember = (roomId, username, type, payload = {}) => {
  const message = `data: ${JSON.stringify({ type, payload, at: Date.now() })}\n\n`;
  roomClients.get(roomId)?.forEach((client) => { if (client.username.toLowerCase() === accountKey(username)) client.response.write(message); });
};

const sign = (value) => createHmac('sha256', sessionSecret).update(value).digest('base64url');
const matches = (left, right) => {
  const a = Buffer.from(left || ''); const b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
};
const issueSession = (account) => {
  const payload = Buffer.from(JSON.stringify({ sub: account.usernameKey, username: account.username, role: account.role === 'admin' ? 'admin' : 'user', exp: Date.now() + sessionLifetime, nonce: randomBytes(12).toString('base64url') })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};
const sessionFrom = (req) => {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || String(req.query?.token || '');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !matches(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session?.sub && session.exp > Date.now() ? { usernameKey: accountKey(session.sub), username: session.username, role: session.role } : null;
  } catch { return null; }
};
const requireAuth = (req, res, next) => {
  const session = sessionFrom(req);
  if (!session) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.auth = session;
  next();
};
const requireAdmin = (req, res, next) => {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
};
const enforceSelf = (req, res, value) => {
  if (accountKey(value) === req.auth.usernameKey) return true;
  res.status(403).json({ error: 'You can only access your own account.' });
  return false;
};

let lastGeocodeAt = 0;
const geocodeMalaysia = async (location) => {
  const queryKey = location.trim().toLowerCase();
  if (!queryKey) return null;
  const cached = await getCachedGeocode(queryKey);
  if (cached) return cached.found ? cached : null;
  const wait = Math.max(0, 1050 - (Date.now() - lastGeocodeAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: `${location}, Malaysia`, format: 'jsonv2', countrycodes: 'my', limit: '1', addressdetails: '1' });
  const response = await fetch(url, { headers: { 'User-Agent': 'Chronos-Time-Planning-App/1.0', Accept: 'application/json' } });
  const [result] = response.ok ? await response.json() : [];
  const entry = result ? { queryKey, found: true, latitude: Number(result.lat), longitude: Number(result.lon), locationLabel: result.display_name, geocodedAt: new Date() } : { queryKey, found: false, geocodedAt: new Date() };
  await saveCachedGeocode(entry);
  return entry.found ? entry : null;
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: process.env.MONGODB_URI ? 'mongodb' : 'local', timeZone: 'Asia/Kuala_Lumpur' }));
app.post('/api/users', requireAuth, async (req, res) => { await recordUser(req.auth.username); res.status(201).json({ username: req.auth.username }); });

app.post('/api/accounts/register', async (req, res, next) => {
  const username = cleanUsername(req.body.username); const password = String(req.body.password || ''); const pin = String(req.body.pin || '');
  if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3–24 characters with no spaces. Use letters, numbers, _, - or .' });
  if (password.length < 8 || !validPin(pin)) return res.status(400).json({ error: 'An 8+ character password and a 3-digit PIN are required.' });
  try { const account = await createAccount({ username, password, pin }); res.status(201).json({ ...account, token: issueSession(account) }); }
  catch (error) { if (error?.code === 11000) return res.status(409).json({ error: 'That username is already taken.' }); next(error); }
});
app.post('/api/accounts/login', async (req, res, next) => {
  try {
    const username = cleanUsername(req.body.username); const pin = String(req.body.pin || '');
    if (!validUsername(username) || !validPin(pin)) return res.status(400).json({ error: 'Enter a valid username and 3-digit PIN.' });
    const account = await loginAccount(username, pin);
    if (!account) return res.status(401).json({ error: 'Username or PIN is incorrect.' });
    res.json({ ...account, token: issueSession(account) });
  } catch (error) { next(error); }
});
app.post('/api/accounts/reset-pin', async (req, res, next) => {
  try {
    const username = cleanUsername(req.body.username); const password = String(req.body.password || ''); const pin = String(req.body.pin || '');
    if (!validUsername(username) || !password || !validPin(pin)) return res.status(400).json({ error: 'Complete all reset fields with a valid username.' });
    if (!(await resetAccountPin(username, password, pin))) return res.status(401).json({ error: 'Password is incorrect.' });
    res.status(204).end();
  } catch (error) { next(error); }
});
app.get('/api/accounts/:username/exists', async (req, res, next) => {
  try { const username = cleanUsername(req.params.username); res.json({ exists: validUsername(username) && await accountExists(username) }); }
  catch (error) { next(error); }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const username = cleanUsername(req.body.username); const pin = String(req.body.pin || '');
    if (!validUsername(username) || !validPin(pin)) return res.status(400).json({ error: 'Enter the admin username and 3-number PIN.' });
    const account = await verifyAdminPin(username, pin);
    if (!account) return res.status(401).json({ error: 'Admin username or PIN is incorrect.' });
    res.json({ username: account.username, role: 'admin', token: issueSession(account) });
  } catch (error) { next(error); }
});
app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res, next) => { try { res.json(await getAdminDashboard()); } catch (error) { next(error); } });
app.delete('/api/admin/rooms/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const room = await deleteRoomAny(req.params.id); if (!room) return res.status(404).json({ error: 'Room not found.' });
    publishRoom(req.params.id, 'room-deleted', { roomName: room.name, by: 'Chronos Admin' }); room.members?.forEach((member) => publish(member.key || member.name, 'room-deleted', { roomName: room.name, by: 'Chronos Admin' })); publish(room.creatorKey, 'room-deleted', { roomName: room.name, by: 'Chronos Admin' }); res.status(204).end();
  } catch (error) { next(error); }
});
app.delete('/api/admin/rooms/:id/messages', requireAuth, requireAdmin, async (req, res, next) => { try { const deleted = await clearRoomMessages(req.params.id); publishRoom(req.params.id, 'room-cleared', { by: 'Chronos Admin' }); res.json({ deleted }); } catch (error) { next(error); } });

app.get('/api/events/:username', requireAuth, async (req, res, next) => {
  try {
    const usernameKey = accountKey(req.params.username); if (!enforceSelf(req, res, usernameKey)) return;
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); res.write(`data: ${JSON.stringify({ type: 'connected', at: Date.now() })}\n\n`);
    const clients = liveClients.get(usernameKey) || new Set(); clients.add(res); liveClients.set(usernameKey, clients);
    const presence = await setAccountPresence(usernameKey, 'online'); if (presence.changed) presence.friends.forEach((friend) => publish(friend, 'presence', { username: usernameKey, status: 'online' }));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    req.on('close', async () => { clearInterval(heartbeat); clients.delete(res); if (!clients.size) { liveClients.delete(usernameKey); const current = await setAccountPresence(usernameKey, 'offline'); if (current.changed) current.friends.forEach((friend) => publish(friend, 'presence', { username: usernameKey, status: 'offline' })); } });
  } catch (error) { next(error); }
});
app.post('/api/presence', requireAuth, async (req, res, next) => { try { const status = ['online', 'idle', 'offline'].includes(req.body.status) ? req.body.status : null; if (!status) return res.status(400).json({ error: 'Valid presence is required.' }); const presence = await setAccountPresence(req.auth.usernameKey, status); if (presence.changed) presence.friends.forEach((friend) => publish(friend, 'presence', { username: req.auth.usernameKey, status })); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/live-locations/:username', requireAuth, async (req, res, next) => { try { if (!enforceSelf(req, res, req.params.username)) return; res.json(await getLiveLocations(req.auth.usernameKey)); } catch (error) { next(error); } });
app.put('/api/live-location', requireAuth, async (req, res, next) => { try { const latitude = Number(req.body.latitude); const longitude = Number(req.body.longitude); const accuracy = Number(req.body.accuracy); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: 'Valid live coordinates are required.' }); const updated = await updateAccountLocation(req.auth.usernameKey, { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null }); if (!updated) return res.status(404).json({ error: 'Account not found.' }); updated.friends.forEach((friend) => publish(friend, 'location', { username: updated.username })); res.status(204).end(); } catch (error) { next(error); } });
app.delete('/api/live-location/:username', requireAuth, async (req, res, next) => { try { if (!enforceSelf(req, res, req.params.username)) return; await clearAccountLocation(req.auth.usernameKey); res.status(204).end(); } catch (error) { next(error); } });

app.get('/api/social/:username', requireAuth, async (req, res, next) => { try { if (!enforceSelf(req, res, req.params.username)) return; const social = await getSocial(req.auth.usernameKey); if (!social) return res.status(404).json({ error: 'Account not found.' }); res.json(social); } catch (error) { next(error); } });
app.delete('/api/notifications/:id', requireAuth, async (req, res, next) => { try { if (!(await dismissNotification(req.auth.usernameKey, req.params.id))) return res.status(404).json({ error: 'Account not found.' }); res.status(204).end(); } catch (error) { next(error); } });
app.delete('/api/notifications', requireAuth, async (req, res, next) => { try { if (!(await clearNotifications(req.auth.usernameKey))) return res.status(404).json({ error: 'Account not found.' }); res.status(204).end(); } catch (error) { next(error); } });
app.post('/api/friend-requests', requireAuth, async (req, res, next) => { try { const to = accountKey(req.body.to); if (!to || to === req.auth.usernameKey) return res.status(400).json({ error: 'Choose another valid account.' }); const request = await createFriendRequest(req.auth.usernameKey, to); if (!request) return res.status(404).json({ error: 'That account does not exist.' }); publish(to, 'friend-request', { from: request.fromName, requestId: request.id }); res.status(201).json(request); } catch (error) { next(error); } });
app.patch('/api/friend-requests/:id', requireAuth, async (req, res, next) => { try { const request = await answerFriendRequest(req.params.id, req.auth.usernameKey, Boolean(req.body.accepted)); if (!request) return res.status(404).json({ error: 'Request not found.' }); publish(request.from, 'friend-response', { from: request.toName || request.to, accepted: Boolean(req.body.accepted) }); res.status(204).end(); } catch (error) { next(error); } });
app.delete('/api/friends/:friend', requireAuth, async (req, res, next) => { try { const friend = cleanUsername(req.params.friend); if (!friend || !(await removeFriend(req.auth.usernameKey, friend))) return res.status(404).json({ error: 'Friend not found.' }); publish(friend, 'friend-removed', { by: req.auth.usernameKey }); res.status(204).end(); } catch (error) { next(error); } });

app.get('/api/rooms/:id/events', requireAuth, async (req, res, next) => {
  try {
    const room = await getRoom(req.params.id); if (!roomAccess(room, req.auth.usernameKey)) return res.status(403).json({ error: 'You are not invited to this room.' });
    const roomId = req.params.id; const username = req.auth.username;
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
    const clients = roomClients.get(roomId) || new Set(); const client = { username, response: res }; clients.add(client); roomClients.set(roomId, clients);
    res.write(`data: ${JSON.stringify({ type: 'room-connected', payload: { members: [...new Set([...clients].map((item) => item.username))] }, at: Date.now() })}\n\n`); publishRoom(roomId, 'member-joined', { username, members: [...new Set([...clients].map((item) => item.username))] }, client);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(client); if (!clients.size) roomClients.delete(roomId); else publishRoom(roomId, 'member-left', { username, members: [...new Set([...clients].map((item) => item.username))] }); });
  } catch (error) { next(error); }
});
app.post('/api/rooms', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60); if (!name) return res.status(400).json({ error: 'A room name is required.' });
    const candidates = Array.isArray(req.body.members) ? req.body.members.slice(0, 100) : [];
    const allowed = (await Promise.all(candidates.map(async (member) => (await areFriends(req.auth.usernameKey, member.key || member.name)) ? member : null))).filter(Boolean);
    const room = { id: crypto.randomUUID(), name, creator: req.auth.username, creatorKey: req.auth.usernameKey, members: allowed };
    const saved = await createRoom(room); room.members.forEach((member) => publish(member.key || member.name, 'room-invite', { from: room.creator, roomId: room.id, roomName: room.name })); res.status(201).json(saved);
  } catch (error) { next(error); }
});
app.delete('/api/rooms/:id', requireAuth, async (req, res, next) => { try { const room = await getRoom(req.params.id); if (!room || room.creatorKey !== req.auth.usernameKey || !(await deleteRoom(req.params.id, req.auth.usernameKey))) return res.status(403).json({ error: 'Only the creator can delete this room.' }); publishRoom(req.params.id, 'room-deleted', { roomName: room.name, by: room.creator }); room.members.forEach((member) => publish(member.key || member.name, 'room-deleted', { roomName: room.name, by: room.creator })); res.status(204).end(); } catch (error) { next(error); } });
app.delete('/api/rooms/:id/members/:member', requireAuth, async (req, res, next) => { try { const room = await getRoom(req.params.id); const member = cleanUsername(req.params.member); if (!room || room.creatorKey !== req.auth.usernameKey || !(await kickRoomMember(req.params.id, req.auth.usernameKey, accountKey(member)))) return res.status(403).json({ error: 'Only the room owner can remove members.' }); publishRoomMember(req.params.id, member, 'member-kicked', { username: member, by: req.auth.username }); publish(member, 'member-kicked', { roomId: req.params.id, by: req.auth.username }); publishRoom(req.params.id, 'member-removed', { username: member, by: req.auth.username }); res.status(204).end(); } catch (error) { next(error); } });
app.post('/api/rooms/:id/typing', requireAuth, async (req, res, next) => { try { const room = await getRoom(req.params.id); if (!roomAccess(room, req.auth.usernameKey)) return res.status(403).json({ error: 'You are not invited to this room.' }); publishRoom(req.params.id, 'typing', { username: req.auth.username, typing: Boolean(req.body.typing) }); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/rooms/:id/messages', requireAuth, async (req, res, next) => { try { const room = await getRoom(req.params.id); if (!roomAccess(room, req.auth.usernameKey)) return res.status(403).json({ error: 'You are not invited to this room.' }); res.json(await getRoomMessages(req.params.id)); } catch (error) { next(error); } });
app.post('/api/rooms/:id/messages', requireAuth, async (req, res, next) => { try { const text = String(req.body.text || '').trim().slice(0, 1000); if (!text) return res.status(400).json({ error: 'A message is required.' }); const room = await getRoom(req.params.id); if (!roomAccess(room, req.auth.usernameKey)) return res.status(403).json({ error: 'You are not invited to this room.' }); const saved = await addRoomMessage({ id: crypto.randomUUID(), roomId: req.params.id, author: req.auth.username, text }); publishRoom(req.params.id, 'room-message', saved); const active = roomActiveKeys(req.params.id); roomMemberKeys(room).filter((key) => key !== req.auth.usernameKey && !active.has(key)).forEach((key) => publish(key, 'room-message-notice', { roomId: room.id, roomName: room.name, from: req.auth.username })); res.status(201).json(saved); } catch (error) { next(error); } });
app.post('/api/rooms/:id/messages/:messageId/seen', requireAuth, async (req, res, next) => { try { const room = await getRoom(req.params.id); if (!roomAccess(room, req.auth.usernameKey)) return res.status(403).json({ error: 'You are not invited to this room.' }); const seen = await markMessageSeen(req.params.id, req.params.messageId, req.auth.username); if (seen) publishRoom(req.params.id, 'message-seen', { messageId: req.params.messageId, ...seen }); res.status(204).end(); } catch (error) { next(error); } });

app.get('/api/plans', requireAuth, async (req, res, next) => {
  try {
    const username = cleanUsername(req.query.username); if (!username) return res.status(400).json({ error: 'Username is required.' });
    if (accountKey(username) !== req.auth.usernameKey && !(await areFriends(req.auth.usernameKey, username))) return res.status(403).json({ error: 'You can only view your friends’ schedules.' });
    res.json(await getPlans(username));
  } catch (error) { next(error); }
});
app.post('/api/plans', requireAuth, async (req, res, next) => {
  try {
    const { title, date, startTime, endTime, category = 'Focus', status = 'Busy', priority = 'None', notes = '', location = '', latitude, longitude, locationAccuracy, locationLabel } = req.body;
    if (![title, date, startTime, endTime].every(Boolean)) return res.status(400).json({ error: 'Please complete all required fields.' });
    const cleanLocation = String(location).trim().slice(0, 100); const gpsValid = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    let coordinates = gpsValid ? { latitude: Number(latitude), longitude: Number(longitude), locationAccuracy: Number(locationAccuracy) || null, locationLabel: String(locationLabel || 'Automatic device location').slice(0, 180) } : null;
    if (!coordinates && cleanLocation && cleanLocation !== 'Automatic device location') { try { coordinates = await geocodeMalaysia(cleanLocation); } catch (error) { console.warn('Location geocoding unavailable:', error.message); } }
    const plan = { id: crypto.randomUUID(), username: req.auth.username, title: String(title).slice(0, 80), date, startTime, endTime, category, status, priority, notes: String(notes).slice(0, 300), location: cleanLocation, ...(coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude, locationAccuracy: coordinates.locationAccuracy || null, locationLabel: coordinates.locationLabel } : {}), completed: false, timeZone: 'Asia/Kuala_Lumpur' };
    res.status(201).json(await addPlan(plan));
  } catch (error) { next(error); }
});
app.patch('/api/plans/:id', requireAuth, async (req, res, next) => { try { const allowed = ['completed', 'title', 'date', 'startTime', 'endTime', 'category', 'status', 'priority', 'notes', 'location']; const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); if (!Object.keys(changes).length) return res.status(400).json({ error: 'No supported plan changes were provided.' }); if (changes.title !== undefined) changes.title = String(changes.title).trim().slice(0, 80); if (changes.notes !== undefined) changes.notes = String(changes.notes).slice(0, 300); if (changes.location !== undefined) changes.location = String(changes.location).trim().slice(0, 100); if (changes.completed !== undefined) changes.completed = Boolean(changes.completed); const plan = await updatePlan(req.params.id, changes, req.auth.usernameKey); if (!plan) return res.status(404).json({ error: 'Plan not found.' }); res.json(plan); } catch (error) { next(error); } });
app.delete('/api/plans/:id', requireAuth, async (req, res, next) => { try { if (!(await removePlan(req.params.id, req.auth.usernameKey))) return res.status(404).json({ error: 'Plan not found.' }); res.status(204).end(); } catch (error) { next(error); } });

app.use(express.static(dist));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
app.use((error, _req, res, _next) => { console.error('API request failed:', error); res.status(500).json({ error: 'Chronos could not complete that request. Please try again.' }); });

initStore().then(() => {
  if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is not set; local sessions will reset when the server restarts.');
  app.listen(port, '0.0.0.0', () => console.log(`Chronos API running on port ${port}`));
}).catch((error) => { console.error('Failed to initialize storage:', error); process.exit(1); });
