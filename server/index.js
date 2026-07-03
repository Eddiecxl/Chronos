import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPlan, getPlans, initStore, recordUser, removePlan, updatePlan } from './store.js';

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim());
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); } }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: process.env.MONGODB_URI ? 'mongodb' : 'local', timeZone: 'Asia/Kuala_Lumpur' }));
app.post('/api/users', async (req, res) => {
  const username = String(req.body.username || '').trim().slice(0, 40);
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  await recordUser(username);
  res.status(201).json({ username });
});
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
