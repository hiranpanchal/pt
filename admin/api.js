/**
 * LHPT API Client
 * Replaces localStorage with real API calls.
 * All admin pages include this script.
 */
(function() {
  const BASE = '';   // same origin — Railway serves everything

  function getToken() {
    return localStorage.getItem('lhpt_auth');
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    };
  }

  function requireLogin() {
    localStorage.removeItem('lhpt_auth');
    window.location.href = '/admin/login.html';
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(BASE + path, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) }
    });
    if (res.status === 401) { requireLogin(); return null; }
    if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
    return res.json();
  }

  // ── Clients ─────────────────────────────────────────────────────────────────

  async function loadClients() {
    const clients = await apiFetch('/api/clients');
    return clients || [];
  }

  async function saveClients(clients) {
    await apiFetch('/api/clients', {
      method: 'PUT',
      body: JSON.stringify(clients)
    });
  }

  async function saveClient(client) {
    await apiFetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify(client)
    });
  }

  async function addClient(client) {
    return apiFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify(client)
    });
  }

  async function deleteClient(id) {
    await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  async function loadEvents() {
    const events = await apiFetch('/api/events');
    return events || [];
  }

  async function saveEvents(events) {
    await apiFetch('/api/events', {
      method: 'PUT',
      body: JSON.stringify(events)
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async function login(email, password) {
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) return null;
    const { token } = await res.json();
    localStorage.setItem('lhpt_auth', token);
    return token;
  }

  function logout() {
    localStorage.removeItem('lhpt_auth');
    window.location.href = '/admin/login.html';
  }

  function isLoggedIn() {
    return !!getToken();
  }

  // ── Expose ──────────────────────────────────────────────────────────────────
  window.LHPT_API = {
    loadClients, saveClients, saveClient, addClient, deleteClient,
    loadEvents, saveEvents,
    login, logout, isLoggedIn, requireLogin
  };
})();
