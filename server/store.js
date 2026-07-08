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

async function readLocal() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return { users: [], plans: [] }; }
}

async function writeLocal(data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

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

export async function createAccount({ username, password, pin }) {
  if (!db) throw new Error('Accounts require MongoDB.');
  const usernameKey = username.toLowerCase();
  const account = { id: crypto.randomUUID(), username, usernameKey, passwordHash: secretHash(password), pinHash: secretHash(pin), friends: [], presence: 'online', online: true, lastSeen: new Date(), lastActive: new Date(), createdAt: new Date() };
  await db.collection('accounts').insertOne(account);
  return publicAccount(account);
}

export async function loginAccount(username, pin) {
  if (!db) throw new Error('Accounts require MongoDB.');
  const account = await db.collection('accounts').findOne({ usernameKey: username.toLowerCase() });
  if (!account || !verifySecret(pin, account.pinHash)) return null;
  await db.collection('accounts').updateOne({ _id: account._id }, { $set: { presence: 'online', online: true, lastSeen: new Date(), lastActive: new Date() } });
  return publicAccount({ ...account, presence: 'online', online: true, lastSeen: new Date(), lastActive: new Date() });
}

export async function resetAccountPin(username, password, pin) {
  const account = await db.collection('accounts').findOne({ usernameKey: username.toLowerCase() });
  if (!account || !verifySecret(password, account.passwordHash)) return false;
  await db.collection('accounts').updateOne({ _id: account._id }, { $set: { pinHash: secretHash(pin), updatedAt: new Date() } });
  return true;
}

export async function accountExists(username) { return Boolean(await db.collection('accounts').findOne({ usernameKey: username.toLowerCase() }, { projection: { _id: 1 } })); }
export async function setAccountPresence(username, status) {
  const usernameKey = username.toLowerCase();
  const before = await db.collection('accounts').findOne({ usernameKey }, { projection: { presence: 1 } });
  const now = new Date(); const update = { $set: { presence: status, online: status !== 'offline', lastSeen: now, ...(status === 'online' ? { lastActive: now } : {}) }, ...(status === 'offline' ? { $unset: { currentLocation: '' } } : {}) }; const account = await db.collection('accounts').findOneAndUpdate({ usernameKey }, update, { returnDocument: 'after', projection: { friends: 1, username: 1 } });
  return { friends: account?.friends || [], changed: before?.presence !== status };
}
export async function updateAccountLocation(username, location) {
  const usernameKey = username.toLowerCase(); const positioned = { ...location, updatedAt: new Date() }; const account = await db.collection('accounts').findOneAndUpdate({ usernameKey }, { $set: { currentLocation: positioned, lastKnownLocation: positioned } }, { returnDocument: 'after', projection: { username: 1, friends: 1, currentLocation: 1 } });
  return account ? { username: account.username, friends: account.friends || [], location: account.currentLocation } : null;
}
export async function clearAccountLocation(username) { await db.collection('accounts').updateOne({ usernameKey: username.toLowerCase() }, { $unset: { currentLocation: '' } }); }
export async function getLiveLocations(username) {
  const account = await db.collection('accounts').findOne({ usernameKey: username.toLowerCase() }); if (!account) return [];
  const accounts = await db.collection('accounts').find({ usernameKey: { $in: [account.usernameKey, ...(account.friends || [])] }, $or: [{ currentLocation: { $exists: true } }, { lastKnownLocation: { $exists: true } }] }, { projection: { _id: 0, username: 1, usernameKey: 1, presence: 1, currentLocation: 1, lastKnownLocation: 1, lastSeen: 1 } }).toArray();
  return accounts.map(({ lastKnownLocation, ...entry }) => ({ ...entry, currentLocation: entry.currentLocation || lastKnownLocation, locationLive: Boolean(entry.currentLocation) && entry.presence !== 'offline' }));
}

export async function getSocial(username) {
  const usernameKey = username.toLowerCase();
  const account = await db.collection('accounts').findOne({ usernameKey });
  if (!account) return null;
  const [friends, requests, rooms] = await Promise.all([
    db.collection('accounts').find({ usernameKey: { $in: account.friends || [] } }, { projection: { _id: 0, passwordHash: 0, pinHash: 0 } }).toArray(),
    db.collection('friendRequests').find({ to: usernameKey, status: 'pending' }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    db.collection('rooms').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray()
  ]);
  const requesters = requests.length ? await db.collection('accounts').find({ usernameKey: { $in: requests.map((request) => request.from) } }, { projection: { _id: 0, passwordHash: 0, pinHash: 0 } }).toArray() : [];
  const dismissed = new Set(account.dismissedNotificationIds || []); const clearedAt = account.notificationsClearedAt ? new Date(account.notificationsClearedAt) : null;
  const notifications = rooms.filter((room) => room.creatorKey !== usernameKey && room.members?.some((member) => member.key === usernameKey)).map((room) => ({ id: `invite-${room.id}-${usernameKey}`, type: 'room-invite', to: usernameKey, from: room.creatorKey, roomId: room.id, read: false, createdAt: room.createdAt })).filter((item) => !dismissed.has(item.id) && (!clearedAt || new Date(item.createdAt) > clearedAt));
  return { account: publicAccount(account), friends, requesters, requests, rooms, notifications };
}
export async function dismissNotification(username, id) { return (await db.collection('accounts').updateOne({ usernameKey: username.toLowerCase() }, { $addToSet: { dismissedNotificationIds: id } })).matchedCount > 0; }
export async function clearNotifications(username) { return (await db.collection('accounts').updateOne({ usernameKey: username.toLowerCase() }, { $set: { notificationsClearedAt: new Date() } })).matchedCount > 0; }

export async function createFriendRequest(from, to) {
  const [target, sender] = await Promise.all([db.collection('accounts').findOne({ usernameKey: to }), db.collection('accounts').findOne({ usernameKey: from })]);
  if (!target || !sender) return null;
  const existing = await db.collection('friendRequests').findOne({ from, to, status: 'pending' });
  if (existing) return publicAccount(existing);
  const request = { id: crypto.randomUUID(), from, fromName: sender.username, to, toName: target.username, status: 'pending', createdAt: new Date() };
  await db.collection('friendRequests').insertOne(request); return request;
}

export async function answerFriendRequest(id, username, accepted) {
  const request = await db.collection('friendRequests').findOne({ id, to: username.toLowerCase(), status: 'pending' });
  if (!request) return null;
  await db.collection('friendRequests').updateOne({ id }, { $set: { status: accepted ? 'accepted' : 'rejected', answeredAt: new Date() } });
  if (accepted) await Promise.all([
    db.collection('accounts').updateOne({ usernameKey: request.from }, { $addToSet: { friends: request.to } }),
    db.collection('accounts').updateOne({ usernameKey: request.to }, { $addToSet: { friends: request.from } })
  ]);
  return request;
}

export async function removeFriend(username, friend) {
  const usernameKey = username.toLowerCase(); const friendKey = friend.toLowerCase();
  const result = await db.collection('accounts').updateOne({ usernameKey }, { $pull: { friends: friendKey } });
  await db.collection('accounts').updateOne({ usernameKey: friendKey }, { $pull: { friends: usernameKey } });
  return result.matchedCount > 0;
}

export async function createRoom(room) { await db.collection('rooms').insertOne({ ...room, createdAt: new Date() }); return room; }
export async function getRoom(id) { return db.collection('rooms').findOne({ id }, { projection: { _id: 0 } }); }
export async function deleteRoom(id, creatorKey) { return (await db.collection('rooms').deleteOne({ id, creatorKey })).deletedCount > 0; }
export async function kickRoomMember(id, creatorKey, memberKey) {
  const result = await db.collection('rooms').updateOne({ id, creatorKey }, { $pull: { members: { key: memberKey } } });
  return result.matchedCount > 0;
}
export async function getRoomMessages(roomId) { return db.collection('messages').find({ roomId }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).limit(300).toArray(); }
export async function addRoomMessage(message) { const saved = { ...message, createdAt: new Date(), seenBy: [{ username: message.author, seenAt: new Date() }] }; await db.collection('messages').insertOne(saved); return saved; }
export async function markMessageSeen(roomId, messageId, username) {
  const seen = { username, seenAt: new Date() };
  const result = await db.collection('messages').updateOne({ roomId, id: messageId, 'seenBy.username': { $ne: username } }, { $push: { seenBy: seen } });
  return result.modifiedCount ? seen : null;
}

export async function recordUser(username) {
  const usernameKey = username.toLowerCase();
  if (db) {
    await db.collection('users').updateOne({ usernameKey }, { $setOnInsert: { username, usernameKey, timeZone: 'Asia/Kuala_Lumpur', createdAt: new Date() } }, { upsert: true });
    return;
  }
  const data = await readLocal();
  if (!data.users.some((u) => u.username.toLowerCase() === usernameKey)) {
    data.users.push({ username, usernameKey, timeZone: 'Asia/Kuala_Lumpur', createdAt: new Date().toISOString() });
    await writeLocal(data);
  }
}

export async function getPlans(username) {
  const usernameKey = username.toLowerCase();
  if (db) return db.collection('plans').find({ usernameKey }, { projection: { _id: 0, usernameKey: 0 } }).sort({ date: 1, startTime: 1 }).toArray();
  return (await readLocal()).plans.filter((p) => p.username.toLowerCase() === usernameKey);
}

export async function addPlan(plan) {
  if (db) await db.collection('plans').insertOne({ ...plan, usernameKey: plan.username.toLowerCase(), createdAt: new Date() });
  else { const data = await readLocal(); data.plans.push(plan); await writeLocal(data); }
  return plan;
}

export async function getCachedGeocode(queryKey) { return db ? db.collection('geocodes').findOne({ queryKey }, { projection: { _id: 0 } }) : null; }
export async function saveCachedGeocode(entry) { if (db) await db.collection('geocodes').updateOne({ queryKey: entry.queryKey }, { $set: entry }, { upsert: true }); return entry; }

export async function updatePlan(id, changes) {
  if (db) {
    const result = await db.collection('plans').findOneAndUpdate({ id }, { $set: changes }, { returnDocument: 'after', projection: { _id: 0, usernameKey: 0 } });
    return result || null;
  }
  const data = await readLocal();
  const plan = data.plans.find((p) => p.id === id);
  if (!plan) return null;
  Object.assign(plan, changes); await writeLocal(data); return plan;
}

export async function removePlan(id) {
  if (db) return (await db.collection('plans').deleteOne({ id })).deletedCount > 0;
  const data = await readLocal(); const before = data.plans.length;
  data.plans = data.plans.filter((p) => p.id !== id); await writeLocal(data);
  return data.plans.length < before;
}
