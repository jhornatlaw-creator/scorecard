window.App = window.App || {};

// Supabase client — lightweight, no SDK dependency
App.Supabase = (() => {
  const SUPABASE_URL = 'https://jgfhgvmnrlufntmvyzck.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZmhndm1ucmx1Zm50bXZ5emNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDc2MjgsImV4cCI6MjA4MzM4MzYyOH0.9l5XdY0nmNXCLyzHVizbNDiTggPsWIe1zFJmsqKWUNY';

  let session = null;  // { access_token, refresh_token, user }
  let refreshPromise = null;  // Singleton guard against concurrent refreshes

  function configured() {
    return SUPABASE_URL && SUPABASE_ANON;
  }

  // --- HTTP helpers ---
  async function api(path, opts = {}, _skipRetry = false) {
    const headers = {
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json',
      ...opts.headers,
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res = await fetch(`${SUPABASE_URL}${path}`, { ...opts, headers, signal: controller.signal });
    clearTimeout(timeout);

    // Auto-retry once on 401 with token refresh (skip for refresh calls to prevent recursion)
    if (!_skipRetry && res.status === 401 && session?.refresh_token) {
      const refreshed = await refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 15000);
        res = await fetch(`${SUPABASE_URL}${path}`, { ...opts, headers, signal: ctrl2.signal });
        clearTimeout(t2);
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || err.msg || res.statusText);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // --- Auth ---
  function loadSession() {
    try {
      const stored = localStorage.getItem('scorecard_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.access_token && typeof parsed.access_token === 'string' && parsed.user?.id) {
          session = parsed;
        } else {
          session = null;
          localStorage.removeItem('scorecard_session');
        }
      }
    } catch { session = null; }
    return session;
  }

  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem('scorecard_session', JSON.stringify(s));
    else localStorage.removeItem('scorecard_session');
  }

  async function signUp(email, password, displayName) {
    const data = await api('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({
        email, password,
        data: { display_name: displayName || email.split('@')[0] }
      }),
    });
    if (data.access_token) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    }
    return data;
  }

  async function signIn(email, password) {
    const data = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    }
    return data;
  }

  async function signOut() {
    if (session?.access_token) {
      try { await api('/auth/v1/logout', { method: 'POST' }); } catch {}
    }
    saveSession(null);
  }

  async function refreshToken() {
    if (!session?.refresh_token) return false;
    // Return existing in-flight refresh to prevent races
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const data = await api('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        }, true);  // skipRetry prevents infinite recursion
        if (data.access_token) {
          saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
          return true;
        }
      } catch {}
      saveSession(null);
      return false;
    })();
    try { return await refreshPromise; } finally { refreshPromise = null; }
  }

  function getUser() { return session?.user || null; }
  function isLoggedIn() { return !!session?.access_token; }

  // --- Scorecards CRUD (PostgREST) ---
  async function saveCard(card) {
    const user = getUser();
    if (!user) throw new Error('Not logged in');

    const row = {
      id: card.id,
      user_id: user.id,
      game_pk: card.gamePk || null,
      date: card.date,
      venue: card.venue || '',
      away_name: card.away.name,
      away_abbr: card.away.abbr,
      home_name: card.home.name,
      home_abbr: card.home.abbr,
      innings: card.innings,
      card_data: card,  // Store entire card as JSONB
      notes: card.notes || '',
      completed: card.completed || false,
    };

    return api('/rest/v1/scorecards', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(row),
    });
  }

  async function loadCards() {
    const user = getUser();
    if (!user) return [];
    const data = await api(`/rest/v1/scorecards?user_id=eq.${user.id}&order=date.desc&select=id,date,venue,away_abbr,home_abbr,completed,shared,share_slug,updated_at`);
    return data || [];
  }

  async function loadCard(id) {
    const user = getUser();
    const filter = user ? `id=eq.${id}&user_id=eq.${user.id}` : `id=eq.${id}`;
    const data = await api(`/rest/v1/scorecards?${filter}&select=card_data`);
    return data?.[0]?.card_data || null;
  }

  async function deleteCard(id) {
    const user = getUser();
    if (!user) throw new Error('Not logged in');
    return api(`/rest/v1/scorecards?id=eq.${id}&user_id=eq.${user.id}`, { method: 'DELETE' });
  }

  // --- Sharing ---
  async function shareCard(id) {
    const user = getUser();
    if (!user) throw new Error('Not logged in');
    // Return existing slug if already shared
    const existing = await api(`/rest/v1/scorecards?id=eq.${id}&user_id=eq.${user.id}&select=share_slug`);
    if (existing?.[0]?.share_slug) return existing[0].share_slug;
    // Generate slug with sufficient entropy (16 hex chars = 64 bits)
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const slug = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    await api(`/rest/v1/scorecards?id=eq.${id}&user_id=eq.${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ shared: true, share_slug: slug }),
    });
    return slug;
  }

  async function loadSharedCard(slug) {
    const data = await api(`/rest/v1/scorecards?share_slug=eq.${slug}&shared=eq.true&select=card_data,away_abbr,home_abbr,date,venue`);
    return data?.[0] || null;
  }

  // --- Sync: push local IndexedDB cards to cloud ---
  async function syncAll() {
    if (!isLoggedIn()) return { synced: 0, failed: 0 };
    const localCards = await App.Storage.list();
    let synced = 0, failed = 0;
    for (const card of localCards) {
      try {
        await saveCard(card);
        synced++;
      } catch (e) {
        failed++;
        console.error('Sync failed:', e.message);
      }
    }
    return { synced, failed };
  }

  return {
    configured, loadSession, signUp, signIn, signOut, refreshToken,
    getUser, isLoggedIn,
    saveCard, loadCards, loadCard, deleteCard,
    shareCard, loadSharedCard,
    syncAll,
  };
})();
