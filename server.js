const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

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
  'https://leehaywardpt.co.uk',
  'https://www.leehaywardpt.co.uk',
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

// Redirect naked domain to www
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host === 'leehaywardpt.co.uk') {
    return res.redirect(301, `https://www.leehaywardpt.co.uk${req.originalUrl}`);
  }
  next();
});

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
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_name TEXT NOT NULL,
      from_email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      read BOOLEAN DEFAULT FALSE,
      starred BOOLEAN DEFAULT FALSE,
      replied_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS sent_messages (
      id SERIAL PRIMARY KEY,
      to_email TEXT NOT NULL,
      to_name TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      reply_to_id INTEGER REFERENCES messages(id)
    );
    CREATE TABLE IF NOT EXISTS whatsapp_log (
      id SERIAL PRIMARY KEY,
      to_phone TEXT NOT NULL,
      client_name TEXT,
      event_id TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS client_password_resets (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
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
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

// Nodemailer transporter (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in Railway)
function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// POST /api/contact — public endpoint (replaces Formspree)
app.post('/api/contact', async (req, res) => {
  const { name, email, message, goal, phone, subject } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const subj = subject || (goal ? `New enquiry — ${goal}` : 'New contact form message');
    const body = [
      message,
      phone ? `\nPhone: ${phone}` : '',
      goal  ? `Goal: ${goal}` : ''
    ].filter(Boolean).join('\n');
    await pool.query(
      'INSERT INTO messages (from_name, from_email, subject, body) VALUES ($1,$2,$3,$4)',
      [name, email, subj, body]
    );
    // Notify Lee by email in the background (don't await — never block the response)
    const t = getTransporter();
    if (t) {
      t.sendMail({
        from: `"${name}" <${process.env.SMTP_USER}>`,
        replyTo: email,
        to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
        subject: `[LHPT] ${subj}`,
        text: `From: ${name} <${email}>\n\n${body}`
      }).catch(err => console.error('Notification email failed:', err));
    }
    res.json({ ok: true }); // respond immediately — email sends in background
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// GET /api/messages — inbox
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const folder = req.query.folder || 'inbox';
    if (folder === 'sent') {
      const result = await pool.query('SELECT * FROM sent_messages ORDER BY sent_at DESC');
      return res.json(result.rows);
    }
    const result = await pool.query('SELECT * FROM messages ORDER BY received_at DESC');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/messages/unread-count
app.get('/api/messages/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS n FROM messages WHERE read=FALSE');
    res.json({ count: parseInt(result.rows[0].n) });
  } catch (e) {
    res.json({ count: 0 });
  }
});

// PATCH /api/messages/:id — mark read/starred
app.patch('/api/messages/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { read, starred } = req.body;
  try {
    const sets = [];
    const vals = [];
    if (read !== undefined)    { sets.push(`read=$${vals.length+1}`);    vals.push(read); }
    if (starred !== undefined) { sets.push(`starred=$${vals.length+1}`); vals.push(starred); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(id);
    await pool.query(`UPDATE messages SET ${sets.join(',')} WHERE id=$${vals.length}`, vals);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/messages/:id
app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM messages WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/messages/send — compose or reply
app.post('/api/messages/send', requireAuth, async (req, res) => {
  const { to_email, to_name, subject, body, reply_to_id } = req.body;
  if (!to_email || !subject || !body) return res.status(400).json({ error: 'Missing fields' });
  const t = getTransporter();
  if (!t) return res.status(503).json({ error: 'SMTP not configured. Add SMTP_USER and SMTP_PASS in Railway environment variables.' });
  try {
    await t.sendMail({
      from: `"Lee Hayward PT" <${process.env.SMTP_USER}>`,
      to: to_name ? `"${to_name}" <${to_email}>` : to_email,
      bcc: process.env.SMTP_USER,
      subject,
      text: body
    });
    await pool.query(
      'INSERT INTO sent_messages (to_email, to_name, subject, body, reply_to_id) VALUES ($1,$2,$3,$4,$5)',
      [to_email, to_name || null, subject, body, reply_to_id || null]
    );
    if (reply_to_id) {
      await pool.query('UPDATE messages SET replied_at=NOW() WHERE id=$1', [reply_to_id]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Send failed:', e);
    res.status(500).json({ error: 'Failed to send email: ' + e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════════════════════════════════════════════

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  const twilio = require('twilio');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Normalise UK/international phone to E.164 (e.g. "+44 7700 123456" → "+447700123456")
function normalisePhone(raw) {
  if (!raw) return null;
  let p = raw.replace(/[\s\-().]/g, '');
  if (p.startsWith('07') && p.length === 11) p = '+44' + p.slice(1); // UK mobile shorthand
  if (!p.startsWith('+')) p = '+44' + p;
  return /^\+\d{7,15}$/.test(p) ? p : null;
}

async function sendWhatsAppMsg(toPhone, body) {
  const client = getTwilioClient();
  if (!client) throw new Error('WhatsApp not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM in Railway.');
  const from = (process.env.TWILIO_WHATSAPP_FROM || '+14155238886').replace('whatsapp:', '');
  const to   = normalisePhone(toPhone);
  if (!to) throw new Error('Invalid phone number: ' + toPhone);
  return client.messages.create({ from: `whatsapp:${from}`, to: `whatsapp:${to}`, body });
}

function buildReminderText(client, start) {
  const dateStr = start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const tomorrow = new Date(Date.now() + 86400000);
  const isTomorrow = tomorrow.toDateString() === start.toDateString();
  const isToday    = new Date().toDateString() === start.toDateString();
  const when = isTomorrow ? 'tomorrow' : isToday ? 'today' : `on ${dateStr}`;
  return `Hi ${client.firstName}! 👋\n\nJust a reminder from Lee Hayward PT that your session is confirmed ${when}:\n\n📅 ${dateStr}\n⏰ ${timeStr}\n\nSee you then! 💪\n\n– Lee Hayward PT`;
}

// POST /api/whatsapp/remind — send a reminder for a specific client + session
app.post('/api/whatsapp/remind', requireAuth, async (req, res) => {
  const { clientId, eventId, eventStart } = req.body;
  if (!clientId || !eventStart) return res.status(400).json({ error: 'Missing clientId or eventStart' });
  try {
    const { rows } = await pool.query('SELECT data FROM clients WHERE id=$1', [parseInt(clientId)]);
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    const client = rows[0].data;
    if (!client.phone) return res.status(400).json({ error: 'Client has no phone number saved' });
    const start   = new Date(eventStart);
    const message = buildReminderText(client, start);
    await sendWhatsAppMsg(client.phone, message);
    await pool.query(
      'INSERT INTO whatsapp_log (to_phone, client_name, event_id, message) VALUES ($1,$2,$3,$4)',
      [normalisePhone(client.phone), `${client.firstName} ${client.lastName}`, eventId || null, message]
    );
    res.json({ ok: true, to: `${client.firstName} ${client.lastName}`, phone: normalisePhone(client.phone) });
  } catch (e) {
    console.error('WhatsApp remind error:', e.message);
    const code = e.message.includes('not configured') ? 503 : 500;
    res.status(code).json({ error: e.message });
  }
});

// POST /api/whatsapp/send — freeform send (manual compose)
app.post('/api/whatsapp/send', requireAuth, async (req, res) => {
  const { phone, clientName, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
  try {
    await sendWhatsAppMsg(phone, message);
    await pool.query(
      'INSERT INTO whatsapp_log (to_phone, client_name, message) VALUES ($1,$2,$3)',
      [normalisePhone(phone) || phone, clientName || null, message]
    );
    res.json({ ok: true });
  } catch (e) {
    const code = e.message.includes('not configured') ? 503 : 500;
    res.status(code).json({ error: e.message });
  }
});

// GET /api/whatsapp/log — see recent sends
app.get('/api/whatsapp/log', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM whatsapp_log ORDER BY sent_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Daily session reminder cron — runs 08:00 UK time ─────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[WhatsApp Cron] Running daily session reminders…');
  if (!getTwilioClient()) {
    console.log('[WhatsApp Cron] Twilio not configured — skipping');
    return;
  }
  try {
    const tomorrow   = new Date(Date.now() + 86400000);
    const dayStart   = new Date(tomorrow); dayStart.setHours(0, 0, 0, 0);
    const dayEnd     = new Date(tomorrow); dayEnd.setHours(23, 59, 59, 999);

    const evRes  = await pool.query('SELECT data FROM events');
    const clRes  = await pool.query('SELECT data FROM clients');
    const events  = evRes.rows.map(r => r.data);
    const clients = clRes.rows.map(r => r.data);

    const tomorrowEvents = events.filter(ev => {
      const s = new Date(ev.start);
      return s >= dayStart && s <= dayEnd;
    });

    console.log(`[WhatsApp Cron] ${tomorrowEvents.length} sessions tomorrow`);

    for (const ev of tomorrowEvents) {
      const clientId = ev.extendedProps?.clientId;
      if (!clientId) continue;
      const client = clients.find(c => c.id === clientId);
      if (!client?.phone) continue;

      // Skip if already reminded for this event
      const { rows } = await pool.query(
        "SELECT id FROM whatsapp_log WHERE event_id=$1 AND status='sent'", [ev.id]
      );
      if (rows.length) { console.log(`[WhatsApp Cron] Already reminded for event ${ev.id}`); continue; }

      const start   = new Date(ev.start);
      const message = buildReminderText(client, start);
      try {
        await sendWhatsAppMsg(client.phone, message);
        await pool.query(
          'INSERT INTO whatsapp_log (to_phone, client_name, event_id, message) VALUES ($1,$2,$3,$4)',
          [normalisePhone(client.phone), `${client.firstName} ${client.lastName}`, ev.id, message]
        );
        console.log(`[WhatsApp Cron] ✓ Reminded ${client.firstName} ${client.lastName}`);
      } catch (err) {
        console.error(`[WhatsApp Cron] ✗ Failed for ${client.firstName}:`, err.message);
        await pool.query(
          "INSERT INTO whatsapp_log (to_phone, client_name, event_id, message, status) VALUES ($1,$2,$3,$4,'failed')",
          [client.phone, `${client.firstName} ${client.lastName}`, ev.id, message]
        );
      }
    }
  } catch (err) {
    console.error('[WhatsApp Cron] Error:', err);
  }
}, { timezone: 'Europe/London' });

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT PORTAL AUTH
// ═══════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function requireClientAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (payload.role !== 'client') return res.status(403).json({ error: 'Forbidden' });
    req.clientId = payload.clientId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /api/client/login
app.post('/api/client/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const { rows } = await pool.query(
      "SELECT data FROM clients WHERE lower(data->>'email') = lower($1)", [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const client = rows[0].data;
    if (!client.clientPassword) return res.status(401).json({ error: 'No portal access set up yet. Please contact Lee.' });
    const valid = await bcrypt.compare(password, client.clientPassword);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ clientId: client.id, role: 'client' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, clientId: client.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/client/forgot-password
app.post('/api/client/forgot-password', loginRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });
  // Always respond OK to prevent email enumeration
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
  try {
    const { rows } = await pool.query(
      "SELECT data FROM clients WHERE lower(data->>'email') = lower($1)", [email]
    );
    if (!rows.length) return;
    const client = rows[0].data;
    if (!client.clientPassword) return; // no portal access, don't send reset
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await pool.query(
      'INSERT INTO client_password_resets (client_id, token, expires_at) VALUES ($1,$2,$3)',
      [client.id, token, expires]
    );
    const t = getTransporter();
    if (!t) return;
    const resetUrl = `https://www.leehaywardpt.co.uk/client-reset-password.html?token=${token}`;
    await t.sendMail({
      from: `"Lee Hayward PT" <${process.env.SMTP_USER}>`,
      to: client.email,
      subject: 'Reset your Lee Hayward PT portal password',
      text: `Hi ${client.firstName},\n\nClick the link below to reset your portal password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you didn't request this, please ignore this email.\n\n– Lee Hayward PT`
    });
  } catch (e) {
    console.error('Forgot password error:', e);
  }
});

// POST /api/client/reset-password
app.post('/api/client/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM client_password_resets WHERE token=$1 AND used=FALSE AND expires_at > NOW()',
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    const reset = rows[0];
    const hashed = await bcrypt.hash(password, 12);
    // Update client password
    const existing = await pool.query('SELECT data FROM clients WHERE id=$1', [reset.client_id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Client not found' });
    const merged = { ...existing.rows[0].data, clientPassword: hashed };
    await pool.query('UPDATE clients SET data=$1, updated_at=NOW() WHERE id=$2', [merged, reset.client_id]);
    // Mark token used
    await pool.query('UPDATE client_password_resets SET used=TRUE WHERE id=$1', [reset.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/client/me — returns client's own safe data
app.get('/api/client/me', requireClientAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM clients WHERE id=$1', [req.clientId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const c = rows[0].data;
    // Strip sensitive admin-only fields
    const { clientPassword, countedEventIds, ...safe } = c;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/client/sessions — returns upcoming sessions for this client
app.get('/api/client/sessions', requireClientAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM events');
    const now = new Date();
    const sessions = rows
      .map(r => r.data)
      .filter(ev => ev.extendedProps?.clientId === req.clientId && new Date(ev.start) >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 10)
      .map(({ id, title, start, end, classNames, extendedProps }) =>
        ({ id, title, start, end, classNames, type: extendedProps?.type })
      );
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/set-client-password — admin sets a client's portal password
app.post('/api/admin/set-client-password', requireAuth, async (req, res) => {
  const { clientId, password } = req.body;
  if (!clientId || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const existing = await pool.query('SELECT data FROM clients WHERE id=$1', [parseInt(clientId)]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Client not found' });
    const hashed = await bcrypt.hash(password, 12);
    const merged = { ...existing.rows[0].data, clientPassword: hashed };
    await pool.query('UPDATE clients SET data=$1, updated_at=NOW() WHERE id=$2', [merged, parseInt(clientId)]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATCH-ALL — serve HTML files for non-API routes
// ═══════════════════════════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    // Serve specific HTML files if they exist, otherwise fall back to index.html
    const htmlFiles = ['client-login', 'client-portal', 'client-forgot-password', 'client-reset-password'];
    const name = req.path.replace('/', '').replace('.html', '');
    if (htmlFiles.includes(name)) {
      return res.sendFile(path.join(__dirname, `${name}.html`));
    }
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
