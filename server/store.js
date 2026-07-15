import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data.json');
const client = process.env.MONGODB_URI
  ? new MongoClient(process.env.MONGODB_URI, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } })
  : null;
let db;

const emptyLocal = () => ({ users: [], plans: [], accounts: [], friendRequests: [], rooms: [], messages: [], geocodes: [] });
const normalizeLocal = (data = {}) => ({ ...emptyLocal(), ...data });
const accountKey = (username) => String(username || '').trim().toLowerCase();
const asDate = (value) => new Date(value || 0).getTime();
const byNewest = (a, b) => asDate(b.createdAt) - asDate(a.createdAt);
const byOldest = (a, b) => asDate(a.createdAt) - asDate(b.createdAt);

async function readLocal() {
  try { return normalizeLocal(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch { return emptyLocal(); }
}

async function writeLocal(data) {
  await fs.writeFile(file, JSON.stringify(normalizeLocal(data), null, 2));
}

const secretHash = (value, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(String(value), salt, 64).toString('hex')}`;
const verifySecret = (value, encoded = '') => {
  const [salt, stored] = encoded.split(':');
  if (!salt || !stored) return false;
  const actual = scryptSync(String(value), salt, 64);
  const expected = Buffer.from(stored, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const publicAccount = ({ _id, passwordHash, pinHash, ...account }) => account;
const withoutInternalPlan = ({ _id, usernameKey, ...plan }) => plan;
const roomMemberKey = (member) => accountKey(member?.key || member?.name || member);

export async function initStore() {
  if (!client) return;
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'chronos');
  await db.command({ ping: 1 });
  await db.collection('users').createIndex({ usernameKey: 1 }, { unique: true });
  await db.collection('plans').createIndex({ usernameKey: 1, date: 1, startTime: 1 });
  await db.collection('accounts').createIndex({ usernameKey: 1 }, { unique: true, name: 'unique_username' });
  await db.collection('friendRequests').createIndex({ to: 1, status: 1, createdAt: -1 }, { name: 'recipient_inbox' });
  await db.collection('friendRequests').createIndex({ from: 1, to: 1, status: 1 }, { name: 'request_lookup' });
  await db.collection('rooms').createIndex({ id: 1 }, { unique: true, name: 'unique_room_id' });
  await db.collection('rooms').createIndex({ creatorKey: 1, createdAt: -1 }, { name: 'creator_rooms' });
  await db.collection('messages').createIndex({ roomId: 1, createdAt: 1 }, { name: 'room_history' });
  await db.collection('messages').createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000, name: 'delete_messages_after_30_days' });
  await db.collection('geocodes').createIndex({ queryKey: 1 }, { unique: true, name: 'unique_geocode_query' });
  await ensureAdminAccount();
}

const adminBootstrap = () => {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password, ADMIN_PIN: pin } = process.env;
  return username && password && pin ? { username, password, pin } : null;
};

async function ensureAdminAccount() {
  const credentials = adminBootstrap();
  if (!credentials) return;
  const usernameKey = accountKey(credentials.username);
  const existing = await db.collection('accounts').findOne({ usernameKey });
  if (existing) {
    await db.collection('accounts').updateOne({ usernameKey }, { $set: { role: 'admin', admin: true, updatedAt: new Date() } });
    return;
  }
  const account = { id: crypto.randomUUID(), username: credentials.username, usernameKey, passwordHash: secretHash(credentials.password), pinHash: secretHash(credentials.pin), role: 'admin', admin: true, friends: [], presence: 'offline', online: false, lastSeen: new Date(), lastActive: new Date(), createdAt: new Date() };
  await db.collection('accounts').insertOne(account);
}

export async function createAccount({ username, password, pin }) {
  const usernameKey = accountKey(username);
  const account = { id: crypto.randomUUID(), username, usernameKey, passwordHash: secretHash(password), pinHash: secretHash(pin), friends: [], presence: 'online', online: true, lastSeen: new Date(), lastActive: new Date(), createdAt: new Date() };
  if (db) {
    await db.collection('accounts').insertOne(account);
    return publicAccount(account);
  }
  const data = await readLocal();
  if (data.accounts.some((item) => item.usernameKey === usernameKey)) {
    const error = new Error('That username is already taken.');
    error.code = 11000;
    throw error;
  }
  data.accounts.push(account);
  await writeLocal(data);
  return publicAccount(account);
}

export async function verifyAdminPin(username, pin) {
  const usernameKey = accountKey(username);
  const account = db
    ? await db.collection('accounts').findOne({ usernameKey, role: 'admin' })
    : (await readLocal()).accounts.find((item) => item.usernameKey === usernameKey && item.role === 'admin');
  return account && verifySecret(pin, account.pinHash) ? publicAccount(account) : null;
}

export async function loginAccount(username, pin) {
  const usernameKey = accountKey(username);
  if (db) {
    const account = await db.collection('accounts').findOne({ usernameKey });
    if (!account || !verifySecret(pin, account.pinHash)) return null;
    const now = new Date();
    await db.collection('accounts').updateOne({ _id: account._id }, { $set: { presence: 'online', online: true, lastSeen: now, lastActive: now } });
    return publicAccount({ ...account, presence: 'online', online: true, lastSeen: now, lastActive: now });
  }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account || !verifySecret(pin, account.pinHash)) return null;
  const now = new Date();
  Object.assign(account, { presence: 'online', online: true, lastSeen: now, lastActive: now });
  await writeLocal(data);
  return publicAccount(account);
}

export async function resetAccountPin(username, password, pin) {
  const usernameKey = accountKey(username);
  if (db) {
    const account = await db.collection('accounts').findOne({ usernameKey });
    if (!account || !verifySecret(password, account.passwordHash)) return false;
    await db.collection('accounts').updateOne({ _id: account._id }, { $set: { pinHash: secretHash(pin), updatedAt: new Date() } });
    return true;
  }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account || !verifySecret(password, account.passwordHash)) return false;
  account.pinHash = secretHash(pin);
  account.updatedAt = new Date();
  await writeLocal(data);
  return true;
}

export async function accountExists(username) {
  const usernameKey = accountKey(username);
  if (db) return Boolean(await db.collection('accounts').findOne({ usernameKey }, { projection: { _id: 1 } }));
  return (await readLocal()).accounts.some((account) => account.usernameKey === usernameKey);
}

export async function setAccountPresence(username, status) {
  const usernameKey = accountKey(username);
  if (db) {
    const before = await db.collection('accounts').findOne({ usernameKey }, { projection: { presence: 1 } });
    const now = new Date();
    const update = { $set: { presence: status, online: status !== 'offline', lastSeen: now, ...(status === 'online' ? { lastActive: now } : {}) }, ...(status === 'offline' ? { $unset: { currentLocation: '' } } : {}) };
    const account = await db.collection('accounts').findOneAndUpdate({ usernameKey }, update, { returnDocument: 'after', projection: { friends: 1, username: 1 } });
    return { friends: account?.friends || [], changed: before?.presence !== status };
  }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) return { friends: [], changed: false };
  const changed = account.presence !== status;
  Object.assign(account, { presence: status, online: status !== 'offline', lastSeen: new Date(), ...(status === 'online' ? { lastActive: new Date() } : {}) });
  if (status === 'offline') delete account.currentLocation;
  await writeLocal(data);
  return { friends: account.friends || [], changed };
}

export async function updateAccountLocation(username, location) {
  const usernameKey = accountKey(username);
  const positioned = { ...location, updatedAt: new Date() };
  if (db) {
    const account = await db.collection('accounts').findOneAndUpdate({ usernameKey }, { $set: { currentLocation: positioned, lastKnownLocation: positioned } }, { returnDocument: 'after', projection: { username: 1, friends: 1, currentLocation: 1 } });
    return account ? { username: account.username, friends: account.friends || [], location: account.currentLocation } : null;
  }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) return null;
  account.currentLocation = positioned;
  account.lastKnownLocation = positioned;
  await writeLocal(data);
  return { username: account.username, friends: account.friends || [], location: positioned };
}

export async function clearAccountLocation(username) {
  const usernameKey = accountKey(username);
  if (db) { await db.collection('accounts').updateOne({ usernameKey }, { $unset: { currentLocation: '' } }); return; }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (account) { delete account.currentLocation; await writeLocal(data); }
}

export async function getLiveLocations(username) {
  const usernameKey = accountKey(username);
  if (db) {
    const account = await db.collection('accounts').findOne({ usernameKey });
    if (!account) return [];
    const accounts = await db.collection('accounts').find({ usernameKey: { $in: [account.usernameKey, ...(account.friends || [])] }, $or: [{ currentLocation: { $exists: true } }, { lastKnownLocation: { $exists: true } }] }, { projection: { _id: 0, username: 1, usernameKey: 1, presence: 1, currentLocation: 1, lastKnownLocation: 1, lastSeen: 1 } }).toArray();
    return accounts.map(({ lastKnownLocation, ...entry }) => ({ ...entry, currentLocation: entry.currentLocation || lastKnownLocation, locationLive: Boolean(entry.currentLocation) && entry.presence !== 'offline' }));
  }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) return [];
  return data.accounts.filter((item) => [usernameKey, ...(account.friends || [])].includes(item.usernameKey) && (item.currentLocation || item.lastKnownLocation)).map((item) => ({ username: item.username, usernameKey: item.usernameKey, presence: item.presence, lastSeen: item.lastSeen, currentLocation: item.currentLocation || item.lastKnownLocation, locationLive: Boolean(item.currentLocation) && item.presence !== 'offline' }));
}

export async function getSocial(username) {
  const usernameKey = accountKey(username);
  if (db) {
    const account = await db.collection('accounts').findOne({ usernameKey });
    if (!account) return null;
    const [friends, requests, rooms] = await Promise.all([
      db.collection('accounts').find({ usernameKey: { $in: account.friends || [] } }, { projection: { _id: 0, passwordHash: 0, pinHash: 0 } }).toArray(),
      db.collection('friendRequests').find({ to: usernameKey, status: 'pending' }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
      db.collection('rooms').find({ $or: [{ creatorKey: usernameKey }, { 'members.key': usernameKey }] }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray()
    ]);
    const requesters = requests.length ? await db.collection('accounts').find({ usernameKey: { $in: requests.map((request) => request.from) } }, { projection: { _id: 0, passwordHash: 0, pinHash: 0 } }).toArray() : [];
    return composeSocial(account, friends, requesters, requests, rooms, await db.collection('messages').find({ roomId: { $in: rooms.map((room) => room.id) } }, { projection: { _id: 0 } }).toArray());
  }
  const data = await readLocal();
  const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) return null;
  const friends = data.accounts.filter((item) => (account.friends || []).includes(item.usernameKey)).map(publicAccount);
  const requests = data.friendRequests.filter((item) => item.to === usernameKey && item.status === 'pending').sort(byNewest);
  const requesters = data.accounts.filter((item) => requests.some((request) => request.from === item.usernameKey)).map(publicAccount);
  const rooms = data.rooms.filter((item) => item.creatorKey === usernameKey || item.members?.some((member) => roomMemberKey(member) === usernameKey)).sort(byNewest);
  return composeSocial(account, friends, requesters, requests, rooms, data.messages);
}

function composeSocial(account, friends, requesters, requests, rooms, allMessages) {
  const dismissed = new Set(account.dismissedNotificationIds || []);
  const clearedAt = account.notificationsClearedAt ? asDate(account.notificationsClearedAt) : 0;
  const inviteNotifications = rooms.filter((room) => room.creatorKey !== account.usernameKey && room.members?.some((member) => roomMemberKey(member) === account.usernameKey)).map((room) => ({ id: `invite-${room.id}-${account.usernameKey}`, type: 'room-invite', to: account.usernameKey, from: room.creatorKey, roomId: room.id, read: false, createdAt: room.createdAt }));
  const unreadByRoom = new Map();
  allMessages.filter((message) => rooms.some((room) => room.id === message.roomId) && message.author !== account.username && !(message.seenBy || []).some((seen) => seen.username === account.username)).sort(byNewest).forEach((message) => { if (!unreadByRoom.has(message.roomId)) unreadByRoom.set(message.roomId, message); });
  const messageNotifications = [...unreadByRoom].map(([roomId, message]) => {
    const room = rooms.find((item) => item.id === roomId);
    return { id: `message-${roomId}-${account.usernameKey}`, type: 'room-message', to: account.usernameKey, from: accountKey(message.author), roomId, roomName: room?.name || 'Room', read: false, createdAt: message.createdAt };
  });
  const notifications = [...inviteNotifications, ...messageNotifications].filter((item) => !dismissed.has(item.id) && (!clearedAt || asDate(item.createdAt) > clearedAt));
  return { account: publicAccount(account), friends, requesters, requests, rooms, notifications };
}

export async function dismissNotification(username, id) {
  const usernameKey = accountKey(username);
  if (db) return (await db.collection('accounts').updateOne({ usernameKey }, { $addToSet: { dismissedNotificationIds: id } })).matchedCount > 0;
  const data = await readLocal(); const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) return false;
  account.dismissedNotificationIds = [...new Set([...(account.dismissedNotificationIds || []), id])]; await writeLocal(data); return true;
}

export async function clearNotifications(username) {
  const usernameKey = accountKey(username);
  if (db) return (await db.collection('accounts').updateOne({ usernameKey }, { $set: { notificationsClearedAt: new Date() } })).matchedCount > 0;
  const data = await readLocal(); const account = data.accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) return false;
  account.notificationsClearedAt = new Date(); await writeLocal(data); return true;
}

export async function areFriends(username, friend) {
  const usernameKey = accountKey(username); const friendKey = accountKey(friend);
  if (usernameKey === friendKey) return true;
  if (db) {
    const account = await db.collection('accounts').findOne({ usernameKey }, { projection: { friends: 1 } });
    return Boolean(account?.friends?.includes(friendKey));
  }
  const account = (await readLocal()).accounts.find((item) => item.usernameKey === usernameKey);
  return Boolean(account?.friends?.includes(friendKey));
}

export async function createFriendRequest(from, to) {
  const fromKey = accountKey(from); const toKey = accountKey(to);
  if (db) {
    const [target, sender] = await Promise.all([db.collection('accounts').findOne({ usernameKey: toKey }), db.collection('accounts').findOne({ usernameKey: fromKey })]);
    if (!target || !sender) return null;
    const existing = await db.collection('friendRequests').findOne({ from: fromKey, to: toKey, status: 'pending' });
    if (existing) return existing;
    const request = { id: crypto.randomUUID(), from: fromKey, fromName: sender.username, to: toKey, toName: target.username, status: 'pending', createdAt: new Date() };
    await db.collection('friendRequests').insertOne(request); return request;
  }
  const data = await readLocal(); const target = data.accounts.find((item) => item.usernameKey === toKey); const sender = data.accounts.find((item) => item.usernameKey === fromKey);
  if (!target || !sender) return null;
  const existing = data.friendRequests.find((item) => item.from === fromKey && item.to === toKey && item.status === 'pending');
  if (existing) return existing;
  const request = { id: crypto.randomUUID(), from: fromKey, fromName: sender.username, to: toKey, toName: target.username, status: 'pending', createdAt: new Date() };
  data.friendRequests.push(request); await writeLocal(data); return request;
}

export async function answerFriendRequest(id, username, accepted) {
  const usernameKey = accountKey(username);
  if (db) {
    const request = await db.collection('friendRequests').findOne({ id, to: usernameKey, status: 'pending' });
    if (!request) return null;
    await db.collection('friendRequests').updateOne({ id }, { $set: { status: accepted ? 'accepted' : 'rejected', answeredAt: new Date() } });
    if (accepted) await Promise.all([db.collection('accounts').updateOne({ usernameKey: request.from }, { $addToSet: { friends: request.to } }), db.collection('accounts').updateOne({ usernameKey: request.to }, { $addToSet: { friends: request.from } })]);
    return request;
  }
  const data = await readLocal(); const request = data.friendRequests.find((item) => item.id === id && item.to === usernameKey && item.status === 'pending');
  if (!request) return null;
  request.status = accepted ? 'accepted' : 'rejected'; request.answeredAt = new Date();
  if (accepted) {
    const sender = data.accounts.find((item) => item.usernameKey === request.from); const recipient = data.accounts.find((item) => item.usernameKey === request.to);
    if (sender) sender.friends = [...new Set([...(sender.friends || []), request.to])];
    if (recipient) recipient.friends = [...new Set([...(recipient.friends || []), request.from])];
  }
  await writeLocal(data); return request;
}

export async function removeFriend(username, friend) {
  const usernameKey = accountKey(username); const friendKey = accountKey(friend);
  if (db) {
    const result = await db.collection('accounts').updateOne({ usernameKey }, { $pull: { friends: friendKey } });
    await db.collection('accounts').updateOne({ usernameKey: friendKey }, { $pull: { friends: usernameKey } });
    return result.matchedCount > 0;
  }
  const data = await readLocal(); const account = data.accounts.find((item) => item.usernameKey === usernameKey); const target = data.accounts.find((item) => item.usernameKey === friendKey);
  if (!account) return false;
  account.friends = (account.friends || []).filter((item) => item !== friendKey);
  if (target) target.friends = (target.friends || []).filter((item) => item !== usernameKey);
  await writeLocal(data); return true;
}

export async function createRoom(room) {
  const saved = { ...room, createdAt: new Date() };
  if (db) { await db.collection('rooms').insertOne(saved); return saved; }
  const data = await readLocal(); data.rooms.push(saved); await writeLocal(data); return saved;
}
export async function getRoom(id) {
  if (db) return db.collection('rooms').findOne({ id }, { projection: { _id: 0 } });
  return (await readLocal()).rooms.find((room) => room.id === id) || null;
}
export async function deleteRoom(id, creatorKey) {
  if (db) return (await db.collection('rooms').deleteOne({ id, creatorKey })).deletedCount > 0;
  const data = await readLocal(); const before = data.rooms.length; data.rooms = data.rooms.filter((room) => !(room.id === id && room.creatorKey === creatorKey)); if (data.rooms.length === before) return false; data.messages = data.messages.filter((message) => message.roomId !== id); await writeLocal(data); return true;
}
export async function deleteRoomAny(id) {
  if (db) {
    const room = await db.collection('rooms').findOne({ id }, { projection: { _id: 0 } }); if (!room) return null;
    await Promise.all([db.collection('rooms').deleteOne({ id }), db.collection('messages').deleteMany({ roomId: id })]); return room;
  }
  const data = await readLocal(); const room = data.rooms.find((item) => item.id === id); if (!room) return null;
  data.rooms = data.rooms.filter((item) => item.id !== id); data.messages = data.messages.filter((message) => message.roomId !== id); await writeLocal(data); return room;
}
export async function clearRoomMessages(roomId) {
  if (db) return (await db.collection('messages').deleteMany({ roomId })).deletedCount;
  const data = await readLocal(); const before = data.messages.length; data.messages = data.messages.filter((message) => message.roomId !== roomId); await writeLocal(data); return before - data.messages.length;
}
export async function kickRoomMember(id, creatorKey, memberKey) {
  if (db) return (await db.collection('rooms').updateOne({ id, creatorKey }, { $pull: { members: { key: memberKey } } })).matchedCount > 0;
  const data = await readLocal(); const room = data.rooms.find((item) => item.id === id && item.creatorKey === creatorKey); if (!room) return false;
  const before = room.members?.length || 0; room.members = (room.members || []).filter((member) => roomMemberKey(member) !== accountKey(memberKey)); await writeLocal(data); return before !== room.members.length;
}
export async function getRoomMessages(roomId) {
  if (db) return db.collection('messages').find({ roomId }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).limit(300).toArray();
  return (await readLocal()).messages.filter((message) => message.roomId === roomId).sort(byOldest).slice(-300);
}
export async function addRoomMessage(message) {
  const saved = { ...message, createdAt: new Date(), seenBy: [{ username: message.author, seenAt: new Date() }] };
  if (db) { await db.collection('messages').insertOne(saved); return saved; }
  const data = await readLocal(); data.messages.push(saved); await writeLocal(data); return saved;
}
export async function markMessageSeen(roomId, messageId, username) {
  const seen = { username, seenAt: new Date() };
  if (db) {
    const result = await db.collection('messages').updateOne({ roomId, id: messageId, 'seenBy.username': { $ne: username } }, { $push: { seenBy: seen } }); return result.modifiedCount ? seen : null;
  }
  const data = await readLocal(); const message = data.messages.find((item) => item.roomId === roomId && item.id === messageId && !(item.seenBy || []).some((entry) => entry.username === username));
  if (!message) return null;
  message.seenBy = [...(message.seenBy || []), seen]; await writeLocal(data); return seen;
}

export async function getAdminDashboard() {
  if (db) {
    const [users, rooms, recentMessages] = await Promise.all([db.collection('accounts').find({}, { projection: { _id: 0, passwordHash: 0, pinHash: 0, dismissedNotificationIds: 0 } }).sort({ createdAt: -1 }).toArray(), db.collection('rooms').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(), db.collection('messages').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(60).toArray()]);
    const counts = await db.collection('messages').aggregate([{ $group: { _id: '$roomId', count: { $sum: 1 } } }]).toArray(); const messageCounts = Object.fromEntries(counts.map((item) => [item._id, item.count]));
    return { users, rooms: rooms.map((room) => ({ ...room, messageCount: messageCounts[room.id] || 0 })), recentMessages };
  }
  const data = await readLocal(); const messageCounts = Object.fromEntries(data.rooms.map((room) => [room.id, data.messages.filter((message) => message.roomId === room.id).length]));
  return { users: data.accounts.map(publicAccount).sort(byNewest), rooms: data.rooms.map((room) => ({ ...room, messageCount: messageCounts[room.id] || 0 })).sort(byNewest), recentMessages: [...data.messages].sort(byNewest).slice(0, 60) };
}

export async function recordUser(username) {
  const usernameKey = accountKey(username);
  if (db) { await db.collection('users').updateOne({ usernameKey }, { $setOnInsert: { username, usernameKey, timeZone: 'Asia/Kuala_Lumpur', createdAt: new Date() } }, { upsert: true }); return; }
  const data = await readLocal();
  if (!data.users.some((user) => accountKey(user.username) === usernameKey)) { data.users.push({ username, usernameKey, timeZone: 'Asia/Kuala_Lumpur', createdAt: new Date() }); await writeLocal(data); }
}

export async function getPlans(username) {
  const usernameKey = accountKey(username);
  if (db) return db.collection('plans').find({ usernameKey }, { projection: { _id: 0, usernameKey: 0 } }).sort({ date: 1, startTime: 1 }).toArray();
  return (await readLocal()).plans.filter((plan) => accountKey(plan.username) === usernameKey).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).map(withoutInternalPlan);
}
export async function addPlan(plan) {
  const saved = { ...plan, usernameKey: accountKey(plan.username), createdAt: new Date() };
  if (db) await db.collection('plans').insertOne(saved);
  else { const data = await readLocal(); data.plans.push(saved); await writeLocal(data); }
  return withoutInternalPlan(saved);
}
export async function getCachedGeocode(queryKey) {
  if (db) return db.collection('geocodes').findOne({ queryKey }, { projection: { _id: 0 } });
  return (await readLocal()).geocodes.find((entry) => entry.queryKey === queryKey) || null;
}
export async function saveCachedGeocode(entry) {
  if (db) { await db.collection('geocodes').updateOne({ queryKey: entry.queryKey }, { $set: entry }, { upsert: true }); return entry; }
  const data = await readLocal(); const index = data.geocodes.findIndex((item) => item.queryKey === entry.queryKey); if (index === -1) data.geocodes.push(entry); else data.geocodes[index] = entry; await writeLocal(data); return entry;
}
export async function updatePlan(id, changes, username = '') {
  const usernameKey = accountKey(username);
  if (db) {
    const result = await db.collection('plans').findOneAndUpdate({ id, ...(usernameKey ? { usernameKey } : {}) }, { $set: changes }, { returnDocument: 'after', projection: { _id: 0, usernameKey: 0 } }); return result || null;
  }
  const data = await readLocal(); const plan = data.plans.find((item) => item.id === id && (!usernameKey || accountKey(item.username) === usernameKey)); if (!plan) return null;
  Object.assign(plan, changes); await writeLocal(data); return withoutInternalPlan(plan);
}
export async function removePlan(id, username = '') {
  const usernameKey = accountKey(username);
  if (db) return (await db.collection('plans').deleteOne({ id, ...(usernameKey ? { usernameKey } : {}) })).deletedCount > 0;
  const data = await readLocal(); const before = data.plans.length; data.plans = data.plans.filter((plan) => !(plan.id === id && (!usernameKey || accountKey(plan.username) === usernameKey))); if (data.plans.length === before) return false; await writeLocal(data); return true;
}
