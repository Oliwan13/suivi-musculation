// js/features/program-builder.js — Générateur de Programme Adaptatif Lyftiv
// Dépend : window.TrainingScience, window.StorageAPI, window.state
// Expose  : window.ProgramBuilder
// ══════════════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    const TS = window.TrainingScience;

    // ══════════════════════════════════════════════════════════════════════
    //  CONSTANTES UI
    // ══════════════════════════════════════════════════════════════════════

    const MUSCLE_LABELS = {
        chest:               '💪 Pectoraux',
        back_lats:           '🔙 Dos — Largeur',
        back_upper:          '🏋️ Dos — Épaisseur',
        shoulders_lateral:   '🏔️ Épaules latérales',
        shoulders_anterior:  '⬆️ Épaules avant',
        shoulders_posterior: '🔄 Épaules arrière',
        biceps:              '💪 Biceps',
        triceps:             '🔱 Triceps',
        quads:               '🦵 Quadriceps',
        hamstrings:          '🦵 Ischios',
        glutes:              '🍑 Fessiers',
        calves:              '🦶 Mollets',
    };

    const SPLIT_DEFINITIONS = {
        full_body: {
            label: 'Full Body',
            description: 'Corps entier — idéal débutant, 2-4j/sem.',
            icon: '🏋️',
            minDays: 2, maxDays: 4,
        },
        upper_lower: {
            label: 'Upper / Lower',
            description: 'Haut + bas alternés — optimal 4j/sem.',
            icon: '⬆️⬇️',
            minDays: 3, maxDays: 5,
        },
        ppl: {
            label: 'Push Pull Legs',
            description: 'Push-Pull-Legs — intermédiaire/avancé 3-6j.',
            icon: '🔁',
            minDays: 3, maxDays: 6,
        },
        split: {
            label: 'Split musculaire',
            description: 'Séance dédiée par groupe — avancé 4-6j.',
            icon: '🎯',
            minDays: 4, maxDays: 6,
        },
    };

    // ══════════════════════════════════════════════════════════════════════
    //  GÉNÉRATION DES SPLITS
    // ══════════════════════════════════════════════════════════════════════

    function buildSplitDef(splitType, days, priority) {
        const injectFirst = (arr) => {
            const p = priority.filter(m => !arr.includes(m));
            return [...p, ...arr.filter(m => !priority.includes(m))];
        };

        switch (splitType) {

            case 'full_body': {
                const baseA = injectFirst(['chest','back_lats','quads','shoulders_lateral']);
                const baseB = injectFirst(['back_upper','hamstrings','glutes','biceps','triceps']);
                return Array.from({ length: days }, (_, i) => ({
                    name: `Full Body ${String.fromCharCode(65 + i)}`,
                    muscles: i % 2 === 0 ? baseA : baseB,
                }));
            }

            case 'upper_lower': {
                const upper = injectFirst(['chest','back_lats','back_upper','shoulders_lateral','shoulders_anterior','biceps','triceps']);
                const lower = injectFirst(['quads','hamstrings','glutes','calves']);
                const patterns = {
                    3: ['upper','lower','upper'],
                    4: ['upper','lower','upper','lower'],
                    5: ['upper','lower','upper','lower','upper'],
                };
                return (patterns[days] || patterns[4]).map((type, i) => ({
                    name: type === 'upper' ? `Upper ${['A','B','C'][Math.floor(i/2)]}` : `Lower ${['A','B','C'][Math.floor(i/2)]}`,
                    muscles: type === 'upper' ? upper : lower,
                }));
            }

            case 'ppl': {
                const push = injectFirst(['chest','shoulders_lateral','shoulders_anterior','triceps']);
                const pull = injectFirst(['back_lats','back_upper','biceps','shoulders_posterior']);
                const legs = injectFirst(['quads','hamstrings','glutes','calves']);
                const pats = {
                    3: [['Push','push'],['Pull','pull'],['Legs','legs']],
                    4: [['Push A','push'],['Pull A','pull'],['Legs','legs'],['Push B','push']],
                    5: [['Push A','push'],['Pull A','pull'],['Legs A','legs'],['Push B','push'],['Pull B','pull']],
                    6: [['Push A','push'],['Pull A','pull'],['Legs A','legs'],['Push B','push'],['Pull B','pull'],['Legs B','legs']],
                };
                const pat = pats[Math.min(Math.max(days, 3), 6)];
                return pat.map(([name, type]) => ({
                    name,
                    muscles: type === 'push' ? push : type === 'pull' ? pull : legs,
                }));
            }

            case 'split': {
                const base = [
                    { name: 'Pectoraux & Triceps',        muscles: ['chest','triceps','shoulders_anterior'] },
                    { name: 'Dos & Biceps',               muscles: ['back_lats','back_upper','biceps'] },
                    { name: 'Épaules',                    muscles: ['shoulders_lateral','shoulders_anterior','shoulders_posterior'] },
                    { name: 'Quadriceps & Mollets',       muscles: ['quads','calves'] },
                    { name: 'Ischios & Fessiers',         muscles: ['hamstrings','glutes'] },
                    { name: 'Bras (Biceps + Triceps)',    muscles: ['biceps','triceps'] },
                ];
                // Séances de spécialisation pour les muscles prioritaires en tête
                const specials = priority.map(m => ({
                    name: `Spécialisation ${(MUSCLE_LABELS[m] || m).replace(/^[^ ]+ /, '')}`,
                    muscles: [m],
                    isSpecialization: true,
                }));
                return [...specials, ...base].slice(0, days);
            }

            default:
                return buildSplitDef('full_body', days, priority);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  CONSTRUCTION D'UNE SÉANCE
    // ══════════════════════════════════════════════════════════════════════

    function buildSession(sessionDef, level, repRange, equipment, priority) {
        const tiers   = TS?.exerciseTiers || {};
        const setsMap = TS?.sessionConstruction?.setsPerExercise || {};
        const exCount = TS?.sessionConstruction?.exercisesPerSession?.[level] || { min: 4, max: 7 };
        let remaining = Math.round((exCount.min + exCount.max) / 2);
        const exercises = [];

        const filterEquip = (list) => {
            if (equipment === 'minimal') {
                const bw = ['tractions','dips','pompes','fentes','hip thrust','circuit','relevé','glute','squat'];
                const f = list.filter(e => bw.some(k => e.toLowerCase().includes(k)));
                return f.length ? f : list.slice(0, 1);
            }
            if (equipment === 'home') {
                const blocked = ['machine','hack squat','pendulum','pec deck','câble','cable','poulie'];
                const f = list.filter(e => !blocked.some(k => e.toLowerCase().includes(k)));
                return f.length ? f : list.slice(0, 1);
            }
            return list;
        };

        sessionDef.muscles.forEach((muscle, idx) => {
            if (remaining <= 0) return;
            const mt = tiers[muscle];
            if (!mt) return;

            const isPrio = priority.includes(muscle);
            const candidates = filterEquip([...(mt.S || []), ...(mt.A || [])]);
            // Muscles prioritaires → 2 exercices ; autres → 1
            const slotCount = isPrio ? Math.min(2, remaining) : 1;

            for (let slot = 0; slot < slotCount; slot++) {
                const chosen = candidates.find(e => !exercises.some(ex => ex.name === e));
                if (!chosen) break;

                const isMain = idx === 0 && slot === 0;
                const sets = isMain
                    ? (setsMap.main_compound?.max || 4)
                    : (slot > 0 || idx > 2 ? (setsMap.isolation?.max || 3) : (setsMap.secondary?.max || 3));

                exercises.push({
                    name:        chosen,
                    rest:        isMain ? '120s' : '75s',
                    series:      [`${sets} x ${repRange[0]}-${repRange[1]}`],
                    muscleGroup: muscle,
                    isDefault:   false,
                });
                remaining--;
            }
        });

        return { name: sessionDef.name, isDefault: false, exercises };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  GÉNÉRATION COMPLÈTE
    // ══════════════════════════════════════════════════════════════════════

    function generateProgram(config) {
        const { splitType = 'ppl', days = 3, level = 'intermediate', goal = 'muscle', equipment = 'gym', priority = [] } = config;
        const repRange = TS?.goalMapping?.[goal]?.repRange || [8, 12];
        const splitDef = buildSplitDef(splitType, days, priority);
        return splitDef.map(def => buildSession(def, level, repRange, equipment, priority));
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ANALYSE RÉCUPÉRATION
    // ══════════════════════════════════════════════════════════════════════

    function analyzeRecovery(plannedDays) {
        let history = [];
        try { history = JSON.parse(localStorage.getItem('workoutHistory') || '[]'); } catch(e) {}

        const ago = Date.now() - 28 * 86400000;
        const recent = history.filter(h => new Date(h.date).getTime() > ago);
        const actualPerWeek = recent.length / 4;
        const adherence = plannedDays > 0 ? Math.min(actualPerWeek / plannedDays, 1) : 1;

        let suggestedDays = null, message = '', level = 'ok';

        if (adherence < 0.5 && plannedDays > 2) {
            suggestedDays = Math.max(2, plannedDays - 2);
            message = `Fréquence réelle : <strong>${actualPerWeek.toFixed(1)}x/sem</strong> (prévu ${plannedDays}x). On suggère <strong>${suggestedDays}j/sem</strong> pour coller à ta récupération.`;
            level = 'danger';
        } else if (adherence < 0.75 && plannedDays > 2) {
            suggestedDays = Math.max(2, plannedDays - 1);
            message = `Fréquence réelle : <strong>${actualPerWeek.toFixed(1)}x/sem</strong>. Descendre à <strong>${suggestedDays}j/sem</strong> serait plus réaliste.`;
            level = 'warning';
        } else if (adherence >= 0.9) {
            message = `Excellent — ${Math.round(adherence * 100)}% de tes séances honorées. 🔥`;
        } else {
            message = `Fréquence réelle : ${actualPerWeek.toFixed(1)}x/sem — continue !`;
        }

        return { adherence, actualPerWeek, suggestedDays, message, level };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  SWAP D'EXERCICE (même groupe musculaire)
    // ══════════════════════════════════════════════════════════════════════

    function getSwapOptions(exercise, sessionExercises, equipment) {
        const muscle = exercise.muscleGroup;
        if (!muscle || !TS?.exerciseTiers?.[muscle]) return [];

        const mt = TS.exerciseTiers[muscle];
        const all = [...(mt.S || []), ...(mt.A || []), ...(mt.B || [])];
        const usedNames = sessionExercises.map(e => e.name);

        const filterEquip = (list) => {
            if (equipment === 'minimal') {
                const bw = ['tractions','dips','pompes','fentes','hip thrust','circuit','relevé','glute','squat'];
                return list.filter(e => bw.some(k => e.toLowerCase().includes(k)));
            }
            if (equipment === 'home') {
                const blocked = ['machine','hack squat','pendulum','pec deck','câble','cable','poulie'];
                return list.filter(e => !blocked.some(k => e.toLowerCase().includes(k)));
            }
            return list;
        };

        return filterEquip(all)
            .filter(name => name !== exercise.name && !usedNames.includes(name))
            .map(name => ({
                name,
                tier: (mt.S || []).includes(name) ? 'S' : (mt.A || []).includes(name) ? 'A' : 'B',
                muscle,
            }));
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ÉTAT DU MODAL
    // ══════════════════════════════════════════════════════════════════════

    let _cfg = { splitType: 'ppl', days: 3, level: 'intermediate', goal: 'muscle', equipment: 'gym', priority: [] };
    let _sessions = [];

    // ══════════════════════════════════════════════════════════════════════
    //  MODAL PRINCIPAL
    // ══════════════════════════════════════════════════════════════════════

    function openBuilder() {
        document.getElementById('pbModal')?.remove();

        // Pré-remplir depuis profil
        try {
            const p = JSON.parse(localStorage.getItem('lyftiv_profile') || '{}');
            if (p.level)     _cfg.level     = _normLevel(p.level);
            if (p.goal)      _cfg.goal      = _normGoal(p.goal);
            if (p.equipment) _cfg.equipment = p.equipment;
            if (p.frequency) _cfg.days      = Math.min(6, Math.max(2, parseInt(p.frequency) || 3));
        } catch(e) {}

        // Adapter jours selon récupération
        const rec = analyzeRecovery(_cfg.days);
        if (rec.suggestedDays) _cfg.days = rec.suggestedDays;

        // Clamper days dans les bornes du split actuel
        const def = SPLIT_DEFINITIONS[_cfg.splitType];
        _cfg.days = Math.min(def.maxDays, Math.max(def.minDays, _cfg.days));

        const modal = document.createElement('div');
        modal.id = 'pbModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,0.7);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s;';

        modal.innerHTML = `
        <div id="pbSheet" style="
            background:var(--color-surface-default);border-radius:20px 20px 0 0;
            width:100%;max-width:560px;max-height:92vh;
            display:flex;flex-direction:column;
            transform:translateY(100%);transition:transform .35s cubic-bezier(.34,1.1,.64,1);
        ">
            <!-- En-tête sticky -->
            <div style="padding:14px 18px 12px;border-bottom:1px solid var(--color-border-default);flex-shrink:0;">
                <div style="width:36px;height:4px;background:var(--color-border-default);border-radius:2px;margin:0 auto 14px;"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <div style="font-weight:900;font-size:1.1rem;color:var(--color-text-header);">🏗️ Créer mon programme</div>
                        <div style="font-size:.73rem;color:var(--color-text-subheader);margin-top:2px;">Configure, ajuste, échange les exercices</div>
                    </div>
                    <button id="pbClose" style="background:var(--color-surface-muted);border:1px solid var(--color-border-default);border-radius:50%;width:32px;height:32px;font-size:1rem;cursor:pointer;color:var(--color-text-default);">✕</button>
                </div>
            </div>

            <!-- Corps scrollable -->
            <div style="overflow-y:auto;flex:1;padding:18px;">

                ${rec.level !== 'ok' ? `
                <div style="background:${rec.level==='danger'?'hsla(0,65%,55%,.1)':'hsla(35,80%,54%,.1)'};border:1px solid ${rec.level==='danger'?'hsla(0,65%,55%,.4)':'hsla(35,80%,54%,.4)'};border-radius:10px;padding:11px 14px;margin-bottom:16px;font-size:.77rem;color:var(--color-text-subheader);line-height:1.55;">
                    ${rec.level==='danger'?'🔴':'🟡'} ${rec.message}
                </div>` : ''}

                <!-- 1. FORMAT -->
                <div style="margin-bottom:20px;">
                    <div style="font-weight:800;font-size:.82rem;color:var(--color-text-header);margin-bottom:8px;">1. Format d'entraînement</div>
                    <div id="pbSplitGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        ${Object.entries(SPLIT_DEFINITIONS).map(([key, d]) => `
                        <button class="pb-split-btn" data-split="${key}" style="
                            padding:12px;border-radius:10px;text-align:left;cursor:pointer;font-family:inherit;
                            display:flex;flex-direction:column;gap:3px;
                            background:${key===_cfg.splitType?'hsla(220,80%,60%,.18)':'var(--color-surface-muted)'};
                            border:1.5px solid ${key===_cfg.splitType?'hsl(220,80%,60%)':'var(--color-border-default)'};
                            color:var(--color-text-default);transition:all .15s;
                        ">
                            <span style="font-size:1.1rem">${d.icon}</span>
                            <span style="font-weight:800;font-size:.8rem;color:var(--color-text-header);">${d.label}</span>
                            <span style="font-size:.68rem;color:var(--color-text-subheader);line-height:1.35;">${d.description}</span>
                        </button>`).join('')}
                    </div>
                </div>

                <!-- 2. JOURS -->
                <div style="margin-bottom:20px;">
                    <div style="font-weight:800;font-size:.82rem;color:var(--color-text-header);margin-bottom:8px;">2. Jours par semaine</div>
                    <div style="display:flex;align-items:center;gap:14px;background:var(--color-surface-muted);border:1px solid var(--color-border-default);border-radius:12px;padding:14px;">
                        <button id="pbDaysDown" style="width:38px;height:38px;border-radius:50%;background:var(--color-surface-default);border:1px solid var(--color-border-default);font-size:1.3rem;cursor:pointer;color:var(--color-text-default);flex-shrink:0;">−</button>
                        <div style="flex:1;text-align:center;">
                            <div id="pbDaysValue" style="font-size:2.2rem;font-weight:900;color:var(--color-text-header);line-height:1;">${_cfg.days}</div>
                            <div id="pbDaysLabel" style="font-size:.7rem;color:var(--color-text-subheader);margin-top:3px;">${_getDaysLabel(_cfg.splitType,_cfg.days)}</div>
                            <div id="pbDaysRecovery" style="font-size:.68rem;color:hsl(35,80%,58%);margin-top:3px;min-height:14px;"></div>
                        </div>
                        <button id="pbDaysUp" style="width:38px;height:38px;border-radius:50%;background:var(--color-surface-default);border:1px solid var(--color-border-default);font-size:1.3rem;cursor:pointer;color:var(--color-text-default);flex-shrink:0;">+</button>
                    </div>
                </div>

                <!-- 3. PRIORITÉS MUSCULAIRES -->
                <div style="margin-bottom:20px;">
                    <div style="font-weight:800;font-size:.82rem;color:var(--color-text-header);margin-bottom:2px;">3. Groupes prioritaires <span style="font-weight:400;font-size:.7rem;opacity:.7">(max 2)</span></div>
                    <div style="font-size:.7rem;color:var(--color-text-subheader);margin-bottom:8px;">Ces muscles reçoivent +1 exercice et passent en tête de séance.</div>
                    <div id="pbPriorityGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        ${Object.entries(MUSCLE_LABELS).map(([key, label]) => `
                        <button class="pb-priority-btn" data-muscle="${key}" style="
                            padding:8px 10px;border-radius:8px;text-align:left;cursor:pointer;font-family:inherit;
                            font-size:.75rem;font-weight:600;
                            background:${_cfg.priority.includes(key)?'hsla(145,65%,48%,.18)':'var(--color-surface-muted)'};
                            border:1.5px solid ${_cfg.priority.includes(key)?'hsl(145,65%,48%)':'var(--color-border-default)'};
                            color:var(--color-text-default);transition:all .15s;
                        ">${label}</button>`).join('')}
                    </div>
                    <div id="pbPriorityWarn" style="font-size:.7rem;color:hsl(0,65%,55%);margin-top:5px;min-height:14px;"></div>
                </div>

                <!-- 4. OBJECTIF -->
                <div style="margin-bottom:20px;">
                    <div style="font-weight:800;font-size:.82rem;color:var(--color-text-header);margin-bottom:8px;">4. Objectif</div>
                    <div style="display:flex;flex-wrap:wrap;gap:7px;" id="pbGoalRow">
                        ${[['muscle','💪 Hypertrophie'],['strength','🏋️ Force'],['weight_loss','🔥 Poids'],['athletic','⚡ Athlétique'],['general','🌿 Général']].map(([key,lbl])=>`
                        <button class="pb-goal-btn" data-goal="${key}" style="
                            padding:7px 13px;border-radius:20px;font-size:.77rem;font-weight:700;
                            cursor:pointer;font-family:inherit;transition:all .15s;
                            background:${_cfg.goal===key?'hsla(220,80%,60%,.18)':'var(--color-surface-muted)'};
                            border:1.5px solid ${_cfg.goal===key?'hsl(220,80%,60%)':'var(--color-border-default)'};
                            color:${_cfg.goal===key?'hsl(220,80%,65%)':'var(--color-text-default)'};
                        ">${lbl}</button>`).join('')}
                    </div>
                </div>

                <!-- 5. ÉQUIPEMENT -->
                <div style="margin-bottom:24px;">
                    <div style="font-weight:800;font-size:.82rem;color:var(--color-text-header);margin-bottom:8px;">5. Équipement</div>
                    <div style="display:flex;gap:8px;" id="pbEquipRow">
                        ${[['gym','🏋️ Salle complète'],['home','🏠 Home gym'],['minimal','🎽 Poids du corps']].map(([key,lbl])=>`
                        <button class="pb-equip-btn" data-equip="${key}" style="
                            flex:1;padding:10px 6px;border-radius:10px;font-size:.74rem;font-weight:700;
                            cursor:pointer;font-family:inherit;transition:all .15s;
                            background:${_cfg.equipment===key?'hsla(280,70%,60%,.18)':'var(--color-surface-muted)'};
                            border:1.5px solid ${_cfg.equipment===key?'hsl(280,70%,60%)':'var(--color-border-default)'};
                            color:${_cfg.equipment===key?'hsl(280,70%,65%)':'var(--color-text-default)'};
                        ">${lbl}</button>`).join('')}
                    </div>
                </div>

                <!-- APERÇU -->
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <div style="font-weight:800;font-size:.82rem;color:var(--color-text-header);">Aperçu du programme</div>
                        <button id="pbRefresh" style="background:none;border:none;cursor:pointer;font-size:.77rem;color:hsl(220,80%,60%);font-weight:700;">🔄 Actualiser</button>
                    </div>
                    <div id="pbPreview"></div>
                </div>

            </div><!-- /corps -->

            <!-- Footer sticky -->
            <div style="padding:14px 18px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--color-border-default);flex-shrink:0;">
                <button id="pbApplyBtn" class="btn btn-primary" style="width:100%;height:50px;font-size:1rem;font-weight:900;">
                    ✅ Appliquer ce programme
                </button>
            </div>
        </div>`;

        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            document.getElementById('pbSheet').style.transform = 'translateY(0)';
        });

        _refreshPreview();
        _bindEvents(modal);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  APERÇU + SWAP
    // ══════════════════════════════════════════════════════════════════════

    function _refreshPreview() {
        _sessions = generateProgram(_cfg);
        const el = document.getElementById('pbPreview');
        if (!el) return;

        el.innerHTML = _sessions.map((s, si) => `
        <div style="background:var(--color-surface-muted);border:1px solid var(--color-border-default);border-radius:12px;margin-bottom:10px;overflow:hidden;">
            <div style="padding:9px 14px;background:hsla(220,80%,60%,.07);border-bottom:1px solid var(--color-border-default);display:flex;align-items:center;justify-content:space-between;">
                <span style="font-weight:800;font-size:.8rem;color:var(--color-text-header);">${si+1}. ${s.name}</span>
                <span style="font-size:.68rem;color:var(--color-text-subheader);">${s.exercises.length} exercices</span>
            </div>
            <div style="padding:8px 14px;">
                ${s.exercises.map((ex, ei) => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border-default);">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:.77rem;font-weight:700;color:var(--color-text-header);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${_cfg.priority.includes(ex.muscleGroup) ? '<span style="color:hsl(145,65%,50%);font-size:.65rem;margin-right:4px;">★ PRIORITÉ</span>' : ''}${ex.name}
                        </div>
                        <div style="font-size:.66rem;color:var(--color-text-subheader);">${ex.series[0]} · ${ex.rest} · ${(MUSCLE_LABELS[ex.muscleGroup]||'').replace(/^[^ ]+ /,'')}</div>
                    </div>
                    ${ex.muscleGroup ? `
                    <button class="pb-swap-btn" data-si="${si}" data-ei="${ei}" style="
                        flex-shrink:0;padding:3px 8px;border-radius:6px;font-size:.65rem;font-weight:700;
                        background:var(--color-surface-default);border:1px solid var(--color-border-default);
                        cursor:pointer;color:hsl(220,80%,60%);font-family:inherit;
                    ">🔄 Swap</button>` : ''}
                </div>`).join('')}
            </div>
        </div>`).join('');

        el.querySelectorAll('.pb-swap-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                _openSwap(parseInt(btn.dataset.si), parseInt(btn.dataset.ei));
            });
        });
    }

    function _openSwap(si, ei) {
        document.getElementById('pbSwapPanel')?.remove();
        const session  = _sessions[si];
        const exercise = session.exercises[ei];
        const options  = getSwapOptions(exercise, session.exercises, _cfg.equipment);
        const muscleName = (MUSCLE_LABELS[exercise.muscleGroup] || exercise.muscleGroup || '').replace(/^[^ ]+ /,'');

        const panel = document.createElement('div');
        panel.id = 'pbSwapPanel';
        panel.style.cssText = 'position:fixed;inset:0;z-index:9300;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s;';

        panel.innerHTML = `
        <div id="pbSwapSheet" style="
            background:var(--color-surface-default);border-radius:20px 20px 0 0;
            width:100%;max-width:560px;max-height:72vh;overflow-y:auto;
            padding:0 0 calc(20px + env(safe-area-inset-bottom,0px));
            transform:translateY(100%);transition:transform .28s cubic-bezier(.34,1.1,.64,1);
        ">
            <div style="padding:13px 18px 11px;border-bottom:1px solid var(--color-border-default);position:sticky;top:0;background:var(--color-surface-default);">
                <div style="width:34px;height:4px;background:var(--color-border-default);border-radius:2px;margin:0 auto 12px;"></div>
                <div style="font-weight:900;font-size:.9rem;color:var(--color-text-header);">🔄 Changer d'exercice</div>
                <div style="font-size:.72rem;color:var(--color-text-subheader);margin-top:3px;">
                    Remplacer <strong>${exercise.name}</strong><br>
                    Groupe ciblé : <strong>${muscleName}</strong> — toutes les alternatives ciblent le même muscle
                </div>
            </div>
            <div style="padding:10px 18px;">
                ${options.length === 0
                    ? `<p style="text-align:center;color:var(--color-text-subheader);font-size:.8rem;padding:20px 0;">Aucune alternative pour cet équipement.</p>`
                    : options.map(opt => `
                    <button class="pb-swap-opt" data-name="${opt.name}" style="
                        width:100%;display:flex;align-items:center;justify-content:space-between;
                        padding:11px 12px;border-radius:10px;margin-bottom:6px;
                        background:var(--color-surface-muted);border:1px solid var(--color-border-default);
                        cursor:pointer;font-family:inherit;text-align:left;transition:background .15s;
                    ">
                        <div>
                            <div style="font-weight:700;font-size:.8rem;color:var(--color-text-header);">${opt.name}</div>
                            <div style="font-size:.65rem;color:var(--color-text-subheader);">Cible : ${muscleName}</div>
                        </div>
                        <span style="
                            padding:2px 8px;border-radius:12px;font-size:.63rem;font-weight:800;flex-shrink:0;
                            background:${opt.tier==='S'?'hsla(145,65%,48%,.2)':opt.tier==='A'?'hsla(220,80%,60%,.2)':'hsla(35,80%,54%,.2)'};
                            color:${opt.tier==='S'?'hsl(145,65%,50%)':opt.tier==='A'?'hsl(220,80%,65%)':'hsl(35,80%,58%)'};
                        ">${opt.tier}-Tier</span>
                    </button>`).join('')}
            </div>
        </div>`;

        document.body.appendChild(panel);
        requestAnimationFrame(() => {
            panel.style.opacity = '1';
            document.getElementById('pbSwapSheet').style.transform = 'translateY(0)';
        });

        const close = () => {
            panel.style.opacity = '0';
            document.getElementById('pbSwapSheet').style.transform = 'translateY(100%)';
            setTimeout(() => panel.remove(), 250);
        };
        panel.addEventListener('click', e => { if (e.target === panel) close(); });

        panel.querySelectorAll('.pb-swap-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                _sessions[si].exercises[ei].name = btn.dataset.name;
                close();
                _refreshPreview();
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    //  BINDING ÉVÉNEMENTS
    // ══════════════════════════════════════════════════════════════════════

    function _bindEvents(modal) {
        const close = () => {
            modal.style.opacity = '0';
            document.getElementById('pbSheet').style.transform = 'translateY(100%)';
            setTimeout(() => modal.remove(), 300);
        };
        document.getElementById('pbClose').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        // Split
        modal.querySelectorAll('.pb-split-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _cfg.splitType = btn.dataset.split;
                const d = SPLIT_DEFINITIONS[_cfg.splitType];
                _cfg.days = Math.min(d.maxDays, Math.max(d.minDays, _cfg.days));
                modal.querySelectorAll('.pb-split-btn').forEach(b => {
                    const s = b.dataset.split === _cfg.splitType;
                    b.style.background  = s ? 'hsla(220,80%,60%,.18)' : 'var(--color-surface-muted)';
                    b.style.borderColor = s ? 'hsl(220,80%,60%)' : 'var(--color-border-default)';
                });
                _updateDaysUI();
                _refreshPreview();
            });
        });

        // Jours
        document.getElementById('pbDaysDown').addEventListener('click', () => {
            const d = SPLIT_DEFINITIONS[_cfg.splitType];
            if (_cfg.days > d.minDays) { _cfg.days--; _updateDaysUI(); _refreshPreview(); }
        });
        document.getElementById('pbDaysUp').addEventListener('click', () => {
            const d = SPLIT_DEFINITIONS[_cfg.splitType];
            if (_cfg.days < d.maxDays) { _cfg.days++; _updateDaysUI(); _refreshPreview(); }
        });

        // Priorités (max 2)
        modal.querySelectorAll('.pb-priority-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = btn.dataset.muscle;
                const idx = _cfg.priority.indexOf(m);
                const warn = document.getElementById('pbPriorityWarn');
                if (idx >= 0) {
                    _cfg.priority.splice(idx, 1);
                } else if (_cfg.priority.length >= 2) {
                    if (warn) { warn.textContent = 'Maximum 2 groupes prioritaires.'; setTimeout(() => { warn.textContent = ''; }, 2000); }
                    return;
                } else {
                    _cfg.priority.push(m);
                }
                modal.querySelectorAll('.pb-priority-btn').forEach(b => {
                    const s = _cfg.priority.includes(b.dataset.muscle);
                    b.style.background  = s ? 'hsla(145,65%,48%,.18)' : 'var(--color-surface-muted)';
                    b.style.borderColor = s ? 'hsl(145,65%,48%)' : 'var(--color-border-default)';
                });
                _refreshPreview();
            });
        });

        // Objectif
        modal.querySelectorAll('.pb-goal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _cfg.goal = btn.dataset.goal;
                modal.querySelectorAll('.pb-goal-btn').forEach(b => {
                    const s = b.dataset.goal === _cfg.goal;
                    b.style.background  = s ? 'hsla(220,80%,60%,.18)' : 'var(--color-surface-muted)';
                    b.style.borderColor = s ? 'hsl(220,80%,60%)' : 'var(--color-border-default)';
                    b.style.color       = s ? 'hsl(220,80%,65%)' : 'var(--color-text-default)';
                });
                _refreshPreview();
            });
        });

        // Équipement
        modal.querySelectorAll('.pb-equip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _cfg.equipment = btn.dataset.equip;
                modal.querySelectorAll('.pb-equip-btn').forEach(b => {
                    const s = b.dataset.equip === _cfg.equipment;
                    b.style.background  = s ? 'hsla(280,70%,60%,.18)' : 'var(--color-surface-muted)';
                    b.style.borderColor = s ? 'hsl(280,70%,60%)' : 'var(--color-border-default)';
                    b.style.color       = s ? 'hsl(280,70%,65%)' : 'var(--color-text-default)';
                });
                _refreshPreview();
            });
        });

        // Actualiser + Appliquer
        document.getElementById('pbRefresh').addEventListener('click', _refreshPreview);
        document.getElementById('pbApplyBtn').addEventListener('click', () => {
            _applyProgram(_sessions);
            close();
        });
    }

    function _updateDaysUI() {
        const def = SPLIT_DEFINITIONS[_cfg.splitType];
        _cfg.days = Math.min(def.maxDays, Math.max(def.minDays, _cfg.days));
        const rec = analyzeRecovery(_cfg.days);
        const el = document.getElementById('pbDaysValue');
        const lbl = document.getElementById('pbDaysLabel');
        const warn = document.getElementById('pbDaysRecovery');
        if (el) el.textContent = _cfg.days;
        if (lbl) lbl.textContent = _getDaysLabel(_cfg.splitType, _cfg.days);
        if (warn) warn.innerHTML = rec.level !== 'ok' && rec.suggestedDays !== _cfg.days
            ? `⚠️ Réel : ~${rec.actualPerWeek.toFixed(1)}j/sem`
            : '';
    }

    function _getDaysLabel(splitType, days) {
        const d = SPLIT_DEFINITIONS[splitType];
        return d ? `${d.label} · ${days}j/sem.` : `${days}j/sem.`;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  APPLICATION
    // ══════════════════════════════════════════════════════════════════════

    function _applyProgram(sessions) {
        if (!sessions?.length) return;
        if (window.state) { window.state.sessions = sessions; window.state.currentSessionIndex = 0; }
        window.StorageAPI?.set('userSessions', sessions);
        window.StorageAPI?.remove('inProgressWorkout');
        if (typeof window.updateSessionSelectOptions === 'function') window.updateSessionSelectOptions();
        if (typeof window.showNotification === 'function')
            window.showNotification(`🏗️ Programme appliqué — ${sessions.length} séances (${SPLIT_DEFINITIONS[_cfg.splitType]?.label || _cfg.splitType})`, 'success', 4000);
        if (typeof window.showDashboard === 'function') setTimeout(window.showDashboard, 350);
    }

    // ── Helpers normalization ─────────────────────────────────────────────
    function _normLevel(r) {
        return { debutant:'beginner', beginner:'beginner', intermediaire:'intermediate', intermediate:'intermediate', avance:'advanced', advanced:'advanced' }[r] || 'beginner';
    }
    function _normGoal(r) {
        return { muscle:'muscle', prise_masse:'muscle', force:'strength', strength:'strength', perte_poids:'weight_loss', weight_loss:'weight_loss', athletic:'athletic', general:'general', sante:'general' }[r] || 'general';
    }

    // ══════════════════════════════════════════════════════════════════════
    //  API PUBLIQUE
    // ══════════════════════════════════════════════════════════════════════

    window.ProgramBuilder = { open: openBuilder, generate: generateProgram, getSwapOptions, analyzeRecovery };

})();
