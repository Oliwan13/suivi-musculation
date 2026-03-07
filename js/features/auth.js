// js/features/auth.js — Lyftiv Auth Local
// Système de comptes léger sans backend.
// Stockage : localStorage avec mot de passe hashé (SHA-256 via Web Crypto).
// Prêt pour migration Supabase : l'API exposée (signUp, signIn, signOut, getUser)
// conserve exactement la même signature qu'un client Supabase.
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    const STORAGE_KEY   = 'lyftiv_auth_accounts';
    const SESSION_KEY   = 'lyftiv_auth_session';
    const PROFILE_KEY   = 'lyftiv_profile';

    // ══════════════════════════════════════════════════════════════════
    //  CRYPTO — hash SHA-256
    // ══════════════════════════════════════════════════════════════════

    async function sha256(str) {
        const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    //  STOCKAGE COMPTES
    // ══════════════════════════════════════════════════════════════════

    function getAccounts() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
        catch(e) { return {}; }
    }

    function saveAccounts(accounts) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch(e) { return null; }
    }

    function saveSession(session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    // ══════════════════════════════════════════════════════════════════
    //  API PUBLIQUE (compatible interface Supabase)
    // ══════════════════════════════════════════════════════════════════

    async function signUp({ email, password, name }) {
        const accounts = getAccounts();
        const key = email.toLowerCase().trim();
        if (accounts[key]) return { error: { message: 'Un compte avec cet email existe déjà.' } };

        const hash = await sha256(password);
        const id   = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const user = { id, email: key, name: name || '', createdAt: new Date().toISOString() };
        accounts[key] = { ...user, passwordHash: hash };
        saveAccounts(accounts);

        const session = { user, accessToken: id, expiresAt: null };
        saveSession(session);

        // Pré-remplir le profil
        _mergeProfile({ name: name || '' });

        return { data: { user, session }, error: null };
    }

    async function signIn({ email, password }) {
        const accounts = getAccounts();
        const key = email.toLowerCase().trim();
        const account = accounts[key];
        if (!account) return { error: { message: 'Aucun compte trouvé avec cet email.' } };

        const hash = await sha256(password);
        if (hash !== account.passwordHash) return { error: { message: 'Mot de passe incorrect.' } };

        const { passwordHash, ...user } = account;
        const session = { user, accessToken: user.id, expiresAt: null };
        saveSession(session);

        return { data: { user, session }, error: null };
    }

    function signOut() {
        localStorage.removeItem(SESSION_KEY);
        _updateNavUI(null);
    }

    function getUser() {
        const session = getSession();
        return session?.user || null;
    }

    function isLoggedIn() {
        return !!getSession();
    }

    function _mergeProfile(data) {
        try {
            const existing = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
            localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...existing, ...data }));
        } catch(e) {}
    }

    // ══════════════════════════════════════════════════════════════════
    //  MODAL UI
    // ══════════════════════════════════════════════════════════════════

    function openAuthModal(initialTab = 'login') {
        document.getElementById('lyftivAuthModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'lyftivAuthModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .2s;';

        modal.innerHTML = `
        <div style="
            background:var(--color-surface-default);
            border:1.5px solid var(--color-border-default);
            border-radius:20px;
            width:100%;max-width:400px;
            overflow:hidden;
            transform:translateY(20px) scale(.97);
            transition:transform .25s cubic-bezier(.34,1.2,.64,1);
        " id="lyftivAuthSheet">

            <!-- Header -->
            <div style="padding:18px 20px 0;text-align:center;">
                <div style="font-size:1.8rem;margin-bottom:6px;">🏋️</div>
                <h2 style="font-size:1.1rem;font-weight:900;color:var(--color-text-header);margin:0 0 4px;">Lyftiv</h2>
                <p style="font-size:.78rem;color:var(--color-text-subheader);margin:0 0 16px;">Sauvegarde tes données sur cet appareil</p>

                <!-- Tabs -->
                <div style="display:flex;background:var(--color-surface-muted);border-radius:10px;padding:3px;gap:3px;margin-bottom:18px;">
                    <button id="authTabLogin" onclick="window._lyftivAuthTab('login')" style="
                        flex:1;padding:8px;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;
                        background:${initialTab==='login'?'var(--color-surface-default)':'transparent'};
                        color:${initialTab==='login'?'var(--color-text-header)':'var(--color-text-subheader)'};
                        box-shadow:${initialTab==='login'?'0 1px 4px var(--shadow-sm)':'none'};
                    ">Connexion</button>
                    <button id="authTabSignup" onclick="window._lyftivAuthTab('signup')" style="
                        flex:1;padding:8px;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;
                        background:${initialTab==='signup'?'var(--color-surface-default)':'transparent'};
                        color:${initialTab==='signup'?'var(--color-text-header)':'var(--color-text-subheader)'};
                        box-shadow:${initialTab==='signup'?'0 1px 4px var(--shadow-sm)':'none'};
                    ">Créer un compte</button>
                </div>
            </div>

            <!-- Form container -->
            <div id="authFormContainer" style="padding:0 20px 20px;"></div>
        </div>`;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            document.getElementById('lyftivAuthSheet').style.transform = 'translateY(0) scale(1)';
        });

        modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });

        window._lyftivAuthTab = (tab) => _renderAuthForm(tab);
        _renderAuthForm(initialTab);
    }

    function closeAuthModal() {
        const modal = document.getElementById('lyftivAuthModal');
        if (!modal) return;
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }

    function _renderAuthForm(tab) {
        // Update tab styles
        ['Login','Signup'].forEach(t => {
            const btn = document.getElementById('authTab' + t);
            const active = tab === t.toLowerCase();
            if (btn) {
                btn.style.background = active ? 'var(--color-surface-default)' : 'transparent';
                btn.style.color = active ? 'var(--color-text-header)' : 'var(--color-text-subheader)';
                btn.style.boxShadow = active ? '0 1px 4px var(--shadow-sm)' : 'none';
            }
        });

        const container = document.getElementById('authFormContainer');
        if (!container) return;

        const inputStyle = `
            width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--color-border-default);
            background:var(--color-surface-muted);color:var(--color-text-default);
            font-size:.88rem;font-family:inherit;outline:none;box-sizing:border-box;
            transition:border-color .15s;
        `;

        if (tab === 'login') {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <input type="email" id="authEmail" placeholder="Email" style="${inputStyle}" autocomplete="email" />
                    <input type="password" id="authPassword" placeholder="Mot de passe" style="${inputStyle}" autocomplete="current-password" />
                    <div id="authError" style="font-size:.78rem;color:hsl(0,65%,60%);display:none;padding:8px 12px;background:hsla(0,65%,60%,.1);border-radius:8px;"></div>
                    <button id="authSubmitBtn" style="
                        width:100%;height:46px;border:none;border-radius:10px;
                        background:var(--color-primary-default,hsl(214,72%,50%));
                        color:#fff;font-weight:800;font-size:.92rem;cursor:pointer;font-family:inherit;
                        transition:opacity .15s;
                    ">Se connecter</button>
                    <button onclick="window._lyftivAuthTab('signup')" style="background:none;border:none;font-size:.78rem;color:var(--color-text-subheader);cursor:pointer;font-family:inherit;padding:4px;">
                        Pas encore de compte ? <span style="color:var(--color-primary-default,hsl(214,72%,50%));font-weight:700;">Créer un compte</span>
                    </button>
                </div>`;

            document.getElementById('authSubmitBtn').addEventListener('click', async () => {
                await _handleLogin();
            });
            document.getElementById('authPassword').addEventListener('keydown', e => {
                if (e.key === 'Enter') _handleLogin();
            });

        } else {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <input type="text" id="authName" placeholder="Prénom (optionnel)" style="${inputStyle}" autocomplete="given-name" />
                    <input type="email" id="authEmail" placeholder="Email" style="${inputStyle}" autocomplete="email" />
                    <input type="password" id="authPassword" placeholder="Mot de passe (min. 6 caractères)" style="${inputStyle}" autocomplete="new-password" />
                    <div id="authError" style="font-size:.78rem;color:hsl(0,65%,60%);display:none;padding:8px 12px;background:hsla(0,65%,60%,.1);border-radius:8px;"></div>
                    <button id="authSubmitBtn" style="
                        width:100%;height:46px;border:none;border-radius:10px;
                        background:var(--color-primary-default,hsl(214,72%,50%));
                        color:#fff;font-weight:800;font-size:.92rem;cursor:pointer;font-family:inherit;
                    ">Créer mon compte</button>
                    <p style="font-size:.72rem;color:var(--color-text-subheader);text-align:center;margin:0;line-height:1.4;">
                        Tes données restent sur cet appareil.<br>La sync cloud sera disponible prochainement.
                    </p>
                </div>`;

            document.getElementById('authSubmitBtn').addEventListener('click', async () => {
                await _handleSignUp();
            });
        }
    }

    function _showAuthError(msg) {
        const el = document.getElementById('authError');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
    }

    async function _handleLogin() {
        const email    = document.getElementById('authEmail')?.value?.trim();
        const password = document.getElementById('authPassword')?.value;
        const btn      = document.getElementById('authSubmitBtn');
        if (!email || !password) { _showAuthError('Remplis tous les champs.'); return; }

        btn.disabled = true;
        btn.textContent = 'Connexion…';
        const { data, error } = await signIn({ email, password });
        btn.disabled = false;
        btn.textContent = 'Se connecter';

        if (error) { _showAuthError(error.message); return; }
        closeAuthModal();
        _updateNavUI(data.user);
        if (typeof window.showNotification === 'function')
            window.showNotification(`👋 Bienvenue, ${data.user.name || data.user.email} !`, 'success', 3000);
    }

    async function _handleSignUp() {
        const name     = document.getElementById('authName')?.value?.trim();
        const email    = document.getElementById('authEmail')?.value?.trim();
        const password = document.getElementById('authPassword')?.value;
        const btn      = document.getElementById('authSubmitBtn');

        if (!email) { _showAuthError('Email requis.'); return; }
        if (!password || password.length < 6) { _showAuthError('Mot de passe trop court (6 caractères min).'); return; }

        btn.disabled = true;
        btn.textContent = 'Création…';
        const { data, error } = await signUp({ email, password, name });
        btn.disabled = false;
        btn.textContent = 'Créer mon compte';

        if (error) { _showAuthError(error.message); return; }
        closeAuthModal();
        _updateNavUI(data.user);
        if (typeof window.showNotification === 'function')
            window.showNotification(`🎉 Compte créé ! Bienvenue${name ? ', ' + name : ''} !`, 'success', 3500);
    }

    // ══════════════════════════════════════════════════════════════════
    //  MISE À JOUR UI NAV
    // ══════════════════════════════════════════════════════════════════

    function _updateNavUI(user) {
        // Bouton auth dans la navbar/profile (cherche l'élément par ID)
        const btn = document.getElementById('authNavBtn');
        if (!btn) return;
        if (user) {
            const initials = (user.name || user.email || '?').slice(0, 2).toUpperCase();
            btn.textContent = initials;
            btn.title = `Connecté : ${user.email}`;
            btn.style.background = 'hsla(145,65%,48%,.15)';
            btn.style.borderColor = 'hsl(145,65%,48%)';
            btn.style.color = 'hsl(145,65%,50%)';
        } else {
            btn.textContent = '🔑';
            btn.title = 'Se connecter';
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        // Restaurer la session active
        const user = getUser();
        _updateNavUI(user);

        // Bouton dans la nav
        const btn = document.getElementById('authNavBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                if (isLoggedIn()) {
                    // Menu contextuel déconnexion
                    _showAccountMenu();
                } else {
                    openAuthModal('login');
                }
            });
        }
    }

    function _showAccountMenu() {
        const user = getUser();
        if (!user) return;

        const existing = document.getElementById('authAccountMenu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = 'authAccountMenu';
        menu.style.cssText = `
            position:fixed;top:60px;right:16px;
            background:var(--color-surface-default);
            border:1.5px solid var(--color-border-default);
            border-radius:14px;padding:12px;
            box-shadow:0 8px 24px var(--shadow-md);
            z-index:9400;min-width:200px;
        `;
        menu.innerHTML = `
            <div style="font-size:.8rem;font-weight:700;color:var(--color-text-header);margin-bottom:4px;">${user.name || 'Mon compte'}</div>
            <div style="font-size:.72rem;color:var(--color-text-subheader);margin-bottom:12px;">${user.email}</div>
            <div style="font-size:.7rem;color:var(--color-text-subheader);padding:6px 0;border-top:1px solid var(--color-border-default);margin-bottom:8px;">
                ☁️ Sync cloud : <span style="color:hsl(35,80%,54%);font-weight:700;">Bientôt disponible</span>
            </div>
            <button id="authSignOutBtn" style="
                width:100%;padding:9px;border:1px solid hsl(0,60%,50%);border-radius:8px;
                background:hsla(0,60%,50%,.1);color:hsl(0,60%,55%);
                font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit;
            ">Se déconnecter</button>
        `;
        document.body.appendChild(menu);
        document.getElementById('authSignOutBtn').addEventListener('click', () => {
            signOut();
            menu.remove();
            if (typeof window.showNotification === 'function')
                window.showNotification('Déconnecté.', 'info', 2000);
        });
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target)) menu.remove();
            }, { once: true });
        }, 50);
    }

    window.addEventListener('load', init);

    // ══════════════════════════════════════════════════════════════════
    //  API PUBLIQUE
    // ══════════════════════════════════════════════════════════════════

    window.LyftivAuth = { signUp, signIn, signOut, getUser, isLoggedIn, openAuthModal };

})();
