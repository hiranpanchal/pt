const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Startup secret check ───────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET env var is missing or too short. Set a strong random secret in Railway.');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD env var is not set. Set it in Railway environment variables.');
  process.exit(1);
}

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Rate limiter (login brute-force protection) ────────────────────────────────
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10;
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  loginAttempts.set(ip, entry);
  if (entry.count > maxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  next();
}
// Clean up old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// ── Middleware ─────────────────────────────────────────────────────────────────
// CORS — only allow requests from the same Railway domain
const allowedOrigins = [
  'https://lee-haywood-pt.up.railway.app',
  /\.railway\.app$/,
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow server-to-server / curl
    const allowed = allowedOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin));
    cb(allowed ? null : new Error('CORS blocked'), allowed);
  },
  credentials: true
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Demo seed data ────────────────────────────────────────────────────────────
const SEED_CLIENTS = [
  { id:1, firstName:'Marcus',  lastName:'Thorne',  email:'marcus.t@corporate.com',   phone:'+44 7700 900001', status:'active',     tier:'Elite Performance', program:'1-on-1 Training', joined:'2024-01-15', phase:'Hypertrophy',    progress:75, goal:'Build Muscle',          weight:92, targetWeight:95, strengthIndex:88, volumeConsistency:94, nutritionCompliance:82, personalBest:{lift:'Deadlift',          weight:260}, strengthGain:'+22%', paymentPlan:'block', sessionsRemaining:3, lastPaymentDate:'2026-03-01', countedEventIds:[], notes:'Highly motivated. Responds well to high volume. Watch lower back on deadlift days.',       weightHistory:[88,89,89.5,90,90.5,91,91.5,92,92,92.3,92.5,92], recentActivity:[], upcomingSchedule:[] },
  { id:2, firstName:'Sarah',   lastName:'Chen',    email:'s.chen.fit@gmail.com',     phone:'+44 7700 900002', status:'onboarding', tier:'Kinetic Lifestyle', program:'Online Coaching',  joined:'2024-03-01', phase:'Foundation',     progress:15, goal:'Fat Loss',              weight:68, targetWeight:62, strengthIndex:45, volumeConsistency:60, nutritionCompliance:55, personalBest:{lift:'Squat',             weight:80},  strengthGain:'+5%',  paymentPlan:'payg',  sessionsRemaining:null,lastPaymentDate:'2026-03-15', countedEventIds:[], notes:'New client, still calibrating. Nutrition logging needs improvement.',                     weightHistory:[70,69.5,69,68.5,68.5,68.2,68,68,67.8,68,67.5,68], recentActivity:[], upcomingSchedule:[] },
  { id:3, firstName:'Jameson', lastName:'Vane',    email:'vane.performance@web.io',  phone:'+44 7700 900003', status:'active',     tier:'Ultimate Cut',      program:'1-on-1 Training', joined:'2023-09-10', phase:'Cutting',        progress:92, goal:'Fat Loss / Aesthetics', weight:82, targetWeight:78, strengthIndex:91, volumeConsistency:97, nutritionCompliance:88, personalBest:{lift:'Bench Press',       weight:140}, strengthGain:'+18%', paymentPlan:'block', sessionsRemaining:1, lastPaymentDate:'2026-03-20', countedEventIds:[], notes:'Elite performer. Near end of cut phase. Transition to maintenance in ~3 weeks.',           weightHistory:[90,89,88,87,86,85.5,85,84.5,84,83,82.5,82], recentActivity:[], upcomingSchedule:[] },
  { id:4, firstName:'Elena',   lastName:'Petrov',  email:'petrov_e@mail.ru',         phone:'+44 7700 900004', status:'paused',     tier:'Recovery Elite',    program:'Online Coaching',  joined:'2023-06-20', phase:'Rehabilitation', progress:44, goal:'Post-Injury Recovery',  weight:65, targetWeight:65, strengthIndex:52, volumeConsistency:48, nutritionCompliance:72, personalBest:{lift:'Romanian Deadlift', weight:70},  strengthGain:'+8%',  paymentPlan:'payg',  sessionsRemaining:null,lastPaymentDate:'2026-02-10', countedEventIds:[], notes:'On pause due to travel. Resume April 20th. Lower back rehab protocol ongoing.',            weightHistory:[65,65.5,65.2,65,64.8,65,65.2,65.5,65,64.8,65,65], recentActivity:[], upcomingSchedule:[] },
  { id:5, firstName:'Tyler',   lastName:'Nash',    email:'tyler.nash@gmail.com',     phone:'+44 7700 900005', status:'active',     tier:'Elite Performance', program:'1-on-1 Training', joined:'2024-02-01', phase:'Strength Block', progress:60, goal:'Athletic Performance',  weight:88, targetWeight:90, strengthIndex:78, volumeConsistency:85, nutritionCompliance:76, personalBest:{lift:'Squat',             weight:200}, strengthGain:'+14%', paymentPlan:'block', sessionsRemaining:5, lastPaymentDate:'2026-04-01', countedEventIds:[], notes:'Former rugby player. Excellent base strength. Focus on hypertrophy accessory work.',      weightHistory:[86,86.5,87,87,87.5,88,88,88.5,88,88,88.5,88], recentActivity:[], upcomingSchedule:[] },
  { id:6, firstName:'Priya',   lastName:'Sharma',  email:'p.sharma.fit@outlook.com', phone:'+44 7700 900006', status:'active',     tier:'Kinetic Lifestyle', program:'Online Coaching',  joined:'2024-01-28', phase:'Recomposition',  progress:68, goal:'Body Recomposition',    weight:58, targetWeight:57, strengthIndex:70, volumeConsistency:78, nutritionCompliance:85, personalBest:{lift:'Hip Thrust',        weight:120}, strengthGain:'+16%', paymentPlan:'block', sessionsRemaining:2, lastPaymentDate:'2026-03-10', countedEventIds:[], notes:'Excellent nutrition compliance. Strength progressing well.',                                 weightHistory:[60,59.5,59,59,58.5,58.5,58,58,58,57.5,58,58], recentActivity:[], upcomingSchedule:[] }
];

