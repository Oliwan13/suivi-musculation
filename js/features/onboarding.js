(function() {
    'use strict';

    /* ════════════════════════════════════════════════════════
       1. ONBOARDING SYSTEM
    ════════════════════════════════════════════════════════ */
    const ONB_KEY = 'lyftiv_onboarded';
    const ONB_DATA_KEY = 'lyftiv_onb_data';

    let onbData = {
        goal: null, level: null, frequency: null, equipment: null,
        name: '', gender: 'male', age: null, weight: null, height: null
    };
    let onbCurrentStep = 0;
    const ONB_STEPS_COUNT = 7; // 0-6

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
        // Activer le bouton suivant
        const nextBtns = { goal: 'onbGoalNext', level: 'onbLevelNext', frequency: 'onbFreqNext', equipment: 'onbEquipNext' };
        const nextBtnId = nextBtns[field];
        if (nextBtnId) {
            const b = document.getElementById(nextBtnId);
            if (b) b.disabled = false;
        }
        if (navigator.vibrate) navigator.vibrate(10);
    };

    window.onbNext = function() {
        // Sauvegarder données profil à l'étape 3
        if (onbCurrentStep === 3) {
            onbData.name = (document.getElementById('onbName') || {}).value || '';
            onbData.gender = (document.getElementById('onbGender') || {}).value || 'male';
            onbData.age = parseInt((document.getElementById('onbAge') || {}).value) || null;
            onbData.weight = parseFloat((document.getElementById('onbWeight') || {}).value) || null;
            onbData.height = parseInt((document.getElementById('onbHeight') || {}).value) || null;
        }

        const steps = document.querySelectorAll('.onb-step');
        if (onbCurrentStep < steps.length - 1) {
            steps[onbCurrentStep].classList.remove('active');
            onbCurrentStep++;
            steps[onbCurrentStep].classList.add('active');
            onbUpdateProgress(onbCurrentStep);

            // Si étape analyse (6), lancer l'animation
            if (onbCurrentStep === 6) {
                onbRunAnalysis();
            }
        }
    };

    window.onbSkip = function() {
        onbFinish();
    };

    window.onbFinish = function() {
        // Sauvegarder données dans le profil
        localStorage.setItem(ONB_KEY, '1');
        localStorage.setItem(ONB_DATA_KEY, JSON.stringify(onbData));

        // Sync vers profil Lyftiv existant
        if (onbData.name || onbData.age || onbData.weight || onbData.height) {
            const existingProfile = JSON.parse(localStorage.getItem('lyftiv_profile') || '{}');
            const merged = Object.assign({}, existingProfile, {
                name: onbData.name || existingProfile.name,
                gender: onbData.gender || existingProfile.gender || 'male',
                age: onbData.age || existingProfile.age,
                weight: onbData.weight || existingProfile.weight,
                height: onbData.height || existingProfile.height,
                goal: onbData.goal || existingProfile.goal,
                level: onbData.level || existingProfile.level,
                frequency: onbData.frequency || existingProfile.frequency,
                savedAt: Date.now()
            });
            localStorage.setItem('lyftiv_profile', JSON.stringify(merged));
        }

        // Objectif hebdomadaire auto basé sur fréquence
        if (onbData.frequency) {
            localStorage.setItem('lyftiv_weekly_goal', onbData.frequency);
        }

        // Animation de sortie
        const overlay = document.getElementById('onboardingOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.style.display = 'none';
                // Aller directement au dashboard
                if (typeof showDashboard === 'function') {
                    showDashboard();
                }
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
        const ring = document.getElementById('onbRingFill');
        const pct = document.getElementById('onbAnalysisPct');
        const steps = document.querySelectorAll('#onbAnalysisSteps .onb-analysis-step');
        const finishBtn = document.getElementById('onbFinishBtn');

        const circumference = 2 * Math.PI * 40; // r=40
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = circumference;

        let progress = 0;
        const stepsData = [
            { delay: 400, text: '✅' },
            { delay: 900, text: '✅' },
            { delay: 1400, text: '✅' },
            { delay: 1900, text: '✅' },
        ];

        // Animer le ring
        setTimeout(() => {
            ring.style.transition = 'stroke-dashoffset 2.2s cubic-bezier(0.4,0,0.2,1)';
            ring.style.strokeDashoffset = 0;
        }, 100);

        // Compteur %
        const pctInterval = setInterval(() => {
            progress = Math.min(progress + 2, 100);
            if (pct) pct.textContent = progress + '%';
            if (progress >= 100) clearInterval(pctInterval);
        }, 44);

        // Étapes analyse
        stepsData.forEach(({ delay, text }, i) => {
            setTimeout(() => {
                if (steps[i]) {
                    steps[i].classList.add('done');
                    steps[i].querySelector('.onb-analysis-step-icon').textContent = text;
                }
            }, delay);
        });

        // Afficher bouton finish
        setTimeout(() => {
            if (finishBtn) {
                finishBtn.classList.remove('hidden');
                finishBtn.style.animation = 'onbIn 0.4s cubic-bezier(0.34,1.56,0.64,1)';
            }
        }, 2400);
    }

    // Afficher l'onboarding au chargement si nécessaire
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
            enabled: true,
            workoutTime: (document.getElementById('notifTimeWorkout') || {}).value || '18:00',
            hydro: (document.getElementById('notifHydroToggle') || {}).checked !== false,
            fast: (document.getElementById('notifFastToggle') || {}).checked !== false,
            savedAt: Date.now()
        };
        localStorage.setItem(NOTIF_KEY, JSON.stringify(settings));
        scheduleAllNotifications(settings);
        // Feedback
        const btn = document.querySelector('#notifSettingsPanel button');
        if (btn) { btn.textContent = '✅ Rappels enregistrés !'; setTimeout(() => { btn.textContent = '💾 Enregistrer les rappels'; }, 2500); }
        if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    };

    function scheduleAllNotifications(settings) {
        if (!('Notification' in window)) return;

        // Rappel séance quotidien
        if (settings.enabled && settings.workoutTime) {
            const [h, m] = settings.workoutTime.split(':').map(Number);
            const now = new Date();
            let target = new Date();
            target.setHours(h, m, 0, 0);
            if (target <= now) target.setDate(target.getDate() + 1);
            const delay = target - now;
            setTimeout(() => {
                if (Notification.permission === 'granted') {
                    new Notification('🏋️ Lyftiv — Heure de s\'entraîner !', {
                        body: 'Votre séance vous attend. Restez consistant — la régularité fait les champions.',
                        icon: './icon-192.png',
                        badge: './icon-192.png',
                        tag: 'lyftiv-workout-reminder',
                        renotify: true
                    });
                }
                // Replanifier pour le lendemain (simplifié)
            }, delay);
        }
    }

    // Initialiser le toggle notifications avec sa logique
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('profileNotifsToggle');
        const panel = document.getElementById('notifSettingsPanel');
        if (!toggle || !panel) return;

        // Charger état sauvegardé
        const saved = getNotifSettings();
        if (saved.enabled) {
            toggle.checked = true;
            panel.classList.add('show');
            if (saved.workoutTime) {
                const el = document.getElementById('notifTimeWorkout');
                if (el) el.value = saved.workoutTime;
            }
            if (saved.hydro === false) {
                const el = document.getElementById('notifHydroToggle');
                if (el) el.checked = false;
            }
            if (saved.fast === false) {
                const el = document.getElementById('notifFastToggle');
                if (el) el.checked = false;
            }
        }

        toggle.addEventListener('change', async () => {
            if (toggle.checked) {
                // Demander permission
                if ('Notification' in window && Notification.permission === 'default') {
                    const perm = await Notification.requestPermission();
                    if (perm !== 'granted') {
                        toggle.checked = false;
                        panel.classList.remove('show');
                        return;
                    }
                }
                if ('Notification' in window && Notification.permission === 'denied') {
                    toggle.checked = false;
                    alert('Les notifications sont bloquées dans votre navigateur. Autorisez-les dans les paramètres du navigateur.');
                    return;
                }
                panel.classList.add('show');
            } else {
                panel.classList.remove('show');
                const settings = getNotifSettings();
                settings.enabled = false;
                localStorage.setItem(NOTIF_KEY, JSON.stringify(settings));
            }
        });
    });


    /* ════════════════════════════════════════════════════════
       3. ALERTES SÉCURITÉ SUPPLÉMENTS
       Règles : détection de combinaisons à risque
    ════════════════════════════════════════════════════════ */
    const SAFETY_RULES = [
        {
            keywords: ['caféine', 'pre-workout', 'pre workout', 'pré-workout', 'stimulant', 'ephedrine', 'éphédrine', 'synephrine', 'synéphrine'],
            combo: ['caféine', 'pre-workout', 'ephedrine', 'synephrine'],
            minMatches: 2,
            title: '⚡ Surdosage en stimulants détecté',
            msg: 'Vous combinez plusieurs stimulants. Risque de palpitations, hypertension et troubles du rythme cardiaque. Ne dépassez pas 400mg de caféine/jour. Consultez votre médecin si vous avez des antécédents cardiaques.',
            severity: 'high'
        },
        {
            keywords: ['creatine', 'créatine'],
            combo: ['diurétique', 'alcool', 'caféine'],
            crossKeywords: ['diurétique', 'alcool'],
            minMatches: 1,
            title: '💧 Risque de déshydratation',
            msg: 'La créatine augmente les besoins en eau. Associée à un diurétique ou à l\'alcool, elle peut provoquer une déshydratation sévère. Buvez au minimum 2.5L d\'eau par jour lors d\'une cure de créatine.',
            severity: 'medium'
        },
        {
            keywords: ['vitamine k', 'vitamine k2', 'vitamine d', 'omega', 'oméga', 'magnésium'],
            special: 'anticoagulant',
            title: '🩺 Interaction médicamenteuse possible',
            msg: 'La Vitamine K peut interférer avec les anticoagulants (Warfarine). Si vous prenez un traitement médical, consultez votre pharmacien avant toute supplémentation.',
            severity: 'high',
            singleMatch: true,
            matchOn: ['vitamine k', 'vitamine k2']
        },
        {
            keywords: ['zinc', 'fer', 'calcium', 'magnésium'],
            combo: ['zinc', 'fer', 'calcium', 'magnésium'],
            minMatches: 3,
            title: '🔬 Compétition minérale',
            msg: 'La prise simultanée de Zinc, Fer, Calcium et Magnésium réduit significativement leur absorption respective. Espacez les prises d\'au moins 2 heures.',
            severity: 'medium'
        }
    ];

    // Historique session suppléments — alimente checkSupplSafety via le listener principal (ligne ~14477)
    // Le double listener a été supprimé pour éviter la reconstruction DOM 2x à chaque frappe.
    // checkSupplSafety est appelé dans le debounce principal 300ms.
    window._sessionSupplHistory = [];

    function checkSupplSafety(history) {
        const allSearches = history.join(' ').toLowerCase();
        const banner = document.getElementById('safetyAlertBanner');
        const titleEl = document.getElementById('safetyAlertTitle');
        const msgEl = document.getElementById('safetyAlertMsg');
        if (!banner || !titleEl || !msgEl) return;

        for (const rule of SAFETY_RULES) {
            let triggered = false;

            if (rule.singleMatch) {
                triggered = rule.matchOn.some(kw => allSearches.includes(kw));
            } else if (rule.crossKeywords) {
                const hasMain = rule.keywords.some(kw => allSearches.includes(kw));
                const hasCross = rule.crossKeywords.some(kw => allSearches.includes(kw));
                triggered = hasMain && hasCross;
            } else if (rule.minMatches) {
                const matches = rule.combo.filter(kw => allSearches.includes(kw)).length;
                triggered = matches >= rule.minMatches;
            }

            if (triggered) {
                titleEl.textContent = rule.title;
                msgEl.textContent = rule.msg;
                banner.classList.add('show');
                if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
                return;
            }
        }
        // Pas de risque détecté : masquer
        banner.classList.remove('show');
    }


    /* ════════════════════════════════════════════════════════
       4. UX AMÉLIORATIONS
       a) Barre de progression séance
       b) Badge PR automatique
    ════════════════════════════════════════════════════════ */

    // ── a) Barre de progression séance ──────────────────────
    function injectSessionProgressBar() {
        // Le widget est directement dans le HTML (sous #progressBar), pas besoin d'injection
        return;
    }

    // La progression est calculée par updateAllTotals() → #progressFill (source de vérité).
    // Notre widget compact se synchronise sur cette source, sans recalcul propre.
    function updateSessionProgress() {
        const sourceFill = document.getElementById('progressFill');
        const myFill     = document.getElementById('sessionProgressFill');
        const myLabel    = document.getElementById('sessionProgressLabel');
        if (!sourceFill || !myFill || !myLabel) return;

        const pct = Math.round(parseFloat(sourceFill.style.width) || 0);
        myFill.style.width = pct + '%';
        myLabel.textContent = pct + '%';

        if (pct >= 100) {
            myFill.style.background = 'linear-gradient(90deg, hsl(35,90%,55%), hsl(22,95%,60%))';
            myLabel.style.color     = 'hsl(35,80%,45%)';
            myLabel.style.fontWeight = '900';
        } else {
            myFill.style.background  = '';
            myLabel.style.color      = '';
            myLabel.style.fontWeight = '';
        }
    }

    // Observer le style du progressFill source (mis à jour par updateAllTotals)
    function observeSessionProgress() {
        const sourceFill = document.getElementById('progressFill');
        if (!sourceFill) return;
        const obs = new MutationObserver(() => setTimeout(updateSessionProgress, 60));
        obs.observe(sourceFill, { attributes: true, attributeFilter: ['style'] });

        // Réactivité immédiate sur les inputs
        const container = document.getElementById('exerciseListContainer');
        if (container) container.addEventListener('input', () => setTimeout(updateSessionProgress, 80));
    }

    // ── b) Badge PR automatique ──────────────────────────────
    function checkAndShowPRBadge(exerciseName, weight, reps) {
        if (!exerciseName || !weight || !reps) return;
        const historyKey = 'workoutHistory';
        let history = [];
        try { history = JSON.parse(localStorage.getItem(historyKey)) || []; } catch(e) {}

        // Chercher le meilleur tonnage pour cet exercice
        let bestVolume = 0;
        history.forEach(session => {
            if (!session.exercises) return;
            session.exercises.forEach(ex => {
                if (ex.name && ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                    (ex.series || []).forEach(s => {
                        const parts = String(s).split(/[xX×]/);
                        const w = parseFloat(parts[0]) || 0;
                        const r = parseFloat(parts[1]) || 0;
                        if (w * r > bestVolume) bestVolume = w * r;
                    });
                }
            });
        });

        const currentVolume = weight * reps;
        return currentVolume > bestVolume && history.length > 0;
    }

    // Injecter badge PR sur les cartes d'exercice
    function injectPRBadgeIfNeeded(exerciseName, weight, reps, targetEl) {
        if (!targetEl) return;
        // Supprimer badge existant
        const existing = targetEl.querySelector('.pr-badge');
        if (existing) existing.remove();

        if (checkAndShowPRBadge(exerciseName, weight, reps)) {
            const badge = document.createElement('span');
            badge.className = 'pr-badge';
            badge.title = 'Nouveau record personnel !';
            badge.innerHTML = '🏆 PR';
            targetEl.appendChild(badge);
        }
    }

    // Exposer pour usage externe
    window.LyftivPhase1 = {
        updateSessionProgress,
        injectPRBadgeIfNeeded,
        checkSupplSafety
    };

    // Init au DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        // Délai court pour laisser l'app s'initialiser
        setTimeout(() => {
            injectSessionProgressBar();
            observeSessionProgress();
        }, 1200);
    });

})();
