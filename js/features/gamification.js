// js/features/gamification.js — Lyftiv Ligues & Gamification
// Classements, défis entre amis, partage de PRs
// Fonctionne en local-first + cloud (Supabase optionnel)
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    //  CONFIG
    // ══════════════════════════════════════════════════════════════════

    const SUPABASE_URL  = 'https://VOTRE_PROJET.supabase.co';
    const SUPABASE_ANON = 'VOTRE_ANON_KEY';
    const IS_CONFIGURED = !SUPABASE_URL.includes('VOTRE_PROJET');

    // ══════════════════════════════════════════════════════════════════
    //  LIGUE LOCALE — Calcul du score personnel
    // ══════════════════════════════════════════════════════════════════

    /**
     * Score Lyftiv — combine fréquence, tonnage, progression, streaks
     * Formule : (séances×10) + (tonnage_total/1000) + (streak×5) + (badges×8)
     */
    function computeScore(history) {
        if (!history?.length) return 0;

        const sessions   = history.length;
        const tonnage    = history.reduce((t, s) =>
            t + (s.exercises || []).reduce((a, ex) =>
                a + (ex.series || []).reduce((b, sr) => b + (sr.reps || 0) * (sr.weight || 0), 0), 0), 0);

        // Streak depuis StorageAPI ou calcul local
        let streak = 0;
        try {
            const badges = JSON.parse(localStorage.getItem('lyftiv_badges') || '[]');
            if (badges.includes('streak_30')) streak = 30;
            else if (badges.includes('streak_14')) streak = 14;
            else if (badges.includes('streak_7')) streak = 7;
            else if (badges.includes('streak_3')) streak = 3;
        } catch(e) {}

        const badgeCount = (() => {
            try { return JSON.parse(localStorage.getItem('lyftiv_badges') || '[]').length; }
            catch(e) { return 0; }
        })();

        return Math.round(
            sessions * 10 +
            tonnage / 1000 +
            streak * 5 +
            badgeCount * 8
        );
    }

    function getLeagueFromScore(score) {
        if (score >= 2000) return { name: 'Diamant',  icon: '💎', color: 'hsl(200,90%,65%)', min: 2000 };
        if (score >= 1000) return { name: 'Platine',  icon: '🔮', color: 'hsl(280,70%,70%)', min: 1000 };
        if (score >= 500)  return { name: 'Or',       icon: '🥇', color: 'hsl(45,90%,55%)',  min: 500  };
        if (score >= 200)  return { name: 'Argent',   icon: '🥈', color: 'hsl(220,20%,70%)', min: 200  };
        if (score >= 50)   return { name: 'Bronze',   icon: '🥉', color: 'hsl(25,70%,55%)',  min: 50   };
        return                    { name: 'Recrue',   icon: '🎽', color: 'hsl(0,0%,55%)',    min: 0    };
    }

    // ══════════════════════════════════════════════════════════════════
    //  LEADERBOARD (Supabase ou demo local)
    // ══════════════════════════════════════════════════════════════════

    async function fetchLeaderboard(limit = 20) {
        if (!IS_CONFIGURED) return _getDemoLeaderboard();

        const token = window.LyftivAuth?.getToken?.() || SUPABASE_ANON;
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/lyftiv_scores?select=username,score,league,updated_at&order=score.desc&limit=${limit}`,
                { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` } }
            );
            const data = await res.json();
            return Array.isArray(data) ? data : _getDemoLeaderboard();
        } catch(e) {
            return _getDemoLeaderboard();
        }
    }

    function _getDemoLeaderboard() {
        // Données de démo pour illustrer le classement
        return [
            { username: 'Alexandre M.', score: 2450, league: 'Diamant',  avatar: '💪' },
            { username: 'Sarah K.',      score: 1820, league: 'Platine',  avatar: '🔥' },
            { username: 'Thomas R.',     score: 1340, league: 'Platine',  avatar: '⚡' },
            { username: 'Emma L.',       score: 980,  league: 'Or',       avatar: '🏋️' },
            { username: 'Nicolas D.',    score: 750,  league: 'Or',       avatar: '💥' },
            { username: 'Julie P.',      score: 520,  league: 'Argent',   avatar: '🎯' },
            { username: 'Marc T.',       score: 380,  league: 'Argent',   avatar: '🦍' },
            { username: 'Camille V.',    score: 210,  league: 'Bronze',   avatar: '🌅' },
        ];
    }

    async function publishScore() {
        if (!IS_CONFIGURED || !window.LyftivAuth?.isLoggedIn?.()) return;

        const history = (() => {
            try { return JSON.parse(localStorage.getItem('workoutHistory') || '[]'); } catch(e) { return []; }
        })();
        const profile = (() => {
            try { return JSON.parse(localStorage.getItem('lyftiv_profile') || '{}'); } catch(e) { return {}; }
        })();

        const score    = computeScore(history);
        const league   = getLeagueFromScore(score);
        const userId   = window.LyftivAuth.getUser()?.id;
        const username = profile.name || window.LyftivAuth.getUser()?.email?.split('@')[0] || 'Anonyme';

        if (!userId) return;

        try {
            const token = window.LyftivAuth.getToken();
            await fetch(`${SUPABASE_URL}/rest/v1/lyftiv_scores`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON,
                    'Authorization': `Bearer ${token}`,
                    'Prefer': 'resolution=merge-duplicates',
                },
                body: JSON.stringify({
                    user_id: userId,
                    username,
                    score,
                    league: league.name,
                    sessions: history.length,
                    updated_at: new Date().toISOString()
                })
            });
        } catch(e) {
            console.warn('[Gamification] publishScore failed:', e.message);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  DÉFIS ENTRE AMIS
    // ══════════════════════════════════════════════════════════════════

    const FRIEND_CHALLENGES = [
        { id: 'fc_tonnage',   label: 'Défi Tonnage',   desc: 'Qui accumule le plus de kg en 7 jours ?', icon: '⚖️' },
        { id: 'fc_sessions',  label: 'Défi Assiduité', desc: 'Qui fait le plus de séances en 7 jours ?', icon: '📅' },
        { id: 'fc_streak',    label: 'Défi Streak',    desc: 'Qui maintient le plus grand streak ?', icon: '🔥' },
        { id: 'fc_exercises', label: 'Défi Variété',   desc: 'Qui utilise le plus d'exercices différents ?', icon: '🎨' },
    ];

    function generateChallengLink(challengeId) {
        const user = window.LyftivAuth?.getUser?.();
        const name = (() => { try { return JSON.parse(localStorage.getItem('lyftiv_profile') || '{}').name || 'Un ami'; } catch(e) { return 'Un ami'; } })();
        const history = (() => { try { return JSON.parse(localStorage.getItem('workoutHistory') || '[]'); } catch(e) { return []; } })();
        const score = computeScore(history);

        const params = new URLSearchParams({
            challenge: challengeId,
            from: name,
            score: score,
            ref: user?.id?.slice(0, 8) || 'local',
        });
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }

    function renderSharePR(exercise, weight, reps) {
        const text = `🏋️ PR LYFTIV — ${exercise} : ${weight}kg × ${reps} reps ! 💪\nBats mon record sur Lyftiv 👇`;
        return {
            text,
            url: window.location.origin + window.location.pathname,
            share: () => {
                if (navigator.share) {
                    navigator.share({ title: 'Mon PR Lyftiv', text, url: window.location.origin + window.location.pathname });
                } else {
                    navigator.clipboard?.writeText(text + '\n' + window.location.href);
                    if (typeof window.showNotification === 'function') window.showNotification('PR copié dans le presse-papiers !', 'success', 3000);
                }
            }
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  PANEL UI — Onglet Ligues
    // ══════════════════════════════════════════════════════════════════

    async function renderLeaguePanel(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const history = (() => { try { return JSON.parse(localStorage.getItem('workoutHistory') || '[]'); } catch(e) { return []; } })();
        const profile = (() => { try { return JSON.parse(localStorage.getItem('lyftiv_profile') || '{}'); } catch(e) { return {}; } })();
        const score    = computeScore(history);
        const league   = getLeagueFromScore(score);
        const nextLeague = _getNextLeague(score);
        const isLoggedIn = window.LyftivAuth?.isLoggedIn?.() || false;

        container.innerHTML = `<div style="max-width:560px;margin:0 auto;padding-bottom:40px;">

            <!-- SCORE CARD -->
            <div style="
                background:linear-gradient(135deg,${league.color}20,${league.color}08);
                border:1.5px solid ${league.color}40;
                border-radius:var(--radius-large,16px);
                padding:var(--spacing-xl,20px);
                margin-bottom:var(--spacing-lg,16px);
                text-align:center;
            ">
                <div style="font-size:3rem;margin-bottom:8px;">${league.icon}</div>
                <div style="font-size:1.5rem;font-weight:900;color:${league.color};margin-bottom:4px;">Ligue ${league.name}</div>
                <div style="font-size:2.5rem;font-weight:900;color:var(--color-text-header);margin-bottom:4px;">${score.toLocaleString('fr-FR')}</div>
                <div style="font-size:.78rem;color:var(--color-text-subheader);">points Lyftiv · ${history.length} séances</div>
                ${nextLeague ? `
                <div style="margin-top:14px;">
                    <div style="font-size:.72rem;color:var(--color-text-subheader);margin-bottom:6px;">
                        ${nextLeague.icon} ${nextLeague.name} dans <strong style="color:${nextLeague.color};">${(nextLeague.min - score).toLocaleString('fr-FR')} pts</strong>
                    </div>
                    <div style="background:var(--color-surface-muted);border-radius:6px;height:8px;overflow:hidden;">
                        <div style="height:100%;background:${league.color};border-radius:6px;width:${Math.min(100, Math.round((score - league.min) / (nextLeague.min - league.min) * 100))}%;transition:width .6s ease;"></div>
                    </div>
                </div>` : '<div style="font-size:.78rem;color:hsl(145,65%,50%);margin-top:10px;font-weight:700;">🏆 Rang maximum atteint !</div>'}
            </div>

            <!-- COMMENT GAGNER DES POINTS -->
            <div style="background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);margin-bottom:var(--spacing-lg,16px);">
                <h3 style="font-size:.9rem;font-weight:800;margin:0 0 12px;color:var(--color-text-header);">⚡ Comment gagner des points</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${[
                        ['🏋️', '10 pts', 'par séance'],
                        ['💪', '1 pt', 'par 1000 kg·rep'],
                        ['🔥', '5 pts', 'par jour de streak'],
                        ['🏆', '8 pts', 'par badge débloqué'],
                    ].map(([icon, pts, label]) => `
                    <div style="background:var(--color-surface-muted);border-radius:10px;padding:10px;text-align:center;">
                        <div style="font-size:1.2rem;">${icon}</div>
                        <div style="font-size:.9rem;font-weight:800;color:var(--color-text-header);">${pts}</div>
                        <div style="font-size:.68rem;color:var(--color-text-subheader);">${label}</div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- CLASSEMENT -->
            <div style="background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);margin-bottom:var(--spacing-lg,16px);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <h3 style="font-size:.9rem;font-weight:800;margin:0;color:var(--color-text-header);">🏆 Classement global</h3>
                    ${!IS_CONFIGURED ? '<span style="font-size:.68rem;color:hsl(35,80%,54%);font-weight:600;">Demo — active Supabase</span>' : ''}
                </div>
                <div id="leaderboardList">
                    <div style="text-align:center;padding:16px;color:var(--color-text-subheader);font-size:.82rem;">Chargement…</div>
                </div>
                ${isLoggedIn ? `<button id="publishScoreBtn" style="width:100%;margin-top:12px;padding:10px;border:1.5px solid var(--color-primary-default,hsl(214,72%,50%));border-radius:10px;background:hsla(214,72%,50%,.1);color:hsl(214,72%,60%);font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">📤 Publier mon score</button>`
                : `<button onclick="window.LyftivAuth?.openAuthModal('signup')" style="width:100%;margin-top:12px;padding:10px;border:1.5px solid var(--color-primary-default,hsl(214,72%,50%));border-radius:10px;background:hsla(214,72%,50%,.1);color:hsl(214,72%,60%);font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">🔑 Se connecter pour rejoindre le classement</button>`}
            </div>

            <!-- DÉFIS AMIS -->
            <div style="background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);margin-bottom:var(--spacing-lg,16px);">
                <h3 style="font-size:.9rem;font-weight:800;margin:0 0 12px;color:var(--color-text-header);">⚔️ Défis entre amis</h3>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${FRIEND_CHALLENGES.map(ch => `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--color-surface-muted);border-radius:10px;padding:12px;">
                        <div>
                            <div style="font-weight:700;font-size:.82rem;color:var(--color-text-header);">${ch.icon} ${ch.label}</div>
                            <div style="font-size:.72rem;color:var(--color-text-subheader);">${ch.desc}</div>
                        </div>
                        <button data-challenge="${ch.id}" class="share-challenge-btn" style="padding:6px 14px;border:1px solid var(--color-primary-default,hsl(214,72%,50%));border-radius:8px;background:hsla(214,72%,50%,.1);color:hsl(214,72%,60%);font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">📤 Défier</button>
                    </div>`).join('')}
                </div>
            </div>

            <!-- PARTAGE PR -->
            <div style="background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);">
                <h3 style="font-size:.9rem;font-weight:800;margin:0 0 12px;color:var(--color-text-header);">🎉 Partager un PR</h3>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <input type="text" id="prExercise" placeholder="Exercice (ex: Squat barre)" style="padding:10px 14px;border-radius:10px;border:1.5px solid var(--color-border-default);background:var(--color-surface-muted);color:var(--color-text-default);font-size:.85rem;font-family:inherit;outline:none;" />
                    <div style="display:flex;gap:8px;">
                        <input type="number" id="prWeight" placeholder="Poids (kg)" style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--color-border-default);background:var(--color-surface-muted);color:var(--color-text-default);font-size:.85rem;font-family:inherit;outline:none;" />
                        <input type="number" id="prReps" placeholder="Reps" style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--color-border-default);background:var(--color-surface-muted);color:var(--color-text-default);font-size:.85rem;font-family:inherit;outline:none;" />
                    </div>
                    <button id="sharePrBtn" style="padding:12px;border:none;border-radius:10px;background:var(--color-primary-default,hsl(214,72%,50%));color:#fff;font-weight:800;font-size:.88rem;cursor:pointer;font-family:inherit;">🏆 Partager ce PR</button>
                </div>
            </div>
        </div>`;

        // Charger leaderboard
        const leaderboard = await fetchLeaderboard();
        const myScore = score;
        const listEl = document.getElementById('leaderboardList');
        if (listEl && leaderboard.length) {
            const myName = profile.name || 'Moi';
            listEl.innerHTML = leaderboard.map((entry, i) => {
                const rank = i + 1;
                const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                const lg = getLeagueFromScore(entry.score);
                return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border-default);">
                    <span style="font-size:.82rem;font-weight:800;color:var(--color-text-subheader);min-width:28px;text-align:center;">${rankIcon}</span>
                    <span style="font-size:1.1rem;">${entry.avatar || lg.icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.82rem;font-weight:700;color:var(--color-text-header);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.username}</div>
                        <div style="font-size:.68rem;color:${lg.color};">${lg.icon} ${lg.name}</div>
                    </div>
                    <span style="font-size:.8rem;font-weight:800;color:var(--color-text-header);">${entry.score.toLocaleString('fr-FR')}</span>
                </div>`;
            }).join('');

            // Afficher ma position
            listEl.innerHTML += `<div style="padding:10px 0;text-align:center;font-size:.75rem;color:var(--color-text-subheader);">
                <strong>Toi (${myName}) : ${myScore.toLocaleString('fr-FR')} pts</strong> · ${league.icon} Ligue ${league.name}
            </div>`;
        }

        // Events
        document.getElementById('publishScoreBtn')?.addEventListener('click', async () => {
            await publishScore();
            if (typeof window.showNotification === 'function') window.showNotification('Score publié ! 🏆', 'success', 3000);
        });

        document.querySelectorAll('.share-challenge-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const link = generateChallengLink(btn.dataset.challenge);
                navigator.clipboard?.writeText(link);
                if (navigator.share) {
                    navigator.share({ title: 'Défi Lyftiv', text: 'Je te lance un défi sur Lyftiv 💪', url: link });
                } else {
                    if (typeof window.showNotification === 'function') window.showNotification('Lien copié !', 'success', 2500);
                }
            });
        });

        document.getElementById('sharePrBtn')?.addEventListener('click', () => {
            const exercise = document.getElementById('prExercise')?.value?.trim();
            const weight   = parseFloat(document.getElementById('prWeight')?.value);
            const reps     = parseInt(document.getElementById('prReps')?.value);
            if (!exercise || !weight || !reps) {
                if (typeof window.showNotification === 'function') window.showNotification('Remplis tous les champs.', 'error', 2500);
                return;
            }
            renderSharePR(exercise, weight, reps).share();
        });
    }

    function _getNextLeague(score) {
        const leagues = [
            { name: 'Bronze',  icon: '🥉', color: 'hsl(25,70%,55%)',  min: 50   },
            { name: 'Argent',  icon: '🥈', color: 'hsl(220,20%,70%)', min: 200  },
            { name: 'Or',      icon: '🥇', color: 'hsl(45,90%,55%)',  min: 500  },
            { name: 'Platine', icon: '🔮', color: 'hsl(280,70%,70%)', min: 1000 },
            { name: 'Diamant', icon: '💎', color: 'hsl(200,90%,65%)', min: 2000 },
        ];
        return leagues.find(l => l.min > score) || null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        // Initialiser le panel si l'onglet Ligues existe
        const tabLigues = document.getElementById('tabLigues');
        if (tabLigues) {
            tabLigues.addEventListener('click', () => {
                renderLeaguePanel('panelLigues');
            });
            // Si l'onglet est déjà actif au chargement
            if (tabLigues.classList.contains('active')) {
                renderLeaguePanel('panelLigues');
            }
        }

        // Publier le score après chaque séance terminée (écouter l'event custom si disponible)
        document.addEventListener('lyftiv:sessionComplete', () => {
            if (window.LyftivAuth?.isLoggedIn?.()) publishScore();
        });
    }

    window.addEventListener('load', init);
    window.LyftivGamification = { computeScore, getLeagueFromScore, renderLeaguePanel, publishScore, renderSharePR };

})();
