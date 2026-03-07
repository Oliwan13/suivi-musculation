// js/features/ai-coach.js — Coach IA Lyftiv
// Analyse l'historique · Génère des insights via Claude API (claude-sonnet-4-20250514)
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
    //  CALCULS LOCAUX (fallback + enrichissement du prompt)
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
    //  RENDU INSIGHT (HTML template)
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
    //  CONSTRUCTION DU PROMPT CLAUDE
    // ══════════════════════════════════════════════════════════════════

    function buildCoachPrompt(history, profile, stats) {
        const last5 = history.slice(-5).map(s => ({
            date: s.date,
            session: s.sessionName,
            exercises: (s.exercises || []).map(ex => ({
                name: ex.name,
                series: (ex.series || []).map(sr => `${sr.reps||0}×${sr.weight||0}kg`).join(', ')
            }))
        }));

        const profileStr = [
            profile.name ? `Prénom : ${profile.name}` : null,
            profile.goal ? `Objectif : ${profile.goal}` : null,
            profile.level ? `Niveau : ${profile.level}` : null,
            profile.frequency ? `Fréquence cible : ${profile.frequency}j/sem` : null,
            profile.equipment ? `Équipement : ${profile.equipment}` : null,
        ].filter(Boolean).join(' | ');

        return `Tu es un coach sportif expert en musculation basé sur la science (science-based). 
Analyse les données d'entraînement ci-dessous et génère un coaching personnalisé en français.

PROFIL UTILISATEUR: ${profileStr || 'Non renseigné'}

STATISTIQUES CLÉS:
- Fréquence hebdomadaire (28 derniers jours) : ${stats.freq}x/sem
- Dernière séance : ${stats.recovery ? stats.recovery.label : 'Inconnue'}
- Stagnations détectées : ${stats.stagnating.map(s => s.name).join(', ') || 'Aucune'}
- Progressions récentes : ${stats.progressing.map(p => `${p.name} +${p.gain}kg`).join(', ') || 'Aucune'}
- Tonnage moyen (5 dernières) : ${stats.avgTonnage.toLocaleString('fr-FR')} kg·rep/séance

5 DERNIÈRES SÉANCES:
${JSON.stringify(last5, null, 2)}

INSTRUCTIONS:
Réponds UNIQUEMENT avec du JSON valide, sans balises markdown, dans ce format exact:
{
  "insights": [
    {
      "icon": "emoji",
      "title": "Titre court (max 4 mots)",
      "body": "Conseil détaillé basé sur les données (2-3 phrases, peut contenir du HTML simple: <strong>, <em>, <br>)",
      "color": "hsl(valeur)"
    }
  ],
  "summary": "Phrase de synthèse motivante personnalisée (1 phrase)",
  "nextSessionTip": "Conseil concret pour la prochaine séance (1-2 phrases)"
}

Génère 4 à 6 insights pertinents basés sur les vraies données. 
Couleurs suggérées: succès=hsl(145,65%,48%), avertissement=hsl(35,80%,54%), info=hsl(210,80%,58%), danger=hsl(0,65%,55%), avancé=hsl(280,72%,62%).
Sois direct, encourageant et scientifiquement précis. Utilise le prénom si disponible.`;
    }

    // ══════════════════════════════════════════════════════════════════
    //  APPEL CLAUDE API
    // ══════════════════════════════════════════════════════════════════

    async function fetchClaudeInsights(prompt) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error('API error ' + response.status);
        const data = await response.json();
        const text = data.content.map(i => i.text || '').join('');
        // Nettoyer les balises markdown potentielles
        const clean = text.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }

    // ══════════════════════════════════════════════════════════════════
    //  ANALYSE PRINCIPALE
    // ══════════════════════════════════════════════════════════════════

    async function runAnalysis() {
        const history     = getHistory();
        const profile     = getProfile();
        const insights    = document.getElementById('aiCoachInsights');
        const placeholder = document.getElementById('aiCoachPlaceholder');
        const btn         = document.getElementById('aiCoachGenerateBtn');
        const btnIcon     = document.getElementById('aiCoachBtnIcon');
        const btnText     = document.getElementById('aiCoachBtnText');
        const progressEl  = document.getElementById('aiProgressionTarget');
        if (!insights) return;

        btn.disabled        = true;
        btnIcon.textContent = '⏳';
        btnText.textContent = 'Analyse IA en cours…';

        if (!history.length) {
            placeholder?.classList.remove('hidden');
            insights.classList.add('hidden');
            btn.disabled        = false;
            btnIcon.textContent = '✨';
            btnText.textContent = 'Analyser mes séances';
            return;
        }

        // Calculs locaux pour enrichir le prompt
        const freq        = avgWeeklyFrequency(history);
        const stagnating  = detectStagnation(history);
        const progressing = detectProgress(history);
        const recovery    = recoveryScore(history);
        const targets     = buildProgressionTargets(history);
        const tonnage     = history.slice(-5).reduce((acc, s) =>
            acc + (s.exercises||[]).reduce((a, ex) =>
                a + (ex.series||[]).reduce((b, sr) => b + (sr.reps||0)*(sr.weight||0), 0), 0), 0);
        const avgTonnage  = history.length ? Math.round(tonnage / Math.min(history.length, 5)) : 0;

        placeholder?.classList.add('hidden');
        insights.classList.remove('hidden');

        // Afficher un état de chargement pendant l'appel API
        insights.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:var(--spacing-xl) 0;color:var(--color-text-subheader);">
                <div style="font-size:2rem;animation:spin 1s linear infinite;">⚙️</div>
                <div style="font-size:0.85rem;font-weight:600;">Claude analyse tes ${history.length} séances…</div>
                <div style="font-size:0.75rem;opacity:0.7;">Cela prend quelques secondes</div>
            </div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;

        try {
            const prompt = buildCoachPrompt(history, profile, { freq, stagnating, progressing, recovery, avgTonnage });
            const result = await fetchClaudeInsights(prompt);

            let html = '';

            // Résumé en haut si présent
            if (result.summary) {
                html += `<div style="background:hsla(214,80%,58%,0.1);border:1px solid hsla(214,80%,58%,0.25);border-radius:var(--radius-base);padding:var(--spacing-md);margin-bottom:var(--spacing-md);font-size:var(--font-size-sm);color:var(--color-text-default);font-weight:600;line-height:1.5;">
                    ✨ ${result.summary}
                </div>`;
            }

            // Insights générés par Claude
            (result.insights || []).forEach(ins => {
                html += renderInsight(ins.icon, ins.title, ins.body, ins.color || 'hsl(220,80%,60%)');
            });

            // Conseil prochaine séance
            if (result.nextSessionTip) {
                html += renderInsight('🎯', 'Conseil pour ta prochaine séance', result.nextSessionTip, 'hsl(280,72%,62%)');
            }

            // Alerte récupération depuis ProgramBuilder
            if (window.ProgramBuilder) {
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

            // Badge IA en haut à droite
            const badge = document.createElement('div');
            badge.style.cssText = 'text-align:right;margin-bottom:8px;font-size:0.68rem;color:var(--color-text-subheader);';
            badge.textContent = '⚡ Généré par Claude AI';
            insights.prepend(badge);

        } catch (err) {
            console.warn('[AI Coach] Fallback mode — Claude API unavailable:', err.message);
            // Fallback : analyse locale si l'API échoue
            _runLocalAnalysis(history, profile, { freq, stagnating, progressing, recovery, targets, tonnage, avgTonnage, insights });
        }

        // Objectifs de progression (toujours calculés localement)
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
    }

    // ══════════════════════════════════════════════════════════════════
    //  FALLBACK LOCAL (si API indisponible)
    // ══════════════════════════════════════════════════════════════════

    function _runLocalAnalysis(history, profile, { freq, stagnating, progressing, recovery, targets, tonnage, avgTonnage, insights }) {
        let html = '';

        if (recovery) {
            const msg = recovery.days === 0
                ? "Tu viens de t'entraîner. Assure-toi de bien récupérer avant la prochaine séance."
                : recovery.days <= 3 ? `Dernière séance il y a ${recovery.label}. Tu es bien récupéré(e).`
                : recovery.days <= 7 ? `${recovery.label} sans séance. Vise 3-4x/semaine pour maximiser les gains.`
                : `${recovery.label} sans séance. Reprends dès aujourd'hui pour maintenir tes acquis !`;
            html += renderInsight(recovery.icon, 'Récupération', msg, recovery.color);
        }

        const freqMsg = freq < 2
            ? `Tu t'entraînes <strong>${freq}x/semaine</strong>. Vise <strong>3x minimum</strong>.`
            : freq >= 4
            ? `Excellent rythme : <strong>${freq}x/semaine</strong>.`
            : `Bonne fréquence : <strong>${freq}x/semaine</strong>. Continue !`;
        html += renderInsight('📅', 'Fréquence', freqMsg, 'hsl(210,80%,58%)');

        if (progressing.length) {
            html += renderInsight('📈', 'Progressions récentes',
                progressing.map(p => `<strong>${p.name}</strong> : +${p.gain} kg (${p.from} → ${p.to} kg)`).join('<br>'),
                'hsl(145,65%,48%)');
        }

        if (stagnating.length) {
            const inc = TS?.progressiveOverload?.weightIncrements?.upperBody ?? 2.5;
            html += renderInsight('⚠️', 'Stagnation détectée',
                stagnating.map(s => `<strong>${s.name}</strong> : ${s.weight} kg sur ${s.sessions} séances`).join('<br>')
                + `<br><br>Applique la <em>double progression</em> : atteins le haut de ta fourchette de reps, puis ajoute <strong>+${inc} kg</strong>.`,
                'hsl(35,80%,54%)');
        }

        if (avgTonnage > 0) {
            html += renderInsight('⚡', 'Volume moyen (5 dernières)',
                `<strong>${avgTonnage.toLocaleString('fr-FR')} kg·rep</strong>/séance.`,
                'hsl(280,72%,62%)');
        }

        html += renderInsight('💤', 'Récupération & Nutrition',
            '<strong>7-9h de sommeil</strong> et <strong>1.6-2.2g de protéines/kg/j</strong>.',
            'hsl(198,75%,48%)');

        insights.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════════════
    //  BADGES PROFIL
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
        document.getElementById('aiCoachGenerateBtn')?.addEventListener('click', runAnalysis);
        document.getElementById('aiProgramGenBtn')?.addEventListener('click', () => {
            window.ProgramBuilder?.open();
        });
        document.getElementById('tabCoach')?.addEventListener('click', () => {
            if (getHistory().length > 0) setTimeout(runAnalysis, 100);
            renderProfileBadges();
        });
        renderProfileBadges();
    }

    window.addEventListener('load', init);

})();
