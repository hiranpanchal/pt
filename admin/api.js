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
    if (res.status === 401) {
      // Only redirect if we're not already on the login page
      if (!window.location.pathname.includes('login')) {
        requireLogin();
      }
      return null;
    }
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
    const t = getToken();
    // Must be a real JWT (three base64 parts), not the old 'authenticated' string
    return !!t && t.startsWith('eyJ') && t.split('.').length === 3;
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  async function loadMessages(folder = 'inbox') {
    return apiFetch(`/api/messages?folder=${folder}`) || [];
  }
  async function getUnreadCount() {
    const r = await apiFetch('/api/messages/unread-count');
    return r ? r.count : 0;
  }
  async function markMessage(id, updates) {
    return apiFetch(`/api/messages/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  }
  async function deleteMessage(id) {
    return apiFetch(`/api/messages/${id}`, { method: 'DELETE' });
  }
  async function sendMessage(payload) {
    return apiFetch('/api/messages/send', { method: 'POST', body: JSON.stringify(payload) });
  }

  // ── Unread badge (auto-loads on every admin page) ───────────────────────────
  async function refreshUnreadBadge() {
    const badge = document.getElementById('sidebarUnread');
    if (!badge) return;
    try {
      const count = await getUnreadCount();
      if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
      else { badge.style.display = 'none'; }
    } catch {}
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) refreshUnreadBadge();
  });

  // ── Expose ──────────────────────────────────────────────────────────────────
  window.LHPT_API = {
    loadClients, saveClients, saveClient, addClient, deleteClient,
    loadEvents, saveEvents,
    loadMessages, getUnreadCount, markMessage, deleteMessage, sendMessage,
    login, logout, isLoggedIn, requireLogin
  };
})();
