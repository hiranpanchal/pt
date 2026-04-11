const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'lhpt-dev-secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

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
  console.log('Database ready');
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail    = process.env.ADMIN_EMAIL    || 'coach@leehaywardpt.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';

  if (email !== adminEmail) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Support both plain text (env var) and bcrypt hash
  let valid = false;
  if (adminPassword.startsWith('$2')) {
    valid = await bcrypt.compare(password, adminPassword);
  } else {
    valid = password === adminPassword;
  }

  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET || 'lhpt-dev-secret',
    { expiresIn: '30d' }
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