// ── Init database ─────────────────────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed demo clients if table is empty
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM clients');
  if (parseInt(rows[0].n) === 0) {
    console.log('Seeding clients table with demo data…');
    for (const c of SEED_CLIENTS) {
      await pool.query(
        'INSERT INTO clients (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [c.id, c]
      );
    }
    console.log(`Seeded ${SEED_CLIENTS.length} demo clients`);
  }

  console.log('Database ready');
}

// Health check (no auth)
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Auth check (requires token)
app.get('/api/auth/check', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  const adminEmail    = process.env.ADMIN_EMAIL    || 'coach@leehaywardpt.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (email.toLowerCase() !== adminEmail.toLowerCase()) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Support both plain text and bcrypt hash
  let valid = false;
  if (adminPassword.startsWith('$2')) {
    valid = await bcrypt.compare(password, adminPassword);
  } else {
    valid = password === adminPassword;
  }

  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/clients — return all clients as array
app.get('/api/clients', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM clients ORDER BY (data->>\'id\')::int ASC');
    res.json(result.rows.map(r => r.data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/clients — replace entire clients collection
app.put('/api/clients', requireAuth, async (req, res) => {
  const clients = req.body;
  if (!Array.isArray(clients)) return res.status(400).json({ error: 'Expected array' });
  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM clients');
    for (const c of clients) {
      await pool.query(
        'INSERT INTO clients (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()',
        [c.id, c]
      );
    }
    await pool.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/clients — add a single client
app.post('/api/clients', requireAuth, async (req, res) => {
  const c = req.body;
  try {
    // Auto-assign ID if not provided
    if (!c.id) {
      const result = await pool.query('SELECT COALESCE(MAX((data->>\'id\')::int), 0) + 1 AS next_id FROM clients');
      c.id = result.rows[0].next_id;
    }
    await pool.query(
      'INSERT INTO clients (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()',
      [c.id, c]
    );
    res.json(c);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/clients/:id — update a single client
app.patch('/api/clients/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  try {
    const existing = await pool.query('SELECT data FROM clients WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    const merged = { ...existing.rows[0].data, ...updates };
    await pool.query('UPDATE clients SET data=$1, updated_at=NOW() WHERE id=$2', [merged, id]);
    res.json(merged);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/clients/:id
app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/events
app.get('/api/events', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM events ORDER BY updated_at ASC');
    res.json(result.rows.map(r => r.data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/events — replace all events
app.put('/api/events', requireAuth, async (req, res) => {
  const events = req.body;
  if (!Array.isArray(events)) return res.status(400).json({ error: 'Expected array' });
  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM events');
    for (const ev of events) {
      await pool.query(
        'INSERT INTO events (id, data) VALUES ($1, $2)',
        [ev.id || ev.title + ev.start, ev]
      );
    }
    await pool.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATCH-ALL — serve index.html for non-API routes
// ═══════════════════════════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => console.log(`Lee Hayward PT running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init database:', err);
  process.exit(1);
});
