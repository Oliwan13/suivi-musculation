// js/features/ai-coach.js — Coach IA Lyftiv
// Analyse l'historique local et génère des suggestions personnalisées
// Dépend : window.StorageAPI, window.state, window.FeatureFlags
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Guard : feature flag ─────────────────────────────────────────
    if (!window.FeatureFlags?.aiCoach) return;

    const StorageAPI = window.StorageAPI;

    // ── Helpers ──────────────────────────────────────────────────────

    /** Récupère l'historique complet depuis le storage */
    function getHistory() {
        return StorageAPI.get('workoutHistory') || [];
    }

    /** Récupère le profil utilisateur */
    function getProfile() {
        return StorageAPI.get('lyftivProfile') || {};
    }

    /**
     * Calcule la fréquence hebdomadaire moyenne sur les 4 dernières semaines
     * @param {Array} history
     */
    function avgWeeklyFrequency(history) {
        if (!history.length) return 0;
        const now = Date.now();
        const fourWeeksAgo = now - 28 * 24 * 3600 * 1000;
        const recent = history.filter(h => new Date(h.date).getTime() > fourWeeksAgo);
        return Math.round((recent.length / 4) * 10) / 10;
    }

    /**
     * Détecte les exercices stagnants (même poids sur 3+ séances consécutives)
     * @param {Array} history
     * @returns {Array} tableau de { name, weight, sessions }
     */
    function detectStagnation(history) {
        const exerciseMap = {}; // name → [weights in order]

        history.slice(-20).forEach(session => {
            (session.exercises || []).forEach(ex => {
                if (!exerciseMap[ex.name]) exerciseMap[ex.name] = [];
                const maxWeight = Math.max(...(ex.series || []).map(s => s.weight || 0));
                if (maxWeight > 0) exerciseMap[ex.name].push(maxWeight);
            });
        });

        return Object.entries(exerciseMap)
            .filter(([, weights]) => {
                if (weights.length < 3) return false;
                const last3 = weights.slice(-3);
                return last3.every(w => w === last3[0]);
            })
            .map(([name, weights]) => ({
                name,
                weight: weights[weights.length - 1],
                sessions: weights.length
            }));
    }

    /**
     * Détecte les exercices avec progression récente
     * @param {Array} history
     */
    function detectProgress(history) {
        const exerciseMap = {};

        history.slice(-10).forEach(session => {
            (session.exercises || []).forEach(ex => {
                if (!exerciseMap[ex.name]) exerciseMap[ex.name] = [];
                const maxWeight = Math.max(...(ex.series || []).map(s => s.weight || 0));
                if (maxWeight > 0) exerciseMap[ex.name].push(maxWeight);
            });
        });

        return Object.entries(exerciseMap)
            .filter(([, weights]) => {
                if (weights.length < 2) return false;
                return weights[weights.length - 1] > weights[0];
            })
            .map(([name, weights]) => ({
                name,
                gain: Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10,
                from: weights[0],
                to: weights[weights.length - 1]
            }))
            .sort((a, b) => b.gain - a.gain)
            .slice(0, 3);
    }

    /**
     * Suggère une surcharge progressive (+ 2.5 kg ou + 1 rep)
     */
    function buildProgressionTarget(history, profile) {
        const exerciseMap = {};

        history.slice(-10).forEach(session => {
            (session.exercises || []).forEach(ex => {
                const maxWeight = Math.max(...(ex.series || []).map(s => s.weight || 0));
                const maxReps   = Math.max(...(ex.series || []).map(s => s.reps || 0));
                if (!exerciseMap[ex.name] || maxWeight > exerciseMap[ex.name].weight) {
                    exerciseMap[ex.name] = { weight: maxWeight, reps: maxReps };
                }
            });
        });

        const targets = Object.entries(exerciseMap)
            .filter(([, v]) => v.weight > 0)
            .slice(0, 4)
            .map(([name, v]) => ({
                name,
                currentWeight: v.weight,
                targetWeight: Math.round((v.weight + 2.5) * 2) / 2, // +2.5 kg arrondi au 0.5
                currentReps: v.reps
            }));

        return targets;
    }

    /**
     * Calcule un score de récupération basique (jours depuis dernière séance)
     */
    function recoveryScore(history) {
        if (!history.length) return null;
        const lastDate = new Date(history[history.length - 1].date).getTime();
        const daysSince = Math.floor((Date.now() - lastDate) / (24 * 3600 * 1000));
        if (daysSince === 0) return { label: 'Aujourd\'hui', icon: '🔥', color: 'hsl(210,80%,58%)', days: 0 };
        if (daysSince === 1) return { label: 'Hier', icon: '✅', color: 'hsl(145,65%,48%)', days: 1 };
        if (daysSince <= 3) return { label: `${daysSince} jours`, icon: '💪', color: 'hsl(145,65%,48%)', days: daysSince };
        if (daysSince <= 7) return { label: `${daysSince} jours`, icon: '⚠️', color: 'hsl(35,80%,54%)', days: daysSince };
        return { label: `${daysSince} jours`, icon: '😴', color: 'hsl(0,65%,55%)', days: daysSince };
    }

    // ── Rendu HTML des insights ──────────────────────────────────────

    function renderInsight(icon, title, body, color = 'hsl(220,80%,60%)') {
        return `
        <div style="background:var(--color-surface-muted);border:1px solid var(--color-border-default);
                    border-left:3px solid ${color};border-radius:var(--radius-base);
                    padding:var(--spacing-md);margin-bottom:var(--spacing-sm);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:1.2rem">${icon}</span>
                <span style="font-weight:700;font-size:var(--font-size-sm);color:var(--color-text-header)">${title}</span>
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-subheader);line-height:1.5">${body}</div>
        </div>`;
    }

    function runAnalysis() {
        const history  = getHistory();
        const profile  = getProfile();
        const insights = document.getElementById('aiCoachInsights');
        const placeholder = document.getElementById('aiCoachPlaceholder');
        const btn      = document.getElementById('aiCoachGenerateBtn');
        const btnIcon  = document.getElementById('aiCoachBtnIcon');
        const btnText  = document.getElementById('aiCoachBtnText');
        const progressionEl = document.getElementById('aiProgressionTarget');

        if (!insights) return;

        // Loading state
        btn.disabled = true;
        btnIcon.textContent = '⏳';
        btnText.textContent = 'Analyse en cours…';

        // Simuler un délai pour l'effet "analyse" (calcul local instantané)
        setTimeout(() => {
            if (!history.length) {
                placeholder?.classList.remove('hidden');
                insights.classList.add('hidden');
                btn.disabled = false;
                btnIcon.textContent = '✨';
                btnText.textContent = 'Analyser mes séances';
                return;
            }

            placeholder?.classList.add('hidden');
            insights.classList.remove('hidden');

            const freq       = avgWeeklyFrequency(history);
            const stagnating = detectStagnation(history);
            const progressing = detectProgress(history);
            const recovery   = recoveryScore(history);
            const targets    = buildProgressionTarget(history, profile);

            let html = '';

            // ── Récupération ─────────────────────────────────────────
            if (recovery) {
                const msg = recovery.days === 0
                    ? 'Tu viens de t\'entraîner. Assure-toi de bien récupérer.'
                    : recovery.days <= 3
                    ? `Dernière séance il y a ${recovery.label}. Tu es bien récupéré(e) pour une nouvelle séance.`
                    : recovery.days <= 7
                    ? `${recovery.label} sans séance. Une consistance de 3-4x/semaine optimise les gains.`
                    : `${recovery.label} sans séance. Reprends dès aujourd'hui pour maintenir tes acquis !`;

                html += renderInsight(recovery.icon, 'Récupération', msg, recovery.color);
            }

            // ── Fréquence ────────────────────────────────────────────
            const freqMsg = freq < 2
                ? `Tu t'entraînes <strong>${freq}x/semaine</strong> en moyenne. Vise 3x pour maximiser les adaptations musculaires.`
                : freq >= 4
                ? `Excellent rythme : <strong>${freq}x/semaine</strong>. Intègre 1-2 jours de repos actif pour optimiser la récupération.`
                : `Bonne fréquence : <strong>${freq}x/semaine</strong>. Continue sur cette lancée !`;
            html += renderInsight('📅', 'Fréquence d\'entraînement', freqMsg, 'hsl(210,80%,58%)');

            // ── Progression ──────────────────────────────────────────
            if (progressing.length) {
                const list = progressing.map(p =>
                    `<strong>${p.name}</strong> : +${p.gain} kg (${p.from} → ${p.to} kg)`
                ).join('<br>');
                html += renderInsight('📈', 'Progressions récentes', list, 'hsl(145,65%,48%)');
            }

            // ── Stagnation ───────────────────────────────────────────
            if (stagnating.length) {
                const list = stagnating.map(s =>
                    `<strong>${s.name}</strong> : ${s.weight} kg sur les ${s.sessions} dernières séances`
                ).join('<br>');
                const advice = 'Essaie la <em>surcharge progressive</em> : +2.5 kg ou +1 répétition par séance.';
                html += renderInsight('⚠️', 'Stagnation détectée', list + '<br><br>' + advice, 'hsl(35,80%,54%)');
            }

            // ── Volume total ─────────────────────────────────────────
            const totalTonnage = history.slice(-5).reduce((acc, s) => {
                return acc + (s.exercises || []).reduce((a, ex) => {
                    return a + (ex.series || []).reduce((b, sr) => b + (sr.reps || 0) * (sr.weight || 0), 0);
                }, 0);
            }, 0);

            if (totalTonnage > 0) {
                const avg5 = Math.round(totalTonnage / Math.min(history.length, 5));
                html += renderInsight('⚡', 'Volume moyen (5 dernières séances)', `<strong>${avg5.toLocaleString('fr-FR')} kg·rep</strong> par séance. Le volume est le principal driver de l'hypertrophie.`, 'hsl(280,72%,62%)');
            }

            // ── Conseil récupération ─────────────────────────────────
            html += renderInsight('💤', 'Conseil récupération', 'Priorité : <strong>7-9h de sommeil</strong> et 1.6-2.2g de protéines/kg/j pour maximiser la synthèse musculaire.', 'hsl(198,75%,48%)');

            insights.innerHTML = html;

            // ── Objectifs de progression ─────────────────────────────
            if (progressionEl && targets.length) {
                progressionEl.innerHTML = targets.map(t =>
                    `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border-default);">
                        <span style="font-weight:600;font-size:var(--font-size-sm);color:var(--color-text-header)">${t.name}</span>
                        <span style="font-size:var(--font-size-xs);color:var(--color-text-subheader);">
                            ${t.currentWeight} kg → <strong style="color:hsl(145,65%,48%)">${t.targetWeight} kg</strong>
                        </span>
                    </div>`
                ).join('') + `<p style="font-size:var(--font-size-xs);color:var(--color-text-subheader);margin-top:var(--spacing-sm);margin-bottom:0;">Progression suggérée : +2.5 kg dès que tu réalises toutes les séries cibles.</p>`;
            }

            // Reset button
            btn.disabled = false;
            btnIcon.textContent = '🔄';
            btnText.textContent = 'Réanalyser';

        }, 600); // délai "analyse" UX
    }

    // ── Init ─────────────────────────────────────────────────────────

    function init() {
        const btn = document.getElementById('aiCoachGenerateBtn');
        if (!btn) return;

        btn.addEventListener('click', runAnalysis);

        // Auto-analyse si historique existant (silent, au chargement de l'onglet)
        const tabCoach = document.getElementById('tabCoach');
        if (tabCoach) {
            tabCoach.addEventListener('click', () => {
                const history = StorageAPI.get('workoutHistory') || [];
                if (history.length > 0) {
                    setTimeout(runAnalysis, 100);
                }
            });
        }
    }

    // Attendre window load — StorageAPI est exposé après le chargement de storage.js
    window.addEventListener('load', init);

})();
