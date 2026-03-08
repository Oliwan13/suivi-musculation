// js/features/supabase-sync.js — Lyftiv Cloud Sync
// Remplace auth.js pour les comptes avec sync multi-appareils via Supabase.
// ⚙️  CONFIGURATION : remplace les deux constantes ci-dessous.
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    //  ⚙️  CONFIG — À remplacer avec tes valeurs Supabase
    //  https://app.supabase.com → Settings → API
    // ══════════════════════════════════════════════════════════════════
    const SUPABASE_URL  = window.LyftivConfig?.SUPABASE_URL  || 'https://VOTRE_PROJET.supabase.co';
    const SUPABASE_ANON = window.LyftivConfig?.SUPABASE_ANON || 'VOTRE_ANON_KEY';

    const IS_CONFIGURED = window.LyftivConfig?.IS_CONFIGURED ?? !SUPABASE_URL.includes('VOTRE_PROJET');

    // ══════════════════════════════════════════════════════════════════
    //  STORAGE KEYS
    // ══════════════════════════════════════════════════════════════════
    const SESSION_KEY   = 'lyftiv_sb_session';
    const PROFILE_KEY   = 'lyftiv_profile';
    const HISTORY_KEY   = 'workoutHistory';
    const SESSIONS_KEY  = 'userSessions';
    const SYNC_TS_KEY   = 'lyftiv_last_sync';

    // ══════════════════════════════════════════════════════════════════
    //  HELPERS HTTP (pas de dépendance à supabase-js)
    // ══════════════════════════════════════════════════════════════════

    async function _req(path, method = 'GET', body = null, token = null) {
        const headers = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${token || SUPABASE_ANON}`,
            'Prefer': method === 'POST' ? 'return=representation' : '',
        };
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(SUPABASE_URL + path, opts);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    async function _authReq(path, body) {
        const res = await fetch(SUPABASE_URL + '/auth/v1/' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SESSION LOCALE
    // ══════════════════════════════════════════════════════════════════

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch(e) { return null; }
    }

    function saveSession(session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }

    function getUser() {
        return getSession()?.user || null;
    }

    function isLoggedIn() {
        const s = getSession();
        if (!s) return false;
        // Vérifier expiration
        if (s.expires_at && Date.now() > s.expires_at * 1000) {
            clearSession(); return false;
        }
        return true;
    }

    function getToken() {
        return getSession()?.access_token || null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  AUTH API
    // ══════════════════════════════════════════════════════════════════

    async function signUp({ email, password, name }) {
        if (!IS_CONFIGURED) return _localSignUp({ email, password, name });

        const { ok, data } = await _authReq('signup', {
            email, password,
            data: { name: name || '' }
        });
        if (!ok) return { error: { message: data.msg || data.message || 'Erreur inscription.' } };

        saveSession(data);
        _mergeProfile({ name: name || '', email });
        setTimeout(() => syncToCloud(), 1000);
        return { data: { user: data.user, session: data }, error: null };
    }

    async function signIn({ email, password }) {
        if (!IS_CONFIGURED) return _localSignIn({ email, password });

        const { ok, data } = await _authReq('token?grant_type=password', { email, password });
        if (!ok) return { error: { message: data.error_description || 'Email ou mot de passe incorrect.' } };

        saveSession(data);
        _mergeProfile({ email });
        setTimeout(() => syncFromCloud(), 500);
        return { data: { user: data.user, session: data }, error: null };
    }

    async function signOut() {
        if (IS_CONFIGURED && getToken()) {
            await _req('/auth/v1/logout', 'POST', null, getToken()).catch(() => {});
        }
        clearSession();
        _updateNavUI(null);
    }

    // ══════════════════════════════════════════════════════════════════
    //  FALLBACK LOCAL (si Supabase non configuré)
    // ══════════════════════════════════════════════════════════════════

    const LOCAL_ACCOUNTS_KEY = 'lyftiv_auth_accounts';

    async function _sha256(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    function _getLocalAccounts() {
        try { return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || '{}'); } catch(e) { return {}; }
    }

    async function _localSignUp({ email, password, name }) {
        const accounts = _getLocalAccounts();
        const key = email.toLowerCase().trim();
        if (accounts[key]) return { error: { message: 'Email déjà utilisé.' } };
        const hash = await _sha256(password);
        const id = 'local_' + Date.now();
        const user = { id, email: key, user_metadata: { name: name || '' } };
        accounts[key] = { ...user, hash };
        localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
        const session = { user, access_token: id, expires_at: null, _local: true };
        saveSession(session);
        _mergeProfile({ name: name || '', email: key });
        return { data: { user, session }, error: null };
    }

    async function _localSignIn({ email, password }) {
        const accounts = _getLocalAccounts();
        const key = email.toLowerCase().trim();
        const account = accounts[key];
        if (!account) return { error: { message: 'Aucun compte trouvé.' } };
        const hash = await _sha256(password);
        if (hash !== account.hash) return { error: { message: 'Mot de passe incorrect.' } };
        const { hash: _h, ...user } = account;
        const session = { user, access_token: user.id, expires_at: null, _local: true };
        saveSession(session);
        return { data: { user, session }, error: null };
    }

    // ══════════════════════════════════════════════════════════════════
    //  CLOUD SYNC
    // ══════════════════════════════════════════════════════════════════

    async function syncToCloud() {
        if (!IS_CONFIGURED || !isLoggedIn()) return { ok: false, reason: 'not_configured' };

        const token   = getToken();
        const userId  = getUser()?.id;
        if (!userId) return;

        try {
            const history  = JSON.parse(localStorage.getItem(HISTORY_KEY)  || '[]');
            const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
            const profile  = JSON.parse(localStorage.getItem(PROFILE_KEY)  || '{}');

            const payload = {
                user_id: userId,
                history:  JSON.stringify(history),
                sessions: JSON.stringify(sessions),
                profile:  JSON.stringify(profile),
                updated_at: new Date().toISOString(),
            };

            // Upsert dans la table lyftiv_data
            const { ok } = await _req(
                '/rest/v1/lyftiv_data?user_id=eq.' + userId,
                'POST',
                payload,
                token
            );

            if (ok) {
                localStorage.setItem(SYNC_TS_KEY, new Date().toISOString());
                _updateSyncBadge('synced');
                console.log('[Sync] ✅ Données envoyées vers le cloud');
            }
            return { ok };
        } catch(e) {
            console.warn('[Sync] ❌ Échec:', e.message);
            _updateSyncBadge('error');
            return { ok: false };
        }
    }

    async function syncFromCloud() {
        if (!IS_CONFIGURED || !isLoggedIn()) return;

        const token  = getToken();
        const userId = getUser()?.id;
        if (!userId) return;

        try {
            const { ok, data } = await _req(
                `/rest/v1/lyftiv_data?user_id=eq.${userId}&select=*`,
                'GET', null, token
            );

            if (!ok || !data?.length) return;
            const row = data[0];

            // Fusionner : garder les données les plus récentes
            const cloudHistory  = JSON.parse(row.history  || '[]');
            const cloudSessions = JSON.parse(row.sessions || '[]');
            const cloudProfile  = JSON.parse(row.profile  || '{}');

            const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)  || '[]');
            const localSessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');

            // Merge historique : déduplication par date
            const merged = _mergeHistory(localHistory, cloudHistory);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));

            // Sessions : cloud gagne si plus récentes
            if (cloudSessions.length > 0) {
                localStorage.setItem(SESSIONS_KEY, JSON.stringify(cloudSessions));
                if (window.state) { window.state.sessions = cloudSessions; }
            }

            // Profil : fusion (local + cloud)
            const mergedProfile = { ...cloudProfile, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') };
            localStorage.setItem(PROFILE_KEY, JSON.stringify(mergedProfile));

            localStorage.setItem(SYNC_TS_KEY, new Date().toISOString());
            _updateSyncBadge('synced');
            console.log(`[Sync] ✅ ${merged.length} séances récupérées du cloud`);

            if (typeof window.showNotification === 'function') {
                window.showNotification(`☁️ Données synchronisées (${merged.length} séances)`, 'success', 3000);
            }
        } catch(e) {
            console.warn('[Sync] ❌ syncFromCloud:', e.message);
        }
    }

    function _mergeHistory(local, cloud) {
        const map = {};
        [...local, ...cloud].forEach(s => {
            const key = s.date + '_' + (s.sessionName || '');
            if (!map[key] || (s.exercises?.length || 0) > (map[key].exercises?.length || 0)) {
                map[key] = s;
            }
        });
        return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    function _mergeProfile(data) {
        try {
            const existing = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
            localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...existing, ...data }));
        } catch(e) {}
    }

    // Auto-sync périodique (toutes les 5 min si connecté)
    setInterval(() => { if (isLoggedIn()) syncToCloud(); }, 5 * 60 * 1000);

    // Sync à la fermeture de l'onglet
    window.addEventListener('beforeunload', () => { if (isLoggedIn()) syncToCloud(); });

    // ══════════════════════════════════════════════════════════════════
    //  SQL — Script de création Supabase (à exécuter une fois)
    // ══════════════════════════════════════════════════════════════════
    //
    // Dans Supabase → SQL Editor, exécute :
    //
    // CREATE TABLE IF NOT EXISTS lyftiv_data (
    //   user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    //   history   TEXT DEFAULT '[]',
    //   sessions  TEXT DEFAULT '[]',
    //   profile   TEXT DEFAULT '{}',
    //   updated_at TIMESTAMPTZ DEFAULT now()
    // );
    // ALTER TABLE lyftiv_data ENABLE ROW LEVEL SECURITY;
    // CREATE POLICY "Users own data" ON lyftiv_data
    //   FOR ALL USING (auth.uid() = user_id);
    //
    // ══════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════
    //  UI
    // ══════════════════════════════════════════════════════════════════

    function _updateSyncBadge(status) {
        const el = document.getElementById('cloudSyncBadge');
        if (!el) return;
        const map = {
            synced:  { icon: '☁️', color: 'hsl(145,65%,48%)', title: 'Synchronisé' },
            syncing: { icon: '🔄', color: 'hsl(210,80%,58%)', title: 'Synchronisation…' },
            error:   { icon: '⚠️', color: 'hsl(35,80%,54%)',  title: 'Erreur sync' },
            offline: { icon: '📴', color: 'hsl(0,0%,50%)',    title: 'Hors ligne' },
        };
        const s = map[status] || map.offline;
        el.textContent = s.icon;
        el.title = s.title;
        el.style.color = s.color;
    }

    function _updateNavUI(user) {
        const btn = document.getElementById('authNavBtn');
        if (!btn) return;
        if (user) {
            const name = user.user_metadata?.name || user.email || '?';
            const initials = name.slice(0, 2).toUpperCase();
            btn.textContent = initials;
            btn.title = `${name} — cliquer pour se déconnecter`;
            btn.style.cssText += ';background:hsla(145,65%,48%,.15);border-color:hsl(145,65%,48%);color:hsl(145,65%,50%);';
        } else {
            btn.textContent = '🔑';
            btn.title = 'Se connecter / Créer un compte';
            btn.style.cssText = '';
        }
    }

    function openAuthModal(initialTab = 'login') {
        document.getElementById('lyftivAuthModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'lyftivAuthModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .2s;';

        const notConfigured = !IS_CONFIGURED;
        const warnHtml = notConfigured ? `
            <div style="background:hsla(35,80%,54%,.1);border:1px solid hsla(35,80%,54%,.3);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:.75rem;color:hsl(35,80%,58%);">
                ⚠️ Supabase non configuré — mode local (données sur cet appareil uniquement).<br>
                Configure <code>SUPABASE_URL</code> et <code>SUPABASE_ANON</code> dans <code>supabase-sync.js</code>.
            </div>` : `
            <div style="background:hsla(145,65%,48%,.1);border:1px solid hsla(145,65%,48%,.3);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:.75rem;color:hsl(145,65%,50%);">
                ☁️ Sync cloud activée — tes données sont sauvegardées sur tous tes appareils.
            </div>`;

        modal.innerHTML = `
        <div id="lyftivAuthSheet" style="
            background:var(--color-surface-default);border:1.5px solid var(--color-border-default);
            border-radius:20px;width:100%;max-width:400px;overflow:hidden;
            transform:translateY(16px) scale(.97);transition:transform .25s cubic-bezier(.34,1.2,.64,1);
        ">
            <div style="padding:20px 20px 0;text-align:center;">
                <div style="font-size:2rem;margin-bottom:6px;">🏋️</div>
                <h2 style="font-size:1.1rem;font-weight:900;color:var(--color-text-header);margin:0 0 4px;">Lyftiv</h2>
                <p style="font-size:.78rem;color:var(--color-text-subheader);margin:0 0 14px;">Sauvegarde et sync tes entraînements</p>
                ${warnHtml}
                <div style="display:flex;background:var(--color-surface-muted);border-radius:10px;padding:3px;gap:3px;margin-bottom:18px;">
                    <button id="authTabLogin" onclick="window._lyftivAuthTab('login')" style="flex:1;padding:8px;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;background:${initialTab==='login'?'var(--color-surface-default)':'transparent'};color:${initialTab==='login'?'var(--color-text-header)':'var(--color-text-subheader)'};">Connexion</button>
                    <button id="authTabSignup" onclick="window._lyftivAuthTab('signup')" style="flex:1;padding:8px;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;background:${initialTab==='signup'?'var(--color-surface-default)':'transparent'};color:${initialTab==='signup'?'var(--color-text-header)':'var(--color-text-subheader)'};">Créer un compte</button>
                </div>
            </div>
            <div id="authFormContainer" style="padding:0 20px 20px;"></div>
        </div>`;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            document.getElementById('lyftivAuthSheet').style.transform = 'translateY(0) scale(1)';
        });
        modal.addEventListener('click', e => { if (e.target === modal) _closeAuthModal(); });
        window._lyftivAuthTab = _renderAuthForm;
        _renderAuthForm(initialTab);
    }

    function _closeAuthModal() {
        const m = document.getElementById('lyftivAuthModal');
        if (!m) return;
        m.style.opacity = '0';
        setTimeout(() => m.remove(), 200);
    }

    const _inputStyle = `width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--color-border-default);background:var(--color-surface-muted);color:var(--color-text-default);font-size:.88rem;font-family:inherit;outline:none;box-sizing:border-box;`;

    function _renderAuthForm(tab) {
        ['Login','Signup'].forEach(t => {
            const btn = document.getElementById('authTab' + t);
            const active = tab === t.toLowerCase();
            if (btn) { btn.style.background = active ? 'var(--color-surface-default)' : 'transparent'; btn.style.color = active ? 'var(--color-text-header)' : 'var(--color-text-subheader)'; }
        });
        const c = document.getElementById('authFormContainer');
        if (!c) return;

        if (tab === 'login') {
            c.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;">
                <input type="email" id="authEmail" placeholder="Email" style="${_inputStyle}" autocomplete="email"/>
                <input type="password" id="authPassword" placeholder="Mot de passe" style="${_inputStyle}" autocomplete="current-password"/>
                <div id="authError" style="font-size:.78rem;color:hsl(0,65%,60%);display:none;padding:8px 12px;background:hsla(0,65%,60%,.1);border-radius:8px;"></div>
                <button id="authSubmitBtn" style="width:100%;height:46px;border:none;border-radius:10px;background:var(--color-primary-default,hsl(214,72%,50%));color:#fff;font-weight:800;font-size:.92rem;cursor:pointer;font-family:inherit;">Se connecter</button>
                <button onclick="window._lyftivAuthTab('signup')" style="background:none;border:none;font-size:.78rem;color:var(--color-text-subheader);cursor:pointer;font-family:inherit;">Pas de compte ? <span style="color:hsl(214,72%,55%);font-weight:700;">Créer un compte</span></button>
            </div>`;
            document.getElementById('authSubmitBtn').addEventListener('click', _handleLogin);
            document.getElementById('authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') _handleLogin(); });
        } else {
            c.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;">
                <input type="text" id="authName" placeholder="Prénom (optionnel)" style="${_inputStyle}" autocomplete="given-name"/>
                <input type="email" id="authEmail" placeholder="Email" style="${_inputStyle}" autocomplete="email"/>
                <input type="password" id="authPassword" placeholder="Mot de passe (6 caractères min.)" style="${_inputStyle}" autocomplete="new-password"/>
                <div id="authError" style="font-size:.78rem;color:hsl(0,65%,60%);display:none;padding:8px 12px;background:hsla(0,65%,60%,.1);border-radius:8px;"></div>
                <button id="authSubmitBtn" style="width:100%;height:46px;border:none;border-radius:10px;background:var(--color-primary-default,hsl(214,72%,50%));color:#fff;font-weight:800;font-size:.92rem;cursor:pointer;font-family:inherit;">Créer mon compte</button>
                <p style="font-size:.72rem;color:var(--color-text-subheader);text-align:center;margin:0;">${IS_CONFIGURED ? '☁️ Données sauvegardées sur tous tes appareils.' : '📱 Données locales — active Supabase pour le cloud.'}</p>
            </div>`;
            document.getElementById('authSubmitBtn').addEventListener('click', _handleSignUp);
        }
    }

    function _showError(msg) {
        const el = document.getElementById('authError');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    async function _handleLogin() {
        const email = document.getElementById('authEmail')?.value?.trim();
        const password = document.getElementById('authPassword')?.value;
        const btn = document.getElementById('authSubmitBtn');
        if (!email || !password) { _showError('Remplis tous les champs.'); return; }
        btn.disabled = true; btn.textContent = 'Connexion…';
        const { data, error } = await signIn({ email, password });
        btn.disabled = false; btn.textContent = 'Se connecter';
        if (error) { _showError(error.message); return; }
        _closeAuthModal();
        _updateNavUI(data.user);
        const name = data.user?.user_metadata?.name || data.user?.email || '';
        if (typeof window.showNotification === 'function')
            window.showNotification(`👋 Bienvenue${name ? ', ' + name : ''} !`, 'success', 3000);
    }

    async function _handleSignUp() {
        const name = document.getElementById('authName')?.value?.trim();
        const email = document.getElementById('authEmail')?.value?.trim();
        const password = document.getElementById('authPassword')?.value;
        const btn = document.getElementById('authSubmitBtn');
        if (!email) { _showError('Email requis.'); return; }
        if (!password || password.length < 6) { _showError('Mot de passe trop court.'); return; }
        btn.disabled = true; btn.textContent = 'Création…';
        const { data, error } = await signUp({ email, password, name });
        btn.disabled = false; btn.textContent = 'Créer mon compte';
        if (error) { _showError(error.message); return; }
        _closeAuthModal();
        _updateNavUI(data.user);
        if (typeof window.showNotification === 'function')
            window.showNotification(`🎉 Compte créé${name ? ', ' + name : ''} !`, 'success', 3500);
    }

    function _showAccountMenu() {
        const user = getUser();
        if (!user) return;
        document.getElementById('authAccountMenu')?.remove();
        const menu = document.createElement('div');
        menu.id = 'authAccountMenu';
        menu.style.cssText = 'position:fixed;top:56px;right:16px;background:var(--color-surface-default);border:1.5px solid var(--color-border-default);border-radius:14px;padding:14px;box-shadow:0 8px 24px var(--shadow-md);z-index:9400;min-width:210px;';
        const name = user.user_metadata?.name || '';
        const lastSync = localStorage.getItem(SYNC_TS_KEY);
        const syncText = lastSync ? new Date(lastSync).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : 'Jamais';
        menu.innerHTML = `
            <div style="font-size:.82rem;font-weight:700;color:var(--color-text-header);margin-bottom:2px;">${name || 'Mon compte'}</div>
            <div style="font-size:.72rem;color:var(--color-text-subheader);margin-bottom:12px;">${user.email}</div>
            <div style="font-size:.72rem;color:var(--color-text-subheader);padding:8px 0;border-top:1px solid var(--color-border-default);margin-bottom:8px;display:flex;flex-direction:column;gap:4px;">
                <div>${IS_CONFIGURED ? '☁️ Cloud Sync actif' : '📱 Mode local'}</div>
                <div>Dernière sync : <strong>${syncText}</strong></div>
            </div>
            ${IS_CONFIGURED ? `<button id="authSyncNowBtn" style="width:100%;padding:8px;border:1px solid var(--color-border-default);border-radius:8px;background:var(--color-surface-muted);color:var(--color-text-default);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px;">🔄 Synchroniser maintenant</button>` : ''}
            <button id="authSignOutBtn" style="width:100%;padding:9px;border:1px solid hsl(0,60%,50%);border-radius:8px;background:hsla(0,60%,50%,.1);color:hsl(0,60%,55%);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit;">Se déconnecter</button>`;
        document.body.appendChild(menu);
        document.getElementById('authSignOutBtn').addEventListener('click', async () => {
            await signOut(); menu.remove();
            if (typeof window.showNotification === 'function') window.showNotification('Déconnecté.', 'info', 2000);
        });
        document.getElementById('authSyncNowBtn')?.addEventListener('click', async () => {
            _updateSyncBadge('syncing');
            await syncToCloud(); menu.remove();
        });
        setTimeout(() => {
            document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.remove(); }, { once: true });
        }, 50);
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        const user = getUser();
        _updateNavUI(user);
        if (user && IS_CONFIGURED) { _updateSyncBadge('syncing'); setTimeout(() => syncFromCloud(), 1000); }

        document.getElementById('authNavBtn')?.addEventListener('click', () => {
            isLoggedIn() ? _showAccountMenu() : openAuthModal('login');
        });

        // Bouton sync manuel dans le profil
        document.getElementById('cloudSyncBtn')?.addEventListener('click', async () => {
            if (!isLoggedIn()) { openAuthModal('login'); return; }
            _updateSyncBadge('syncing');
            await syncToCloud();
        });
    }

    window.addEventListener('load', init);

    // ══════════════════════════════════════════════════════════════════
    //  API PUBLIQUE
    // ══════════════════════════════════════════════════════════════════
    window.LyftivAuth = { signUp, signIn, signOut, getUser, isLoggedIn, getToken, openAuthModal, syncToCloud, syncFromCloud };

})();
