// js/features/ai-coach.js — Coach IA Lyftiv
// Analyse + Générateur de programme basé sur TrainingScience
// Dépend : window.StorageAPI, window.FeatureFlags, window.TrainingScience, window.state
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
    //  ANALYSE — Calculs sur l'historique
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
                const w = Math.max(...(ex.series || []).map(sr => sr.weight || 0));
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
                const w = Math.max(...(ex.series || []).map(sr => sr.weight || 0));
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
                const w = Math.max(...(ex.series || []).map(sr => sr.weight || 0));
                const r = Math.max(...(ex.series || []).map(sr => sr.reps   || 0));
                if (!map[ex.name] || w > map[ex.name].weight) map[ex.name] = { weight: w, reps: r };
            });
        });
        return Object.entries(map).filter(([, v]) => v.weight > 0).slice(0, 4)
            .map(([name, v]) => ({ name, currentWeight: v.weight, targetWeight: Math.round((v.weight + 2.5) * 2) / 2 }));
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
    //  RENDU — Insight card
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

        btn.disabled = true;
        btnIcon.textContent = '⏳';
        btnText.textContent = 'Analyse en cours…';

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

            const freq        = avgWeeklyFrequency(history);
            const stagnating  = detectStagnation(history);
            const progressing = detectProgress(history);
            const recovery    = recoveryScore(history);
            const targets     = buildProgressionTargets(history);
            let html = '';

            // Récupération
            if (recovery) {
                const msg = recovery.days === 0 ? "Tu viens de t'entraîner. Assure-toi de bien récupérer."
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
                const avg = Math.round(tonnage / Math.min(history.length, 5));
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

            // Nutrition
            html += renderInsight('💤', 'Récupération & Nutrition',
                '<strong>7-9h de sommeil</strong> et <strong>1.6-2.2g de protéines/kg/j</strong> pour maximiser la synthèse musculaire.',
                'hsl(198,75%,48%)');

            // Technique avancée si utilisateur expérimenté
            if (history.length >= 5 && TS?.advancedTechniques?.lengthened_partials) {
                const lp = TS.advancedTechniques.lengthened_partials;
                html += renderInsight('🔬', 'Technique avancée suggérée',
                    `<strong>${lp.name}</strong> : ${lp.description}<br><em>${lp.usage}</em>`,
                    'hsl(280,72%,62%)');
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

            btn.disabled = false;
            btnIcon.textContent = '🔄';
            btnText.textContent = 'Réanalyser';
        }, 600);
    }

    // ══════════════════════════════════════════════════════════════════
    //  GÉNÉRATEUR DE PROGRAMME
    // ══════════════════════════════════════════════════════════════════

    function normalizeLevel(raw) {
        const map = { debutant:'beginner', beginner:'beginner', intermediaire:'intermediate', intermediate:'intermediate', avance:'advanced', advanced:'advanced' };
        return map[raw] || 'beginner';
    }

    function normalizeGoal(raw) {
        const map = { muscle:'muscle', prise_masse:'muscle', force:'strength', strength:'strength', perte_poids:'weight_loss', weight_loss:'weight_loss', athletic:'athletic', general:'general', sante:'general' };
        return map[raw] || 'general';
    }

    function chooseSplit(level, frequency) {
        if (level === 'beginner' || frequency <= 3) {
            if (frequency <= 2) return [
                { name: 'Full Body A', muscles: ['chest','back_lats','quads','shoulders_lateral'] },
                { name: 'Full Body B', muscles: ['back_upper','hamstrings','glutes','biceps','triceps'] },
            ];
            return [
                { name: 'Full Body A', muscles: ['chest','back_lats','quads','shoulders_lateral'] },
                { name: 'Full Body B', muscles: ['back_upper','hamstrings','glutes','biceps','triceps'] },
                { name: 'Full Body C', muscles: ['chest','back_lats','shoulders_anterior','quads','hamstrings'] },
            ];
        }
        if (level === 'intermediate' && frequency === 4) return [
            { name: 'Upper A — Force',        muscles: ['chest','back_lats','back_upper','shoulders_anterior'] },
            { name: 'Lower A — Force',        muscles: ['quads','hamstrings','glutes','calves'] },
            { name: 'Upper B — Hypertrophie', muscles: ['chest','back_lats','shoulders_lateral','biceps','triceps'] },
            { name: 'Lower B — Hypertrophie', muscles: ['quads','hamstrings','glutes','calves'] },
        ];
        if (level === 'advanced' && frequency >= 5) return [
            { name: 'Upper',  muscles: ['chest','back_lats','shoulders_anterior','back_upper'] },
            { name: 'Lower',  muscles: ['quads','hamstrings','glutes','calves'] },
            { name: 'Pull',   muscles: ['back_lats','back_upper','biceps'] },
            { name: 'Push',   muscles: ['chest','shoulders_lateral','triceps'] },
            { name: 'Legs',   muscles: ['quads','hamstrings','glutes','calves'] },
        ].slice(0, frequency);
        // PPL intermédiaire 5-6j
        return [
            { name: 'Push — Pecs · Épaules · Triceps', muscles: ['chest','shoulders_lateral','shoulders_anterior','triceps'] },
            { name: 'Pull — Dos · Biceps',              muscles: ['back_lats','back_upper','biceps'] },
            { name: 'Legs — Cuisses · Fessiers',        muscles: ['quads','hamstrings','glutes','calves'] },
            { name: 'Push B',                           muscles: ['chest','shoulders_lateral','triceps'] },
            { name: 'Pull B',                           muscles: ['back_lats','back_upper','biceps'] },
            { name: 'Legs B',                           muscles: ['quads','hamstrings','glutes','calves'] },
        ].slice(0, Math.min(frequency, 6));
    }

    function buildSession(sessionDef, level, repRange, equipment) {
        const tiers   = TS?.exerciseTiers || {};
        const setsMap = TS?.sessionConstruction?.setsPerExercise || {};
        const exCount = TS?.sessionConstruction?.exercisesPerSession?.[level] || { min: 4, max: 6 };
        const target  = Math.round((exCount.min + exCount.max) / 2);
        const exercises = [];

        const filterEquip = (list) => {
            if (equipment === 'minimal') {
                const bw = ['tractions','dips','pompes','fentes','hip thrust','circuit','relevé','glute'];
                const f = list.filter(e => bw.some(k => e.toLowerCase().includes(k)));
                return f.length ? f : list.slice(0, 1);
            }
            if (equipment === 'home') {
                const f = list.filter(e => !['machine','hack squat','pendulum','pec deck','poulie','câble','cable'].some(k => e.toLowerCase().includes(k)));
                return f.length ? f : list.slice(0, 1);
            }
            return list;
        };

        sessionDef.muscles.forEach((muscle, idx) => {
            if (exercises.length >= target) return;
            const mt = tiers[muscle];
            if (!mt) return;
            const candidates = filterEquip([...(mt.S || []), ...(mt.A || [])]);
            const chosen = candidates.find(e => !exercises.some(ex => ex.name === e));
            if (!chosen) return;

            const isMain = idx === 0;
            const sets   = isMain ? (setsMap.main_compound?.max || 4)
                         : idx <= 2 ? (setsMap.secondary?.max || 3)
                         : (setsMap.isolation?.max || 3);
            const [rMin, rMax] = repRange;
            exercises.push({ name: chosen, rest: isMain ? '120s' : '75s', series: [`${sets} x ${rMin}-${rMax}`], isDefault: false });
        });

        return { name: sessionDef.name, isDefault: false, exercises };
    }

    function generateProgram(profile) {
        const level     = normalizeLevel(profile.level);
        const goal      = normalizeGoal(profile.goal);
        const frequency = parseInt(profile.frequency) || 3;
        const equipment = profile.equipment || 'gym';
        const repRange  = TS?.goalMapping?.[goal]?.repRange || [8, 12];
        return chooseSplit(level, frequency).map(def => buildSession(def, level, repRange, equipment));
    }

    // ── Aperçu HTML des séances ───────────────────────────────────────

    function renderProgramPreview(sessions) {
        return sessions.map((s, i) =>
            `<div style="background:var(--color-surface-muted);border:1px solid var(--color-border-default);
                    border-radius:var(--radius-base);padding:var(--spacing-md);margin-bottom:var(--spacing-sm);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-weight:700;font-size:var(--font-size-sm);color:var(--color-text-header);">${i+1}. ${s.name}</span>
                    <span style="font-size:var(--font-size-xs);color:var(--color-text-subheader);">${s.exercises.length} ex.</span>
                </div>
                <div style="font-size:var(--font-size-xs);color:var(--color-text-subheader);line-height:1.6;">
                    ${s.exercises.slice(0, 4).map(e => `• ${e.name} <em style="opacity:.7">(${e.series[0]})</em>`).join('<br>')}
                    ${s.exercises.length > 4 ? `<br><em style="opacity:.6">+ ${s.exercises.length - 4} autres…</em>` : ''}
                </div>
            </div>`
        ).join('');
    }

    // ── Bottom sheet de confirmation ──────────────────────────────────

    function showProgramModal(sessions, profile) {
        document.getElementById('aiProgramModal')?.remove();

        const levelLabel = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' };
        const goalLabel  = { muscle: 'Hypertrophie', strength: 'Force', weight_loss: 'Perte de poids', athletic: 'Athlétique', general: 'Général' };
        const level = normalizeLevel(profile.level);
        const goal  = normalizeGoal(profile.goal);
        const freq  = parseInt(profile.frequency) || 3;

        const modal = document.createElement('div');
        modal.id = 'aiProgramModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,0.65);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity 0.25s;';

        modal.innerHTML = `
        <div id="aiProgramSheet" style="
            background:var(--color-surface-default);
            border-radius:20px 20px 0 0;
            width:100%;max-width:540px;
            padding:24px 20px calc(28px + env(safe-area-inset-bottom,0px));
            max-height:88vh;overflow-y:auto;
            transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.34,1.1,0.64,1);
        ">
            <div style="width:40px;height:4px;background:var(--color-border-default);border-radius:2px;margin:0 auto 20px;"></div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,hsl(220,80%,60%),hsl(280,70%,65%));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🏗️</div>
                <div>
                    <div style="font-weight:900;font-size:1.1rem;color:var(--color-text-header);">Nouveau programme</div>
                    <div style="font-size:0.75rem;color:var(--color-text-subheader);">${levelLabel[level] || level} · ${goalLabel[goal] || goal} · ${freq}j/sem.</div>
                </div>
            </div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:hsla(220,80%,60%,0.12);border:1px solid hsla(220,80%,60%,0.3);border-radius:20px;padding:4px 12px;font-size:0.72rem;color:hsl(220,80%,65%);font-weight:700;margin-bottom:16px;">
                🔬 Exercices S-Tier · Jeff Nippard Science
            </div>
            <div id="aiProgramPreview" style="margin-bottom:16px;">${renderProgramPreview(sessions)}</div>
            <div style="background:hsla(35,90%,55%,0.1);border:1px solid hsla(35,80%,54%,0.3);border-radius:10px;padding:12px;margin-bottom:16px;font-size:0.73rem;color:var(--color-text-subheader);line-height:1.5;">
                ⚠️ <strong>Attention :</strong> Ce programme remplacera tes séances actuelles. Ton historique et tes records sont conservés.
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="aiProgramConfirmBtn" class="btn btn-primary" style="width:100%;height:52px;font-size:1rem;font-weight:800;">✅ Appliquer ce programme</button>
                <button id="aiProgramCancelBtn"  class="btn" style="width:100%;background:var(--color-surface-muted);color:var(--color-text-default);">Annuler</button>
            </div>
        </div>`;

        document.body.appendChild(modal);

        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            document.getElementById('aiProgramSheet').style.transform = 'translateY(0)';
        });

        const close = () => {
            modal.style.opacity = '0';
            document.getElementById('aiProgramSheet').style.transform = 'translateY(100%)';
            setTimeout(() => modal.remove(), 300);
        };

        document.getElementById('aiProgramCancelBtn').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
        document.getElementById('aiProgramConfirmBtn').addEventListener('click', () => {
            applyProgram(sessions);
            close();
        });
    }

    function applyProgram(sessions) {
        if (!sessions?.length) return;
        if (window.state) { window.state.sessions = sessions; window.state.currentSessionIndex = 0; }
        StorageAPI?.set('userSessions', sessions);
        StorageAPI?.remove('inProgressWorkout');
        if (typeof window.updateSessionSelectOptions === 'function') window.updateSessionSelectOptions();
        if (typeof window.showNotification === 'function') window.showNotification(`🏗️ Programme appliqué — ${sessions.length} séances chargées !`, 'success', 4000);
        if (typeof window.showDashboard === 'function') setTimeout(window.showDashboard, 400);
    }

    // ── Handler bouton génération ─────────────────────────────────────

    function runProgramGeneration() {
        const profile   = getProfile();
        const btn       = document.getElementById('aiProgramGenBtn');
        const btnText   = document.getElementById('aiProgramGenBtnText');
        if (btn) btn.disabled = true;
        if (btnText) btnText.textContent = 'Génération…';

        setTimeout(() => {
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Générer un programme';

            const sessions = generateProgram(profile);
            if (!sessions?.length) {
                if (typeof window.showNotification === 'function')
                    window.showNotification('Complète ton profil (niveau, objectif, fréquence) pour générer un programme.', 'info', 4000);
                return;
            }
            showProgramModal(sessions, profile);
        }, 500);
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        document.getElementById('aiCoachGenerateBtn')?.addEventListener('click', runAnalysis);
        document.getElementById('aiProgramGenBtn')?.addEventListener('click', runProgramGeneration);
        document.getElementById('tabCoach')?.addEventListener('click', () => {
            if (getHistory().length > 0) setTimeout(runAnalysis, 100);
            renderProfileBadges();
        });
        renderProfileBadges();
    }

    /** Affiche les badges niveau/objectif/fréquence dans le générateur */
    function renderProfileBadges() {
        const el = document.getElementById('aiProgramBadges');
        if (!el) return;
        const p = getProfile();
        const levelLabel = { debutant:'Débutant', beginner:'Débutant', intermediaire:'Intermédiaire', intermediate:'Intermédiaire', avance:'Avancé', advanced:'Avancé' };
        const goalLabel  = { muscle:'💪 Muscle', prise_masse:'💪 Muscle', force:'🏋️ Force', strength:'🏋️ Force', perte_poids:'🔥 Poids', weight_loss:'🔥 Poids', athletic:'⚡ Athlétique', general:'🌿 Général', sante:'🌿 Général' };
        const badgeStyle = 'display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;';
        const badges = [];
        if (p.level) badges.push(`<span style="${badgeStyle}background:hsla(220,80%,60%,0.15);color:hsl(220,80%,65%);border:1px solid hsla(220,80%,60%,0.3);">📊 ${levelLabel[p.level] || p.level}</span>`);
        if (p.goal)  badges.push(`<span style="${badgeStyle}background:hsla(145,65%,48%,0.15);color:hsl(145,65%,50%);border:1px solid hsla(145,65%,48%,0.3);">${goalLabel[p.goal] || p.goal}</span>`);
        if (p.frequency) badges.push(`<span style="${badgeStyle}background:hsla(35,80%,54%,0.15);color:hsl(35,80%,58%);border:1px solid hsla(35,80%,54%,0.3);">📅 ${p.frequency}j/sem.</span>`);
        if (p.equipment) badges.push(`<span style="${badgeStyle}background:hsla(280,70%,60%,0.15);color:hsl(280,70%,65%);border:1px solid hsla(280,70%,60%,0.3);">${p.equipment === 'gym' ? '🏋️ Salle' : p.equipment === 'home' ? '🏠 Home gym' : '🎽 Poids du corps'}</span>`);
        el.innerHTML = badges.length
            ? badges.join('')
            : `<span style="font-size:0.72rem;color:var(--color-text-subheader);font-style:italic;">Complète ton profil pour une génération personnalisée.</span>`;
    }

    window.addEventListener('load', init);

})();
