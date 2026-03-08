(function() {
    'use strict';

    /* ════════════════════════════════════════════════════════
       1. ONBOARDING SYSTEM
       Génère un programme réel basé sur TrainingScience
       (goal + level + frequency + equipment)
    ════════════════════════════════════════════════════════ */
    const ONB_KEY      = 'lyftiv_onboarded';
    const ONB_DATA_KEY = 'lyftiv_onb_data';

    let onbData = {
        goal: null, level: null, frequency: null, equipment: null,
        name: '', gender: 'male', age: null, weight: null, height: null
    };
    let onbCurrentStep = 0;

    function onbShouldShow() {
        return !localStorage.getItem(ONB_KEY);
    }

    function onbInit() {
        if (!onbShouldShow()) return;
        const overlay = document.getElementById('onboardingOverlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        onbUpdateProgress(0);
    }

    window.onbSelect = function(btn, field) {
        const parent = btn.closest('.onb-choices');
        if (parent) parent.querySelectorAll('.onb-choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        onbData[field] = btn.dataset.value;
        const nextBtns = { goal: 'onbGoalNext', level: 'onbLevelNext', frequency: 'onbFreqNext', equipment: 'onbEquipNext' };
        const nextBtnId = nextBtns[field];
        if (nextBtnId) {
            const b = document.getElementById(nextBtnId);
            if (b) b.disabled = false;
        }
        if (navigator.vibrate) navigator.vibrate(10);
    };

    window.onbNext = function() {
        if (onbCurrentStep === 3) {
            onbData.name   = (document.getElementById('onbName')   || {}).value || '';
            onbData.gender = (document.getElementById('onbGender') || {}).value || 'male';
            onbData.age    = parseInt((document.getElementById('onbAge')    || {}).value) || null;
            onbData.weight = parseFloat((document.getElementById('onbWeight') || {}).value) || null;
            onbData.height = parseInt((document.getElementById('onbHeight') || {}).value) || null;
        }

        const steps = document.querySelectorAll('.onb-step');
        if (onbCurrentStep < steps.length - 1) {
            steps[onbCurrentStep].classList.remove('active');
            onbCurrentStep++;
            steps[onbCurrentStep].classList.add('active');
            onbUpdateProgress(onbCurrentStep);
            if (onbCurrentStep === 6) onbRunAnalysis();
        }
    };

    window.onbSkip = function() { onbFinish(); };

    window.onbFinish = function() {
        // 1. Persister profil
        localStorage.setItem(ONB_KEY, '1');
        localStorage.setItem(ONB_DATA_KEY, JSON.stringify(onbData));

        if (onbData.name || onbData.age || onbData.weight || onbData.height) {
            const existing = JSON.parse(localStorage.getItem('lyftiv_profile') || '{}');
            localStorage.setItem('lyftiv_profile', JSON.stringify(Object.assign({}, existing, {
                name:      onbData.name      || existing.name,
                gender:    onbData.gender    || existing.gender || 'male',
                age:       onbData.age       || existing.age,
                weight:    onbData.weight    || existing.weight,
                height:    onbData.height    || existing.height,
                goal:      onbData.goal      || existing.goal,
                level:     onbData.level     || existing.level,
                frequency: onbData.frequency || existing.frequency,
                savedAt:   Date.now()
            })));
        }

        if (onbData.frequency) {
            localStorage.setItem('lyftiv_weekly_goal', onbData.frequency);
        }

        // 2. Générer le programme personnalisé et l'injecter dans state
        const program = generateProgram(onbData);
        if (program.length > 0 && window.state) {
            window.state.sessions = program;
            window.state.currentSessionIndex = 0;
            if (window.StorageAPI) {
                window.StorageAPI.set('userSessions', program);
            }
        }

        // 3. Fermer l'onboarding et aller au dashboard
        const overlay = document.getElementById('onboardingOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.style.display = 'none';
                if (typeof showDashboard === 'function') showDashboard();
            }, 500);
        }
    };

    function onbUpdateProgress(step) {
        document.querySelectorAll('.onb-progress-dot').forEach((dot, i) => {
            dot.classList.remove('active', 'done');
            if (i < step) dot.classList.add('done');
            else if (i === step) dot.classList.add('active');
        });
    }

    function onbRunAnalysis() {
        const ring      = document.getElementById('onbRingFill');
        const pct       = document.getElementById('onbAnalysisPct');
        const stepEls   = document.querySelectorAll('#onbAnalysisSteps .onb-analysis-step');
        const finishBtn = document.getElementById('onbFinishBtn');

        const circumference = 2 * Math.PI * 40;
        ring.style.strokeDasharray  = circumference;
        ring.style.strokeDashoffset = circumference;

        let progress = 0;
        const stepsData = [
            { delay: 400,  text: '✅' },
            { delay: 900,  text: '✅' },
            { delay: 1400, text: '✅' },
            { delay: 1900, text: '✅' },
        ];

        setTimeout(() => {
            ring.style.transition    = 'stroke-dashoffset 2.2s cubic-bezier(0.4,0,0.2,1)';
            ring.style.strokeDashoffset = 0;
        }, 100);

        const pctInterval = setInterval(() => {
            progress = Math.min(progress + 2, 100);
            if (pct) pct.textContent = progress + '%';
            if (progress >= 100) clearInterval(pctInterval);
        }, 44);

        stepsData.forEach(({ delay, text }, i) => {
            setTimeout(() => {
                if (stepEls[i]) {
                    stepEls[i].classList.add('done');
                    stepEls[i].querySelector('.onb-analysis-step-icon').textContent = text;
                }
            }, delay);
        });

        setTimeout(() => {
            if (finishBtn) {
                finishBtn.classList.remove('hidden');
                finishBtn.style.animation = 'onbIn 0.4s cubic-bezier(0.34,1.56,0.64,1)';
            }
        }, 2400);
    }

    /* ════════════════════════════════════════════════════════
       GÉNÉRATEUR DE PROGRAMME — basé sur TrainingScience
    ════════════════════════════════════════════════════════ */

    /**
     * Point d'entrée principal.
     * Retourne un tableau de sessions prêtes à être injectées dans state.sessions.
     */
    function generateProgram(data) {
        const TS = window.TrainingScience;

        // Normalisation des valeurs onboarding → clés TrainingScience
        const level     = normalizeLevel(data.level);
        const goal      = normalizeGoal(data.goal);
        const frequency = parseInt(data.frequency) || 3;
        const equipment = data.equipment || 'gym'; // 'gym' | 'home' | 'minimal'

        // Mapping objectif → fourchette de reps et temps de repos
        const goalMap   = TS ? TS.goalMapping[goal]      : null;
        const repRange  = goalMap ? goalMap.repRange      : [8, 12];
        const restMap   = TS ? TS.sessionConstruction.restTimes : {};

        // Choisir le split adapté
        const split = chooseSplit(level, frequency, TS);

        // Construire chaque séance du split
        return split.map(sessionDef => buildSession(sessionDef, level, goal, repRange, restMap, equipment, TS));
    }

    /** Normalise le niveau onboarding vers la clé TrainingScience */
    function normalizeLevel(raw) {
        if (!raw) return 'beginner';
        if (raw === 'debutant')     return 'beginner';
        if (raw === 'intermediaire') return 'intermediate';
        if (raw === 'avance')       return 'advanced';
        return 'beginner';
    }

    /** Normalise l'objectif onboarding vers la clé TrainingScience */
    function normalizeGoal(raw) {
        if (!raw) return 'general';
        const map = {
            muscle:      'muscle',
            prise_masse: 'muscle',
            force:       'strength',
            strength:    'strength',
            perte_poids: 'weight_loss',
            weight_loss: 'weight_loss',
            athletic:    'athletic',
            general:     'general',
            sante:       'general',
        };
        return map[raw] || 'general';
    }

    /**
     * Choisit le split optimal selon level + fréquence
     * Retourne un tableau de définitions de séances : { name, muscles[], type }
     */
    function chooseSplit(level, frequency, TS) {
        // Full Body pour débutants ou fréquence ≤ 3
        if (level === 'beginner' || frequency <= 3) {
            if (frequency <= 2) return [
                { name: 'Full Body A', muscles: ['chest','back_lats','quads','shoulders_lateral'], type: 'full' },
                { name: 'Full Body B', muscles: ['back_upper','hamstrings','glutes','biceps','triceps'], type: 'full' },
            ];
            return [
                { name: 'Full Body A', muscles: ['chest','back_lats','quads','shoulders_lateral'], type: 'full' },
                { name: 'Full Body B', muscles: ['back_upper','hamstrings','glutes','biceps','triceps'], type: 'full' },
                { name: 'Full Body C', muscles: ['chest','back_lats','shoulders_anterior','quads','hamstrings'], type: 'full' },
            ];
        }

        // Upper/Lower pour intermédiaires 4j
        if (level === 'intermediate' && frequency === 4) return [
            { name: 'Upper A — Force',        muscles: ['chest','back_lats','back_upper','shoulders_anterior'], type: 'upper' },
            { name: 'Lower A — Force',        muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
            { name: 'Upper B — Hypertrophie', muscles: ['chest','back_lats','shoulders_lateral','biceps','triceps'], type: 'upper' },
            { name: 'Lower B — Hypertrophie', muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
        ];

        // PPL pour intermédiaires 5-6j ou avancés
        if (frequency >= 5 && level !== 'beginner') {
            if (level === 'advanced' && frequency >= 5) return [
                { name: 'Upper',  muscles: ['chest','back_lats','shoulders_anterior','back_upper'], type: 'upper' },
                { name: 'Lower',  muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
                { name: 'Pull',   muscles: ['back_lats','back_upper','biceps'], type: 'pull' },
                { name: 'Push',   muscles: ['chest','shoulders_lateral','triceps'], type: 'push' },
                { name: 'Legs',   muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
            ];
            return [
                { name: 'Push — Pectoraux & Épaules & Triceps', muscles: ['chest','shoulders_lateral','shoulders_anterior','triceps'], type: 'push' },
                { name: 'Pull — Dos & Biceps',                  muscles: ['back_lats','back_upper','biceps'], type: 'pull' },
                { name: 'Legs — Cuisses & Fessiers & Mollets',  muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
                { name: 'Push B',                               muscles: ['chest','shoulders_lateral','triceps'], type: 'push' },
                { name: 'Pull B',                               muscles: ['back_lats','back_upper','biceps'], type: 'pull' },
                { name: 'Legs B',                               muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
            ].slice(0, frequency);
        }

        // Fallback : Upper/Lower 4j
        return [
            { name: 'Upper A', muscles: ['chest','back_lats','shoulders_lateral','back_upper'], type: 'upper' },
            { name: 'Lower A', muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
            { name: 'Upper B', muscles: ['chest','back_lats','biceps','triceps'], type: 'upper' },
            { name: 'Lower B', muscles: ['quads','hamstrings','glutes','calves'], type: 'lower' },
        ];
    }

    /**
     * Construit une séance complète pour un type donné.
     * Sélectionne les exercices S-Tier en priorité, puis A-Tier.
     */
    function buildSession(sessionDef, level, goal, repRange, restMap, equipment, TS) {
        const exercises = [];
        const tiers     = TS ? TS.exerciseTiers : {};
        const setsMap   = TS ? TS.sessionConstruction.setsPerExercise : {};
        const restTimes = TS ? TS.sessionConstruction.restTimes       : {};

        // Nombre d'exercices cible selon le niveau
        const exCount = TS ? TS.sessionConstruction.exercisesPerSession[level] : { min: 4, max: 6 };
        const targetCount = exCount ? Math.round((exCount.min + exCount.max) / 2) : 5;

        // Pour chaque groupe musculaire de la séance
        sessionDef.muscles.forEach((muscle, muscleIdx) => {
            if (exercises.length >= targetCount) return;

            const muscleTiers = tiers[muscle];
            if (!muscleTiers) return;

            // Filtrer selon équipement si home/minimal
            const filterByEquipment = (list) => {
                if (equipment === 'minimal') {
                    const bodyweight = ['Tractions','Dips','Pompes','Fentes','Hip thrust','Glute-Ham Raise','Circuit abdos'];
                    return list.filter(e => bodyweight.some(bw => e.toLowerCase().includes(bw.toLowerCase()))) || list.slice(0, 1);
                }
                if (equipment === 'home') {
                    const noMachines = list.filter(e => !e.toLowerCase().includes('machine') && !e.toLowerCase().includes('hack squat') && !e.toLowerCase().includes('pendulum') && !e.toLowerCase().includes('pec deck'));
                    return noMachines.length ? noMachines : list;
                }
                return list; // gym complet : tout est disponible
            };

            // Priorité S-Tier, fallback A-Tier
            const sList = filterByEquipment(muscleTiers.S || []);
            const aList = filterByEquipment(muscleTiers.A || []);
            const chosen = sList.length ? sList[0] : (aList.length ? aList[0] : null);
            if (!chosen) return;

            // Déduplication — pas deux fois le même exercice
            if (exercises.some(e => e.name === chosen)) return;

            // Nombre de séries selon position dans la séance
            const isMain      = muscleIdx === 0;
            const setsRange   = isMain ? (setsMap.main_compound || { min: 3, max: 4 })
                                       : (muscleIdx <= 2 ? (setsMap.secondary || { min: 3, max: 3 })
                                                         : (setsMap.isolation  || { min: 2, max: 3 }));
            const sets = setsRange.max;

            // Temps de repos selon type
            const isCompound   = isMain;
            const restSeconds  = isCompound ? 120 : 75;

            // Fourchette de reps selon objectif
            const [rMin, rMax] = repRange;
            const seriesStr    = `${sets} x ${rMin}-${rMax}`;

            exercises.push({
                name:   chosen,
                rest:   restSeconds + 's',
                series: [seriesStr],
                isDefault: false,
            });
        });

        // Compléter si trop peu d'exercices (fallback sur defaultSessions)
        if (exercises.length < 3 && window.defaultSessions) {
            const fallback = window.defaultSessions[0];
            if (fallback) return Object.assign({}, fallback, { name: sessionDef.name, isDefault: true });
        }

        return {
            name:      sessionDef.name,
            isDefault: false,
            exercises,
        };
    }

    // Démarrage
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(onbInit, 200);
    });


    /* ════════════════════════════════════════════════════════
       2. NOTIFICATIONS LOCALES
    ════════════════════════════════════════════════════════ */
    const NOTIF_KEY = 'lyftiv_notif_settings';

    function getNotifSettings() {
        try { return JSON.parse(localStorage.getItem(NOTIF_KEY)) || {}; } catch(e) { return {}; }
    }

    window.saveNotifSettings = function() {
        const settings = {
            enabled:     true,
            workoutTime: (document.getElementById('notifTimeWorkout') || {}).value || '18:00',
            hydro:       (document.getElementById('notifHydroToggle') || {}).checked !== false,
            fast:        (document.getElementById('notifFastToggle')  || {}).checked !== false,
            savedAt:     Date.now()
        };
        localStorage.setItem(NOTIF_KEY, JSON.stringify(settings));

        // Demander permission si besoin
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const confirmEl = document.getElementById('notifSaveConfirm');
        if (confirmEl) {
            confirmEl.textContent = '✓ Préférences enregistrées';
            setTimeout(() => { confirmEl.textContent = ''; }, 2500);
        }
    };

    // Initialisation des toggles depuis le storage
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            const settings = getNotifSettings();
            const timeInput = document.getElementById('notifTimeWorkout');
            const hydroToggle = document.getElementById('notifHydroToggle');
            const fastToggle  = document.getElementById('notifFastToggle');
            if (timeInput   && settings.workoutTime) timeInput.value    = settings.workoutTime;
            if (hydroToggle && settings.hydro !== undefined) hydroToggle.checked = settings.hydro;
            if (fastToggle  && settings.fast  !== undefined) fastToggle.checked  = settings.fast;

            // Activer bouton save notif
            const saveBtn = document.getElementById('saveNotifBtn');
            if (saveBtn) saveBtn.addEventListener('click', window.saveNotifSettings);

            // Révoquer notifications
            const revokeBtn = document.getElementById('revokeNotifBtn');
            if (revokeBtn) revokeBtn.addEventListener('click', () => {
                const s = getNotifSettings();
                s.enabled = false;
                localStorage.setItem(NOTIF_KEY, JSON.stringify(s));
            });
        }, 800);
    });


    /* ════════════════════════════════════════════════════════
       3. ALERTES SÉCURITÉ SUPPLÉMENTS
    ════════════════════════════════════════════════════════ */
    const SAFETY_RULES = [
        {
            keywords: ['caféine','pre-workout','pre workout','pré-workout','stimulant','ephedrine','éphédrine','synephrine','synéphrine'],
            combo: ['caféine','pre-workout','ephedrine','synephrine'],
            minMatches: 2,
            title: '⚡ Surdosage en stimulants détecté',
            msg: 'Vous combinez plusieurs stimulants. Risque de palpitations, hypertension et troubles du rythme cardiaque. Ne dépassez pas 400mg de caféine/jour. Consultez votre médecin si vous avez des antécédents cardiaques.',
            severity: 'high'
        },
        {
            keywords: ['creatine','créatine'],
            combo: ['diurétique','alcool','caféine'],
            crossKeywords: ['diurétique','alcool'],
            minMatches: 1,
            title: '💧 Risque de déshydratation',
            msg: 'La créatine augmente les besoins en eau. Associée à un diurétique ou à l\'alcool, elle peut provoquer une déshydratation sévère. Buvez au minimum 2.5L d\'eau par jour lors d\'une cure de créatine.',
            severity: 'medium'
        },
        {
            keywords: ['vitamine k','vitamine k2','vitamine d','omega','oméga','magnésium'],
            special: 'anticoagulant',
            title: '🩺 Interaction médicamenteuse possible',
            msg: 'La Vitamine K peut interférer avec les anticoagulants (Warfarine). Si vous prenez un traitement médical, consultez votre pharmacien avant toute supplémentation.',
            severity: 'high',
            singleMatch: true,
            matchOn: ['vitamine k','vitamine k2']
        },
        {
            keywords: ['zinc','fer','calcium','magnésium'],
            combo: ['zinc','fer','calcium','magnésium'],
            minMatches: 3,
            title: '🔬 Compétition minérale',
            msg: 'La prise simultanée de Zinc, Fer, Calcium et Magnésium réduit significativement leur absorption respective. Espacez les prises d\'au moins 2 heures.',
            severity: 'medium'
        }
    ];

    window._sessionSupplHistory = [];

    function checkSupplSafety(history) {
        const allSearches = history.join(' ').toLowerCase();
        const banner  = document.getElementById('safetyAlertBanner');
        const titleEl = document.getElementById('safetyAlertTitle');
        const msgEl   = document.getElementById('safetyAlertMsg');
        if (!banner || !titleEl || !msgEl) return;

        for (const rule of SAFETY_RULES) {
            let triggered = false;
            if (rule.singleMatch) {
                triggered = rule.matchOn.some(kw => allSearches.includes(kw));
            } else if (rule.crossKeywords) {
                triggered = rule.keywords.some(kw => allSearches.includes(kw)) &&
                            rule.crossKeywords.some(kw => allSearches.includes(kw));
            } else if (rule.minMatches) {
                triggered = rule.combo.filter(kw => allSearches.includes(kw)).length >= rule.minMatches;
            }
            if (triggered) {
                titleEl.textContent = rule.title;
                msgEl.textContent   = rule.msg;
                banner.classList.add('show');
                if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
                return;
            }
        }
        banner.classList.remove('show');
    }


    /* ════════════════════════════════════════════════════════
       4. UX — Barre de progression & Badge PR
    ════════════════════════════════════════════════════════ */

    function updateSessionProgress() {
        const sourceFill = document.getElementById('progressFill');
        const myFill     = document.getElementById('sessionProgressFill');
        const myLabel    = document.getElementById('sessionProgressLabel');
        if (!sourceFill || !myFill || !myLabel) return;
        const pct = Math.round(parseFloat(sourceFill.style.width) || 0);
        myFill.style.width = pct + '%';
        myLabel.textContent = pct + '%';
        if (pct >= 100) {
            myFill.style.background  = 'linear-gradient(90deg, hsl(35,90%,55%), hsl(22,95%,60%))';
            myLabel.style.color      = 'hsl(35,80%,45%)';
            myLabel.style.fontWeight = '900';
        } else {
            myFill.style.background  = '';
            myLabel.style.color      = '';
            myLabel.style.fontWeight = '';
        }
    }

    function observeSessionProgress() {
        const sourceFill = document.getElementById('progressFill');
        if (!sourceFill) return;
        new MutationObserver(() => setTimeout(updateSessionProgress, 60))
            .observe(sourceFill, { attributes: true, attributeFilter: ['style'] });
        const container = document.getElementById('exerciseListContainer');
        if (container) container.addEventListener('input', () => setTimeout(updateSessionProgress, 80));
    }

    function checkAndShowPRBadge(exerciseName, weight, reps) {
        if (!exerciseName || !weight || !reps) return false;
        let history = [];
        try { history = JSON.parse(localStorage.getItem('workoutHistory')) || []; } catch(e) {}
        let bestVolume = 0;
        history.forEach(session => {
            (session.exercises || []).forEach(ex => {
                if (ex.name && ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                    (ex.series || []).forEach(s => {
                        const parts = String(s).split(/[xX×]/);
                        const vol = (parseFloat(parts[0]) || 0) * (parseFloat(parts[1]) || 0);
                        if (vol > bestVolume) bestVolume = vol;
                    });
                }
            });
        });
        return (weight * reps) > bestVolume && history.length > 0;
    }

    function injectPRBadgeIfNeeded(exerciseName, weight, reps, targetEl) {
        if (!targetEl) return;
        const existing = targetEl.querySelector('.pr-badge');
        if (existing) existing.remove();
        if (checkAndShowPRBadge(exerciseName, weight, reps)) {
            const badge = document.createElement('span');
            badge.className = 'pr-badge';
            badge.title     = 'Nouveau record personnel !';
            badge.innerHTML = '🏆 PR';
            targetEl.appendChild(badge);
        }
    }

    window.LyftivPhase1 = { updateSessionProgress, injectPRBadgeIfNeeded, checkSupplSafety };

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            observeSessionProgress();
        }, 1200);
    });

})();
