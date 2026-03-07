// js/features/ai-coach.js — Coach IA Lyftiv
// Analyse l'historique · Délègue la génération à window.ProgramBuilder
// Dépend : window.StorageAPI, window.FeatureFlags, window.TrainingScience, window.ProgramBuilder
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    if (!window.FeatureFlags?.aiCoach) return;

    const StorageAPI = window.StorageAPI;
    const TS         = window.TrainingScience;

    // ══════════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════════

    function getHistory() {
        return StorageAPI.get('workoutHistory') || [];
    }

    function getProfile() {
        try { return JSON.parse(localStorage.getItem('lyftiv_profile')) || {}; }
        catch(e) { return {}; }
    }

    // ══════════════════════════════════════════════════════════════════
    //  CALCULS ANALYSE
    // ══════════════════════════════════════════════════════════════════

    function avgWeeklyFrequency(history) {
        if (!history.length) return 0;
        const ago = Date.now() - 28 * 86400000;
        return Math.round((history.filter(h => new Date(h.date).getTime() > ago).length / 4) * 10) / 10;
    }

    function detectStagnation(history) {
        const map = {};
        history.slice(-20).forEach(s => {
            (s.exercises || []).forEach(ex => {
                if (!map[ex.name]) map[ex.name] = [];
                const w = Math.max(0, ...(ex.series || []).map(sr => sr.weight || 0));
                if (w > 0) map[ex.name].push(w);
            });
        });
        return Object.entries(map)
            .filter(([, w]) => w.length >= 3 && w.slice(-3).every(v => v === w[w.length - 1]))
            .map(([name, w]) => ({ name, weight: w[w.length - 1], sessions: w.length }));
    }

    function detectProgress(history) {
        const map = {};
        history.slice(-10).forEach(s => {
            (s.exercises || []).forEach(ex => {
                if (!map[ex.name]) map[ex.name] = [];
                const w = Math.max(0, ...(ex.series || []).map(sr => sr.weight || 0));
                if (w > 0) map[ex.name].push(w);
            });
        });
        return Object.entries(map)
            .filter(([, w]) => w.length >= 2 && w[w.length - 1] > w[0])
            .map(([name, w]) => ({ name, gain: Math.round((w[w.length-1]-w[0])*10)/10, from: w[0], to: w[w.length-1] }))
            .sort((a, b) => b.gain - a.gain).slice(0, 3);
    }

    function buildProgressionTargets(history) {
        const map = {};
        history.slice(-10).forEach(s => {
            (s.exercises || []).forEach(ex => {
                const w = Math.max(0, ...(ex.series || []).map(sr => sr.weight || 0));
                const r = Math.max(0, ...(ex.series || []).map(sr => sr.reps   || 0));
                if (!map[ex.name] || w > map[ex.name].weight) map[ex.name] = { weight: w, reps: r };
            });
        });
        return Object.entries(map).filter(([, v]) => v.weight > 0).slice(0, 4)
            .map(([name, v]) => ({
                name,
                currentWeight: v.weight,
                targetWeight:  Math.round((v.weight + 2.5) * 2) / 2,
            }));
    }

    function recoveryScore(history) {
        if (!history.length) return null;
        const days = Math.floor((Date.now() - new Date(history[history.length-1].date).getTime()) / 86400000);
        if (days === 0) return { label: "Aujourd'hui", icon: '🔥', color: 'hsl(210,80%,58%)', days };
        if (days === 1) return { label: 'Hier',          icon: '✅', color: 'hsl(145,65%,48%)', days };
        if (days <= 3)  return { label: `${days} jours`, icon: '💪', color: 'hsl(145,65%,48%)', days };
        if (days <= 7)  return { label: `${days} jours`, icon: '⚠️', color: 'hsl(35,80%,54%)',  days };
        return              { label: `${days} jours`, icon: '😴', color: 'hsl(0,65%,55%)',    days };
    }

    // ══════════════════════════════════════════════════════════════════
    //  RENDU INSIGHT
    // ══════════════════════════════════════════════════════════════════

    function renderInsight(icon, title, body, color = 'hsl(220,80%,60%)') {
        return `<div style="background:var(--color-surface-muted);border:1px solid var(--color-border-default);
                    border-left:3px solid ${color};border-radius:var(--radius-base);
                    padding:var(--spacing-md);margin-bottom:var(--spacing-sm);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:1.2rem">${icon}</span>
                <span style="font-weight:700;font-size:var(--font-size-sm);color:var(--color-text-header)">${title}</span>
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-subheader);line-height:1.5">${body}</div>
        </div>`;
    }

    // ══════════════════════════════════════════════════════════════════
    //  ANALYSE PRINCIPALE
    // ══════════════════════════════════════════════════════════════════

    function runAnalysis() {
        const history     = getHistory();
        const insights    = document.getElementById('aiCoachInsights');
        const placeholder = document.getElementById('aiCoachPlaceholder');
        const btn         = document.getElementById('aiCoachGenerateBtn');
        const btnIcon     = document.getElementById('aiCoachBtnIcon');
        const btnText     = document.getElementById('aiCoachBtnText');
        const progressEl  = document.getElementById('aiProgressionTarget');
        if (!insights) return;

        btn.disabled        = true;
        btnIcon.textContent = '⏳';
        btnText.textContent = 'Analyse en cours…';

        setTimeout(() => {
            if (!history.length) {
                placeholder?.classList.remove('hidden');
                insights.classList.add('hidden');
                btn.disabled        = false;
                btnIcon.textContent = '✨';
                btnText.textContent = 'Analyser mes séances';
                return;
            }

            placeholder?.classList.add('hidden');
            insights.classList.remove('hidden');

            const freq        = avgWeeklyFrequency(history);
            const stagnating  = detectStagnation(history);
            const progressing = detectProgress(history);
            const recovery    = recoveryScore(history);
            const targets     = buildProgressionTargets(history);
            let html = '';

            // Récupération
            if (recovery) {
                const msg = recovery.days === 0
                    ? "Tu viens de t'entraîner. Assure-toi de bien récupérer avant la prochaine séance."
                    : recovery.days <= 3 ? `Dernière séance il y a ${recovery.label}. Tu es bien récupéré(e).`
                    : recovery.days <= 7 ? `${recovery.label} sans séance. Vise 3-4x/semaine pour maximiser les gains.`
                    : `${recovery.label} sans séance. Reprends dès aujourd'hui pour maintenir tes acquis !`;
                html += renderInsight(recovery.icon, 'Récupération', msg, recovery.color);
            }

            // Fréquence
            const freqMsg = freq < 2
                ? `Tu t'entraînes <strong>${freq}x/semaine</strong>. Vise <strong>3x minimum</strong> — 2 stimuli/muscle/semaine sont nécessaires pour optimiser la synthèse protéique.`
                : freq >= 4
                ? `Excellent rythme : <strong>${freq}x/semaine</strong>. Intègre 1-2 jours de repos actif.`
                : `Bonne fréquence : <strong>${freq}x/semaine</strong>. Continue !`;
            html += renderInsight('📅', 'Fréquence', freqMsg, 'hsl(210,80%,58%)');

            // Progressions
            if (progressing.length) {
                html += renderInsight('📈', 'Progressions récentes',
                    progressing.map(p => `<strong>${p.name}</strong> : +${p.gain} kg (${p.from} → ${p.to} kg)`).join('<br>'),
                    'hsl(145,65%,48%)');
            }

            // Stagnation
            if (stagnating.length) {
                const inc = TS?.progressiveOverload?.weightIncrements?.upperBody ?? 2.5;
                html += renderInsight('⚠️', 'Stagnation détectée',
                    stagnating.map(s => `<strong>${s.name}</strong> : ${s.weight} kg sur ${s.sessions} séances`).join('<br>')
                    + `<br><br>Applique la <em>double progression</em> : atteins le haut de ta fourchette de reps sur TOUTES les séries, puis ajoute <strong>+${inc} kg</strong>.`,
                    'hsl(35,80%,54%)');
            }

            // Volume
            const tonnage = history.slice(-5).reduce((acc, s) =>
                acc + (s.exercises||[]).reduce((a, ex) =>
                    a + (ex.series||[]).reduce((b, sr) => b + (sr.reps||0)*(sr.weight||0), 0), 0), 0);
            if (tonnage > 0) {
                const avg  = Math.round(tonnage / Math.min(history.length, 5));
                const note = TS?.volume?.weeklySetRange
                    ? ` Recommandation : <strong>${TS.volume.weeklySetRange.min}-${TS.volume.weeklySetRange.max} séries/muscle/sem.</strong> (inverted-U).`
                    : '';
                html += renderInsight('⚡', 'Volume moyen (5 dernières)', `<strong>${avg.toLocaleString('fr-FR')} kg·rep</strong>/séance.${note}`, 'hsl(280,72%,62%)');
            }

            // RIR
            if (TS?.intensity?.rirRange) {
                html += renderInsight('🎯', 'Intensité (RIR)',
                    `Travaille à <strong>${TS.intensity.rirRange.min}-${TS.intensity.rirRange.max} RIR</strong>. L'échec total n'est pas obligatoire — 1-2 RIR donne des résultats comparables.`,
                    'hsl(220,80%,60%)');
            }

            // Récupération / Nutrition
            html += renderInsight('💤', 'Récupération & Nutrition',
                '<strong>7-9h de sommeil</strong> et <strong>1.6-2.2g de protéines/kg/j</strong> pour maximiser la synthèse musculaire.',
                'hsl(198,75%,48%)');

            // Technique avancée
            if (history.length >= 5 && TS?.advancedTechniques?.lengthened_partials) {
                const lp = TS.advancedTechniques.lengthened_partials;
                html += renderInsight('🔬', 'Technique avancée suggérée',
                    `<strong>${lp.name}</strong> : ${lp.description}<br><em>${lp.usage}</em>`,
                    'hsl(280,72%,62%)');
            }

            // Alerte récupération depuis ProgramBuilder
            if (window.ProgramBuilder) {
                const profile = getProfile();
                const plannedDays = parseInt(profile.frequency) || 3;
                const rec = window.ProgramBuilder.analyzeRecovery(plannedDays);
                if (rec.level !== 'ok') {
                    html += renderInsight(
                        rec.level === 'danger' ? '🔴' : '🟡',
                        'Adhérence au programme',
                        rec.message + `<br><br><button onclick="window.ProgramBuilder.open()" style="
                            margin-top:6px;padding:6px 14px;border-radius:8px;font-size:.75rem;font-weight:700;
                            background:hsla(220,80%,60%,.18);border:1px solid hsl(220,80%,60%);
                            color:hsl(220,80%,65%);cursor:pointer;font-family:inherit;">
                            🏗️ Adapter mon programme
                        </button>`,
                        rec.level === 'danger' ? 'hsl(0,65%,55%)' : 'hsl(35,80%,54%)'
                    );
                }
            }

            insights.innerHTML = html;

            // Objectifs de progression
            if (progressEl && targets.length) {
                progressEl.innerHTML = targets.map(t =>
                    `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border-default);">
                        <span style="font-weight:600;font-size:var(--font-size-sm);color:var(--color-text-header)">${t.name}</span>
                        <span style="font-size:var(--font-size-xs);color:var(--color-text-subheader);">
                            ${t.currentWeight} kg → <strong style="color:hsl(145,65%,48%)">${t.targetWeight} kg</strong>
                        </span>
                    </div>`
                ).join('') + `<p style="font-size:var(--font-size-xs);color:var(--color-text-subheader);margin-top:var(--spacing-sm);margin-bottom:0;">
                    +2.5 kg dès que tu atteins toutes les séries cibles (double progression).
                </p>`;
            }

            btn.disabled        = false;
            btnIcon.textContent = '🔄';
            btnText.textContent = 'Réanalyser';
        }, 600);
    }

    // ══════════════════════════════════════════════════════════════════
    //  BADGES PROFIL (section générateur)
    // ══════════════════════════════════════════════════════════════════

    function renderProfileBadges() {
        const el = document.getElementById('aiProgramBadges');
        if (!el) return;
        const p = getProfile();
        const levelLabel = { debutant:'Débutant', beginner:'Débutant', intermediaire:'Intermédiaire', intermediate:'Intermédiaire', avance:'Avancé', advanced:'Avancé' };
        const goalLabel  = { muscle:'💪 Muscle', prise_masse:'💪 Muscle', force:'🏋️ Force', strength:'🏋️ Force', perte_poids:'🔥 Poids', weight_loss:'🔥 Poids', athletic:'⚡ Athlétique', general:'🌿 Général', sante:'🌿 Général' };
        const bs = 'display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:.72rem;font-weight:700;';
        const badges = [];
        if (p.level)     badges.push(`<span style="${bs}background:hsla(220,80%,60%,.15);color:hsl(220,80%,65%);border:1px solid hsla(220,80%,60%,.3);">📊 ${levelLabel[p.level] || p.level}</span>`);
        if (p.goal)      badges.push(`<span style="${bs}background:hsla(145,65%,48%,.15);color:hsl(145,65%,50%);border:1px solid hsla(145,65%,48%,.3);">${goalLabel[p.goal]  || p.goal}</span>`);
        if (p.frequency) badges.push(`<span style="${bs}background:hsla(35,80%,54%,.15);color:hsl(35,80%,58%);border:1px solid hsla(35,80%,54%,.3);">📅 ${p.frequency}j/sem.</span>`);
        if (p.equipment) badges.push(`<span style="${bs}background:hsla(280,70%,60%,.15);color:hsl(280,70%,65%);border:1px solid hsla(280,70%,60%,.3);">${p.equipment==='gym'?'🏋️ Salle':p.equipment==='home'?'🏠 Home gym':'🎽 Poids du corps'}</span>`);
        el.innerHTML = badges.length
            ? badges.join('')
            : `<span style="font-size:.72rem;color:var(--color-text-subheader);font-style:italic;">Complète ton profil pour une génération personnalisée.</span>`;
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        // Analyse
        document.getElementById('aiCoachGenerateBtn')?.addEventListener('click', runAnalysis);

        // Générateur → délègue à ProgramBuilder
        document.getElementById('aiProgramGenBtn')?.addEventListener('click', () => {
            window.ProgramBuilder?.open();
        });

        // Onglet Coach
        document.getElementById('tabCoach')?.addEventListener('click', () => {
            if (getHistory().length > 0) setTimeout(runAnalysis, 100);
            renderProfileBadges();
        });

        renderProfileBadges();
    }

    window.addEventListener('load', init);

})();
