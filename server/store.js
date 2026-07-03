import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ServerApiVersion } from 'mongodb';

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
