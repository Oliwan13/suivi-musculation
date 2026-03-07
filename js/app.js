// ──  FeatureFlags → js/core/feature-flags.js  ──────────────────────────

// ──  StorageAPI + beep + parseInputValues → js/core/storage.js  ─────────

    const ModalManager = {
        open(modalEl, focusEl = null) {
            if (!modalEl) return;
            modalEl.classList.remove('hidden');
            void modalEl.offsetWidth;
            modalEl.classList.add('show');
            if (focusEl) requestAnimationFrame(() => focusEl.focus());
        },
        close(modalEl, fallbackFocusEl = null) {
            if (!modalEl) return;
            modalEl.classList.remove('show');
            modalEl.addEventListener('transitionend', () => {
                modalEl.classList.add('hidden');
                fallbackFocusEl?.focus?.();
            }, { once: true });
        },
        toggle(modalEl, condition, focusEl = null) {
            condition ? this.open(modalEl, focusEl) : this.close(modalEl);
        }
    };

    window.addEventListener('load', () => {
        // ══ Résolution des dépendances externes (modules chargés avant app.js) ══
        const FeatureFlags    = window.FeatureFlags;
        const StorageAPI      = window.StorageAPI;
        const parseInputValues = window.parseInputValues;
        const beep            = window.beep;
        const RenderScheduler = window.RenderScheduler;
        const DisciplineEngine = window.DisciplineEngine;
        const PhysioCompute   = window.PhysioCompute;
        const state           = window.state;
        const Store           = window.Store;
        const SaveQueue       = window.SaveQueue;
        const defaultSessions = window.defaultSessions;
        const SUPPLEMENT_DB   = window.SUPPLEMENT_DB;
        const TRAINING_ZONES  = window.TRAINING_ZONES;


        const dashboard = document.getElementById('dashboard');
        const appContainer = document.getElementById('app-container');
        const sessionSelectorGrid = document.getElementById('sessionSelectorGrid');

        function populateDashboard() {
            sessionSelectorGrid.innerHTML = '';
            const allSessions = state.sessions;

            allSessions.forEach((session, index) => {
                const card = document.createElement('button');
                card.className = 'session-card';
                card.dataset.sessionIndex = index;
                const icon = session.name.toLowerCase().includes('haut') ? '🏋️‍♂️' : 
                             session.name.toLowerCase().includes('bas') ? '🦵' : '';
                card.innerHTML = `
                    <span class="session-card-icon">${icon}</span>
                    <h3>${escapeHTML(session.name)}</h3>
                    <p>${session.exercises.length} exercices</p>
                `;
                card.addEventListener('click', () => startSessionFromDashboard(index));
                sessionSelectorGrid.appendChild(card);
            });

            const createCard = document.createElement('button');
            createCard.className = 'session-card create-new';
            createCard.id = 'dashboard-create-session-btn';
            createCard.innerHTML = `
                <span class="session-card-icon">➕</span>
                <h3>Créer une séance</h3>
                <p>Bâtissez votre propre entraînement</p>
            `;
            createCard.addEventListener('click', () => {
                dashboard.classList.add('hidden');
                appContainer.classList.remove('hidden');
                sessionStorage.setItem('dashboardShown', 'true');
                showNewSessionModal();
            });
            sessionSelectorGrid.appendChild(createCard);

            // Initialiser les sections premium du dashboard
            initDashboard();
        }

        function startSessionFromDashboard(sessionIndex) {
            dom.sessionSelect.value = sessionIndex;
            state.currentSessionIndex = +sessionIndex;
            createTable();
            updateDeleteSessionButtonState();

            landing.classList.add('hidden');
            dashboard.classList.add('hidden');
            appContainer.classList.remove('hidden');
            sessionStorage.setItem('dashboardShown', 'true');
            sessionStorage.setItem('landingPassed', 'true');
        }
        
        // Références landing
        const landing = document.getElementById('landing');

        function showLanding() {
            landing.classList.remove('hidden');
            dashboard.classList.add('hidden');
            appContainer.classList.add('hidden');
            sessionStorage.removeItem('dashboardShown');
        }

        function showDashboard() {
            landing.classList.add('hidden');
            dashboard.classList.remove('hidden');
            appContainer.classList.add('hidden');
            populateDashboard();
            // Mettre à jour le mode actuel (retour de séance)
            AppMode.clear();
        }
        // Exposer globalement pour l'onboarding
        window.showDashboard = showDashboard;

        // Affichage initial
        if (sessionStorage.getItem('dashboardShown')) {
            // Revient de la séance → dashboard direct
            landing.classList.add('hidden');
            dashboard.classList.add('hidden');
            appContainer.classList.remove('hidden');
        } else if (sessionStorage.getItem('landingPassed')) {
            // Déjà vu la landing → dashboard
            landing.classList.add('hidden');
            dashboard.classList.remove('hidden');
            appContainer.classList.add('hidden');
        } else if (!localStorage.getItem('lyftiv_onboarded')) {
            // Première visite → onboarding (masquer landing et dashboard)
            landing.classList.add('hidden');
            dashboard.classList.add('hidden');
            appContainer.classList.add('hidden');
            // L'overlay onboarding sera affiché par onbInit()
        } else {
            // Déjà onboardé → landing
            landing.classList.remove('hidden');
            dashboard.classList.add('hidden');
            appContainer.classList.add('hidden');
        }

        // ══════════════════════════════════════════════════════════════════════
        //  INIT PIPELINE — ordre déterministe de démarrage :
        //  1. Appliquer le thème (avant tout render pour éviter le flash)
        //  2. Charger state depuis localStorage (inProgressWorkout)
        //  3. Reconstruire l'UI (createTable, updateAllTotals)
        //  4. Brancher les event listeners (setupEventListeners)
        //  5. Initialiser les features secondaires (timers, weekly goal…)
        //  6. Activer le router SPA
        //  Cet ordre garantit 0 flash de contenu et 0 bug d'init aléatoire.
        // ══════════════════════════════════════════════════════════════════════
        function init() {
            if (state.isInitialized) return; // guard double-init
            const savedTheme = StorageAPI.getRaw('theme');
            if (savedTheme) {
                applyTheme(savedTheme);
            } else {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
                applyTheme(prefersDark.matches ? 'dark' : 'light');
                prefersDark.addEventListener('change', (e) => {
                    if (!StorageAPI.getRaw('theme')) {
                        applyTheme(e.matches ? 'dark' : 'light');
                    }
                });
            }
            
            const inProgress = StorageAPI.get('inProgressWorkout');
            if (inProgress) {
                // Load session data
                state.sessions = Array.isArray(inProgress.customSessions) ? inProgress.customSessions : JSON.parse(JSON.stringify(defaultSessions));
                state.currentSessionIndex = inProgress.sessionIndex || 0;
                if (state.currentSessionIndex >= state.sessions.length) {
                    state.currentSessionIndex = 0;
                }

                // Load timer state
                if (inProgress.workoutStartTime) {
                    state.workoutStartTime = inProgress.workoutStartTime;
                    state.isWorkoutTimerPaused = inProgress.isWorkoutTimerPaused;
                    state.totalPausedDuration = inProgress.totalPausedDuration || 0;

                    if (!state.isWorkoutTimerPaused) {
                         // If the timer was running when the page was closed, calculate the time elapsed since and resume it.
                        state.pauseStartTime = inProgress.pauseStartTime; // It wouldn't exist, but good practice
                        startTotalWorkoutTimer();
                    } else {
                        // If it was paused, store the pause start time and display the correct time and button state
                        state.pauseStartTime = inProgress.pauseStartTime || Date.now();
                        updateTotalTimeDisplay();
                        updateTimerToggleButtonUI(true); // isPaused = true
                    }
                }

                // Notifier l'utilisateur que la séance a été restaurée
                if (inProgress.savedAt) {
                    const savedTime = new Date(inProgress.savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    setTimeout(() => {
                        showNotification(`🔄 Séance restaurée — brouillon du ${savedTime} récupéré automatiquement.`, 'info', 6000);
                    }, 800);
                }
            } else {
                 state.sessions = JSON.parse(JSON.stringify(defaultSessions));
                 StorageAPI.remove('inProgressWorkout');
            }
            
            if (state.isMobileView) {
                dom.sessionNotesSection.classList.add('hide-notes-section');
                state.isNotesSectionVisible = false;
            } else {
                dom.sessionNotesSection.classList.add('show-notes-section');
                state.isNotesSectionVisible = true;
            }

            if (!sessionStorage.getItem('dashboardShown')) {
                populateDashboard();
            }

            updateSessionSelectOptions(); 
            dom.sessionSelect.value = state.currentSessionIndex;
            createTable();
            setupEventListeners();
            loadPersistentIndividualTimers();

            window.addEventListener('resize', () => {
                const newIsMobileView = window.matchMedia("(max-width: 768px)").matches;
                if (newIsMobileView !== state.isMobileView) {
                    state.isMobileView = newIsMobileView;
                    createTable();
                    if (state.isMobileView && !state.isNotesSectionVisible) {
                        dom.sessionNotesSection.classList.add('hide-notes-section');
                    } else {
                        dom.sessionNotesSection.classList.remove('hide-notes-section');
                        dom.sessionNotesSection.classList.add('show-notes-section');
                    }
                }
            });

            state.isInitialized = true;
            // Router SPA : lire la route URL et activer l'onglet correspondant
            Router.init();
            // Vérifier si un Deload est recommandé
            setTimeout(checkDeload, 800);
        }

        const dom = {
            sessionSelect: document.getElementById('sessionSelect'),
            exerciseListContainer: document.getElementById('exerciseListContainer'),
            totalKgRepEl: document.getElementById('totalKgRep'),
            previousWeekInput: document.getElementById('previousWeek'),
            deltaEl: document.getElementById('delta'),
            totalTimeEl: document.getElementById('totalTime'),
            progressFill: document.getElementById('progressFill'),
            historyModal: document.getElementById('historyModal'),
            closeHistoryModal: document.getElementById('closeHistoryModal'),
            notificationContainer: document.getElementById('notification-container'),
            customExerciseInput: document.getElementById('customExercise'),
            addExerciseBtn: document.getElementById('addExerciseBtn'),
            historyList: document.getElementById('historyList'),
            importFileInput: document.getElementById('importFile'),
            themeToggleBtn: document.getElementById('themeToggleBtn'),
            homeBtn: document.getElementById('homeBtn'),
            body: document.body,
            toggleWorkoutTimerBtn: document.getElementById('toggleWorkoutTimerBtn'),
            resetWorkoutTimerBtn: document.getElementById('resetWorkoutTimerBtn'),
            newSessionModal: document.getElementById('newSessionModal'),
            closeNewSessionModal: document.getElementById('closeNewSessionModal'),
            newSessionNameInput: document.getElementById('newSessionNameInput'),
            cancelNewSessionBtn: document.getElementById('cancelNewSessionBtn'),
            createNewSessionBtn: document.getElementById('createNewSessionBtn'),
            createNewSessionTypeBtn: document.getElementById('createNewSessionTypeBtn'),
            deleteCurrentSessionBtn: document.getElementById('deleteCurrentSessionBtn'),
            resetCurrentSessionBtn: document.getElementById('resetCurrentSessionBtn'),
            loadOptionsModal: document.getElementById('loadOptionsModal'),
            closeLoadOptionsModal: document.getElementById('closeLoadOptionsModal'),
            loadSessionNameDisplay: document.getElementById('loadSessionName'),
            openNewSessionBtn: document.getElementById('openNewSessionBtn'),
            appendToCurrentSessionBtn: document.getElementById('appendToCurrentSessionBtn'),
            plateCalculatorModal: document.getElementById('plateCalculatorModal'),
            closePlateCalculatorModal: document.getElementById('closePlateCalculatorModal'),
            plateCalculatorBtn: document.getElementById('plateCalculatorBtn'),
            targetWeightInput: document.getElementById('targetWeightInput'),
            barbellWeightInput: document.getElementById('barbellWeightInput'),
            platesResult: document.getElementById('platesResult'),
            sessionNotesInput: document.getElementById('sessionNotes'),
            addExerciseSection: document.getElementById('addExerciseSection'),
            quickEditModal: document.getElementById('quickEditModal'),
            closeQuickEditModal: document.getElementById('closeQuickEditModal'),
            quickEditExerciseName: document.getElementById('quickEditExerciseName'),
            quickEditWeight: document.getElementById('quickEditWeight'),
            quickEditReps: document.getElementById('quickEditReps'),
            applyQuickEditBtn: document.getElementById('applyQuickEditBtn'),
            plateCalcTab: document.getElementById('plateCalcTab'),
            goalCalcTab: document.getElementById('goalCalcTab'),
            plateCalcContent: document.getElementById('plateCalcContent'),
            goalCalcContent: document.getElementById('goalCalcContent'),
            oneRmInput: document.getElementById('oneRmInput'),
            oneRmManualInput: document.getElementById('oneRmManualInput'),
            oneRmSelectInput: document.getElementById('oneRmSelectInput'),
            oneRmExerciseSelect: document.getElementById('oneRmExerciseSelect'),
            goalResultsContainer: document.getElementById('goalResultsContainer'),
            timerPlayPauseIcon: document.getElementById('timerPlayPauseIcon'),
            timerPlayPauseText: document.getElementById('timerPlayPauseText'),
            bottomAddExerciseBtn: document.getElementById('bottomAddExerciseBtn'),
            bottomScrollBtn: document.getElementById('bottomScrollBtn'),
            bottomViewHistoryBtn: document.getElementById('bottomViewHistoryBtn'),
            bottomPlateCalculatorBtn: document.getElementById('bottomPlateCalculatorBtn'),
            bottomNotesBtn: document.getElementById('bottomNotesBtn'),
            sessionNotesSection: document.getElementById('sessionNotesSection'),
            exportBtn: document.getElementById('exportBtn'),
            exportJsonBtn: document.getElementById('exportJsonBtn'),
            importBtn: document.getElementById('importBtn'),
            newSessionNameError: document.getElementById('newSessionNameError'),
            targetWeightError: document.getElementById('targetWeightError'),
            barbellWeightError: document.getElementById('barbellWeightError'),
            oneRmError: document.getElementById('oneRmError'),
            quickEditWeightError: document.getElementById('quickEditWeightError'),
            quickEditRepsError: document.getElementById('quickEditRepsError'),
            progressBar: document.getElementById('progressBar'),
            pwaInstallPrompt: document.getElementById('pwaInstallPrompt'),
            installPwaBtn: document.getElementById('installPwaBtn'),
            closePwaPrompt: document.getElementById('closePwaPrompt')
        };

        /* =========================================
           UTILS — Sanitizers, Formatters
           ========================================= */

        /**
         * Escape user-controlled strings before injecting into innerHTML.
         * Prevents XSS from exercise names, session names, imported data, CSV.
         */
        const escapeHTML = (str) => String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // ── Store — Gestionnaire centralisé des mutations de state ──────
        // Toute modification de state.sessions passe par Store pour garantir
        // la sauvegarde automatique et une source de vérité unique.
        // ══════════════════════════════════════════════════════════════════════
        //  RENDER SCHEDULER — batching des mises à jour UI
        //  N mutations dans la même frame → 1 seul re-render via rAF.
        //  Évite le layout thrashing sur mobile (recalculs style multiples,
        //  battery drain) sans dépendre d'un framework.
        // ══════════════════════════════════════════════════════════════════════
        // ══════════════════════════════════════════════════════════════════════
        //  APP MODE — Router d'état central
        //  Pilote body[data-mode] → CSS réagit → 0 JS de rendu supplémentaire.
        //
        //  Modes :
        //    'execute' — focus workout (défaut dès la première saisie)
        //    'review'  — overlay de fin de séance (Lyftiv Score)
        //    'plan'    — panneau latéral stratégie + sélection séance
        //    ''        — neutre (au chargement, avant première saisie)
        // ══════════════════════════════════════════════════════════════════════
        const AppMode = {
            _current: '',
            _indicator: null,

            /** Passer au mode donné */
            set(mode) {
                if (this._current === mode) return;
                this._current = mode;
                document.body.dataset.mode = mode;
                this._updateIndicator(mode);
            },

            /** Revenir au mode neutre */
            clear() { this.set(''); },

            get current() { return this._current; },

            _updateIndicator(mode) {
                if (!this._indicator) this._indicator = document.getElementById('appModeIndicator');
                if (!this._indicator) return;
                const labels = {
                    execute: '● EXECUTE',
                    review:  '● REVIEW',
                    plan:    '⚡ PLAN',
                    '':      '● PLAN',
                };
                this._indicator.textContent = labels[mode] || '● PLAN';
            },

            /** Lyftiv Score — formule composite 0-100
             *  Pondère : tonnage vs session précédente (40%)
             *            nombre de séries complètes (30%)
             *            durée dans la fenêtre idéale 35-75 min (20%)
             *            adherence DisciplineEngine (10%)
             */
            /** Utilitaire interne — serre une valeur entre min et max */
            _clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),

            // ══════════════════════════════════════════════════════════════════
            //  LYFTIV SCORE ENGINE v2
            //  Modèle à 3 dimensions scientifiquement calibré :
            //    STIMULUS    (40%) — charge relative à l'historique personnel
            //    RECOVERY    (35%) — repos + fatigue cumulative 7 jours
            //    CONSISTENCY (25%) — régularité 30 jours + repos validés
            //
            //  Toutes les baselines sont calibrées sur l'utilisateur lui-même
            //  (percentile, pas des seuils absolus), donc le score est équitable
            //  que l'utilisateur soulève 20 kg ou 200 kg.
            // ══════════════════════════════════════════════════════════════════

            /**
             * STIMULUS SCORE — mesure la charge mécanique réelle vs la distribution
             * personnelle historique (30 dernières séances du même type).
             *
             * Calibré par percentile rang : 50e percentile = 65/100.
             * Le score monte non-linéairement pour récompenser les records
             * sans punir les séances d'entretien.
             */
            computeStimulusScore(workoutData, history) {
                const clamp = this._clamp;

                // Training Load = tonnage (poids × reps × series implicite)
                const load = workoutData.exercises
                    ? workoutData.exercises.reduce((t, ex) =>
                        t + (ex.series || []).reduce((s, sr) =>
                            s + (parseFloat(sr.reps) || 0) * (parseFloat(sr.weight) || 0), 0), 0)
                    : 0;
                if (load <= 0) return 0;

                // Historique de la même séance — fenêtre 30 séances max
                const ref = history
                    .filter(s => s.sessionName === workoutData.sessionName && s.id !== workoutData.id)
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .slice(-30)
                    .map(s => getTonnage(s))
                    .filter(v => v > 0);

                if (ref.length === 0) return 65; // baseline première séance

                // Percentile rang de la charge courante dans l'historique
                const below = ref.filter(v => v < load).length;
                const equal = ref.filter(v => v === load).length;
                const percentile = (below + equal * 0.5) / ref.length; // 0→1

                // Conversion percentile → score avec bonus record
                // 50e pct = 65, 80e pct = 85, 100e pct (record) = 100
                const baseScore = percentile < 0.5
                    ? 30 + percentile * 2 * 35          // [30–65] en dessous de la médiane
                    : 65 + (percentile - 0.5) * 2 * 35; // [65–100] au-dessus

                return Math.round(clamp(baseScore, 0, 100));
            },

            /**
             * RECOVERY SCORE — estime la récupération sans capteur biométrique.
             *
             * Composantes :
             *  - Repos depuis la dernière séance (optimum : 36–72h)
             *  - Charge cumulative des 7 derniers jours (fatigue accumulée)
             *  - Bonus si la séance précédente était légère
             *
             * Basé sur le modèle ATL/CTL simplifié (Banister, 1975 / Busso, 2003)
             */
            computeRecoveryScore(workoutData, history) {
                const clamp = this._clamp;

                const past = history
                    .filter(s => s.id !== workoutData.id && s.date)
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                if (past.length === 0) return 80; // première séance → repos maximum

                // 1. Repos depuis la dernière séance
                const lastDate    = new Date(past[0].date);
                const hoursSince  = (Date.now() - lastDate.getTime()) / 3_600_000;
                // Courbe en cloche : optimal 36–72h
                let restScore;
                if (hoursSince < 12) {
                    restScore = clamp(hoursSince / 12 * 30, 0, 30); // < 12h → très fatigué
                } else if (hoursSince < 36) {
                    restScore = 30 + ((hoursSince - 12) / 24) * 50; // 12–36h → montée
                } else if (hoursSince <= 72) {
                    restScore = 80 + ((hoursSince - 36) / 36) * 20; // 36–72h → optimal
                } else if (hoursSince <= 120) {
                    restScore = 100 - ((hoursSince - 72) / 48) * 10; // 72–120h → léger déclin
                } else {
                    restScore = 90; // > 5j → pleinement récupéré
                }

                // 2. Charge cumulative 7 derniers jours (ATL proxy)
                const sevenDaysAgo = Date.now() - 7 * 86_400_000;
                const weeklyLoads  = past
                    .filter(s => new Date(s.date).getTime() > sevenDaysAgo)
                    .map(s => getTonnage(s));
                const avgLoad7d    = weeklyLoads.length
                    ? weeklyLoads.reduce((a, b) => a + b, 0) / weeklyLoads.length
                    : 0;

                // Calibration sur l'historique propre de l'utilisateur
                const allLoads = past.map(s => getTonnage(s)).filter(v => v > 0);
                const userAvgLoad = allLoads.length
                    ? allLoads.reduce((a, b) => a + b, 0) / allLoads.length
                    : avgLoad7d || 1;

                // Ratio charge récente vs habituelle : >1.5 = surentraînement
                const loadRatio    = userAvgLoad > 0 ? avgLoad7d / userAvgLoad : 1;
                const fatiguePen   = clamp((loadRatio - 0.8) / 0.7 * 30, 0, 30);

                return Math.round(clamp(restScore - fatiguePen, 0, 100));
            },

            /**
             * CONSISTENCY SCORE — régularité sur 30 jours.
             *
             * Intègre les jours de repos volontaires validés via DisciplineEngine.
             * Un repos prévu = engagement respecté = discipline.
             *
             * Cible : 3 séances/semaine = 12–13/mois (fréquence optimale hypertrophie).
             * Cible adaptative : si l'utilisateur a une baseline différente,
             * on utilise sa fréquence historique comme référence.
             */
            computeConsistencyScore(history) {
                const clamp = this._clamp;

                const thirtyDaysAgo = Date.now() - 30 * 86_400_000;

                // Séances des 30 derniers jours
                const recentSessions = history.filter(s =>
                    s.date && new Date(s.date).getTime() > thirtyDaysAgo && !s.isAutoSave
                );

                // Jours de repos validés (DisciplineEngine)
                const restDays = (StorageAPI.get('lyftiv_rest_days', []) || [])
                    .filter(d => new Date(d).getTime() > thirtyDaysAgo);

                // Jours actifs = séances + repos validés (score global du protocole)
                const activeDays    = new Set([
                    ...recentSessions.map(s => s.date?.split('T')[0]),
                    ...restDays
                ]).size;

                // Cible adaptative : moyenne des 3 derniers mois ou 12 par défaut
                const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
                const sessionsLast90 = history.filter(s =>
                    s.date && new Date(s.date).getTime() > ninetyDaysAgo && !s.isAutoSave
                ).length;
                const idealPerMonth  = sessionsLast90 > 0
                    ? Math.round(sessionsLast90 / 3)
                    : 12; // fallback : 3 séances/sem

                // Ratio jours actifs / cible mensuelle
                const ratio = activeDays / Math.max(idealPerMonth, 1);

                // Courbe progressive : on récompense la constance plus que le volume brut
                let score;
                if (ratio >= 1)        score = 85 + clamp((ratio - 1) * 15, 0, 15); // dépasse la cible
                else if (ratio >= 0.8) score = 65 + (ratio - 0.8) / 0.2 * 20;       // bonne adhérence
                else if (ratio >= 0.5) score = 35 + (ratio - 0.5) / 0.3 * 30;       // acceptable
                else                   score = ratio / 0.5 * 35;                     // insuffisant

                return Math.round(clamp(score, 0, 100));
            },

            /**
             * LYFTIV SCORE FINAL — composition pondérée des 3 dimensions.
             *
             * Pondération : Stimulus 40% · Recovery 35% · Consistency 25%
             * Le Recovery pèse davantage que dans v1 car c'est le signal
             * que les apps sans capteur ignorent systématiquement.
             *
             * Retourne : { score, stimulus, recovery, consistency, league }
             */
            computeLyftivScore(workoutData, history) {
                const stimulus    = this.computeStimulusScore(workoutData, history);
                const recovery    = this.computeRecoveryScore(workoutData, history);
                const consistency = this.computeConsistencyScore(history);

                const final = Math.round(
                    stimulus    * 0.40 +
                    recovery    * 0.35 +
                    consistency * 0.25
                );
                const score = this._clamp(final, 0, 100);

                // Ligue dynamique
                const league =
                    score >= 90 ? { name: 'TITAN',     color: 'hsl(280,72%,62%)', icon: '⚡' } :
                    score >= 75 ? { name: 'ÉLITE',      color: 'hsl(152,65%,48%)', icon: '🏆' } :
                    score >= 60 ? { name: 'PERFORMER',  color: 'hsl(210,80%,58%)', icon: '📈' } :
                    score >= 40 ? { name: 'SILVER',     color: 'hsl(35,80%,54%)',  icon: '⚙️'  } :
                                  { name: 'BRONZE',     color: 'hsl(24,60%,48%)',  icon: '🔩' };

                return { score, stimulus, recovery, consistency, league };
            }
        };

// ──  RenderScheduler → js/core/render-scheduler.js  ─────────────────────

// ──  DisciplineEngine → js/fitness/discipline-engine.js  ────────────────

// ──  PhysioCompute → js/fitness/physio-compute.js  ──────────────────────

// ──  Store → js/core/state.js  ───────────────────────────────────────────

// ──  state → js/core/state.js  ───────────────────────────────────────────
        
// ──  defaultSessions → js/data/default-sessions.js  ──────────────────────
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            state.deferredPwaPrompt = e;
            if (StorageAPI.getRaw('pwaPromptDismissed') !== 'true') {
                dom.pwaInstallPrompt.classList.remove('hidden');
                setTimeout(() => dom.pwaInstallPrompt.classList.add('show'), 10);
            }
        });

        dom.installPwaBtn.addEventListener('click', async () => {
            if (state.deferredPwaPrompt) {
                state.deferredPwaPrompt.prompt();
                const { outcome } = await state.deferredPwaPrompt.userChoice;
                if (outcome === 'accepted') {
                    showNotification('Lyftiv a été ajouté à votre écran d\'accueil!', 'success', 5000);
                }
                state.deferredPwaPrompt = null;
                dom.pwaInstallPrompt.classList.remove('show');
                dom.pwaInstallPrompt.addEventListener('transitionend', () => dom.pwaInstallPrompt.classList.add('hidden'), { once: true });
            }
        });

        dom.closePwaPrompt.addEventListener('click', () => {
            dom.pwaInstallPrompt.classList.remove('show');
            dom.pwaInstallPrompt.addEventListener('transitionend', () => dom.pwaInstallPrompt.classList.add('hidden'), { once: true });
            StorageAPI.setRaw('pwaPromptDismissed', 'true');
        });
        
        function validateInputField(inputElement, errorDisplayElement, allowEmpty = false) {
            const value = inputElement.value.trim();
            if (allowEmpty && value === '') {
                inputElement.classList.remove('is-invalid');
                errorDisplayElement.textContent = '';
                return true;
            }
            const regex = /^\d+(\.\d{1,2})?$/;
            if (!regex.test(value) || parseFloat(value) < 0) {
                inputElement.classList.add('is-invalid');
                errorDisplayElement.textContent = 'Veuillez entrer un nombre positif valide.';
                return false;
            } else {
                inputElement.classList.remove('is-invalid');
                errorDisplayElement.textContent = '';
                return true;
            }
        }

        function handleNumericInput(e) {
            const input = e.target;
            let value = input.value.replace(/,/g, '.');
            const segments = value.split('+').map(s => s.trim());
            const validatedSegments = segments.filter(s => {
                if (s === '') return true;
                const num = parseFloat(s);
                return !isNaN(num) && num >= 0;
            });
            input.value = validatedSegments.join('+');
        }

        function getPlateCombinationOptimal(target, denominations) {
            let currentRemaining = target;
            const platesUsed = {};
            let loadedWeight = 0;
            for (const plateValue of denominations) {
                const numPlates = Math.floor(currentRemaining / plateValue);
                if (numPlates > 0) {
                    platesUsed[plateValue] = numPlates;
                    loadedWeight += numPlates * plateValue;
                    currentRemaining -= (numPlates * plateValue);
                    currentRemaining = parseFloat(currentRemaining.toFixed(2)); 
                }
            }
            return { plates: platesUsed, loadedWeight: loadedWeight, remaining: currentRemaining };
        }

        function getPlateCombinationAlternative(target, fullDenominations) {
            let currentRemaining = target;
            const platesUsed = {};
            const alternativeOrder = [20, 10, 5, 2.5, 1.25, 0.5, 0.25]; 
            const availableAlternativeOrder = fullDenominations.filter(p => alternativeOrder.includes(p));
            availableAlternativeOrder.sort((a, b) => b - a);

            for (const plateValue of availableAlternativeOrder) {
                if (currentRemaining <= 0) break; 
                const numPlates = Math.floor(currentRemaining / plateValue);
                if (numPlates > 0) {
                    platesUsed[plateValue] = (platesUsed[plateValue] || 0) + numPlates;
                    currentRemaining -= numPlates * plateValue;
                    currentRemaining = parseFloat(currentRemaining.toFixed(2)); 
                }
            }
            let loadedWeight = target - currentRemaining; 
            return { plates: platesUsed, loadedWeight: loadedWeight, remaining: currentRemaining };
        }

        function formatPlatesWithPlus(platesObject) {
            let formatted = [];
            const sortedPlateValues = Object.keys(platesObject).map(Number).sort((a, b) => b - a);
            for (const plateValue of sortedPlateValues) {
                if (platesObject[plateValue] > 0) {
                    formatted.push(`<span>${plateValue}kg x${platesObject[plateValue]}</span>`); 
                }
            }
            return formatted.length > 0 ? formatted.join(' + ') : 'Aucun';
        }
        
        function calculatePlates() {
            const targetValid = validateInputField(dom.targetWeightInput, dom.targetWeightError);
            const barbellValid = validateInputField(dom.barbellWeightInput, dom.barbellWeightError); 

            if (!targetValid || !barbellValid) {
                dom.platesResult.innerHTML = `<p class="plate-result-message danger">Veuillez corriger les erreurs dans les poids.</p>`;
                return;
            }

            const targetWeight = parseFloat(dom.targetWeightInput.value);
            const barbellWeight = parseFloat(dom.barbellWeightInput.value);
            
            if (barbellWeight > targetWeight) {
                dom.targetWeightInput.classList.add('is-invalid');
                dom.targetWeightError.textContent = 'Le poids cible doit être supérieur ou égal au poids de la barre.';
                dom.platesResult.innerHTML = `<p class="plate-result-message danger">Veuillez corriger les erreurs dans les poids.</p>`;
                return;
            } else {
                dom.targetWeightInput.classList.remove('is-invalid');
                dom.targetWeightError.textContent = '';
            }

            let weightPerSideTarget = (targetWeight - barbellWeight) / 2;
            
            const platesDenominations = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25].sort((a, b) => b - a);

            const combinationResult1 = getPlateCombinationOptimal(weightPerSideTarget, platesDenominations);
            const combinationResult2 = getPlateCombinationAlternative(weightPerSideTarget, platesDenominations);
            
            const totalPlates1 = {};
            for (const plate in combinationResult1.plates) {
                totalPlates1[plate] = combinationResult1.plates[plate] * 2;
            }
            const formattedTotalPlates1 = formatPlatesWithPlus(totalPlates1);
            
            const totalPlates2 = {};
            for (const plate in combinationResult2.plates) {
                totalPlates2[plate] = combinationResult2.plates[plate] * 2;
            }
            const formattedTotalPlates2 = formatPlatesWithPlus(totalPlates2);

            const loadedWeightPerSide = combinationResult1.loadedWeight;
            const totalLoadedWeight = loadedWeightPerSide * 2 + barbellWeight;
            const diff = targetWeight - totalLoadedWeight;

            let resultHtml = `<div class="result-summary">
                                <h3>Résultats :</h3>
                                <p>Poids chargé par côté: <span>${loadedWeightPerSide.toFixed(2)}kg</span> | Poids total chargé: <span>${totalLoadedWeight.toFixed(2)}kg</span></p>`;
            
            if (Math.abs(diff) < 0.01) {
                resultHtml += `<p class="plate-result-message success">Poids cible atteint !</p>`;
            } else {
                resultHtml += `<p class="plate-result-message danger">Différence par rapport à la cible: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}kg</p>`;
            }
            resultHtml += `</div>`;
            resultHtml += `<h4>1. Total des plaques (2 côtés) - Minimisant le nombre:</h4><p>${formattedTotalPlates1}</p>`;
            if(formattedTotalPlates1 !== formattedTotalPlates2 && formattedTotalPlates2 !== 'Aucun') {
                resultHtml += `<h4>2. Total des plaques (2 côtés) - Autre décomposition:</h4><p>${formattedTotalPlates2}</p>`;
            }
            
            dom.platesResult.innerHTML = resultHtml;
        }

        function calculateTrainingGoals() {
            const oneRmValid = validateInputField(dom.oneRmInput, dom.oneRmError);
            if (!oneRmValid) {
                dom.goalResultsContainer.innerHTML = '';
                return;
            }

            const oneRm = parseFloat(dom.oneRmInput.value);

            const goals = [
                { name: 'Hypertrophie', icon: '💪', minPercent: 0.60, maxPercent: 0.80, a_class: 'hypertrophy', tooltip: '60-80% du 1RM', reps: '6-12 Répétitions' },
                { name: 'Force', icon: '🏋', minPercent: 0.80, maxPercent: 1.00, a_class: 'strength', tooltip: '80-100% du 1RM', reps: '1-5 Répétitions' },
                { name: 'Endurance', icon: '🏃', minPercent: 0, maxPercent: 0.60, a_class: 'endurance', tooltip: '<60% du 1RM', reps: '15+ Répétitions' },
                { name: 'Power', icon: '⚡', minPercent: 0.30, maxPercent: 0.70, a_class: 'power', tooltip: '30-70% du 1RM', reps: '3-6 Répétitions (explosif)' }
            ];

            let resultsHtml = '';
            goals.forEach(goal => {
                const minWeight = (oneRm * goal.minPercent).toFixed(1);
                const maxWeight = (oneRm * goal.maxPercent).toFixed(1);
                let rangeText;
                if (goal.minPercent === 0) {
                    rangeText = `< ${maxWeight} kg`;
                } else {
                    rangeText = `${minWeight} - ${maxWeight} kg`;
                }

                resultsHtml += `
                    <div class="goal-card ${goal.a_class}" title="${goal.tooltip}">
                        <h4><span class="icon">${goal.icon}</span> ${goal.name}</h4>
                        <div class="weight-range"><strong>${rangeText}</strong></div>
                        <p class="rep-range">${goal.reps}</p>
                    </div>
                `;
            });

            dom.goalResultsContainer.innerHTML = resultsHtml;
        }
        
        async function handleTableActions(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const rowOrCard = button.closest('.exercise-row') || button.closest('.exercise-card');
            if (!rowOrCard) return;
            const idx = +rowOrCard.dataset.exerciseIndex;
            const timerAction = button.dataset.timerAction;
            const action = button.dataset.action;

            if (action === 'quick-edit') {
                state.quickEditIndex = idx;
                dom.quickEditExerciseName.textContent = state.sessions[state.currentSessionIndex].exercises[idx].name;
                ModalManager.open(dom.quickEditModal, dom.quickEditWeight);
                if (!state.isMobileView) dom.quickEditWeight.focus();
                dom.quickEditWeight.classList.remove('is-invalid');
                dom.quickEditWeightError.textContent = '';
                dom.quickEditReps.classList.remove('is-invalid');
                dom.quickEditRepsError.textContent = '';
            } else if (action === 'link-superset') {
                const scrollY = window.scrollY;
                const session = state.sessions[state.currentSessionIndex];
                const exercises = session.exercises;
                const clickedEx = exercises[idx];

                if (state.linkingState && state.linkingState.active) {
                    const fromIdx = state.linkingState.fromIndex;

                    if (fromIdx === idx) {
                        state.linkingState = { active: false, fromIndex: null };
                        showNotification("Liaison annulée.", "info");
                        createTable();
                        window.scrollTo(0, scrollY);
                    } else {
                        const fromEx = exercises[fromIdx];
                        // Réutilise le groupId existant ou génère un nouveau
                        const groupId = fromEx.groupId || clickedEx.groupId || ('g-' + Date.now());
                        fromEx.groupId = groupId;
                        clickedEx.groupId = groupId;

                        // Auto-rapprochement : déplace l'exo cliqué juste après le premier
                        if (Math.abs(fromIdx - idx) > 1) {
                            const [movedEx] = exercises.splice(idx, 1);
                            const insertAt = idx > fromIdx ? fromIdx + 1 : fromIdx;
                            exercises.splice(insertAt, 0, movedEx);
                        }

                        state.linkingState = { active: false, fromIndex: null };
                        showNotification("✅ Superset / Circuit créé !", "success");
                        saveCurrentState(true);
                        createTable();
                        window.scrollTo(0, scrollY);
                    }
                } else {
                    if (clickedEx.groupId) {
                        // Délier cet exercice du groupe
                        const currentGroupId = clickedEx.groupId;
                        delete clickedEx.groupId;
                        // Détruire le groupe si moins de 2 membres restants
                        const remaining = exercises.filter(e => e.groupId === currentGroupId);
                        if (remaining.length === 1) delete remaining[0].groupId;
                        showNotification("Exercice retiré du groupe.", "info");
                        saveCurrentState(true);
                        createTable();
                        window.scrollTo(0, scrollY);
                    } else {
                        state.linkingState = { active: true, fromIndex: idx };
                        button.classList.add('linking');
                        showNotification(`Sélectionnez l'exercice à lier avec "${clickedEx.name}"...`, "info");
                    }
                    const fromIndex = state.linkingState?.fromIndex;
                    if (false) { // ancienne branche — conservée pour compat
                        const fromIndex2 = state.linkingState.fromIndex;
                        if (fromIndex2 !== idx) {
                            showNotification("Exercices liés!", "success");
                        }
                        state.linkingState = { active: false, fromIndex: null };
                        createTable();
                        window.scrollTo(0, scrollY);
                    }
                }

            } else if (timerAction) {
                handleTimerActions(timerAction, idx, rowOrCard);
            } else if (action === 'remove') {
                const exerciseToRemove = state.sessions[state.currentSessionIndex].exercises[idx];
                const confirmed = await customConfirm(`Êtes-vous sûr de vouloir supprimer l'exercice "${exerciseToRemove.name}"?`);
                if (confirmed) {
                    const scrollY = window.scrollY;
                    if (state.timers[idx]) {
                        clearInterval(state.timers[idx].interval);
                        delete state.timers[idx];
                    }
                    state.lastDeletedExercise = Store.removeExercise(idx);
                    createTable();
                    window.scrollTo(0, scrollY);
                    showUndoableNotification(`Exercice "${exerciseToRemove.name}" supprimé.`, () => {
                        if (state.lastDeletedExercise) {
                            state.sessions[state.currentSessionIndex].exercises.splice(idx, 0, state.lastDeletedExercise);
                            saveCurrentState(true);
                            createTable();
                            updateAllTotals();
                            state.lastDeletedExercise = null;
                            showNotification(`Suppression annulée. "${exerciseToRemove.name}" restauré.`, "info");
                        }
                    }, 7000);
                }
            } else if (action === 'add-series') {
                const scrollY = window.scrollY;
                const exName = state.sessions[state.currentSessionIndex].exercises[idx]?.name;
                Store.addSeries(idx);
                createTable();
                window.scrollTo(0, scrollY);
                showNotification(`Nouvelle série ajoutée à l'exercice "${escapeHTML(exName)}".`, "info", 2000);
            }
        }
        
        function handleTimerActions(timerAction, idx, element) {
            const timerDisplay = element.querySelector('.timer-display');
            const startBtn = element.querySelector('[data-timer-action="start"]');
            const stopBtn = element.querySelector('[data-timer-action="stop"]'); // This is now our Pause/Resume button
            const exercise = state.sessions[state.currentSessionIndex].exercises[idx];
            const restString = exercise.rest;
            const duration = parseInt(restString) * (restString.includes('min') ? 60 : 1) || 60;

            // Initialize timer state if it doesn't exist
            if (!state.timers[idx]) {
                state.timers[idx] = {
                    interval: null,
                    remaining: duration,
                    isPaused: false,
                    duration: duration
                };
            }
            
            const runTimer = () => {
                const timerState = state.timers[idx];
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission();
                }

                if (timerState.interval) clearInterval(timerState.interval);
                
                const endTime = Date.now() + timerState.remaining * 1000;
                StorageAPI.set(`timer-${idx}`, { endTime: endTime, name: exercise.name, duration: timerState.duration });

                timerState.interval = setInterval(() => {
                    const now = Date.now();
                    const remainingSeconds = Math.round((endTime - now) / 1000);
                    
                    if (remainingSeconds <= 0) {
                        clearInterval(timerState.interval);
                        timerDisplay.textContent = formatTimerDisplay(0);
                        timerDisplay.classList.remove('timer-active');
                        StorageAPI.remove(`timer-${idx}`);
                        playBeep();
                        if (Notification.permission === "granted") {
                            new Notification('Lyftiv - Repos Terminé !', { body: `Le temps de repos pour ${exercise.name} est terminé.` });
                        }
                        startBtn.classList.remove('hidden');
                        stopBtn.classList.add('hidden');
                        state.timers[idx].remaining = state.timers[idx].duration; // Reset for next time
                    } else {
                        timerState.remaining = remainingSeconds;
                        timerDisplay.textContent = formatTimerDisplay(remainingSeconds);
                    }
                }, 1000);

                timerDisplay.classList.add('timer-active');
                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
                stopBtn.innerHTML = '⏸';
                stopBtn.style.background = 'var(--btn-danger-bg)';
            };

            if (timerAction === 'start' || (timerAction === 'stop' && state.timers[idx].isPaused)) { // Start or Resume
                state.timers[idx].isPaused = false;
                runTimer();
            } else if (timerAction === 'stop' && !state.timers[idx].isPaused) { // Pause
                state.timers[idx].isPaused = true;
                clearInterval(state.timers[idx].interval);
                StorageAPI.remove(`timer-${idx}`);
                timerDisplay.classList.remove('timer-active');
                stopBtn.innerHTML = '▶'; // Set icon to Resume/Play
                stopBtn.style.background = 'var(--btn-success-bg)';
            } else if (timerAction === 'reset') { // Reset
                clearInterval(state.timers[idx].interval);
                StorageAPI.remove(`timer-${idx}`);
                state.timers[idx] = null; // Clear the state
                timerDisplay.textContent = formatTimerDisplay(duration);
                timerDisplay.classList.remove('timer-active');
                startBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                stopBtn.innerHTML = '⏸'; // Reset icon
                stopBtn.style.background = 'var(--btn-danger-bg)';
            }
        }

        async function handleHistoryActions(e) { 
            const button = e.target.closest('button');
            if (!button) return;
            const historyAction = button.dataset.historyAction;
            const historyId = +button.dataset.historyId;
            if (historyAction === 'details') showHistoryDetails(historyId);
            else if (historyAction === 'delete') await deleteHistoryItem(historyId);
            else if (historyAction === 'load') {
                const historicalSession = getHistory().find(s => s.id == historyId);
                if (historicalSession) {
                    showLoadOptionsModal(historicalSession); 
                } else {
                    showNotification("La séance historique demandée n'a pas été trouvée.", "error");
                }
            }
        }

        async function deleteHistoryItem(id) {
            const confirmed = await customConfirm("Êtes-vous sûr de vouloir supprimer définitivement cette séance de l'historique ?");
            if (confirmed) {
                let history = getHistory().filter(session => session.id != id);
                StorageAPI.set('workoutHistory', history);
                displayHistory(); 
                showNotification("Séance supprimée de l'historique avec succès.", "info");
            }
        }
        
        // updateStateFromTable — lecture DOM complète (utilisée uniquement à la sauvegarde globale)
        function updateStateFromTable() {
            if (!state.isInitialized) return;
            const currentSession = state.sessions[state.currentSessionIndex];
            if (!currentSession?.exercises) return;
            currentSession.exercises.forEach((ex, idx) => {
                if (!Array.isArray(ex.series)) ex.series = [];
                const seriesMap = new Map();
                document.querySelectorAll(`[data-ex='${idx}'][data-serie]`).forEach(input => {
                    const si = parseInt(input.dataset.serie, 10);
                    if (!seriesMap.has(si)) seriesMap.set(si, {});
                    if (input.classList.contains('weight')) seriesMap.get(si).weight = input.value;
                    else if (input.classList.contains('reps')) seriesMap.get(si).reps = input.value;
                });
                ex.series = Array.from(seriesMap.keys()).sort((a, b) => a - b).map(si => seriesMap.get(si));
            });
        }

        // updateSingleSerie — mise à jour chirurgicale d'1 seul champ (poids ou reps)
        // Appelée à chaque frappe clavier : 0 querySelectorAll global, 0 layout thrashing
        function updateSingleSerie(exIndex, serieIndex, field, value) {
            if (!state.isInitialized) return;
            const session = state.sessions[state.currentSessionIndex];
            if (!session?.exercises?.[exIndex]) return;
            const ex = session.exercises[exIndex];
            if (!Array.isArray(ex.series)) ex.series = [];
            // BUG FIX: les séries héritées de defaultSessions sont des strings ("4 x 5-7").
            // Une string est truthy → !ex.series[i] est false → écriture .weight/.reps silencieusement
            // perdue. On remplace explicitement tout item non-objet par un objet vide.
            if (typeof ex.series[serieIndex] !== 'object' || ex.series[serieIndex] === null) {
                ex.series[serieIndex] = {};
            }
            ex.series[serieIndex][field] = value;
            // Cache invalidé : les données de la session ont changé
            invalidateNextSessionCache();
        }

        function resetAppStateToDefault() {
            state.sessions = JSON.parse(JSON.stringify(defaultSessions));
            state.currentSessionIndex = 0;
            StorageAPI.remove('inProgressWorkout');
            StorageAPI.remove('calculatorState');
            Object.values(state.timers).forEach(timer => {
                if (timer && timer.interval) clearInterval(timer.interval);
            });
            state.timers = {};
            
            resetTotalWorkoutTimer(false);
            
            dom.totalKgRepEl.textContent = "0 kg/rep";
            dom.deltaEl.textContent = "0 kg";
            dom.previousWeekInput.value = "";
            dom.sessionNotesInput.value = "";
            updateSessionSelectOptions();
            dom.sessionSelect.value = state.currentSessionIndex;
            updateDeleteSessionButtonState();
        }

        function isAppStateValid() {
            if (!Array.isArray(state.sessions)) {
                return false;
            }
            if (typeof state.currentSessionIndex !== 'number' || state.currentSessionIndex < 0 || state.currentSessionIndex >= state.sessions.length) {
                return false;
            }
            const currentSession = state.sessions[state.currentSessionIndex];
            if (!currentSession || typeof currentSession !== 'object' || !Array.isArray(currentSession.exercises)) {
                return false;
            }
            return true;
        }
        


        /* ── openCircuitModal — ouvre la modale de sélection circuit ── */
        function openCircuitModal() {
            const session = state.sessions[state.currentSessionIndex];
            const list = document.getElementById('circuitExerciseList');
            if (!list) return;
            list.innerHTML = '';
            const confirmBtn = document.getElementById('confirmCircuitBtn');

            if (!session?.exercises?.length) {
                list.innerHTML = '<p style="color:var(--color-danger-default);">Ajoutez d\'abord des exercices à votre séance.</p>';
                if (confirmBtn) confirmBtn.disabled = true;
            } else {
                let availableCount = 0;
                session.exercises.forEach((ex, idx) => {
                    // Barrière : exclure les exercices déjà dans un circuit (évite les doublons/corruption)
                    if (ex.groupId) return;
                    availableCount++;
                    list.innerHTML += `<label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-base);cursor:pointer;">
                        <input type="checkbox" value="${idx}" class="circuit-ex-cb" style="width:22px;height:22px;accent-color:hsl(240,60%,60%);">
                        <span style="font-weight:700;color:var(--color-text-header);">${escapeHTML(ex.name)}</span>
                    </label>`;
                });
                if (availableCount < 2) {
                    list.innerHTML += '<p style="color:var(--color-text-subheader);font-style:italic;margin-top:8px;">Pas assez d\'exercices libres. Déliez d\'abord un circuit existant.</p>';
                    if (confirmBtn) confirmBtn.disabled = true;
                } else {
                    if (confirmBtn) confirmBtn.disabled = false;
                }
            }
            const modal = document.getElementById('globalCircuitModal');
            ModalManager.open(modal, modal.querySelector('button'));
        }

        /* ── buildCircuit — regroupe N exercices sélectionnés ─── */
        function buildCircuit(selectedIndexes) {
            const session = state.sessions[state.currentSessionIndex];
            if (!selectedIndexes || selectedIndexes.length < 2) {
                showNotification("Cochez au moins 2 exercices.", "error");
                return;
            }
            const newGroupId = 'circuit-' + Date.now();

            // 1. Snapshot des exercices à grouper (AVANT tout splice pour figer les références)
            const groupedExercises = [...selectedIndexes]
                .sort((a, b) => a - b)
                .map(idx => {
                    session.exercises[idx].groupId = newGroupId;
                    return session.exercises[idx];
                });

            // 2. CORRECTION CRITIQUE : supprimer du plus grand au plus petit index
            // → évite le décalage d'index causé par les suppressions successives
            [...selectedIndexes].sort((a, b) => b - a).forEach(idx => {
                session.exercises.splice(idx, 1);
            });

            // 3. Réinsérer le bloc complet à la position du premier exercice sélectionné
            const insertAt = Math.min(...selectedIndexes);
            session.exercises.splice(insertAt, 0, ...groupedExercises);

            ModalManager.close(document.getElementById('globalCircuitModal'));
            saveCurrentState(true, true); // skipDomSync : state déjà à jour, pas de lecture DOM
            createTable();
            showNotification(`🔗 Circuit créé (${groupedExercises.length} exercices) !`, "success");
        }

        /* ── formatSupersetsUI — post-processing visuel superset ── */
        function formatSupersetsUI() {
            const session = state.sessions[state.currentSessionIndex];
            if (!session?.exercises) return;
            const container = document.getElementById('exerciseListContainer') ||
                              document.querySelector('.mobile-cards') ||
                              document.getElementById('exerciseList');
            if (!container) return;

            const cards = Array.from(container.querySelectorAll('.exercise-card'));
            if (!cards.length) return;

            let currentGroupId = null;
            let wrapper = null;
            let mainCounter = 1;
            let letterCode = 65; // 'A'

            cards.forEach((card, idx) => {
                const ex = session.exercises[idx];
                if (!ex) return;
                const titleEl = card.querySelector('.ex-name, h3, h4');

                if (ex.groupId) {
                    if (ex.groupId !== currentGroupId) {
                        wrapper = document.createElement('div');
                        wrapper.className = 'superset-wrapper';
                        wrapper.innerHTML = '<div class="superset-header">🔗 Circuit / Superset</div><div class="superset-body"></div>';
                        card.parentNode.insertBefore(wrapper, card);
                        currentGroupId = ex.groupId;
                        letterCode = 65;
                    }
                    wrapper.querySelector('.superset-body').appendChild(card);
                    if (titleEl) titleEl.textContent = `${mainCounter}${String.fromCharCode(letterCode)} – ${ex.name}`;
                    letterCode++;

                    // Masquer timer repos si pas le dernier du groupe
                    const isLast = (idx === session.exercises.length - 1) || (session.exercises[idx + 1]?.groupId !== ex.groupId);
                    const restBtn = card.querySelector('[data-timer-action="start"]');
                    const timerContainer = card.querySelector('.timer-container');
                    if (!isLast) {
                        if (restBtn) restBtn.style.display = 'none';
                        if (timerContainer) timerContainer.style.opacity = '0.3';
                    }
                    if (isLast) mainCounter++;

                    // Bouton lier → délier
                    const linkBtn = card.querySelector('[data-action="link-superset"]');
                    if (linkBtn) {
                        linkBtn.innerHTML = '✂️';
                        linkBtn.setAttribute('aria-label', 'Délier du superset');
                        linkBtn.style.color = 'var(--color-danger-default)';
                    }
                } else {
                    currentGroupId = null;
                    if (titleEl) titleEl.textContent = `${mainCounter} – ${ex.name}`;
                    mainCounter++;
                }
            });
        }

        function createTable() {
            if (!state.isInitialized) return;

            // Snapshot des timers actifs AVANT de détruire le DOM
            // → permet de les ré-attacher après reconstruction sans les tuer
            const _activeTimerSnapshot = {};
            Object.entries(state.timers).forEach(([idx, t]) => {
                if (t && t.interval && t.duration != null) {
                    const remaining = t.duration - (t.secondsElapsed || 0);
                    if (remaining > 0) _activeTimerSnapshot[idx] = { remaining, duration: t.duration };
                }
                if (t && t.interval) { clearInterval(t.interval); t.interval = null; }
            });

            dom.exerciseListContainer.innerHTML = "";
            if (!isAppStateValid()) resetAppStateToDefault();

            const currentSession = state.sessions[state.currentSessionIndex];
            const exercises = currentSession?.exercises ?? [];

            // Normalisation
            exercises.forEach(ex => {
                if (!ex.rest?.trim()) ex.rest = "1 min";
                if (Array.isArray(ex.series)) {
                    // BUG FIX: defaultSessions stocke les séries comme strings ("4 x 5-7").
                    // createTable lit s.weight / s.reps → undefined sur une string → input vide,
                    // et updateSingleSerie ne pouvait pas écraser une string (truthy guard).
                    // On normalise ici en un seul passage : string → {weight:'', reps:''}.
                    ex.series = ex.series.map(s =>
                        (s !== null && typeof s === 'object') ? s : { weight: '', reps: '' }
                    );
                    while (ex.series.length < 4) ex.series.push({ weight: '', reps: '' });
                }
            });

            if (!state.isMobileView) {
                // ── MODE DESKTOP — clonage des templates ────────────────────
                const tplRow  = document.getElementById('tpl-exercise-row');
                const tplCell = document.getElementById('tpl-serie-cell');

                const table = document.createElement('table');
                table.id = 'workoutTable';
                table.className = 'desktop-table';
                table.setAttribute('role', 'table');
                table.setAttribute('aria-label', 'Liste des exercices de la séance');

                const thead = document.createElement('thead');
                thead.innerHTML = `<tr role="row">
                    <th class="actions-col" scope="col">Actions</th>
                    <th scope="col">Exercice</th>
                    <th colspan="5" scope="colgroup">Séries</th>
                    <th scope="col">Kg/Rép</th><th scope="col">1RM</th>
                    <th scope="col">Repos</th><th scope="col">Minuteur</th><th scope="col"></th>
                </tr>`;
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                tbody.id = 'tbody';
                const desktopFrag = document.createDocumentFragment();

                exercises.forEach((ex, idx) => {
                    if (!ex || !Array.isArray(ex.series)) return;

                    const safeName = escapeHTML(ex.name);
                    const restSeconds = parseInt(ex.rest) * (String(ex.rest).includes('min') ? 60 : 1) || 0;

                    // Cloner le template de ligne
                    const tr = tplRow.content.cloneNode(true).querySelector('tr');
                    tr.dataset.exerciseIndex = idx;
                    if (ex.supersetGroup) tr.classList.add('superset-group');

                    // Remplir via textContent/dataset — protection XSS native
                    tr.querySelector('.ex-name').textContent = ex.name;
                    tr.querySelector('.ex-rest').textContent = ex.rest || '';
                    const timerEl = tr.querySelector('.ex-timer');
                    timerEl.id = `timer-${idx}`;
                    timerEl.textContent = formatTimerDisplay(restSeconds);

                    // Stat cells — IDs pour updateAllTotals()
                    tr.querySelector('.ex-kgrep').id = `kgrep-${idx}`;
                    tr.querySelector('.ex-onerm').id = `onerm-${idx}`;

                    // aria-labels sur les boutons d'action
                    tr.querySelector('[data-action="quick-edit"]').setAttribute('aria-label', `Édition rapide pour ${safeName}`);
                    tr.querySelector('[data-action="add-series"]').setAttribute('aria-label', `Ajouter une série à ${safeName}`);
                    tr.querySelector('[data-action="remove"]').setAttribute('aria-label', `Supprimer l'exercice ${safeName}`);
                    tr.querySelectorAll('[data-timer-action="start"]').forEach(b => b.setAttribute('aria-label', `Démarrer le minuteur pour ${safeName}`));
                    tr.querySelectorAll('[data-timer-action="stop"]').forEach(b => b.setAttribute('aria-label', `Arrêter le minuteur pour ${safeName}`));
                    tr.querySelectorAll('[data-timer-action="reset"]').forEach(b => b.setAttribute('aria-label', `Réinitialiser le minuteur pour ${safeName}`));
                    tr.querySelector('[data-action="add-series"]').dataset.exerciseIndex = idx;

                    // Insérer les cellules de séries avant la col Kg/Rép
                    const kgRepTd = tr.querySelector('.ex-kgrep');
                    ex.series.forEach((s, i) => {
                        const cell = tplCell.content.cloneNode(true).querySelector('td');
                        const wInput = cell.querySelector('.weight');
                        const rInput = cell.querySelector('.reps');
                        const delBtn = cell.querySelector('.serie-input-delete');
                        wInput.dataset.ex = idx; wInput.dataset.serie = i;
                        wInput.value = s.weight || '';
                        wInput.setAttribute('aria-label', `Poids pour ${safeName} série ${i+1}`);
                        wInput.setAttribute('title', `Poids pour ${safeName} série ${i+1}`);
                        rInput.dataset.ex = idx; rInput.dataset.serie = i;
                        rInput.value = s.reps || '';
                        rInput.setAttribute('aria-label', `Reps pour ${safeName} série ${i+1}`);
                        rInput.setAttribute('title', `Reps pour ${safeName} série ${i+1}`);
                        delBtn.dataset.ex = idx; delBtn.dataset.serie = i;
                        delBtn.setAttribute('aria-label', `Effacer série ${i+1} pour ${safeName}`);
                        tr.insertBefore(cell, kgRepTd);
                    });
                    // Colonnes vides pour compléter jusqu'à 5 séries
                    for (let i = ex.series.length; i < 5; i++) {
                        const empty = document.createElement('td');
                        empty.setAttribute('role', 'cell');
                        tr.insertBefore(empty, kgRepTd);
                    }

                    if (ex.supersetGroup) tr.querySelector('.link-btn')?.classList.add('active-superset');
                    desktopFrag.appendChild(tr);
                });

                tbody.appendChild(desktopFrag);
                table.appendChild(tbody);
                dom.exerciseListContainer.appendChild(table);

            } else {
                // ── MODE MOBILE — clonage des templates ─────────────────────
                const tplCard = document.getElementById('tpl-exercise-card');
                const tplSerieRow = document.getElementById('tpl-serie-row');

                const container = document.createElement('div');
                container.className = 'mobile-cards';
                container.setAttribute('role', 'list');
                const mobileFrag = document.createDocumentFragment();
                let mainCounter = 1;  // numérotation exercices (circuits: 1A/1B, isolés: 1, 2…)
                let letterCode  = 65; // code ASCII 'A'

                exercises.forEach((ex, idx) => {
                    if (!ex || !Array.isArray(ex.series)) return;

                    const safeName = escapeHTML(ex.name);
                    const restSeconds = parseInt(ex.rest) * (String(ex.rest).includes('min') ? 60 : 1) || 0;

                    const card = tplCard.content.cloneNode(true).querySelector('.exercise-card');
                    card.dataset.exerciseIndex = idx;
                    card.setAttribute('aria-label', `Exercice : ${safeName}`);
                    if (ex.supersetGroup) card.classList.add('superset-group');

                    card.querySelector('.ex-name').textContent = ex.name;
                    card.querySelector('.ex-rest').textContent = ex.rest || '';
                    const timerEl = card.querySelector('.ex-timer');
                    timerEl.id = `timer-${idx}`;
                    timerEl.textContent = formatTimerDisplay(restSeconds);
                    card.querySelector('.ex-kgrep').id = `kgrep-${idx}`;
                    card.querySelector('.ex-onerm').id = `onerm-${idx}`;

                    // aria-labels
                    card.querySelector('[data-action="remove"]').setAttribute('aria-label', `Supprimer l'exercice ${safeName}`);
                    card.querySelector('[data-action="quick-edit"]').setAttribute('aria-label', `Édition rapide pour ${safeName}`);

                    card.querySelectorAll('[data-timer-action="start"]').forEach(b => b.setAttribute('aria-label', `Démarrer le minuteur pour ${safeName}`));
                    card.querySelectorAll('[data-timer-action="stop"]').forEach(b => b.setAttribute('aria-label', `Arrêter le minuteur pour ${safeName}`));
                    card.querySelectorAll('[data-timer-action="reset"]').forEach(b => b.setAttribute('aria-label', `Réinitialiser le minuteur pour ${safeName}`));
                    const addSeriesBtn = card.querySelector('[data-action="add-series"]');
                    addSeriesBtn.setAttribute('aria-label', `Ajouter une série à ${safeName}`);
                    addSeriesBtn.dataset.exerciseIndex = idx;

                    // Séries — insérées avant le bouton "Ajouter une série"
                    const seriesGroup = card.querySelector('.series-group');
                    ex.series.forEach((s, i) => {
                        const row = tplSerieRow.content.cloneNode(true).querySelector('.series-row');
                        row.querySelector('.serie-label').textContent = `Série ${i + 1} :`;
                        const wInput = row.querySelector('.weight');
                        const rInput = row.querySelector('.reps');
                        const delBtn = row.querySelector('.serie-input-delete');
                        wInput.dataset.ex = idx; wInput.dataset.serie = i;
                        wInput.value = s.weight || '';
                        wInput.setAttribute('aria-label', `Poids pour ${safeName} série ${i+1}`);
                        wInput.setAttribute('title', `Poids pour ${safeName} série ${i+1}`);
                        rInput.dataset.ex = idx; rInput.dataset.serie = i;
                        rInput.value = s.reps || '';
                        rInput.setAttribute('aria-label', `Reps pour ${safeName} série ${i+1}`);
                        rInput.setAttribute('title', `Reps pour ${safeName} série ${i+1}`);
                        delBtn.dataset.ex = idx; delBtn.dataset.serie = i;
                        delBtn.setAttribute('aria-label', `Effacer série ${i+1} pour ${safeName}`);
                        seriesGroup.insertBefore(row, addSeriesBtn);
                    });

                    if (ex.supersetGroup) card.querySelector('.link-btn')?.classList.add('active-superset');
                    // Animation d'entrée pour la dernière card (exercice venant d'être ajouté)
                    if (state._lastAddedExercise === idx) {
                        card.classList.add('exercise-card-new');
                        card.addEventListener('animationend', () => card.classList.remove('exercise-card-new'), { once: true });
                        state._lastAddedExercise = null;
                    }
                    // Groupement superset DANS le DocumentFragment (zéro layout thrashing)
                    if (ex.groupId) {
                        let wrapper = Array.from(mobileFrag.querySelectorAll('.superset-wrapper'))
                            .find(w => w.dataset.group === ex.groupId);
                        if (!wrapper) {
                            wrapper = document.createElement('div');
                            wrapper.className = 'superset-wrapper';
                            wrapper.dataset.group = ex.groupId;
                            wrapper.dataset.counter = mainCounter; // stocker le numéro du groupe
                            wrapper.innerHTML = '<div class="superset-header">🔗 Circuit / Superset</div><div class="superset-body"></div>';
                            mobileFrag.appendChild(wrapper);
                            letterCode = 65; // reset 'A' à chaque nouveau groupe
                        }
                        // Numérotation 1A, 1B, 2A…
                        const titleEl = card.querySelector('.ex-name, h4');
                        if (titleEl) titleEl.textContent = `${wrapper.dataset.counter}${String.fromCharCode(letterCode)} – ${ex.name}`;
                        letterCode++;
                        wrapper.querySelector('.superset-body').appendChild(card);
                        // Masquer timer repos si pas le dernier du groupe
                        const isLast = (idx === exercises.length - 1) || (exercises[idx + 1]?.groupId !== ex.groupId);
                        const restBtn = card.querySelector('[data-timer-action="start"]');
                        const timerContainer = card.querySelector('.timer-container');
                        if (!isLast) {
                            if (restBtn) restBtn.style.display = 'none';
                            if (timerContainer) timerContainer.style.opacity = '0.3';
                        } else {
                            mainCounter++; // incrémenter après le dernier du groupe
                        }
                    } else {
                        // Exercice normal : numérotation simple
                        const titleEl = card.querySelector('.ex-name, h4');
                        if (titleEl) titleEl.textContent = `${mainCounter} – ${ex.name}`;
                        mainCounter++;
                        mobileFrag.appendChild(card);
                    }
                });

                container.appendChild(mobileFrag);
                dom.exerciseListContainer.appendChild(container);
            }

            loadCurrentState();
            updateAllTotals();
            updateDeleteSessionButtonState();
        
            // Restauration des timers actifs après reconstruction DOM
            Object.entries(_activeTimerSnapshot).forEach(([idxStr, snap]) => {
                const idx = parseInt(idxStr);
                const el = document.querySelector(`[data-exercise-index="${idx}"]`);
                if (!el) return;
                const timerDisplay = el.querySelector('.timer-display');
                const startBtn    = el.querySelector('[data-timer-action="start"]');
                const stopBtn     = el.querySelector('[data-timer-action="stop"]');
                if (!timerDisplay) return;
                timerDisplay.classList.add('timer-active');
                if (startBtn) startBtn.style.display = 'none';
                if (stopBtn)  stopBtn.style.display  = 'inline-flex';
                state.timers[idx] = {
                    secondsElapsed: snap.duration - snap.remaining,
                    duration: snap.duration,
                    interval: setInterval(() => {
                        if (!state.timers[idx]) return;
                        state.timers[idx].secondsElapsed++;
                        const rem = state.timers[idx].duration - state.timers[idx].secondsElapsed;
                        if (rem <= 0) {
                            timerDisplay.textContent = formatTimerDisplay(0);
                            timerDisplay.classList.remove('timer-active');
                            clearInterval(state.timers[idx].interval);
                            delete state.timers[idx];
                            StorageAPI.remove(`timer-${idx}`);
                        } else {
                            timerDisplay.textContent = formatTimerDisplay(rem);
                        }
                    }, 1000)
                };
                timerDisplay.textContent = formatTimerDisplay(snap.remaining);
            });
        }

        // calculate1RM — délégué à PhysioCompute.oneRM (conservé pour compatibilité avec les appels existants)
        function calculate1RM(weight, reps) {
            return PhysioCompute.oneRM(weight, reps);
        }

        function animateNumberChange(element, startValue, endValue, duration, suffix = '') {
            const range = endValue - startValue;
            const startTime = performance.now();
            function update() {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const currentValue = startValue + range * progress;
                element.textContent = `${currentValue.toFixed(0)}${suffix}`;
                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    element.textContent = `${endValue.toFixed(0)}${suffix}`;
                    // Notifier les lecteurs d'écran uniquement à la fin (évite le spam)
                    const a11y = document.getElementById(element.id + 'A11y');
                    if (a11y) a11y.textContent = `${endValue.toFixed(0)}${suffix}`;
                }
            }
            requestAnimationFrame(update);
        }

        function updateAllTotals() {
            if (!state.isInitialized) return;

            let totalSessionReps = 0;
            let totalSessionKgRep = 0;
            let completedSeriesOverall = 0;
            let totalTonnageForKgRep = 0;

            if (!isAppStateValid()) {
                resetAppStateToDefault();
                updateAllTotals();
                return;
            }
            const currentSession = state.sessions[state.currentSessionIndex];
            const exercises = (currentSession && Array.isArray(currentSession.exercises)) ? currentSession.exercises : [];
            let totalPossibleSeries = 0;
            let exercisesWith1RM = [];

            // ── Phase 1 : calculs purs en mémoire (zéro DOM read) ───────────
            // Accumule les mutations CSS à appliquer en batch dans le rAF
            const domMutations = []; // [{el, add:[], remove:[], toggle:[{cls,force}]}]

            (exercises || []).forEach((ex, idx) => {
                if (!ex || typeof ex !== 'object' || !Array.isArray(ex.series)) return;

                let exerciseTonnage = 0;
                let exerciseTotalReps = 0;
                let exerciseKgRep = 0;
                let oneRMs = [];

                totalPossibleSeries += ex.series.length;

                ex.series.forEach((s, i) => {
                    // Lecture STATE uniquement — updateSingleSerie() garantit la sync
                    const repsValue   = String(s.reps   || '').trim();
                    const weightValue = String(s.weight || '').trim();

                    const repsSegments   = parseInputValues(repsValue);
                    const weightSegments = parseInputValues(weightValue);

                    let currentSeriesTonnage = 0;
                    let currentSeriesReps    = 0;
                    let currentSeriesValid   = false;

                    const minLength = Math.min(repsSegments.length, weightSegments.length);
                    for (let k = 0; k < minLength; k++) {
                        const r = repsSegments[k];
                        const w = weightSegments[k];
                        currentSeriesTonnage += r * w;
                        currentSeriesReps    += r;
                        if (r > 0 && w > 0) {
                            oneRMs.push(calculate1RM(w, r));
                            currentSeriesValid = true;
                        }
                    }

                    if (currentSeriesValid) completedSeriesOverall++;

                    // Préparer mutation CSS — pas de DOM read ici
                    domMutations.push({ exIdx: idx, serieIdx: i,
                        repsVal: repsValue, weightVal: weightValue,
                        valid: currentSeriesValid });

                    exerciseTonnage   += currentSeriesTonnage;
                    exerciseTotalReps += currentSeriesReps;
                });

                if (exerciseTotalReps > 0) exerciseKgRep = exerciseTonnage / exerciseTotalReps;

                let weightedAverage1RM = 0;
                if (oneRMs.length > 0) {
                    let totalWeighted1RM = 0, totalWeightSum = 0;
                    for (let j = 0; j < oneRMs.length; j++) {
                        const wf = 1 / (1 + (oneRMs.length - 1 - j) * 0.2);
                        totalWeighted1RM += oneRMs[j] * wf;
                        totalWeightSum   += wf;
                    }
                    weightedAverage1RM = totalWeighted1RM / totalWeightSum;
                }

                // Mutations kgrep / onerm — batch DOM write
                const kgRepVal = exerciseKgRep;
                const onermVal = weightedAverage1RM;
                const exName   = ex.name;
                domMutations.push({ type: 'exStats', exIdx: idx, kgRepVal, onermVal, exName });

                totalTonnageForKgRep += exerciseTonnage;
                totalSessionReps     += exerciseTotalReps;
            });

            if (totalSessionReps > 0) {
                totalSessionKgRep = totalTonnageForKgRep / totalSessionReps;
            }

            // ── Phase 2 : toutes les écritures DOM en un seul batch rAF ─────
            // Sépare clairement les reads (ci-dessus, state pur) des writes (ci-dessous, DOM)
            const _newKgRep        = totalSessionKgRep;
            const _completedSeries = completedSeriesOverall;
            const _totalPossible   = totalPossibleSeries;
            const _previous        = parseFloat(dom.previousWeekInput.value) || 0;
            const _delta           = _newKgRep - _previous;
            const _currentKgRep    = parseFloat(dom.totalKgRepEl.textContent.replace(' kg/rep', '')) || 0;
            const _startDelta      = parseFloat(dom.deltaEl.textContent.replace(' kg', '').replace('+', '')) || 0;
            const _domMutations    = domMutations; // référence locale pour le rAF

            requestAnimationFrame(() => {
                // ── Inputs : is-invalid + completed ─────────────────────────
                _domMutations.forEach(m => {
                    if (m.type === 'exStats') {
                        // kgrep / onerm
                        const kgRepEl = document.getElementById(`kgrep-${m.exIdx}`);
                        if (kgRepEl) {
                            kgRepEl.textContent = m.kgRepVal.toFixed(2);
                            kgRepEl.classList.toggle('kg-rep-high', m.kgRepVal > 0);
                        }
                        const onermEl = document.getElementById(`onerm-${m.exIdx}`);
                        if (onermEl) {
                            onermEl.textContent = m.onermVal > 0 ? m.onermVal.toFixed(1) : '0';
                            onermEl.classList.toggle('onerm-high', m.onermVal > 0);
                            if (m.onermVal > 0) exercisesWith1RM.push({ name: m.exName, oneRm: m.onermVal.toFixed(1) });
                        }
                        return;
                    }
                    // Mutation CSS inputs — 1 querySelector par série (ciblé, non global)
                    const repsInput   = document.querySelector(`[data-ex='${m.exIdx}'][data-serie='${m.serieIdx}'].reps`);
                    const weightInput = document.querySelector(`[data-ex='${m.exIdx}'][data-serie='${m.serieIdx}'].weight`);
                    if (weightInput) {
                        weightInput.classList.toggle('is-invalid',
                            !isValidAndCompleteNumber(weightInput.value) && weightInput.value.trim() !== '');
                        weightInput.classList.toggle('completed', m.valid);
                    }
                    if (repsInput) {
                        repsInput.classList.toggle('is-invalid',
                            !isValidAndCompleteNumber(repsInput.value) && repsInput.value.trim() !== '');
                        repsInput.classList.toggle('completed', m.valid);
                    }
                });

                // ── Barre de progression ─────────────────────────────────────
                const pct = _totalPossible > 0 ? (_completedSeries / _totalPossible) * 100 : 0;
                dom.progressFill.style.width = `${pct}%`;
                dom.progressBar.setAttribute('aria-valuenow', pct.toFixed(0));

                // ── Compteur X/Y exercices ───────────────────────────────────
                const _exCountEl = document.getElementById('sessionExerciseCount');
                if (_exCountEl) {
                    const _exList = state.sessions?.[state.currentSessionIndex]?.exercises || [];
                    const _total  = _exList.length;
                    const _done   = _exList.filter(ex =>
                        (ex.series || []).length > 0 &&
                        (ex.series || []).every(s => parseFloat(s.reps) > 0)
                    ).length;
                    if (_total > 0) {
                        _exCountEl.textContent = `${_done} / ${_total} exercices`;
                        _exCountEl.classList.add('visible');
                    } else {
                        _exCountEl.classList.remove('visible');
                    }
                }

                // ── Kg/rep total + animation delta ──────────────────────────
                animateNumberChange(dom.totalKgRepEl, _currentKgRep, _newKgRep, 500, ' kg/rep');

                const deltaDuration = 500;
                const deltaStartTime = performance.now();
                function updateDeltaAnimation() {
                    const elapsed  = performance.now() - deltaStartTime;
                    const progress = Math.min(elapsed / deltaDuration, 1);
                    const cur      = _startDelta + (_delta - _startDelta) * progress;
                    const disp     = Math.round(cur);
                    dom.deltaEl.textContent = `${disp > 0 ? '+' : ''}${disp} kg`;
                    dom.deltaEl.style.color = disp > 0 ? 'var(--color-success-default)'
                        : disp < 0 ? 'var(--color-danger-default)' : 'inherit';
                    if (progress < 1) {
                        requestAnimationFrame(updateDeltaAnimation);
                    } else {
                        dom.deltaEl.textContent = `${_delta > 0 ? '+' : ''}${_delta.toFixed(0)} kg`;
                        dom.deltaEl.dataset.sign = _delta > 0 ? 'positive' : _delta < 0 ? 'negative' : '';
                        dom.deltaEl.style.color  = _delta > 0 ? 'var(--color-success-default)'
                            : _delta < 0 ? 'var(--color-danger-default)' : 'inherit';
                    }
                }
                requestAnimationFrame(updateDeltaAnimation);

                // ── Dropdown 1RM ─────────────────────────────────────────────
                populateOneRMDropdown(exercisesWith1RM);
            });

            // Sauvegarde hors du rAF — ne bloque pas le rendu
            saveCurrentState(true);
        }

        function populateOneRMDropdown(exercisesWith1RM) {
            dom.oneRmExerciseSelect.innerHTML = '<option value="">-- Sélectionner un exercice --</option>';
            if (exercisesWith1RM.length > 0) {
                exercisesWith1RM.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.oneRm;
                    option.textContent = `${item.name} (${item.oneRm} kg)`;
                    dom.oneRmExerciseSelect.appendChild(option);
                });
                dom.oneRmExerciseSelect.disabled = false;
            } else {
                dom.oneRmExerciseSelect.disabled = true;
            }
        }

// ──  SaveQueue → js/core/state.js  ───────────────────────────────────────

        function saveCurrentState(silent = false, skipDomSync = true) {
            const currentSession = state.sessions[state.currentSessionIndex];
            if (!currentSession) return;
            // skipDomSync=true : on sauvegarde l'état mémoire tel quel, sans lire le DOM
            // Utilisé par WodEngine pour éviter l'écrasement des séries EMOM/AMRAP
            if (!skipDomSync) {
                currentSession.exercises.forEach((ex, idx) => {
                    ex.series = Array.from(document.querySelectorAll(`[data-ex='${idx}'][data-serie]`)).reduce((acc, input) => {
                        const serieIndex = parseInt(input.dataset.serie, 10);
                        if (!acc[serieIndex]) {
                            acc[serieIndex] = {};
                        }
                        if (input.classList.contains('weight')) {
                            acc[serieIndex].weight = input.value;
                        } else if (input.classList.contains('reps')) {
                            acc[serieIndex].reps = input.value;
                        }
                        return acc;
                    }, []).filter(s => s.weight !== undefined || s.reps !== undefined);
                });
            }
            const calculatorState = {
                targetWeight: dom.targetWeightInput.value,
                barbellWeight: dom.barbellWeightInput.value,
                oneRm: dom.oneRmInput.value
            };
            try {
                StorageAPI.set('calculatorState', calculatorState);
            } catch (e) {
                console.error("Erreur lors de la sauvegarde de l'état du calculateur :", e);
            }

            let currentTotalPaused = state.totalPausedDuration;
            if (state.isWorkoutTimerPaused && state.pauseStartTime > 0) {
                currentTotalPaused += (Date.now() - state.pauseStartTime);
            }

            const data = {
                previousWeek: dom.previousWeekInput.value,
                sessionIndex: state.currentSessionIndex,
                customSessions: state.sessions,
                workoutStartTime: state.workoutStartTime,
                isWorkoutTimerPaused: state.isWorkoutTimerPaused,
                totalPausedDuration: state.totalPausedDuration,
                pauseStartTime: state.pauseStartTime,
                sessionNotes: dom.sessionNotesInput.value,
                savedAt: Date.now()
            };
            // Déléguer à SaveQueue : les appels rapides sont fusionnés en 1 écriture
            SaveQueue.enqueue(data, silent);
        }

        // Indicateur discret de sauvegarde automatique
        let saveIndicatorTimer = null;
        function showSaveIndicator() {
            let indicator = document.getElementById('autoSaveIndicator');
            if (!indicator) return;
            clearTimeout(saveIndicatorTimer);
            indicator.classList.add('visible');
            saveIndicatorTimer = setTimeout(() => indicator.classList.remove('visible'), 1500);
        }

        function loadCurrentState() {
            const data = StorageAPI.get('inProgressWorkout');
            if (!data) return;
            const currentSession = state.sessions[state.currentSessionIndex];
            const currentExercises = (currentSession && Array.isArray(currentSession.exercises)) ? currentSession.exercises : [];

            currentExercises.forEach((ex, idx) => {
                if (!Array.isArray(ex.series)) {
                    ex.series = [];
                }
                ex.series.forEach((s, i) => {
                    const repsInput = document.querySelector(`[data-ex='${idx}'][data-serie='${i}'].reps`);
                    const weightInput = document.querySelector(`[data-ex='${idx}'][data-serie='${i}'].weight`);
                    if (repsInput) repsInput.value = s.reps || '';
                    if (weightInput) weightInput.value = s.weight || '';
                });
            });
            dom.previousWeekInput.value = data.previousWeek || "";
            dom.sessionNotesInput.value = data.sessionNotes || "";

            const calculatorState = StorageAPI.get('calculatorState');
            if (calculatorState) {
                dom.targetWeightInput.value = calculatorState.targetWeight || '';
                dom.barbellWeightInput.value = calculatorState.barbellWeight || '';
                dom.oneRmInput.value = calculatorState.oneRm || '';
                calculatePlates();
                calculateTrainingGoals();
            }
        }

        function customConfirm(message) {
            return new Promise(resolve => {
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-labelledby', 'confirmModalTitle');

                // Build DOM nodes to avoid XSS from user-controlled message content
                const content = document.createElement('div');
                content.className = 'modal-content';
                content.style.textAlign = 'center';

                const title = document.createElement('h2');
                title.id = 'confirmModalTitle';
                title.style.cssText = 'font-size: 1.5rem; margin-bottom: var(--spacing-md);';
                title.textContent = 'Confirmation';

                const para = document.createElement('p');
                para.style.marginBottom = 'var(--spacing-lg)';
                para.textContent = message; // textContent — safe against XSS

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display: flex; justify-content: center; gap: var(--spacing-md);';

                const noBtn  = document.createElement('button');
                noBtn.className  = 'btn btn-outline confirm-no';
                noBtn.textContent = ' Non';

                const yesBtn = document.createElement('button');
                yesBtn.className  = 'btn btn-success confirm-yes';
                yesBtn.textContent = ' Oui';

                btnRow.appendChild(noBtn);
                btnRow.appendChild(yesBtn);
                content.appendChild(title);
                content.appendChild(para);
                content.appendChild(btnRow);
                modal.appendChild(content);
                document.body.appendChild(modal);

                const confirmYesBtn = modal.querySelector('.confirm-yes');
                const confirmNoBtn = modal.querySelector('.confirm-no');
                const triggeringElement = document.activeElement;

                const cleanup = () => {
                    modal.classList.remove('show');
                    const fallbackTimeout = setTimeout(() => {
                        if (document.body.contains(modal)) {
                            modal.remove();
                            if (triggeringElement && typeof triggeringElement.focus === 'function') {
                                triggeringElement.focus();
                            }
                        }
                    }, 500);
                    modal.addEventListener('transitionend', () => {
                        clearTimeout(fallbackTimeout);
                        if (document.body.contains(modal)) {
                           modal.remove();
                           if (triggeringElement && typeof triggeringElement.focus === 'function') {
                                triggeringElement.focus();
                            }
                        }
                    }, { once : true });
                };

                confirmYesBtn.onclick = () => { 
                    cleanup();
                    resolve(true); 
                };

                confirmNoBtn.onclick = () => { 
                    cleanup();
                    resolve(false); 
                };
                
                setTimeout(() => {
                    modal.classList.add('show');
                    confirmNoBtn.focus();
                }, 10);
            });
        }
        
        function finishAndSaveSession() {
            let currentSessionReps = 0;
            let currentSessionTonnage = 0;

            const exercisesData = (state.sessions[state.currentSessionIndex]?.exercises || []).flatMap((ex, idx) => {
                const exerciseSeries = [];
                let exerciseTonnage = 0;
                let exerciseReps = 0;

                ex.series.forEach(s => {
                    const repsValues = parseInputValues(s.reps);
                    const weightValues = parseInputValues(s.weight);
                    
                    const minLength = Math.min(repsValues.length, weightValues.length);
                    
                    if (minLength > 0) {
                        for (let k = 0; k < minLength; k++) {
                            exerciseSeries.push({ reps: repsValues[k], weight: weightValues[k] });
                            exerciseTonnage += repsValues[k] * weightValues[k];
                            exerciseReps += repsValues[k];
                        }
                    } else if (repsValues.length > 0) {
                        repsValues.forEach(r => {
                            exerciseSeries.push({ reps: r, weight: 0 });
                            exerciseReps += r;
                        });
                    } else if (weightValues.length > 0) {
                        weightValues.forEach(w => {
                            exerciseSeries.push({ reps: 0, weight: w });
                        });
                    }
                });

                if (exerciseSeries.length > 0) {
                    currentSessionTonnage += exerciseTonnage;
                    currentSessionReps += exerciseReps;
                    return [{
                        name: ex.name,
                        rest: ex.rest || "1 min",
                        series: exerciseSeries.filter(s => s.reps > 0 || s.weight > 0),
                        exerciseReps: exerciseReps
                    }];
                }
                return [];
            });

            if (currentSessionReps === 0) {
                showNotification("Aucune donnée à sauvegarder. La séance n'a pas été enregistrée car aucune répétition n'a été effectuée.", "info");
                return; 
            }
            pauseTotalWorkoutTimer(); 

            const workoutData = {
                id: Date.now(),
                date: new Date().toISOString(),
                sessionName: dom.sessionSelect.selectedOptions[0].text,
                totalReps: currentSessionReps,
                totalKgRep: currentSessionReps > 0 ? (currentSessionTonnage / currentSessionReps).toFixed(2) : 0,
                duration: dom.totalTimeEl.textContent,
                notes: dom.sessionNotesInput.value,
                exercises: exercisesData
            };
            let history = getHistory();
            history = history.filter(session => !(session.isAutoSave && session.id === state.workoutStartTime));
            history.push(workoutData);
            StorageAPI.set('workoutHistory', history);
            // ── FIX v10 : Forcer le re-rendu de l'historique après sauvegarde ──
            // state.historyLoaded = true est posé dans displayHistory() — on reset
            // le flag pour que le prochain displayHistory() relise le localStorage.
            state.historyLoaded = false;
            displayHistory();
            showNotification("Séance sauvegardée dans l'historique avec succès !", "success");
            setTimeout(checkDeload, 500);
            
            Object.values(state.timers).forEach(timer => {
                if (timer && timer.interval) clearInterval(timer.interval);
            });
            state.timers = {};
            
            resetTotalWorkoutTimer(false);
            StorageAPI.remove('inProgressWorkout');
            createTable();
            
            dom.totalKgRepEl.textContent = "0 kg/rep";
            dom.deltaEl.textContent = "0 kg";
            dom.previousWeekInput.value = "";
            dom.sessionNotesInput.value = "";

            // Vérifier badges et afficher résumé
            const newBadges = checkAndAwardBadges();
            renderBadgeGrid();
            renderWeeklyGoal();
            renderHeatmap();

            // ── Dopamine Closure — fermeture émotionnelle avant le REVIEW ──
            _showDopamineClosure(workoutData, newBadges);
        }

        /**
         * DOPAMINE CLOSURE
         * 1. Score calculé et affiché en plein écran (overlay)
         * 2. Checklist séquentielle ✔ ✔ ✔
         * 3. Vibration haptique forte
         * 4. Après 2.8s → fermeture + ouverture REVIEW
         */
        function _showDopamineClosure(workoutData, newBadges) {
            const overlay = document.getElementById('sessionClosedOverlay');
            if (!overlay) {
                setTimeout(() => showSessionSummary(workoutData, newBadges), 400);
                return;
            }

            const history = getHistory();
            const result  = AppMode.computeLyftivScore(workoutData, history);
            const score   = (typeof result === 'object') ? result.score : result;
            const league  = (typeof result === 'object' && result.league)
                ? result.league
                : { name: score >= 90 ? 'TITAN' : score >= 75 ? 'ÉLITE' : score >= 60 ? 'PERFORMER' : 'SILVER',
                    color: score >= 90 ? 'hsl(280,72%,62%)' : score >= 75 ? 'hsl(145,65%,48%)' : score >= 60 ? 'hsl(210,80%,58%)' : 'hsl(35,80%,52%)',
                    icon: score >= 90 ? '⚡' : '🏆' };

            // Remplir la carte
            const sccScore  = document.getElementById('sccScore');
            const sccLeague = document.getElementById('sccLeague');
            const sccItems  = document.getElementById('sccItems');

            if (sccScore) {
                sccScore.textContent = '0';
                sccScore.style.color = league.color;
            }
            if (sccLeague) {
                sccLeague.textContent  = league.icon + ' ' + league.name;
                sccLeague.style.background = league.color + '22';
                sccLeague.style.color      = league.color;
                sccLeague.style.border     = '1px solid ' + league.color + '44';
            }

            const items = [
                'Session enregistrée',
                'Score recalculé',
                'Classement mis à jour',
            ];
            if (newBadges && newBadges.length > 0) {
                items.push(newBadges[0].icon + ' ' + newBadges[0].label + ' débloqué');
            }
            if (sccItems) {
                sccItems.innerHTML = items.map(t =>
                    `<div class="scc-item"><span class="scc-check">✔</span><span>${t}</span></div>`
                ).join('');
            }

            // Afficher l'overlay
            document.body.dataset.sessionClosing = 'true';

            // Vibration haptique forte
            if (navigator.vibrate) navigator.vibrate([120, 60, 80, 40, 40]);

            // Sound : accord montant discret
            try {
                const ac = new (window.AudioContext || window.webkitAudioContext)();
                [[261.6, 0], [329.6, 0.15], [392, 0.30], [523.2, 0.48]].forEach(([f, d]) => {
                    const osc = ac.createOscillator(), g = ac.createGain();
                    osc.connect(g); g.connect(ac.destination);
                    osc.type = 'sine'; osc.frequency.value = f;
                    g.gain.setValueAtTime(0, ac.currentTime + d);
                    g.gain.linearRampToValueAtTime(0.14, ac.currentTime + d + 0.04);
                    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d + 0.9);
                    osc.start(ac.currentTime + d);
                    osc.stop(ac.currentTime + d + 1);
                });
            } catch (_) {}

            // Count-up 0 → score
            if (sccScore) {
                let cur = 0;
                const step = Math.ceil(score / 30);
                const tick = setInterval(() => {
                    cur = Math.min(cur + step, score);
                    sccScore.textContent = cur;
                    if (cur >= score) clearInterval(tick);
                }, 45);
            }

            // Checklist séquentielle
            setTimeout(() => {
                const sccEl = document.getElementById('sccItems');
                if (sccEl) {
                    sccEl.querySelectorAll('.scc-item').forEach((el, i) => {
                        setTimeout(() => el.classList.add('visible'), i * 320);
                    });
                }
            }, 300);

            // Appliquer la ligue sur body
            document.body.dataset.league = league.name;

            // 2.8s → fermer + ouvrir REVIEW
            setTimeout(() => {
                document.body.dataset.sessionClosing = '';
                // Appliquer les modifications sur next action
                _applyScoreAura();
                setTimeout(() => showSessionSummary(workoutData, newBadges), 400);
            }, 2800);
        }

        function getHistory() {
            try {
                return StorageAPI.get('workoutHistory', []);
            } catch (e) {
                console.warn('[Lyftiv] historique corrompu, réinitialisation', e);
                return [];
            }
        }
        
        function displayHistory() {
            state.historyLoaded = true; // Lazy : chargé seulement à la demande (pas sérialisé dans saveCurrentState)
            dom.historyList.innerHTML = '';
            const sortedHistory = getHistory().sort((a, b) => new Date(b.date) - new Date(a.date));

            if (sortedHistory.length === 0) {
                dom.historyList.innerHTML = '<p style="text-align: center; color: var(--sub-header-color);">Aucune séance enregistrée dans l\'historique.</p>';
                return;
            }

            sortedHistory.forEach(session => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.setAttribute('role', 'listitem');
                const _sName = escapeHTML(session.sessionName);
                const _sKg   = escapeHTML(String(session.totalKgRep));
                const _sDur  = session.duration ? escapeHTML(String(session.duration)) : '';
                item.style.cursor = 'pointer';
                item.title = 'Cliquer pour voir les détails';
                item.addEventListener('click', (e) => {
                    if (!e.target.closest('[data-history-action]')) showHistoryDetails(session.id);
                });
                item.innerHTML = `
                    <div style="flex:1;min-width:0;">
                        ${new Date(session.date).toLocaleDateString('fr-FR')} - 
                        <strong>${_sName}</strong> (${_sKg} kg/rep) ${_sDur ? ` - ⏱️ ${_sDur}` : ''}
                    </div>
                    <div style="display: flex; gap: var(--spacing-xs);">
                        <button class="btn btn-ghost" data-history-action="details" data-history-id="${escapeHTML(String(session.id))}" title="Voir les détails de ${_sName}">👁</button>
                        <button class="btn btn-ghost" data-history-action="load" data-history-id="${escapeHTML(String(session.id))}" title="Utiliser cette séance comme modèle">⬇</button>
                        <button class="btn btn-ghost" data-history-action="delete" data-history-id="${escapeHTML(String(session.id))}" title="Supprimer ${_sName} de l'historique">🗑️</button>
                    </div>
                    <div class="history-details" id="details-${escapeHTML(String(session.id))}" role="region" aria-live="polite"></div>`;
                dom.historyList.appendChild(item);
            });
        }
        
        function showHistoryDetails(id) {
            const detailsDiv = document.getElementById(`details-${id}`);
            if (!detailsDiv) return;

            if (detailsDiv.classList.contains('visible')) {
                detailsDiv.classList.remove('visible');
                detailsDiv.innerHTML = '';
            } else {
                const session = getHistory().find(s => s.id == id);
                if (session) {
                    let detailsHtml = `<h4>Détails de la Séance :</h4>
                                       <p><strong>Total Kg/Rép :</strong> ${session.totalKgRep || 0} kg/rep</p>`;
                    if (session.notes) {
                        detailsHtml += `<p><strong>Notes :</strong> ${session.notes}</p>`;
                    }
                    detailsHtml += `<ul>`;
                    session.exercises.forEach(ex => {
                        let exerciseOneRMs = [];
                        let exerciseTonnage = 0;
                        if (ex.series && ex.series.length > 0) {
                            ex.series.forEach(s => {
                                const reps = parseFloat(String(s.reps).replace(',', '.')) || 0;
                                const weight = parseFloat(String(s.weight).replace(',', '.')) || 0;
                                if (reps > 0 && weight > 0) {
                                    exerciseOneRMs.push(calculate1RM(weight, reps));
                                    exerciseTonnage += reps * weight;
                                }
                            });
                        }
                        let weightedAverage1RM = 0;
                        if (exerciseOneRMs.length > 0) {
                            let totalWeighted1RM = 0;
                            let totalWeightSum = 0;
                            for (let j = 0; j < exerciseOneRMs.length; j++) {
                                const positionFromEnd = exerciseOneRMs.length - 1 - j;
                                const weightFactor = 1 / (1 + positionFromEnd * 0.2);
                                totalWeighted1RM += exerciseOneRMs[j] * weightFactor;
                                totalWeightSum += weightFactor;
                            }
                            weightedAverage1RM = totalWeighted1RM / totalWeightSum;
                        }
                        const exerciseKgRep = (ex.exerciseReps > 0) ? (exerciseTonnage / ex.exerciseReps).toFixed(2) : 0;

                        detailsHtml += `<li><strong>${escapeHTML(ex.name)}</strong> - Kg/Rép: ${exerciseKgRep} kg/rep, 1RM Moy: ${weightedAverage1RM.toFixed(1)} kg</li>`;
                    });
                    detailsHtml += '</ul>';
                    detailsDiv.innerHTML = detailsHtml;
                    detailsDiv.classList.add('visible');
                    detailsDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
            }
        }
        
        const escapeCsv = (str) => {
            const s = String(str || '');
            if (s.includes(';') || s.includes('"') || s.includes('\n')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        /**
         * exportJSON — Backup complet : historique + templates de séances + paramètres
         * Permet à l'utilisateur de récupérer toutes ses données en cas de
         * corruption du localStorage ou de changement d'appareil.
         */
        function exportJSON() {
            const history = getHistory();
            const backup = {
                version: 1,
                exportedAt: new Date().toISOString(),
                appName: 'Lyftiv',
                data: {
                    workoutHistory: history,
                    customSessions: state.sessions,
                    calculatorState: StorageAPI.get('calculatorState', {}),
                    previousWeek: dom.previousWeekInput?.value || ''
                }
            };

            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const dateStr = new Date().toISOString().split('T')[0];
            link.download = `lyftiv_backup_${dateStr}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
            showNotification(`Backup JSON exporté — ${history.length} séance(s) sauvegardée(s).`, 'success', 4000);
            if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
        }

        function exportCSV() {
            const history = getHistory();
            if (history.length === 0) {
                showNotification("Aucune donnée historique à exporter. Le fichier CSV est vide.", "info");
                return;
            }

            const headers = [
                "Type", "Date/ID", "Nom", "Duree", "Serie", "Reps", "Poids", "Notes"
            ];
            let csvContent = headers.join(';') + '\n';

            history.forEach((session) => {
                const sessionDate = new Date(session.date).toLocaleString('fr-FR', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });

                const sessionRow = [
                    "Session",
                    escapeCsv(sessionDate),
                    escapeCsv(session.sessionName),
                    escapeCsv(session.duration),
                    "", "", "",
                    escapeCsv(session.notes)
                ];
                csvContent += sessionRow.join(';') + '\n';

                session.exercises.forEach(ex => {
                    const exerciseRow = ["Exercice", "", escapeCsv(ex.name), "", "", "", "", ""];
                    csvContent += exerciseRow.join(';') + '\n';

                    if (ex.series && ex.series.length > 0) {
                        ex.series.forEach((serie, i) => {
                            const serieRow = [
                                "Serie", "", "", "", `Série ${i + 1}`,
                                escapeCsv(String(serie.reps).replace('.', ',')),
                                escapeCsv(String(serie.weight).replace('.', ',')),
                                ""
                            ];
                            csvContent += serieRow.join(';') + '\n';
                        });
                    }
                });
            });
            
            const currentSessionName = dom.sessionSelect.selectedOptions[0].text;
            const sanitizedName = currentSessionName.replace(/[\s/\\?%*:|"<>]/g, '_');
            const dateStr = new Date().toISOString().split('T')[0];
            
            const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${sanitizedName}_${dateStr}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
            showNotification("Exportation de l'historique CSV réussie !", "success");
        }

        function parseCsvToHistory(csvContent) {
            // Strip BOM UTF-8 + normalize line endings
            const clean = csvContent.replace(/^\uFEFF/, '').replace(/\r/g, '');
            const lines = clean.split('\n').filter(line => line.trim() && !line.startsWith('---'));
            if (lines.length < 2) {
                showNotification("Le fichier CSV est vide ou invalide.", "error");
                return [];
            }

            // Parser CSV robuste — respecte les champs entre guillemets
            function parseCSVLine(line) {
                const sep = (() => {
                    let inQ = false, sc = 0, cc = 0;
                    for (const ch of line) {
                        if (ch === '"') { inQ = !inQ; continue; }
                        if (!inQ) { if (ch === ';') sc++; else if (ch === ',') cc++; }
                    }
                    return sc >= cc ? ';' : ',';
                })();
                const cols = []; let cur = '', inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
                        else inQ = !inQ;
                    } else if (ch === sep && !inQ) {
                        cols.push(cur.trim()); cur = '';
                    } else cur += ch;
                }
                cols.push(cur.trim());
                return cols;
            }

            // Parser date — tous formats fr-FR
            // "07/03/2026 à 12:00" | "07/03/2026 12:00" | "07/03/2026 12h00"
            function parseDate(str) {
                if (!str) return null;
                const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})(?:.*?(\d{2})[h:](\d{2}))?/);
                if (m) {
                    const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]||'12'}:${m[5]||'00'}:00`);
                    if (!isNaN(d)) return d;
                }
                const d2 = new Date(str);
                return isNaN(d2) ? null : d2;
            }

            const history = []; let currentSession = null, currentExercise = null;

            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const type = (cols[0] || '').toLowerCase().trim();

                if (type === 'session') {
                    const parsedDate = parseDate(cols[1] || '');
                    if (!parsedDate) continue;
                    currentSession = {
                        id: parsedDate.getTime() + Math.random(),
                        date: parsedDate.toISOString(),
                        sessionName: cols[2] || 'Séance importée',
                        duration: cols[3] || '00:00:00',
                        notes: cols[7] || '',
                        exercises: [], totalReps: 0, totalKgRep: 0
                    };
                    history.push(currentSession); currentExercise = null;

                } else if (type === 'exercice' && currentSession) {
                    currentExercise = { name: cols[2] || 'Exercice inconnu', rest: '1 min', series: [], exerciseReps: 0 };
                    currentSession.exercises.push(currentExercise);

                } else if (type === 'serie' && currentExercise) {
                    const reps   = parseFloat((cols[5] || '0').replace(',', '.')) || 0;
                    const weight = parseFloat((cols[6] || '0').replace(',', '.')) || 0;
                    if (reps > 0 || weight > 0) currentExercise.series.push({ reps, weight });
                }
            }

            history.forEach(session => {
                let sessionTonnage = 0;
                session.exercises.forEach(ex => {
                    let exT = 0;
                    ex.series.forEach(s => {
                        const r = parseFloat(s.reps) || 0, w = parseFloat(s.weight) || 0;
                        exT += r * w; ex.exerciseReps += r;
                    });
                    sessionTonnage += exT; session.totalReps += ex.exerciseReps;
                });
                session.totalKgRep = session.totalReps > 0
                    ? (sessionTonnage / session.totalReps).toFixed(2) : 0;
            });
            return history;
        }
        
        function showNotification(message, type = 'info', duration = 5000) { 
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            const span = document.createElement('span');
            span.textContent = message;
            notification.appendChild(span);
            dom.notificationContainer.appendChild(notification);
            void notification.offsetWidth;
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
                notification.addEventListener('transitionend', () => notification.remove(), { once : true });
            }, duration);
        }

        function showUndoableNotification(message, onUndoCallback, duration = 7000) {
            const notification = document.createElement('div');
            notification.className = `notification info`; 
            const msgSpan = document.createElement('span');
            msgSpan.textContent = message;
            const undoBtn = document.createElement('button');
            undoBtn.className = 'btn btn-secondary';
            undoBtn.id = 'undoBtn';
            undoBtn.style.cssText = 'margin-inline-start: 1rem; padding: 0.5rem 1rem; border-radius: 15px;';
            undoBtn.textContent = 'Annuler';
            notification.appendChild(msgSpan);
            notification.appendChild(undoBtn);
            dom.notificationContainer.appendChild(notification);
            void notification.offsetWidth; 
            notification.classList.add('show');
            let timer; 
            const closeNotification = () => {
                notification.classList.remove('show');
                notification.addEventListener('transitionend', () => notification.remove(), { once : true });
            };
            const undoButton = notification.querySelector('#undoBtn');
            if (undoButton) {
                undoButton.addEventListener('click', () => {
                    clearTimeout(timer); 
                    onUndoCallback(); 
                    closeNotification(); 
                });
            }
            timer = setTimeout(closeNotification, duration);
        }

        function formatTime(totalMilliseconds) {
            if (totalMilliseconds < 0) totalMilliseconds = 0;
            const totalSeconds = Math.floor(totalMilliseconds / 1000);
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = Math.floor(totalSeconds % 60);
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        
        function formatTimerDisplay(seconds) {
             const m = Math.floor(seconds / 60);
             const s = Math.floor(seconds % 60);
             return `${m}:${String(s).padStart(2, '0')}`;
        }

        // --- NEW/REFACTORED WORKOUT TIMER FUNCTIONS ---

        function updateTotalTimeDisplay() {
            if (!state.workoutStartTime) {
                dom.totalTimeEl.textContent = "00:00:00";
                return;
            }

            // Calculate elapsed time based on timestamps, not a simple counter
            const elapsed = state.isWorkoutTimerPaused 
                ? state.pauseStartTime - state.workoutStartTime - state.totalPausedDuration 
                : Date.now() - state.workoutStartTime - state.totalPausedDuration;
                
            dom.totalTimeEl.textContent = formatTime(elapsed);
        }

        function updateTimerToggleButtonUI(isPaused) {
            if (isPaused) {
                dom.timerPlayPauseIcon.textContent = '▶️';
                dom.timerPlayPauseText.textContent = state.workoutStartTime ? 'Reprendre' : 'Démarrer';
            } else {
                dom.timerPlayPauseIcon.textContent = '⏸️';
                dom.timerPlayPauseText.textContent = 'Pause';
            }
        }
        
        function startTotalWorkoutTimer() {
            if (state.totalWorkoutTimeInterval) clearInterval(state.totalWorkoutTimeInterval);

            if (!state.workoutStartTime) {
                // First start
                state.workoutStartTime = Date.now();
                state.totalPausedDuration = 0;
            }
            
            if (state.isWorkoutTimerPaused && state.pauseStartTime > 0) {
                // Resuming from a pause
                const currentPauseDuration = Date.now() - state.pauseStartTime;
                state.totalPausedDuration += currentPauseDuration;
            }
            
            state.isWorkoutTimerPaused = false;
            state.pauseStartTime = 0;
            updateTimerToggleButtonUI(false);

            state.totalWorkoutTimeInterval = setInterval(updateTotalTimeDisplay, 1000);
            updateTotalTimeDisplay(); 
            saveCurrentState(true);
        }

        function pauseTotalWorkoutTimer() {
            if (state.workoutStartTime && !state.isWorkoutTimerPaused) {
                if (state.totalWorkoutTimeInterval) clearInterval(state.totalWorkoutTimeInterval);
                state.isWorkoutTimerPaused = true;
                state.pauseStartTime = Date.now();
                updateTimerToggleButtonUI(true);
                updateTotalTimeDisplay(); 
                saveCurrentState(true);
            }
        }
        
        async function resetTotalWorkoutTimer(withConfirmation = true) {
            let confirmed = false;
            if (withConfirmation) {
                if (!state.workoutStartTime) return; // Don't ask to reset if not started
                confirmed = await customConfirm("Voulez-vous vraiment réinitialiser le minuteur de la séance ?");
            } else {
                confirmed = true;
            }

            if (confirmed) {
                if (state.totalWorkoutTimeInterval) clearInterval(state.totalWorkoutTimeInterval);
                
                state.workoutStartTime = null;
                state.totalWorkoutTimeInterval = null;
                state.isWorkoutTimerPaused = true;
                state.totalPausedDuration = 0;
                state.pauseStartTime = 0;
                
                dom.totalTimeEl.textContent = "00:00:00";
                updateTimerToggleButtonUI(true); 
                
                // Clear only timer-related parts from persisted state
                const inProgress = StorageAPI.get('inProgressWorkout', {});
                delete inProgress.workoutStartTime;
                delete inProgress.isWorkoutTimerPaused;
                delete inProgress.totalPausedDuration;
                delete inProgress.pauseStartTime;
                StorageAPI.set('inProgressWorkout', inProgress);

                if (withConfirmation) {
                    showNotification("Minuteur de la séance réinitialisé.", "info");
                }
            }
        }

        function handleVisibilityChange() {
            // This function is kept for individual rest timers.
            if (document.hidden) {
                for (const idx in state.timers) {
                    if (state.timers[idx] && state.timers[idx].interval) {
                        clearInterval(state.timers[idx].interval);
                    }
                }
            } else {
                // When returning to the tab, reload the individual timers from localStorage
                loadPersistentIndividualTimers();
            }
        }

        function applyTheme(theme) {
            const isDark = theme === 'dark';
            dom.body.classList.toggle('dark-mode', isDark);
            // isDark → on affiche le soleil (pour revenir au clair), sinon la lune
            const themeIcon  = isDark ? '☀️' : '🌙';
            const themeTitle = isDark ? 'Passer au thème clair' : 'Passer au thème sombre';
            // Mettre à jour TOUS les boutons thème sur toutes les pages
            ['themeToggleBtn', 'dashThemeBtn', 'landingThemeBtn'].forEach(id => {
                const btn = id === 'themeToggleBtn' ? dom.themeToggleBtn : document.getElementById(id);
                if (btn) {
                    btn.innerHTML = themeIcon;
                    btn.setAttribute('title', themeTitle);
                    btn.setAttribute('aria-label', themeTitle);
                }
            });
        }

        function updateSessionSelectOptions() {
            dom.sessionSelect.innerHTML = '';
            state.sessions.forEach((session, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = session.name; 
                dom.sessionSelect.appendChild(option);
            });
        }

        function showNewSessionModal() {
            dom.newSessionNameInput.value = '';
            dom.newSessionNameInput.classList.remove('is-invalid');
            dom.newSessionNameError.textContent = '';
            ModalManager.open(dom.newSessionModal, !state.isMobileView ? dom.newSessionNameInput : null);
        }

        function hideNewSessionModal() {
            ModalManager.close(dom.newSessionModal, document.activeElement);
        }

        async function createNewSession() {
            const newName = dom.newSessionNameInput.value.trim();
            if (!newName) {
                dom.newSessionNameInput.classList.add('is-invalid');
                dom.newSessionNameError.textContent = 'Le nom de la séance ne peut pas être vide.';
                return;
            }
            const isDuplicate = state.sessions.some(s => s.name.toLowerCase() === newName.toLowerCase());
            if (isDuplicate) {
                dom.newSessionNameInput.classList.add('is-invalid');
                dom.newSessionNameError.textContent = `Une séance nommée "${newName}" existe déjà. Veuillez choisir un nom différent.`;
                return;
            }
            dom.newSessionNameInput.classList.remove('is-invalid');
            dom.newSessionNameError.textContent = '';

            const newSession = { name: newName, isDefault: false, exercises: [] };
            state.sessions.push(newSession);
            updateSessionSelectOptions(); 
            const newSessionIndex = state.sessions.length - 1;
            
            hideNewSessionModal();
            showNotification(`Séance "${newName}" créée avec succès !`, "success");
            
            if (!dashboard.classList.contains('hidden')) {
                startSessionFromDashboard(newSessionIndex);
            } else {
                state.currentSessionIndex = newSessionIndex; 
                dom.sessionSelect.value = state.currentSessionIndex;
                StorageAPI.remove('inProgressWorkout');
                resetTotalWorkoutTimer(false); // Reset timer for new session
                createTable(); 
                updateAllTotals(); 
            }
        }

        function updateDeleteSessionButtonState() {
            const currentSession = state.sessions[state.currentSessionIndex];
            if (currentSession) {
                dom.deleteCurrentSessionBtn.removeAttribute('disabled');
                dom.deleteCurrentSessionBtn.classList.remove('btn-outline');
                dom.deleteCurrentSessionBtn.classList.add('btn-danger');
                if (currentSession.isDefault) {
                    dom.deleteCurrentSessionBtn.setAttribute('title', 'Réinitialiser les données de cette séance par défaut');
                } else {
                    dom.deleteCurrentSessionBtn.setAttribute('title', 'Supprimer définitivement cette séance personnalisée');
                }
            } else {
                 dom.deleteCurrentSessionBtn.setAttribute('disabled', 'true');
                 dom.deleteCurrentSessionBtn.classList.remove('btn-danger');
                 dom.deleteCurrentSessionBtn.classList.add('btn-outline');
            }
        }

        async function deleteCurrentSession() {
            const currentSession = state.sessions[state.currentSessionIndex];
            if (!currentSession) return;

            if (currentSession.isDefault) {
                const confirmed = await customConfirm(`Voulez-vous vraiment réinitialiser toutes les données (poids et reps) pour la séance par défaut "${currentSession.name}" ?`);
                if (confirmed) {
                    currentSession.exercises.forEach(ex => {
                        ex.series.forEach(s => {
                            s.weight = '';
                            s.reps = '';
                        });
                    });
                    createTable();
                    updateAllTotals();
                    showNotification(`Séance par défaut "${currentSession.name}" réinitialisée.`, "info");
                }
            } else {
                const confirmed = await customConfirm(`Êtes-vous sûr de vouloir supprimer définitivement la séance personnalisée "${currentSession.name}"? Cette action est irréversible.`);
                if (confirmed) {
                    state.sessions.splice(state.currentSessionIndex, 1);
                    state.currentSessionIndex = 0;
                    updateSessionSelectOptions();
                    dom.sessionSelect.value = state.currentSessionIndex;
                    StorageAPI.remove('inProgressWorkout');
                    resetTotalWorkoutTimer(false); // Reset timer
                    createTable();
                    updateAllTotals();
                    showNotification(`Séance "${currentSession.name}" supprimée avec succès.`, "info");
                }
            }
        }

        async function resetCurrentSession() {
            const currentSession = state.sessions[state.currentSessionIndex];
            if (!currentSession) return;

            const confirmed = await customConfirm(`Voulez-vous vraiment réinitialiser toutes les données (poids et reps) pour la séance "${currentSession.name}" ?`);
            if (confirmed) {
                currentSession.exercises.forEach(ex => {
                    if (ex.series && Array.isArray(ex.series)) {
                        ex.series.forEach(s => {
                            s.weight = '';
                            s.reps = '';
                        });
                    }
                });
                createTable(); // Re-render the table with empty inputs
                updateAllTotals(); // Recalculate and update summary data
                showNotification(`Séance "${currentSession.name}" réinitialisée.`, "info");
            }
        }

        async function openNewSessionLogic(historicalSession) {
            const confirmed = await customConfirm("Ouvrir cette séance ? La séance en cours sera remplacée et toutes les données non sauvegardées seront perdues.");
            if (!confirmed) return;
            Object.values(state.timers).forEach(timer => {
                if (timer && timer.interval) clearInterval(timer.interval);
            });
            state.timers = {};
            resetTotalWorkoutTimer(false); // Reset timer completely
            StorageAPI.remove('inProgressWorkout');
            
            dom.totalKgRepEl.textContent = "0 kg/rep";
            dom.deltaEl.textContent = "0 kg";
            dom.previousWeekInput.value = "";
            dom.sessionNotesInput.value = ""; 
            let sessionIndexToLoad = state.sessions.findIndex(s => s.name === historicalSession.sessionName);
            if (sessionIndexToLoad === -1) {
                const newTemplateExercises = historicalSession.exercises.map(ex => ({
                    name: ex.name,
                    rest: ex.rest || "1 min",
                    series: ex.series.map(s => ({weight: s.weight, reps: s.reps})) || []
                }));
                const newTemplate = { name: historicalSession.sessionName, exercises: newTemplateExercises };
                state.sessions.push(newTemplate);
                sessionIndexToLoad = state.sessions.length - 1;
                updateSessionSelectOptions(); 
            } else {
                state.sessions[sessionIndexToLoad].exercises = historicalSession.exercises.map(ex => ({
                    name: ex.name,
                    rest: ex.rest || "1 min",
                    series: ex.series.map(s => ({weight: s.weight, reps: s.reps})) || []
                }));
            }
            state.currentSessionIndex = sessionIndexToLoad;
            dom.sessionSelect.value = state.currentSessionIndex; 
            createTable();
            dom.previousWeekInput.value = historicalSession.totalKgRep || "";
            dom.sessionNotesInput.value = historicalSession.notes || ""; 
            showNotification(`Séance "${historicalSession.sessionName}" ouverte et chargée avec succès.`, "success", 3000);
            ModalManager.close(dom.loadOptionsModal, document.activeElement);
            ModalManager.close(dom.historyModal);
        }

        async function appendToCurrentSessionLogic(historicalSession) {
            const confirmed = await customConfirm("Ajouter/mettre à jour les exercices de cette séance à la séance en cours ? Cela écrasera les séries existantes pour les exercices ayant le même nom.");
            if (!confirmed) return;
            const currentSession = state.sessions[state.currentSessionIndex];
            if (!currentSession.exercises) {
                currentSession.exercises = []; 
            }
            let exercisesAdded = 0;
            let exercisesUpdated = 0;
            historicalSession.exercises.forEach(historicalEx => {
                const existingExIndex = currentSession.exercises.findIndex(ex => ex.name === historicalEx.name);
                if (existingExIndex !== -1) {
                    const currentEx = currentSession.exercises[existingExIndex];
                    currentEx.series = historicalEx.series.map(s => ({weight: s.weight, reps: s.reps}));
                    exercisesUpdated++;
                } else {
                    currentSession.exercises.push({
                        name: historicalEx.name,
                        rest: historicalEx.rest || "1 min",
                        series: historicalEx.series.map(s => ({weight: s.weight, reps: s.reps}))
                    });
                    exercisesAdded++;
                }
            });
            createTable(); 
            dom.previousWeekInput.value = historicalSession.totalKgRep || "";
            dom.sessionNotesInput.value = historicalSession.notes || ""; 
            showNotification(`${exercisesAdded} exercices ajoutés et ${exercisesUpdated} mis à jour dans la séance en cours.`, "success", 5000);
            ModalManager.close(dom.loadOptionsModal, document.activeElement);
            ModalManager.close(dom.historyModal);
        }

        function showLoadOptionsModal(session) {
            state.sessionToLoad = session;
            dom.loadSessionNameDisplay.textContent = session.sessionName;
            ModalManager.open(dom.loadOptionsModal, dom.loadOptionsModal.querySelector('button'));
        }

        function hideLoadOptionsModal() {
            const trigger = document.activeElement;
            ModalManager.close(dom.loadOptionsModal);
            dom.loadOptionsModal.addEventListener('transitionend', () => {
                state.sessionToLoad = null;
                trigger?.focus?.();
            }, { once: true });
        }
           

        // beep() défini globalement (avant le listener) — accessible à tous les scripts
        const playBeep = () => beep(500, 0.5, 0.5);

        function isValidAndCompleteNumber(value) {
            if (value === null || value.trim() === '') return false;
            const segments = value.trim().split('+');
            const regex = /^\d+(\.\d{1,2})?$/;

            for (const segment of segments) {
                if (segment.trim() === '' || !regex.test(segment.trim()) || parseFloat(segment.trim()) < 0) {
                    return false;
                }
            }
            return true;
        }

        function loadPersistentIndividualTimers() {
            // Itération sur les clés localStorage pour les timers persistants
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('timer-')) {
                    const idx = parseInt(key.replace('timer-', ''), 10);
                    try {
                        const storedTimer = StorageAPI.get(key);
                        if (storedTimer && storedTimer.endTime > Date.now()) {
                            const remainingSeconds = (storedTimer.endTime - Date.now()) / 1000;
                            if (remainingSeconds > 0) {
                                const element = document.querySelector(`[data-exercise-index="${idx}"]`);
                                if (element) {
                                    const timerDisplay = element.querySelector('.timer-display');
                                    const startBtn = element.querySelector('[data-timer-action="start"]');
                                    const stopBtn = element.querySelector('[data-timer-action="stop"]');

                                    if (state.timers[idx] && state.timers[idx].interval) {
                                        clearInterval(state.timers[idx].interval);
                                    }

                                    state.timers[idx] = {
                                        secondsElapsed: storedTimer.duration - remainingSeconds,
                                        duration: storedTimer.duration,
                                        interval: setInterval(() => {
                                            state.timers[idx].secondsElapsed++;
                                            const currentRemaining = state.timers[idx].duration - state.timers[idx].secondsElapsed;
                                            if (currentRemaining <= 0) {
                                                timerDisplay.textContent = formatTimerDisplay(0);
                                                timerDisplay.classList.remove('timer-active');
                                                clearInterval(state.timers[idx].interval);
                                                StorageAPI.remove(`timer-${idx}`);
                                                playBeep(); 
                                                if(Notification.permission === "granted") {
                                                    new Notification('Lyftiv - Repos Terminé !', { body: `Le temps de repos pour ${storedTimer.name} est terminé.`});
                                                }
                                                startBtn.classList.remove('hidden'); 
                                                stopBtn.classList.add('hidden'); 
                                                timerDisplay.textContent = formatTimerDisplay(storedTimer.duration); 
                                            } else {
                                                timerDisplay.textContent = formatTimerDisplay(currentRemaining); 
                                            }
                                        }, 1000)
                                    };
                                    timerDisplay.textContent = formatTimerDisplay(remainingSeconds);
                                    timerDisplay.classList.add('timer-active');
                                    startBtn.classList.add('hidden');
                                    stopBtn.classList.remove('hidden');
                                } else {
                                    localStorage.removeItem(key);
                                }
                            } else {
                                localStorage.removeItem(key);
                            }
                        } else {
                            localStorage.removeItem(key);
                        }
                    } catch (e) {
                        console.error(`Error parsing stored timer data for key ${key}:`, e);
                        localStorage.removeItem(key);
                    }
                }
            }
        }
        
        function handleSeriesUpdate(exerciseIndex, seriesIndex) {
            const exercise = state.sessions[state.currentSessionIndex].exercises[exerciseIndex];
            if (!exercise) return;

            const currentSeries = exercise.series[seriesIndex];
            const nextSeries = exercise.series[seriesIndex + 1];
            const currentWeight = currentSeries.weight?.trim();
            const currentReps = currentSeries.reps?.trim();

            if (currentWeight && currentReps && nextSeries && !nextSeries.weight?.trim()) {
                nextSeries.weight = currentWeight;
                // Mise à jour chirurgicale : on cible uniquement l'input poids de la série suivante
                // sans recréer tout le DOM (évite la perte de focus et les micro-saccades)
                const nextWeightInput = document.querySelector(
                    `[data-ex='${exerciseIndex}'][data-serie='${seriesIndex + 1}'].weight`
                );
                if (nextWeightInput) {
                    nextWeightInput.value = currentWeight;
                    nextWeightInput.classList.remove('is-invalid', 'completed');
                } else {
                    // Fallback : la série suivante n'est pas encore rendue (cas rare)
                    const scrollY = window.scrollY;
                    createTable();
                    window.scrollTo(0, scrollY);
                }
                showNotification(`Poids pré-rempli pour la série suivante.`, "info", 1500);
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        //  ACTION LAYER — Interface unique DOM ↔ logique métier
        //  Le DOM n'appelle jamais Store / PhysioCompute directement.
        //  Chaque action est un point d'entrée unique : loggable, testable,
        //  extensible (AI suggestion, cloud sync, analytics) sans toucher l'UI.
        // ══════════════════════════════════════════════════════════════════════
        const Actions = {

            /** Ajouter un exercice à la séance courante */
            addExercise(name) {
                const cleaned = name.trim();
                if (!cleaned) { showNotification("Veuillez entrer un nom d’exercice.", "error"); return; }
                Store.addExercise(cleaned);
                state._lastAddedExercise = Store.exercises().length - 1; // index pour l'animation
                RenderScheduler.scheduleAll();
                const lastCard = dom.exerciseListContainer.lastElementChild;
                if (lastCard) requestAnimationFrame(() => lastCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
                showNotification(`Exercice « ${cleaned} » ajouté.`, "info");
            },

            /** Supprimer un exercice (avec dernier état enregistré pour undo) */
            removeExercise(idx) {
                state.lastDeletedExercise = Store.removeExercise(idx);
                RenderScheduler.scheduleAll();
            },

            /** Changer de séance */
            switchSession(index) {
                state.currentSessionIndex = index;
                if (dom.totalKgRepEl)      dom.totalKgRepEl.textContent = "0 kg/rep";
                if (dom.deltaEl)           dom.deltaEl.textContent      = "0 kg";
                if (dom.previousWeekInput) dom.previousWeekInput.value  = "";
                if (dom.sessionNotesInput) dom.sessionNotesInput.value  = "";
                // Cache invalidé : session différente
                invalidateNextSessionCache();
                RenderScheduler.scheduleAll();
                updateDeleteSessionButtonState();
                showNotification("Séance changée.", "info", 2000);
            },

            /** Valider une série (blur input) — save + timer + haptic + feedback neuro-UX */
            commitSeriesInput(exIndex, serieIndex, target) {
                handleNumericInput({ target });
                saveCurrentState(true);
                handleSeriesUpdate(exIndex, serieIndex);

                const isReps   = target.classList.contains('reps');
                const isWeight = target.classList.contains('weight');
                const val = parseFloat(target.value);

                if ((isReps || isWeight) && val > 0) {
                    // ── 1. Set Completion Hit ─────────────────────────────────
                    // Flash visuel sur la ligne de série
                    const row = target.closest('.series-row');
                    if (row) {
                        row.classList.remove('set-complete-flash');
                        // forcer reflow pour que l'animation se relance si déjà jouée
                        void row.offsetWidth;
                        row.classList.add('set-complete-flash');
                        row.addEventListener('animationend', () =>
                            row.classList.remove('set-complete-flash'), { once: true }
                        );
                    }

                    // Vibration distincte validation série
                    if (navigator.vibrate) navigator.vibrate(20);
                }

                if (isReps && val > 0) {
                    // ── Barrière superset : pas de timer de repos entre les exercices liés ──
                    const currentEx = state.sessions[state.currentSessionIndex].exercises[exIndex];
                    const exercises = state.sessions[state.currentSessionIndex].exercises;
                    let shouldStartTimer = true;
                    if (currentEx?.groupId) {
                        const isLastOfGroup = (exIndex === exercises.length - 1) ||
                                              (exercises[exIndex + 1]?.groupId !== currentEx.groupId);
                        if (!isLastOfGroup) shouldStartTimer = false; // Enchaîner sans repos
                    }
                    if (shouldStartTimer) startRestTimer();

                    // ── 4. Progress Memory Effect ─────────────────────────────
                    // Comparaison avec la même série de la dernière séance du même exercice
                    _showProgressMemory(exIndex, serieIndex, target);
                }
            },

            /** Finaliser la séance et sauvegarder dans l'historique */
            finishWorkout() {
                // Cache invalidé : l'historique change, le calcul prochain peut changer
                invalidateNextSessionCache();
                if (typeof saveToHistory === 'function') saveToHistory();
            },

            /** Annuler la suppression d'un exercice */
            undoRemoveExercise() {
                if (!state.lastDeletedExercise) return false;
                Store.exercises().push(state.lastDeletedExercise);
                state.lastDeletedExercise = null;
                saveCurrentState(true);
                RenderScheduler.scheduleAll();
                return true;
            }
        };

        /** Progress Memory — affiche brièvement "+X kg vs session précédente" */
        function _showProgressMemory(exIndex, serieIndex, triggerEl) {
            try {
                const ex = state.sessions[state.currentSessionIndex]?.exercises?.[exIndex];
                if (!ex) return;

                const history = getHistory();
                const sessionName = state.sessions[state.currentSessionIndex]?.name || '';

                // Chercher la dernière séance du même nom avec cet exercice
                const lastSession = history
                    .filter(s => s.sessionName === sessionName)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                if (!lastSession) return;

                const lastEx = lastSession.exercises?.find(e =>
                    e.name.toLowerCase() === ex.name.toLowerCase()
                );
                if (!lastEx || !lastEx.series?.[serieIndex]) return;

                const lastSerie = lastEx.series[serieIndex];
                const lastWeight = parseFloat(lastSerie.weight) || 0;
                const currentWeight = parseFloat(
                    document.querySelector(`[data-ex='${exIndex}'][data-serie='${serieIndex}'].weight`)?.value || 0
                );

                if (!lastWeight || !currentWeight) return;

                const diff = currentWeight - lastWeight;
                const isRecord = currentWeight >= Math.max(...(lastEx.series.map(s => parseFloat(s.weight) || 0)));

                let text, isRecordBadge = false;
                if (Math.abs(diff) < 0.1) {
                    text = '= même charge';
                } else if (diff > 0) {
                    text = '+' + diff.toFixed(1) + ' kg ↑';
                    isRecordBadge = isRecord;
                } else {
                    text = diff.toFixed(1) + ' kg ↓';
                }
                if (isRecord) text = '🔥 Record session!';

                // Position : au-dessus du champ reps déclencleur
                const rect = triggerEl.getBoundingClientRect();
                const badge = document.createElement('div');
                badge.className = 'progress-toast' + (isRecordBadge ? '' : '');
                badge.textContent = text;
                badge.style.top = (rect.top + window.scrollY - 36) + 'px';
                document.body.appendChild(badge);
                badge.addEventListener('animationend', () => badge.remove(), { once: true });

            } catch (e) { /* silencieux — feature optionnelle */ }
        }

        // ══════════════════════════════════════════════════════════════════════
        //  ROUTER — Navigation SPA hash-based
        //  Gère le bouton "retour" Android et permet les deep links.
        //  Routes : #training | #history | #dashboard | #nutrition | #settings
        //  La route active synchronise l'onglet visible sans recharger la page.
        // ══════════════════════════════════════════════════════════════════════
        const Router = {
            // Correspondance route → onglet nav
            _routes: {
                '#training':   'training',
                '#history':    'history',
                '#dashboard':  'dashboard',
                '#nutrition':  'nutrition',
                '#settings':   'settings',
            },

            // true quand history.pushState est bloqué (iframe srcdoc, claudeusercontent preview…)
            _historyDisabled: false,

            /** Tester si history API est utilisable dans ce contexte */
            _canUseHistory() {
                if (this._historyDisabled) return false;
                try {
                    // about:srcdoc et certains iframes bloquent history.replaceState
                    history.replaceState(history.state, '');
                    return true;
                } catch {
                    this._historyDisabled = true;
                    return false;
                }
            },

            /** Naviguer vers une route — met à jour l'URL si possible, active l'onglet dans tous les cas */
            navigate(hash, replace = false) {
                if (this._canUseHistory()) {
                    try {
                        if (replace) history.replaceState({ route: hash }, '', hash);
                        else         history.pushState({ route: hash }, '', hash);
                    } catch { this._historyDisabled = true; }
                }
                this._apply(hash);
            },

            /** Appliquer la route à l'UI (activer le bon onglet) */
            _apply(hash) {
                const tabKey = this._routes[hash];
                if (!tabKey) return;
                const navBtn = document.querySelector(`.nav-btn[data-tab="${tabKey}"], .nav-btn[data-view="${tabKey}"]`);
                if (navBtn && !navBtn.classList.contains('active')) navBtn.click();
            },

            /** Lire la route depuis l'URL et l'appliquer au démarrage */
            init() {
                const hash = location.hash || '#training';
                if (this._canUseHistory()) {
                    try { history.replaceState({ route: hash }, '', hash); }
                    catch { this._historyDisabled = true; }
                }
                this._apply(hash);

                // Bouton retour / avant — seulement si history API dispo
                if (!this._historyDisabled) {
                    window.addEventListener('popstate', (e) => {
                        this._apply(e.state?.route || '#training');
                    });
                }
            }
        };

        function setupEventListeners() {
            WodEngine.init();
            document.querySelectorAll('input[inputmode="decimal"]').forEach(input => {
                input.addEventListener('input', e => {
                    e.target.value = e.target.value.replace(/,/g, '.');
                });
            });

            // ── Onglets Dashboard ────────────────────────────────────
            document.querySelectorAll('.dash-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.dash-tab-btn').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    });
                    document.querySelectorAll('.dash-tab-panel').forEach(p => p.classList.add('hidden'));
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                    document.getElementById(btn.dataset.tab).classList.remove('hidden');

                    // Mettre à jour l'URL pour le bouton retour Android
                    const tabToHash = {
                        panelTraining: '#training', panelHistory:   '#history',
                        panelDash:     '#dashboard', panelNutrition: '#nutrition',
                        panelSettings: '#settings',
                    };
                    const hash = tabToHash[btn.dataset.tab];
                    if (hash) Router.navigate(hash);
                });
            });

            // ── Navigation menu Nutrition ────────────────────────────
            document.querySelectorAll('.nutri-menu-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.dataset.nutri + '-wrap';
                    // Update button states
                    document.querySelectorAll('.nutri-menu-btn').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-pressed', 'true');
                    // Show/hide sections
                    document.querySelectorAll('.nutri-section-wrap').forEach(s => {
                        s.classList.add('nutri-section-hidden');
                    });
                    const target = document.getElementById(targetId);
                    if (target) {
                        target.classList.remove('nutri-section-hidden');
                        // Scroll to top of nutrition panel smoothly
                        document.getElementById('nutritionMenu').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
            });

            // ── Calculateur TDEE ────────────────────────────────────
            document.getElementById('tdee_calc_btn').addEventListener('click', calculateTDEE);

            dom.homeBtn.addEventListener('click', () => {
                showLanding();
            });

            // Bouton séances → menu entraînement (dashboard, onglet Training)
            document.getElementById('dashMenuBtn').addEventListener('click', () => {
                landing.classList.add('hidden');
                dashboard.classList.remove('hidden');
                appContainer.classList.add('hidden');
                // Activer l'onglet Entraînement
                document.querySelectorAll('.dash-tab-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === 'panelTraining');
                    b.setAttribute('aria-selected', b.dataset.tab === 'panelTraining' ? 'true' : 'false');
                });
                document.querySelectorAll('.dash-tab-panel').forEach(p => {
                    p.classList.toggle('hidden', p.id !== 'panelTraining');
                });
                populateDashboard();
            });

            // Bouton hero "Commencer l'entraînement" → app directe (saute le dashboard)
            document.getElementById('landingStartBtn').addEventListener('click', () => {
                sessionStorage.setItem('landingPassed', 'true');
                landing.classList.add('hidden');
                dashboard.classList.add('hidden');
                appContainer.classList.remove('hidden');
                sessionStorage.setItem('dashboardShown', 'true');
            });

            // Bouton bas de page "Accéder à l'application" → dashboard (choix de séance)
            document.getElementById('landingStartBtn2').addEventListener('click', () => {
                sessionStorage.setItem('landingPassed', 'true');
                showDashboard();
            });

            // Bouton topbar dashboard → landing
            document.getElementById('dashHomeBtn').addEventListener('click', () => {
                showLanding();
            });

            // Boutons mode nuit universels
            function toggleTheme() {
                const newTheme = dom.body.classList.contains('dark-mode') ? 'light' : 'dark';
                applyTheme(newTheme);
                StorageAPI.setRaw('theme', newTheme);
            }
            document.getElementById('dashThemeBtn').addEventListener('click', toggleTheme);
            document.getElementById('landingThemeBtn').addEventListener('click', toggleTheme);

            dom.sessionSelect.addEventListener('change', () => {
              // Stoppe et purge tous les timers d'exercices
              for (const key in state.timers) {
                const t = state.timers[key];
                if (t && t.interval) {
                  clearInterval(t.interval);
                  StorageAPI.remove(`timer-${key}`);
                }
              }
              state.timers = {};

              // Réinitialise le minuteur global proprement (sans confirmation)
              if (typeof resetTotalWorkoutTimer === 'function') {
                try { resetTotalWorkoutTimer(false); } catch {}
              }

              // Oublie l’éventuelle séance en cours
              StorageAPI.remove('inProgressWorkout');

              // Pointe sur la nouvelle séance sélectionnée
              state.currentSessionIndex = +dom.sessionSelect.value;

              // Réinitialise l’UI dérivée (si présents)
              if (dom.totalKgRepEl) dom.totalKgRepEl.textContent = "0 kg/rep";
              if (dom.deltaEl) dom.deltaEl.textContent = "0 kg";
              if (dom.previousWeekInput) dom.previousWeekInput.value = "";
              if (dom.sessionNotesInput) dom.sessionNotesInput.value = "";

              // Reconstruit l’UI via RenderScheduler (batch en 1 frame)
              RenderScheduler.scheduleAll();
              if (typeof updateDeleteSessionButtonState === 'function') updateDeleteSessionButtonState();

              // Feedback discret
              if (typeof showNotification === 'function') showNotification("Séance changée.", "info", 2000);
            });
            
            dom.addExerciseBtn.addEventListener('click', () => {
                Actions.addExercise(dom.customExerciseInput.value);
                dom.customExerciseInput.value = '';
            });

            dom.exerciseListContainer.addEventListener('blur', (e) => {
                if (e.target.classList.contains('reps') || e.target.classList.contains('weight')) {
                    Actions.commitSeriesInput(+e.target.dataset.ex, +e.target.dataset.serie, e.target);
                }
            }, true);

            dom.exerciseListContainer.addEventListener('input', e => { 
                if (e.target.classList.contains('reps') || e.target.classList.contains('weight')) {
                    // Passer en mode EXECUTE à la première saisie
                    if (AppMode.current !== 'execute') AppMode.set('execute');
                    // Démarrer le timer global à la première saisie
                    if (!state.workoutStartTime) {
                        startTotalWorkoutTimer();
                    }
                    // Scheduler : les totaux seront recalculés en 1 frame max
                    RenderScheduler.scheduleTotals();
                }
            });

            dom.exerciseListContainer.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const target = e.target;
                    if (target.classList.contains('weight') || target.classList.contains('reps')) {
                        e.preventDefault();
                        target.blur();
                    }
                }
            });

            const pressHandler = (e) => {
                const button = e.target.closest('.serie-input-delete');
                if (!button) return;

                state.pressTimer = setTimeout(() => {
                    if (navigator.vibrate) navigator.vibrate(50);

                    const scrollY = window.scrollY;
                    const exIndex = +button.dataset.ex;
                    const serieIndex = +button.dataset.serie;
                    const exercise = state.sessions[state.currentSessionIndex].exercises[exIndex];

                    if (exercise.series.length > 1) {
                        exercise.series.splice(serieIndex, 1);
                        createTable();
                        window.scrollTo(0, scrollY);
                        updateAllTotals();
                        showNotification(`Série ${serieIndex + 1} supprimée.`, "info", 2000);
                    } else {
                        showNotification("Un exercice doit avoir au moins une série.", "error", 3000);
                    }
                }, 500);
            };

            const releaseHandler = () => {
                clearTimeout(state.pressTimer);
            };

            dom.exerciseListContainer.addEventListener('mousedown', pressHandler);
            dom.exerciseListContainer.addEventListener('mouseup', releaseHandler);
            dom.exerciseListContainer.addEventListener('mouseleave', releaseHandler, true);
            // ── { passive: true } — débloque le scrolling natif 60 FPS sur iOS/Android
            dom.exerciseListContainer.addEventListener('touchstart',  pressHandler,   { passive: true });
            dom.exerciseListContainer.addEventListener('touchend',    releaseHandler, { passive: true });
            dom.exerciseListContainer.addEventListener('touchcancel', releaseHandler, { passive: true, capture: true });

            dom.exerciseListContainer.addEventListener('dblclick', (e) => {
                const button = e.target.closest('.serie-input-delete');
                if (!button) return;

                clearTimeout(state.pressTimer);

                const scrollY = window.scrollY;
                const exIndex = +button.dataset.ex;
                const serieIndex = +button.dataset.serie;
                const exercise = state.sessions[state.currentSessionIndex].exercises[exIndex];

                if (exercise && exercise.series[serieIndex]) {
                    exercise.series[serieIndex].weight = '';
                    exercise.series[serieIndex].reps = '';
                    createTable();
                    window.scrollTo(0, scrollY);
                    updateAllTotals();
                    showNotification(`Données de la série ${serieIndex + 1} effacées.`, "info", 2000);
                }
            });

            dom.previousWeekInput.addEventListener('input', updateAllTotals); 
            dom.exerciseListContainer.addEventListener('click', handleTableActions); 
            document.getElementById('finishSessionBtn').addEventListener('click', async () => {
                const exerciseList = state.sessions?.[state.currentSessionIndex]?.exercises || [];
                const hasData = exerciseList.some(ex =>
                    (ex.series || []).some(s => parseFloat(s.reps) > 0 || parseFloat(s.weight) > 0)
                );
                if (hasData) {
                    const confirmed = await customConfirm('Terminer et sauvegarder la séance ?');
                    if (!confirmed) return;
                }
                finishAndSaveSession();
            });
            document.getElementById('viewHistoryBtn').addEventListener('click', () => {
                const triggeringElement = document.activeElement;
                displayHistory();
                ModalManager.open(dom.historyModal, dom.closeHistoryModal);
            });
            dom.historyModal.addEventListener('click', handleHistoryActions);
            dom.exportBtn.addEventListener('click', exportCSV);
            dom.exportJsonBtn.addEventListener('click', exportJSON);
            dom.importBtn.addEventListener('click', () => dom.importFileInput.click());

            dom.importFileInput.addEventListener('change', async (event) => {
                const files = Array.from(event.target.files);
                if (!files.length) {
                    showNotification("Aucun fichier sélectionné pour l'importation.", "info");
                    return;
                }

                // Read a single file as text
                function readFile(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = e => resolve({ name: file.name, content: e.target.result });
                        reader.onerror = () => reject(new Error(`Lecture échouée : ${file.name}`));
                        reader.readAsText(file, 'UTF-8');
                    });
                }

                // Parse a single file to session array
                function parseFile({ name, content }) {
                    if (name.endsWith('.csv'))  return parseCsvToHistory(content);
                    if (name.endsWith('.json')) {
                        const parsed = JSON.parse(content);
                        // Format backup Lyftiv v1 : { version, data: { workoutHistory, customSessions, ... } }
                        if (parsed.appName === 'Lyftiv' && parsed.data?.workoutHistory) {
                            // Restaurer les sessions template si présentes
                            if (Array.isArray(parsed.data.customSessions) && parsed.data.customSessions.length) {
                                state.sessions = parsed.data.customSessions;
                                saveCurrentState(true);
                                createTable();
                                updateAllTotals();
                            }
                            return parsed.data.workoutHistory;
                        }
                        // Format historique brut (tableau de séances)
                        return Array.isArray(parsed) ? parsed : [];
                    }
                    throw new Error(`Format non pris en charge : ${name}`);
                }

                let totalNew = 0, totalUpdated = 0, errors = [];

                try {
                    // Read all files in parallel
                    const results = await Promise.all(files.map(f => readFile(f).catch(err => ({ error: err.message, name: f.name }))));

                    let currentHistory = getHistory();

                    for (const result of results) {
                        if (result.error) { errors.push(result.name); continue; }
                        try {
                            const importedData = parseFile(result);
                            importedData.forEach(importedSession => {
                                const existingIndex = currentHistory.findIndex(s =>
                                    s.date === importedSession.date &&
                                    s.sessionName === importedSession.sessionName
                                );
                                if (existingIndex !== -1) {
                                    currentHistory[existingIndex] = importedSession;
                                    totalUpdated++;
                                } else {
                                    currentHistory.push(importedSession);
                                    totalNew++;
                                }
                            });
                        } catch (e) {
                            errors.push(result.name);
                        }
                    }

                    StorageAPI.set('workoutHistory', currentHistory);
                    displayHistory();

                    const successMsg = `✅ ${files.length} fichier${files.length > 1 ? 's' : ''} traité${files.length > 1 ? 's' : ''} — ${totalNew} séance${totalNew > 1 ? 's' : ''} importée${totalNew > 1 ? 's' : ''}, ${totalUpdated} mise${totalUpdated > 1 ? 's' : ''} à jour.`;
                    showNotification(successMsg, "success", 5000);

                    if (errors.length) {
                        showNotification(`⚠️ Erreur sur ${errors.length} fichier${errors.length > 1 ? 's' : ''} : ${errors.join(', ')}`, "error", 6000);
                    }

                } catch (error) {
                    console.error("Erreur lors de l'importation :", error);
                    showNotification("Une erreur est survenue lors de l'importation. Vérifiez le format des fichiers.", "error");
                } finally {
                    event.target.value = '';
                }
            });

            document.getElementById('closeHistoryModal').addEventListener('click', () => ModalManager.close(dom.historyModal, document.activeElement));
            dom.themeToggleBtn.addEventListener('click', toggleTheme);
            
            dom.toggleWorkoutTimerBtn.addEventListener('click', () => {
                if (state.isWorkoutTimerPaused) {
                    startTotalWorkoutTimer();
                } else {
                    pauseTotalWorkoutTimer();
                }
            });

            dom.resetWorkoutTimerBtn.addEventListener('click', () => resetTotalWorkoutTimer(true));

            dom.createNewSessionTypeBtn.addEventListener('click', showNewSessionModal);
            dom.deleteCurrentSessionBtn.addEventListener('click', deleteCurrentSession);
            dom.resetCurrentSessionBtn.addEventListener('click', resetCurrentSession);
            dom.closeNewSessionModal.addEventListener('click', hideNewSessionModal);
            dom.cancelNewSessionBtn.addEventListener('click', hideNewSessionModal);
            dom.createNewSessionBtn.addEventListener('click', createNewSession);
            dom.closeLoadOptionsModal.addEventListener('click', hideLoadOptionsModal);
            dom.openNewSessionBtn.addEventListener('click', async () => { 
                if (state.sessionToLoad) await openNewSessionLogic(state.sessionToLoad);
            });
            dom.appendToCurrentSessionBtn.addEventListener('click', async () => { 
                if (state.sessionToLoad) await appendToCurrentSessionLogic(state.sessionToLoad);
            });

            if (dom.plateCalculatorBtn) {
                dom.plateCalculatorBtn.addEventListener('click', () => {
                    const triggeringElement = document.activeElement;
                    dom.plateCalculatorModal.classList.remove('hidden');
                    dom.plateCalculatorModal.classList.add('show');
                    const firstInput = dom.plateCalculatorModal.querySelector('input, button');
                    if (firstInput) firstInput.focus();
                    dom.plateCalculatorModal.addEventListener('transitionend', () => {
                        if (dom.plateCalculatorModal.classList.contains('hidden') && triggeringElement && typeof triggeringElement.focus === 'function') {
                            triggeringElement.focus();
                        }
                    }, { once : true });
                });
            }

            dom.closePlateCalculatorModal.addEventListener('click', () => ModalManager.close(dom.plateCalculatorModal, document.activeElement));
            if (dom.targetWeightInput) {
                dom.targetWeightInput.addEventListener('input', calculatePlates);
            }
            if (dom.barbellWeightInput) {
                dom.barbellWeightInput.addEventListener('input', calculatePlates);
            }
            
            document.querySelectorAll('input[name="oneRmInputMode"]').forEach(radio => {
                radio.addEventListener('change', (event) => {
                    if (event.target.value === 'manual') {
                        dom.oneRmManualInput.classList.remove('hidden');
                        dom.oneRmSelectInput.classList.add('hidden');
                        dom.oneRmInput.focus();
                        dom.oneRmExerciseSelect.value = '';
                    } else {
                        dom.oneRmManualInput.classList.add('hidden');
                        dom.oneRmSelectInput.classList.remove('hidden');
                        dom.oneRmExerciseSelect.focus();
                        dom.oneRmInput.value = '';
                        calculateTrainingGoals();
                    }
                });
            });

            if (dom.oneRmExerciseSelect) {
                dom.oneRmExerciseSelect.addEventListener('change', () => {
                    dom.oneRmInput.value = dom.oneRmExerciseSelect.value;
                    calculateTrainingGoals();
                });
            }

            if (dom.oneRmInput) {
                dom.oneRmInput.addEventListener('input', calculateTrainingGoals);
            }

            if (dom.plateCalcTab) {
                dom.plateCalcTab.addEventListener('click', () => {
                    dom.plateCalcTab.classList.add('active');
                    dom.plateCalcTab.setAttribute('aria-selected', 'true');
                    dom.goalCalcTab.classList.remove('active');
                    dom.goalCalcTab.setAttribute('aria-selected', 'false');
                    dom.plateCalcContent.classList.remove('hidden');
                    dom.goalCalcContent.classList.add('hidden');
                    const firstInput = dom.plateCalcContent.querySelector('input, button');
                    if (firstInput) firstInput.focus();
                });
            }

            if (dom.goalCalcTab) {
                dom.goalCalcTab.addEventListener('click', () => {
                    dom.goalCalcTab.classList.add('active');
                    dom.goalCalcTab.setAttribute('aria-selected', 'true');
                    dom.plateCalcTab.classList.remove('active');
                    dom.plateCalcTab.setAttribute('aria-selected', 'false');
                    dom.goalCalcContent.classList.remove('hidden');
                    dom.plateCalcContent.classList.add('hidden');
                    const firstInput = dom.goalCalcContent.querySelector('input, button');
                    if (firstInput) firstInput.focus();
                });
            }

            dom.closeQuickEditModal.addEventListener('click', () => ModalManager.close(dom.quickEditModal, document.activeElement));
            dom.applyQuickEditBtn.addEventListener('click', () => {
                const weightValid = validateInputField(dom.quickEditWeight, dom.quickEditWeightError, true);
                const repsValid = validateInputField(dom.quickEditReps, dom.quickEditRepsError, true);

                if (!weightValid || !repsValid) {
                    showNotification("Veuillez corriger les erreurs pour appliquer l'édition rapide.", "error");
                    return;
                }

                if (state.quickEditIndex !== null) {
                    const weight = dom.quickEditWeight.value;
                    const reps = dom.quickEditReps.value;
                    const exerciseToUpdate = state.sessions[state.currentSessionIndex].exercises[state.quickEditIndex];
                    exerciseToUpdate.series.forEach((s, i) => {
                        exerciseToUpdate.series[i].weight = weight;
                        exerciseToUpdate.series[i].reps = reps;
                    });
                    
                    createTable();
                    updateAllTotals();
                    ModalManager.close(dom.quickEditModal, document.activeElement);
                    showNotification("Séries mises à jour rapidement !", "success");
                }
            });

            document.addEventListener('keydown', e => {
                if (e.ctrlKey || e.metaKey) { 
                    if (e.key === 's') { e.preventDefault(); finishAndSaveSession(); } 
                    if (e.key === 'e') { e.preventDefault(); exportCSV(); } 
                }
                if (e.key === 'Escape') {
                    // Ferme la première modale visible (LIFO)
                    const modals = [
                        dom.quickEditModal, dom.loadOptionsModal, dom.newSessionModal,
                        dom.plateCalculatorModal, dom.historyModal, dom.pwaInstallPrompt
                    ];
                    const openModal = modals.find(m => m?.classList.contains('show'));
                    if (openModal) {
                        if (openModal === dom.pwaInstallPrompt) StorageAPI.setRaw('pwaPromptDismissed', 'true');
                        if (openModal === dom.loadOptionsModal) { hideLoadOptionsModal(); return; }
                        ModalManager.close(openModal);
                    }
                }
            });

            dom.bottomAddExerciseBtn.addEventListener('click', () => {
                dom.addExerciseSection.scrollIntoView({ behavior: 'smooth' });
                if (!state.isMobileView) {
                    setTimeout(() => {
                        dom.customExerciseInput.focus();
                    }, 300);
                }
            });
            dom.bottomNotesBtn.addEventListener('click', () => {
                state.isNotesSectionVisible = !state.isNotesSectionVisible;
                if (state.isNotesSectionVisible) {
                    dom.sessionNotesSection.classList.add('show-notes-section');
                    dom.sessionNotesSection.classList.remove('hide-notes-section');
                    if (!state.isMobileView) dom.sessionNotesInput.focus();
                    dom.sessionNotesSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    dom.sessionNotesSection.classList.remove('show-notes-section');
                    dom.sessionNotesSection.classList.add('hide-notes-section');
                }
            });
            // Timer repos bottom nav
            document.getElementById('bottomRestTimerBtn').addEventListener('click', () => {
                if (restTimerState.active) {
                    stopRestTimer(false);
                } else {
                    // Popup de sélection durée
                    showRestDurationPicker();
                }
            });

            dom.bottomScrollBtn.addEventListener('click', () => {
                const currentScrollY = window.scrollY;
                const windowHeight = window.innerHeight;
                const documentHeight = document.documentElement.scrollHeight;
            
                const distanceToTop = currentScrollY;
                const distanceToBottom = documentHeight - windowHeight - currentScrollY;
            
                if (distanceToBottom > distanceToTop) {
                    window.scrollTo({ top: documentHeight, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            dom.bottomViewHistoryBtn.addEventListener('click', () => {
                displayHistory(); 
                ModalManager.open(dom.historyModal, dom.closeHistoryModal);
                dom.historyModal.classList.add('show');
                dom.closeHistoryModal.focus();
            });
            dom.bottomPlateCalculatorBtn.addEventListener('click', () => {
                dom.plateCalculatorModal.classList.remove('hidden');
                dom.plateCalculatorModal.classList.add('show');
                dom.closePlateCalculatorModal.focus();
            });

            // ── Graphiques dashboard (page d'accueil) ───────────────
            document.querySelectorAll('.dash-chart-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.dash-chart-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderDashChart(btn.dataset.dchart);
                });
            });
            document.getElementById('dashChartExercise').addEventListener('change', () => {
                const active = document.querySelector('.dash-chart-tab.active');
                renderDashChart(active ? active.dataset.dchart : '1rm');
            });

            // ── Compléments alimentaires dashboard ────────────────────
            // OPT: debounce 300ms — évite de reconstruire le DOM de la grille à chaque frappe
            // Historique session intégré ici (l'ancien double listener Phase 1 a été supprimé)
            (function() {
                let _supplSearchTimer = null;
                if (!window._sessionSupplHistory) window._sessionSupplHistory = [];

                document.getElementById('dashSupplSearch').addEventListener('input', e => {
                    if (_supplSearchTimer) clearTimeout(_supplSearchTimer);
                    _supplSearchTimer = setTimeout(() => {
                        const q = e.target.value.trim();
                        renderDashSuppl(q);
                        // Sécurité : accumuler l'historique de session pour détection croisée
                        if (q.length > 1) {
                            window._sessionSupplHistory.push(q.toLowerCase());
                            checkSupplSafety(window._sessionSupplHistory);
                        } else {
                            checkSupplSafety([q]);
                        }
                    }, 300);
                });
            })();

            // ── Deload widget dashboard ──────────────────────────────
            document.getElementById('dashDeloadWidget').addEventListener('click', e => {
                if (e.target.id === 'dashApplyDeloadBtn') applyDeload();
                if (e.target.id === 'dashDismissDeloadBtn') {
                    StorageAPI.setRaw('deloadDismissed', Date.now());
                    renderDashDeload();
                }
            });
            
            document.addEventListener('visibilitychange', handleVisibilityChange);

            // ── SAUVEGARDE AUTOMATIQUE ROBUSTE ─────────────────────────
            // 1. Fermeture d'onglet / navigation (desktop)
            window.addEventListener('beforeunload', () => {
                saveCurrentState(true, true); // skipDomSync: state déjà à jour
            });

            // 2. Mise en arrière-plan sur mobile (iOS/Android — pagehide est plus fiable que beforeunload sur mobile)
            window.addEventListener('pagehide', () => {
                saveCurrentState(true, true); // skipDomSync: state déjà à jour
            });

            // 3. Passage en arrière-plan (app PWA minimisée, écran verrouillé)
            // Flush immédiat de SaveQueue avant fermeture / mise en background
        window.addEventListener('beforeunload', () => {
            if (state.isInitialized) {
                // Construire le payload inline pour un flush synchrone
                const sess = state.sessions[state.currentSessionIndex];
                if (sess) {
                    SaveQueue.flush({
                        previousWeek: dom.previousWeekInput?.value || '',
                        sessionIndex: state.currentSessionIndex,
                        customSessions: state.sessions,
                        workoutStartTime: state.workoutStartTime,
                        isWorkoutTimerPaused: state.isWorkoutTimerPaused,
                        totalPausedDuration: state.totalPausedDuration,
                        pauseStartTime: state.pauseStartTime,
                        sessionNotes: dom.sessionNotesInput?.value || '',
                        savedAt: Date.now()
                    });
                }
            }
        });

        document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    saveCurrentState(true, true); // skipDomSync: state déjà à jour
                }
            });

            // 4. Sauvegarde périodique toutes les 30 secondes (uniquement si séance active)
            setInterval(() => {
                if (state.isInitialized && state.workoutStartTime) {
                    saveCurrentState(true, true); // skipDomSync: state déjà à jour
                }
            }, 30000);

            // 5. Mise à jour ciblée à chaque frappe + debounce sauvegarde
            let saveDebounceTimer = null;
            document.getElementById('exerciseListContainer').addEventListener('input', (e) => {
                const input = e.target;
                // Mise à jour chirurgicale : ne touche que la série modifiée
                if (input.dataset.ex !== undefined && input.dataset.serie !== undefined) {
                    const field = input.classList.contains('weight') ? 'weight' : 'reps';
                    updateSingleSerie(parseInt(input.dataset.ex), parseInt(input.dataset.serie), field, input.value);
                }
                // Debounce : sauvegarde localStorage (pas de querySelectorAll ici)
                clearTimeout(saveDebounceTimer);
                saveDebounceTimer = setTimeout(() => {
                    if (state.isInitialized) saveCurrentState(true, true); // skipDomSync: state déjà à jour
                }, 1500);
            }, true);
        }

        /* ============================================================
           FONCTIONS PREMIUM — Graphiques de Progression
        ============================================================ */
        /* ============================================================
           GRAPHIQUES — Dashboard inline (page d'accueil)
        ============================================================ */
        // Registre des instances Chart.js actives — destroy() avant toute recréation
        const chartRegistry = new Map();
        function getChart(id)       { return chartRegistry.get(id) || null; }
        function destroyChart(id)   { const c = chartRegistry.get(id); if (c) { c.destroy(); chartRegistry.delete(id); } }
        function storeChart(id, c)  { destroyChart(id); chartRegistry.set(id, c); return c; }
        let dashChartInstance = null;


        /* ════════════════════════════════════════════════════════════
           TIMER DE REPOS GLOBAL
           ════════════════════════════════════════════════════════════ */
        const restTimerState = {
            interval: null,
            remaining: 0,
            duration: 60,
            active: false
        };
        const REST_DURATIONS = [30, 60, 90, 120, 180, 240];

        function startRestTimer(durationSec) {
            if (restTimerState.interval) clearInterval(restTimerState.interval);
            restTimerState.duration = durationSec || restTimerState.duration;
            restTimerState.remaining = restTimerState.duration;
            restTimerState.active = true;

            const overlay = document.getElementById('restTimerOverlay');
            const bar = document.getElementById('restTimerBar');
            const countdown = document.getElementById('restTimerCountdown');

            overlay.classList.add('visible');
            bar.style.transition = 'none';
            bar.style.transform = 'scaleX(1)';
            bar.classList.add('active');

            // Force reflow then start animation
            bar.getBoundingClientRect();
            bar.style.transition = `transform ${restTimerState.duration}s linear`;
            bar.style.transform = 'scaleX(0)';

            function tick() {
                restTimerState.remaining--;
                const m = Math.floor(restTimerState.remaining / 60);
                const s = restTimerState.remaining % 60;
                countdown.textContent = m + ':' + String(s).padStart(2, '0');

                // ── Rest Timer States — 3 états psychologiques ─────────────
                const r = restTimerState.remaining;
                if (r <= 10) {
                    // Préparation : rouge + pulse
                    countdown.classList.remove('rest-warning');
                    countdown.classList.add('rest-ready');
                    overlay.classList.remove('rest-warning');
                    overlay.classList.add('rest-ready');
                    // Pré-vibration 5s avant : double tap léger
                    if (r === 5 && navigator.vibrate) navigator.vibrate([10, 40, 10]);
                } else if (r <= 30) {
                    // Tension : ambre
                    countdown.classList.remove('rest-ready');
                    countdown.classList.add('rest-warning');
                    overlay.classList.remove('rest-ready');
                    overlay.classList.add('rest-warning');
                } else {
                    // Calme : état normal
                    countdown.classList.remove('rest-warning', 'rest-ready');
                    overlay.classList.remove('rest-warning', 'rest-ready');
                }

                if (restTimerState.remaining <= 0) {
                    stopRestTimer(true);
                }
            }

            // Init display
            const m0 = Math.floor(restTimerState.duration / 60);
            const s0 = restTimerState.duration % 60;
            countdown.textContent = m0 + ':' + String(s0).padStart(2, '0');

            restTimerState.interval = setInterval(tick, 1000);

            // Vibration au démarrage
            if (navigator.vibrate) navigator.vibrate(50);
        }

        function stopRestTimer(finished) {
            if (restTimerState.interval) clearInterval(restTimerState.interval);
            restTimerState.interval = null;
            restTimerState.active = false;

            const overlay = document.getElementById('restTimerOverlay');
            const bar = document.getElementById('restTimerBar');

            overlay.classList.remove('visible', 'rest-warning', 'rest-ready');
            bar.classList.remove('active');
            bar.style.transition = 'none';
            bar.style.transform = 'scaleX(0)';
            // Nettoyer les classes d'état sur le countdown
            document.getElementById('restTimerCountdown')
                ?.classList.remove('rest-warning', 'rest-ready');

            if (finished) {
                // Vibration fin de repos
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                showNotification('⏱️ Repos terminé — c\'est reparti !', 'success', 2500);

                // Auto-focus sur le premier input poids vide de l'exercice le plus récent
                // UX : l'athlète peut saisir immédiatement sans chercher le champ
                requestAnimationFrame(() => {
                    const emptyWeights = [...document.querySelectorAll(
                        '.exercise-card .series-input-group input.weight'
                    )].filter(el => !el.value.trim());
                    if (emptyWeights.length > 0) {
                        emptyWeights[0].focus({ preventScroll: false });
                        emptyWeights[0].closest('.exercise-card')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
            }
        }

        function initRestTimerUI() {
            // Bouton skip
            document.getElementById('restTimerSkip').addEventListener('click', () => {
                stopRestTimer(false);
            });

            // Durée depuis localStorage (avec validation)
            const saved = StorageAPI.getRaw('restTimerDuration');
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed > 0 && parsed <= 600) {
                    restTimerState.duration = parsed;
                }
            }
        }

        /* ════════════════════════════════════════════════════════════
           SYSTÈME DE BADGES
           ════════════════════════════════════════════════════════════ */
        const BADGE_DEFS = [
            { id: 'first_session',   icon: '🎯', label: '1ère séance',    check: (h) => h.length >= 1 },
            { id: 'sessions_5',      icon: '⭐', label: '5 séances',      check: (h) => h.length >= 5 },
            { id: 'sessions_10',     icon: '🔟', label: '10 séances',     check: (h) => h.length >= 10 },
            { id: 'sessions_25',     icon: '🥈', label: '25 séances',     check: (h) => h.length >= 25 },
            { id: 'sessions_50',     icon: '🥇', label: '50 séances',     check: (h) => h.length >= 50 },
            { id: 'sessions_100',    icon: '💎', label: '100 séances',    check: (h) => h.length >= 100 },
            { id: 'streak_3',        icon: '🔥', label: 'Streak 3j',      check: (h) => calcStreak(h) >= 3 },
            { id: 'streak_7',        icon: '🔥🔥', label: 'Streak 7j',   check: (h) => calcStreak(h) >= 7 },
            { id: 'streak_30',       icon: '🌋', label: 'Streak 30j',     check: (h) => calcStreak(h) >= 30 },
            { id: 'tonnage_1000',    icon: '💪', label: '1000 kg séance', check: (h) => h.some(s => getTonnage(s) >= 1000) },
            { id: 'tonnage_5000',    icon: '🦍', label: '5000 kg séance', check: (h) => h.some(s => getTonnage(s) >= 5000) },
            { id: 'early_bird',  icon: '🌅', label: 'Lève-tôt',   check: (h) => h.some(s => { const d = new Date(s.date); return d.getHours() < 7; }) },
            { id: 'night_owl',   icon: '🦉', label: 'Noctambule', check: (h) => h.some(s => { const d = new Date(s.date); return d.getHours() >= 22; }) },
            { id: 'consistency',     icon: '📅', label: '4 sem. consec.', check: (h) => hasConsecutiveWeeks(h, 4) },
            { id: 'variety',         icon: '🎨', label: '5 types séances',check: (h) => new Set(h.map(s => s.sessionName)).size >= 5 },
        ];

        function getTonnage(session) {
            if (!session.exercises) return 0;
            return session.exercises.reduce((t, ex) =>
                t + (ex.series || []).reduce((s, sr) => s + (sr.reps || 0) * (sr.weight || 0), 0), 0);
        }

        function calcStreak(history) {
            if (!history.length) return 0;
            const toKey = d => {
                // Utiliser la date locale (pas UTC) pour éviter les décalages de fuseau
                const dd = new Date(d);
                return dd.getFullYear() + '-' +
                    String(dd.getMonth() + 1).padStart(2, '0') + '-' +
                    String(dd.getDate()).padStart(2, '0');
            };
            const today = new Date(); today.setHours(0,0,0,0);
            const dateSet = new Set(history.map(s => toKey(s.date)));
            const todayKey = toKey(today);

            // Grace period : si pas de séance aujourd'hui mais une hier,
            // on commence le compte depuis hier (streak non brisé avant minuit)
            let check = new Date(today);
            if (!dateSet.has(todayKey)) {
                check.setDate(check.getDate() - 1);
                if (!dateSet.has(toKey(check))) return 0;
            }

            let streak = 0;
            while (dateSet.has(toKey(check))) {
                streak++;
                check.setDate(check.getDate() - 1);
            }
            return streak;
        }

        function hasConsecutiveWeeks(history, n) {
            if (!history.length) return false;
            const weeks = new Set(history.map(s => {
                const d = new Date(s.date);
                const jan = new Date(d.getFullYear(), 0, 1);
                return d.getFullYear() + '-' + Math.ceil(((d - jan) / 86400000 + jan.getDay() + 1) / 7);
            }));
            const arr = [...weeks].sort();
            let consec = 1;
            for (let i = 1; i < arr.length; i++) {
                const [y1, w1] = arr[i-1].split('-').map(Number);
                const [y2, w2] = arr[i].split('-').map(Number);
                if ((y1 === y2 && w2 === w1 + 1) || (y2 === y1 + 1 && w1 >= 52 && w2 === 1)) {
                    consec++;
                    if (consec >= n) return true;
                } else { consec = 1; }
            }
            return false;
        }

        function getEarnedBadges() {
            try {
                return StorageAPI.get('lyftiv_badges', []);
            } catch (e) {
                return [];
            }
        }

        function checkAndAwardBadges() {
            const history = getHistory();
            const earned = new Set(getEarnedBadges());
            const newlyEarned = [];

            BADGE_DEFS.forEach(badge => {
                if (!earned.has(badge.id) && badge.check(history)) {
                    earned.add(badge.id);
                    newlyEarned.push(badge);
                }
            });

            if (newlyEarned.length > 0) {
                StorageAPI.set('lyftiv_badges', [...earned]);
                // Afficher toast pour chaque badge avec délai
                newlyEarned.forEach((badge, i) => {
                    setTimeout(() => showBadgeToast(badge), i * 4000);
                });
            }
            return newlyEarned;
        }

        function showBadgeToast(badge) {
            const toast = document.getElementById('badgeToast');
            document.getElementById('badgeToastIcon').textContent = badge.icon;
            document.getElementById('badgeToastText').textContent = '🏆 ' + badge.label + ' débloqué !';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3500);
        }

        function renderBadgeGrid() {
            const grid = document.getElementById('badgeGrid');
            if (!grid) return;
            const earned = new Set(getEarnedBadges());
            grid.innerHTML = BADGE_DEFS.map(b => {
                const isEarned = earned.has(b.id);
                return `<div class="badge-item ${isEarned ? 'earned' : 'locked'}" title="${b.label}">
                    <div class="badge-icon-wrap">${b.icon}</div>
                    <div class="badge-item-label">${b.label}</div>
                </div>`;
            }).join('');
        }

        /* ════════════════════════════════════════════════════════════
           OBJECTIF HEBDOMADAIRE
           ════════════════════════════════════════════════════════════ */
        function getWeeklyGoal() {
            const v = parseInt(StorageAPI.getRaw('lyftiv_weekly_goal') || '3', 10);
            return (!isNaN(v) && v >= 1 && v <= 7) ? v : 3;
        }

        function setWeeklyGoal(n) {
            n = Math.max(1, Math.min(7, parseInt(n, 10) || 3));
            StorageAPI.setRaw('lyftiv_weekly_goal', String(n));
            renderWeeklyGoal();
        }

        function getSessionsThisWeek(history) {
            if (!Array.isArray(history)) return 0;
            const now = new Date();
            const dayOfWeek = now.getDay() || 7; // 0(dim)->7, 1(lun)->1 ... 6(sam)->6
            const monday = new Date(now);
            monday.setDate(now.getDate() - (dayOfWeek - 1));
            monday.setHours(0, 0, 0, 0);
            // Dédupliquer par jour (plusieurs séances le même jour comptent pour 1)
            const daysWithSession = new Set(
                history
                    .filter(s => s.date && new Date(s.date) >= monday)
                    .map(s => new Date(s.date).toDateString())
            );
            return daysWithSession.size;
        }

        function renderWeeklyGoal() {
            const goal = getWeeklyGoal();
            const history = getHistory();
            const done = getSessionsThisWeek(history);
            const pct = Math.min(100, Math.round((done / goal) * 100));

            // Dots
            const dotsEl = document.getElementById('weeklyGoalDots');
            if (!dotsEl) return;
            dotsEl.innerHTML = '';
            for (let i = 0; i < goal; i++) {
                const dot = document.createElement('div');
                dot.className = 'wg-dot' + (i < done ? ' done' : '');
                dot.textContent = i < done ? '✓' : '';
                dotsEl.appendChild(dot);
            }

            // Texte statut
            const statusEl = document.getElementById('weeklyGoalStatus');
            const subEl = document.getElementById('weeklyGoalSub');
            if (done >= goal) {
                statusEl.textContent = '🎉 Objectif atteint !';
                statusEl.style.color = 'var(--color-success-default)';
                if (subEl) subEl.textContent = 'Bravo — objectif de ' + goal + ' séances/semaine respecté.';
            } else {
                const remaining = goal - done;
                statusEl.textContent = done + ' / ' + goal + ' séances cette semaine';
                statusEl.style.color = 'var(--color-text-header)';
                if (subEl) {
                    subEl.textContent = remaining === 1
                        ? "Plus qu’1 séance pour atteindre ton objectif — utilise + / − pour l’ajuster"
                        : remaining + " séances restantes · utilise + / − pour ajuster l’objectif";
                }
            }

            document.getElementById('wgCountDisplay').textContent = goal + ' / sem.';
            const fill = document.getElementById('weeklyGoalBarFill');
            if (fill) fill.style.width = pct + '%';
        }

        function initWeeklyGoal() {
            document.getElementById('wgIncBtn').addEventListener('click', () => setWeeklyGoal(getWeeklyGoal() + 1));
            document.getElementById('wgDecBtn').addEventListener('click', () => setWeeklyGoal(getWeeklyGoal() - 1));
        }

        /* ════════════════════════════════════════════════════════════
           RÉSUMÉ PARTAGEABLE POST-SÉANCE
           ════════════════════════════════════════════════════════════ */
        function showSessionSummary(workoutData, newBadges) {
            const modal = document.getElementById('sessionSummaryModal');
            if (!modal) return;

            const history = getHistory();
            const streak = calcStreak(history);
            const tonnage = getTonnage(workoutData);
            const exerciceCount = workoutData.exercises ? workoutData.exercises.length : 0;
            const seriesCount = workoutData.exercises ? workoutData.exercises.reduce((t, e) => t + (e.series ? e.series.length : 0), 0) : 0;

            // Sous-titre
            const now = new Date();
            document.getElementById('summarySubtitle').textContent =
                workoutData.sessionName + ' · ' + now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

            // Stats grid
            const grid = document.getElementById('summaryStatsGrid');
            grid.innerHTML = [
                { value: workoutData.duration || '—', label: '⏱ Durée' },
                { value: seriesCount + ' séries', label: '🔁 Volume' },
                { value: Math.round(tonnage) + ' kg', label: '⚡ Tonnage' },
                { value: streak > 0 ? '🔥 ' + streak + 'j' : '#' + history.length, label: streak > 0 ? 'Streak' : 'Séance n°' },
            ].map(s => `<div class="summary-stat">
                <div class="summary-stat-value">${s.value}</div>
                <div class="summary-stat-label">${s.label}</div>
            </div>`).join('');

            // Badges
            const badgeRow = document.getElementById('summaryNewBadges');
            if (newBadges && newBadges.length > 0) {
                badgeRow.style.display = 'flex';
                badgeRow.innerHTML = newBadges.map(b =>
                    `<span class="summary-new-badge">${b.icon} ${b.label}</span>`
                ).join('');
            } else {
                badgeRow.style.display = 'none';
            }

            modal.classList.add('show');

            // Activer simultanément le mode REVIEW (overlay amélioré)
            _showReviewMode(workoutData, newBadges, history, tonnage, seriesCount, streak);
        }

        /** Mode REVIEW — overlay "Lyftiv Score" full-screen */
        function _showReviewMode(workoutData, newBadges, history, tonnage, seriesCount, streak) {
            // Lyftiv Score v2 — objet complet {score, stimulus, recovery, consistency, league}
            const result = AppMode.computeLyftivScore(workoutData, history);
            const score  = result.score;

            // Sous-titre + ligue
            const now = new Date();
            const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            document.getElementById('reviewSubtitle').textContent =
                workoutData.sessionName + ' · ' + dateStr;

            // Titre avec ligue dynamique
            const titleEl = document.getElementById('reviewTitle');
            if (titleEl) {
                titleEl.innerHTML = `Séance terminée <span style="font-size:0.6em;vertical-align:middle;
                    background:${result.league.color}22;color:${result.league.color};
                    border:1px solid ${result.league.color}44;border-radius:12px;
                    padding:2px 10px;font-weight:900;letter-spacing:0.08em;">
                    ${result.league.icon} ${result.league.name}</span>`;
            }

            // Score ring — couleur calée sur la ligue
            const arc      = document.getElementById('reviewScoreArc');
            const scoreVal = document.getElementById('reviewScoreValue');
            arc.style.stroke      = result.league.color;
            scoreVal.style.color  = result.league.color;
            scoreVal.textContent  = score;

            // Stats séance (3 métriques clés)
            const stats = [
                { value: workoutData.duration || '—', label: 'Durée' },
                { value: seriesCount,                 label: 'Séries' },
                { value: Math.round(tonnage) + ' kg', label: 'Tonnage' },
            ];
            document.getElementById('reviewStatsGrid').innerHTML = stats.map(s =>
                `<div class="review-stat">
                    <div class="review-stat-value">${s.value}</div>
                    <div class="review-stat-label">${s.label}</div>
                </div>`
            ).join('');

            // Breakdown Lyftiv Score — la vraie innovation
            _renderScoreBreakdown(result);

            // Badges
            const badgesRow = document.getElementById('reviewBadgesRow');
            if (newBadges && newBadges.length > 0) {
                badgesRow.innerHTML = newBadges.map(b =>
                    `<span class="review-badge">${b.icon} ${b.label}</span>`
                ).join('');
                badgesRow.style.display = 'flex';
            } else {
                badgesRow.style.display = 'none';
            }

            AppMode.set('review');

            // ── Session Closure Ritual ────────────────────────────────────
            // 1. Vibration d'entrée + son discret de victoire
            if (navigator.vibrate) navigator.vibrate([80, 40, 40]);
            // Son : accord montant discret (optionnel — respecte les préférences silencieux)
            try {
                const ac = new (window.AudioContext || window.webkitAudioContext)();
                // Accord do-mi-sol : sentiment d'accomplissement, pas de fanfare
                [[261.6, 0], [329.6, 0.12], [392, 0.24]].forEach(([freq, delay]) => {
                    const osc  = ac.createOscillator();
                    const gain = ac.createGain();
                    osc.connect(gain); gain.connect(ac.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
                    gain.gain.setValueAtTime(0, ac.currentTime + delay);
                    gain.gain.linearRampToValueAtTime(0.12, ac.currentTime + delay + 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.7);
                    osc.start(ac.currentTime + delay);
                    osc.stop(ac.currentTime + delay + 0.8);
                });
            } catch (_) { /* silencieux si AudioContext non disponible */ }

            // 2. Score count-up animé : 0 → score final
            const scoreEl = document.getElementById('reviewScoreValue');
            if (scoreEl) {
                scoreEl.style.animation = 'none';
                scoreEl.textContent = '0';
                let current = 0;
                const target = score;
                const step   = Math.ceil(target / 28); // ~28 frames
                const tick   = setInterval(() => {
                    current = Math.min(current + step, target);
                    scoreEl.textContent = current;
                    if (current >= target) clearInterval(tick);
                }, 40);
                // Relancer l'animation scoreRise
                requestAnimationFrame(() => {
                    scoreEl.style.animation = '';
                });
            }

            // 3. Anneau SVG — delayed pour laisser le count-up démarrer
            setTimeout(() => {
                const arc = document.getElementById('reviewScoreArc');
                if (arc) arc.setAttribute('stroke-dasharray', score + ' 100');
            }, 200);

            // 4. Checklist séquentielle — fermeture psychologique complète
            _showReviewChecklist(workoutData, tonnage);
        }

        /** Affiche le breakdown Stimulus / Recovery / Consistency sous le ring */
        function _renderScoreBreakdown(result) {
            // Insérer le breakdown dans l'overlay, juste après reviewStatsGrid
            let container = document.getElementById('scoreBreakdown');
            if (!container) {
                container = document.createElement('div');
                container.id = 'scoreBreakdown';
                container.className = 'score-breakdown';
                const statsGrid = document.getElementById('reviewStatsGrid');
                if (statsGrid && statsGrid.parentNode) {
                    statsGrid.parentNode.insertBefore(container, statsGrid.nextSibling);
                }
            }

            const dims = [
                {
                    key: 'stimulus', label: 'Stimulus',
                    value: result.stimulus,
                    color: 'hsl(210, 80%, 58%)',
                    tip: 'Charge mécanique vs ton historique'
                },
                {
                    key: 'recovery', label: 'Recovery',
                    value: result.recovery,
                    color: result.recovery >= 70 ? 'hsl(145, 62%, 48%)' :
                           result.recovery >= 40 ? 'hsl(35, 85%, 52%)' : 'hsl(2, 72%, 55%)',
                    tip: 'Repos + charge cumulative 7j'
                },
                {
                    key: 'consistency', label: 'Consistency',
                    value: result.consistency,
                    color: 'hsl(280, 60%, 58%)',
                    tip: 'Régularité 30 jours (séances + repos)'
                }
            ];

            container.innerHTML = dims.map(d => `
                <div class="score-dim" title="${d.tip}">
                    <span class="score-dim-label">${d.label}</span>
                    <div class="score-dim-bar-track">
                        <div class="score-dim-bar-fill"
                             data-width="${d.value}"
                             style="background:${d.color};"></div>
                    </div>
                    <span class="score-dim-value">${d.value}</span>
                </div>
            `).join('');

            // Lancer les animations de barre après un tick (CSS transition)
            requestAnimationFrame(() => {
                container.querySelectorAll('.score-dim-bar-fill').forEach(bar => {
                    bar.style.width = bar.dataset.width + '%';
                });
            });
        }

        function _showReviewChecklist(workoutData, tonnage) {
            // Injecter la checklist dans l'overlay si pas déjà présente
            let checklist = document.getElementById('reviewChecklist');
            if (!checklist) {
                checklist = document.createElement('div');
                checklist.id = 'reviewChecklist';
                checklist.className = 'review-checklist';
                // Insérer avant les boutons d'action
                const actions = document.querySelector('.review-actions');
                if (actions) actions.parentNode.insertBefore(checklist, actions);
            }
            checklist.innerHTML = '';

            const items = [
                '✔ Séance enregistrée',
                '✔ Score mis à jour',
                '✔ Historique synchronisé',
            ];
            if (tonnage > 0) items.push('✔ Tonnage : ' + Math.round(tonnage) + ' kg cumulés');

            items.forEach((text, i) => {
                const item = document.createElement('div');
                item.className = 'review-check-item';
                item.innerHTML = `<span class="review-check-icon">${text.charAt(0) === '✔' ? '✔' : '•'}</span><span>${text.slice(2)}</span>`;
                checklist.appendChild(item);
                // Apparition décalée — fermeture narrative
                setTimeout(() => item.classList.add('visible'), 600 + i * 280);
            });
        }

        function buildShareText(workoutData) {
            if (!workoutData) return '';
            const history = getHistory();
            const streak = calcStreak(history);
            const tonnage = Math.round(getTonnage(workoutData));
            const exs = workoutData.exercises || [];
            const seriesCount = exs.reduce((t, e) => t + ((e.series || []).length), 0);
            const sessionName = workoutData.sessionName || 'Séance';
            const lines = [
                '💪 Séance Lyftiv terminée !',
                '━━━━━━━━━━━━━━━━━━━━',
                '📋 ' + sessionName,
                '⏱ Durée : ' + (workoutData.duration || '—'),
                '🔁 Séries : ' + seriesCount,
                '⚡ Tonnage : ' + tonnage + ' kg',
            ];
            if (streak > 1) lines.push('🔥 Streak : ' + streak + ' jours');
            lines.push('');
            lines.push('🏋 Tracké avec Lyftiv — lyftiv.app');
            return lines.join('\n');
        }

        function initSessionSummary() {
            document.getElementById('summaryCloseBtn').addEventListener('click', () => {
                ModalManager.close(document.getElementById('sessionSummaryModal'));
            });

            document.getElementById('summaryPrintBtn').addEventListener('click', () => {
                ModalManager.close(document.getElementById('sessionSummaryModal'));
                setTimeout(() => window.print(), 300);
            });

            document.getElementById('summaryShareBtn').addEventListener('click', () => {
                const history = getHistory();
                const last = history[history.length - 1];
                if (!last) return;
                const text = buildShareText(last);
                if (navigator.share) {
                    navigator.share({ text }).catch(() => {});
                } else {
                    navigator.clipboard.writeText(text).then(() => {
                        showNotification('📋 Résumé copié dans le presse-papiers !', 'success', 3000);
                    });
                }
            });

            // Clic fond pour fermer
            document.getElementById('sessionSummaryModal').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
            });
        }

        /* ════════════════════════════════════════════════════════════
           INIT GLOBAL DES NOUVELLES FONCTIONNALITÉS
           ════════════════════════════════════════════════════════════ */

        function showRestDurationPicker() {
            // Créer ou afficher le picker inline dans l'overlay
            const overlay = document.getElementById('restTimerOverlay');
            const existing = document.getElementById('restDurationPicker');
            if (existing) { existing.remove(); return; }

            const picker = document.createElement('div');
            picker.id = 'restDurationPicker';
            picker.style.cssText = 'position:fixed;bottom:calc(var(--nav-height) + env(safe-area-inset-bottom,0px) + 64px);left:50%;transform:translateX(-50%);background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large);padding:12px 16px;box-shadow:0 8px 24px var(--shadow-md);z-index:var(--z-dropdown);display:flex;flex-direction:column;gap:8px;align-items:center;';

            const label = document.createElement('div');
            label.style.cssText = 'font-size:0.78rem;color:var(--color-text-subheader);font-weight:600;margin-bottom:4px;';
            label.textContent = 'Durée du repos';
            picker.appendChild(label);

            const btnsRow = document.createElement('div');
            btnsRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;';
            [30, 60, 90, 120, 180, 240].forEach(sec => {
                const btn = document.createElement('button');
                btn.className = 'rest-duration-btn' + (sec === restTimerState.duration ? ' active' : '');
                btn.textContent = sec < 60 ? sec + 's' : (sec / 60) + 'min';
                btn.addEventListener('click', () => {
                    restTimerState.duration = sec;
                    StorageAPI.setRaw('restTimerDuration', sec);
                    picker.remove();
                    startRestTimer(sec);
                });
                btnsRow.appendChild(btn);
            });
            picker.appendChild(btnsRow);

            document.body.appendChild(picker);
            // Fermer en cliquant ailleurs
            setTimeout(() => {
                document.addEventListener('click', function closePicker(e) {
                    if (!picker.contains(e.target) && e.target.id !== 'bottomRestTimerBtn') {
                        picker.remove();
                        document.removeEventListener('click', closePicker);
                    }
                });
            }, 100);
        }

        /* ============================================================
           MOTEUR WOD GLOBAL (EMOM / AMRAP) — rAF zéro freeze 🚀
        ============================================================ */
        const WodEngine = {
            mode: '',
            active: false,
            rafId: null,
            endTime: 0,
            roundDuration: 60,
            roundEndTime: 0,
            roundsCompleted: 0,
            selectedExIds: [],

            init() {
                document.getElementById('globalEmomBtn')?.addEventListener('click', () => this.openSetup('EMOM'));
                document.getElementById('globalAmrapBtn')?.addEventListener('click', () => this.openSetup('AMRAP'));
                document.getElementById('closeWodModalBtn')?.addEventListener('click', () => this.stop());
                document.getElementById('startWodBtn')?.addEventListener('click', () => this.start());
                document.getElementById('logWodRoundBtn')?.addEventListener('click', () => this.logRound());
                // Circuit modal
                document.getElementById('globalCircuitBtn')?.addEventListener('click', () => openCircuitModal());
                document.getElementById('closeCircuitModalBtn')?.addEventListener('click', () => ModalManager.close(document.getElementById('globalCircuitModal')));
                document.getElementById('confirmCircuitBtn')?.addEventListener('click', () => {
                    const checked = Array.from(document.querySelectorAll('.circuit-ex-cb:checked')).map(cb => parseInt(cb.value));
                    buildCircuit(checked); // buildCircuit gère maintenant la fermeture du modal
                });
            },

            openSetup(mode) {
                this.mode = mode;
                document.getElementById('wodModalTitle').textContent = `Configuration ${mode}`;
                const exList = document.getElementById('wodExerciseSelection');
                exList.innerHTML = '';
                const currentSession = state.sessions[state.currentSessionIndex];
                if (!currentSession?.exercises?.length) {
                    exList.innerHTML = '<p style="color:var(--color-danger-default);">Ajoutez d\'abord des exercices.</p>';
                    document.getElementById('startWodBtn').disabled = true;
                } else {
                    document.getElementById('startWodBtn').disabled = false;
                    currentSession.exercises.forEach((ex, idx) => {
                        exList.innerHTML += `<label style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-base);cursor:pointer;">
                            <input type="checkbox" value="${idx}" class="wod-ex-cb" style="width:22px;height:22px;accent-color:var(--color-primary-default);">
                            <span style="font-weight:700;font-size:1rem;color:var(--color-text-header);">${escapeHTML(ex.name)}</span>
                        </label>`;
                    });
                }
                if (mode === 'EMOM') {
                    document.getElementById('wodSetupTimeLabel').textContent = "Durée d'un round (sec) :";
                    document.getElementById('wodSetupTimeInput').value = 60;
                    document.getElementById('wodSetupRoundsLabel').style.display = 'flex';
                } else {
                    document.getElementById('wodSetupTimeLabel').textContent = 'Durée totale (min) :';
                    document.getElementById('wodSetupTimeInput').value = 10;
                    document.getElementById('wodSetupRoundsLabel').style.display = 'none';
                }
                document.getElementById('wodSetupPhase').classList.remove('hidden');
                document.getElementById('wodExecutionPhase').classList.add('hidden');
                const modal = document.getElementById('globalWodModal');
                ModalManager.open(modal, modal.querySelector('button'));
            },

            start() {
                const checkboxes = document.querySelectorAll('.wod-ex-cb:checked');
                if (!checkboxes.length) { showNotification("Cochez au moins un exercice.", "error"); return; }
                this.selectedExIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
                const timeInput = parseInt(document.getElementById('wodSetupTimeInput').value) || (this.mode === 'EMOM' ? 60 : 10);
                this.roundsCompleted = 0;
                const now = Date.now();
                if (this.mode === 'EMOM') {
                    const totalRounds = parseInt(document.getElementById('wodSetupRoundsInput').value) || 10;
                    this.roundDuration = timeInput;
                    this.endTime = now + (this.roundDuration * totalRounds * 1000);
                    this.roundEndTime = now + (this.roundDuration * 1000);
                } else {
                    this.endTime = now + (timeInput * 60 * 1000);
                }
                this.buildExecutionUI();
                document.getElementById('wodSetupPhase').classList.add('hidden');
                document.getElementById('wodExecutionPhase').classList.remove('hidden');
                this.active = true;
                this.tick();
            },

            buildExecutionUI() {
                const session = state.sessions[state.currentSessionIndex];
                const container = document.getElementById('wodActiveExercises');
                container.innerHTML = '';
                this.selectedExIds.forEach(idx => {
                    const ex = session.exercises[idx];
                    container.innerHTML += `<div style="background:var(--color-surface-default);border:1.5px solid var(--color-border-default);border-radius:var(--radius-base);padding:16px;">
                        <div style="font-weight:800;color:var(--color-text-header);margin-bottom:12px;font-size:1.05rem;">${escapeHTML(ex.name)}</div>
                        <div style="display:flex;gap:12px;">
                            <input type="number" class="wod-w-input" data-idx="${idx}" placeholder="Poids (kg)" inputmode="decimal"
                                style="flex:1;text-align:center;font-weight:800;font-size:1.2rem;height:52px;border-radius:12px;border:1px solid var(--color-border-default);background:var(--color-surface-input);color:var(--color-text-header);">
                            <input type="number" class="wod-r-input" data-idx="${idx}" placeholder="Reps" inputmode="decimal"
                                style="flex:1;text-align:center;font-weight:800;font-size:1.2rem;height:52px;border-radius:12px;border:1px solid var(--color-border-default);background:var(--color-surface-input);color:var(--color-text-header);">
                        </div>
                    </div>`;
                });
                document.getElementById('wodRoundDisplay').textContent = 'Round 1';
            },

            tick() {
                if (!this.active) return;
                const now = Date.now();
                let remaining = this.endTime - now;
                if (remaining <= 0) {
                    this.updateClock(0);
                    beep(880, 0.8, 0.3); setTimeout(() => beep(880, 0.8, 0.3), 300);
                    if (navigator.vibrate) navigator.vibrate([200,100,200]);
                    showNotification('⏱️ Travail terminé ! Bon boulot.', 'success', 5000);
                    this.stop();
                    return;
                }
                if (this.mode === 'EMOM') {
                    let roundRemaining = this.roundEndTime - now;
                    if (roundRemaining <= 0) {
                        beep(660, 0.3, 0.25);
                        if (navigator.vibrate) navigator.vibrate(150);
                        this.roundEndTime += (this.roundDuration * 1000);
                        roundRemaining = this.roundEndTime - now;
                        showNotification('🔥 Nouveau Round !', 'info', 1500);
                    }
                    this.updateClock(roundRemaining);
                } else {
                    this.updateClock(remaining);
                }
                this.rafId = requestAnimationFrame(() => this.tick());
            },

            updateClock(ms) {
                const totalSec = Math.ceil(ms / 1000);
                const m = Math.floor(totalSec / 60);
                const s = totalSec % 60;
                const el = document.getElementById('wodTimerDisplay');
                if (el) el.textContent = `${m}:${String(s).padStart(2,'0')}`;
            },

            logRound() {
                const session = state.sessions[state.currentSessionIndex];
                let loggedSomething = false;
                this.selectedExIds.forEach(idx => {
                    const wInput = document.querySelector(`.wod-w-input[data-idx="${idx}"]`);
                    const rInput = document.querySelector(`.wod-r-input[data-idx="${idx}"]`);
                    if (wInput && rInput && (wInput.value !== '' || rInput.value !== '')) {
                        if (!Array.isArray(session.exercises[idx].series)) session.exercises[idx].series = [];
                        session.exercises[idx].series = session.exercises[idx].series.filter(s => s.weight !== '' || s.reps !== '');
                        session.exercises[idx].series.push({
                            weight: wInput.value || '0',
                            reps: rInput.value || '0',
                            completed: true,
                            timestamp: Date.now()
                        });
                        loggedSomething = true;
                    }
                });
                if (loggedSomething) {
                    this.roundsCompleted++;
                    document.getElementById('wodRoundDisplay').textContent = `Round ${this.roundsCompleted + 1}`;
                    const btn = document.getElementById('logWodRoundBtn');
                    const orig = btn.innerHTML;
                    btn.innerHTML = '✔ Série ajoutée !';
                    btn.style.transform = 'scale(0.96)';
                    setTimeout(() => { btn.innerHTML = orig; btn.style.transform = 'none'; }, 800);
                    saveCurrentState(true, true); // skipDomSync=true : préserve les séries WOD injectées
                } else {
                    showNotification("Remplissez Poids ou Reps pour valider.", "error");
                }
            },

            stop() {
                this.active = false;
                if (this.rafId) cancelAnimationFrame(this.rafId);
                ModalManager.close(document.getElementById('globalWodModal'));
                saveCurrentState(true);
                if (typeof RenderScheduler !== 'undefined') RenderScheduler.scheduleTotals();
                createTable();
                updateAllTotals();
            }
        };

                function initNewFeatures() {
            initRestTimerUI();
            initWeeklyGoal();
            initSessionSummary();
            initModeSystem();
        }

        /** Initialise le système de modes EXECUTE / REVIEW / PLAN */
        function initModeSystem() {

            // ── REVIEW — boutons de l'overlay ────────────────────────────
            document.getElementById('reviewCloseBtn').addEventListener('click', () => {
                AppMode.clear();
            });

            document.getElementById('reviewPlanBtn').addEventListener('click', () => {
                AppMode.clear();
                setTimeout(() => _openPlan(), 50);
            });

            document.getElementById('reviewShareBtn').addEventListener('click', () => {
                // Utiliser buildShareText existant — récupérer le dernier workoutData
                const history = getHistory();
                if (history.length === 0) return;
                const last = history[history.length - 1];
                const text = buildShareText(last);
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() =>
                        showNotification('📋 Résumé copié !', 'success', 2500)
                    );
                }
            });

            // ── PLAN — bouton flottant + edge tab ────────────────────────────
            document.getElementById('planTriggerBtn').addEventListener('click', _openPlan);
            document.getElementById('planEdgeTab').addEventListener('click', _openPlan);

            // Pastille ● PLAN dans la topbar — cliquable pour ouvrir le panel
            const modeIndicator = document.getElementById('appModeIndicator');
            if (modeIndicator) {
                modeIndicator.setAttribute('role', 'button');
                modeIndicator.setAttribute('title', 'Ouvrir le panneau Plan');
                modeIndicator.setAttribute('tabindex', '0');
                modeIndicator.addEventListener('click', _openPlan);
                modeIndicator.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openPlan(); }
                });
            }
            document.getElementById('planBackdrop').addEventListener('click', _closePlan);
            document.getElementById('planCloseBtn').addEventListener('click', _closePlan);

            // Actions rapides du panneau PLAN
            document.getElementById('planViewHistory').addEventListener('click', () => {
                _closePlan();
                setTimeout(() => document.getElementById('viewHistoryBtn')?.click(), 200);
            });
            document.getElementById('planViewCalculator').addEventListener('click', () => {
                _closePlan();
                setTimeout(() => document.getElementById('plateCalculatorBtn')?.click(), 200);
            });
            document.getElementById('planNextSession').addEventListener('click', () => {
                _closePlan();
                setTimeout(() => document.getElementById('nextSessionBtn')?.click(), 200);
            });
            document.getElementById('planNewSession').addEventListener('click', () => {
                _closePlan();
                setTimeout(() => document.getElementById('createNewSessionTypeBtn')?.click(), 200);
            });
        }

        function _openPlan() {
            // Peupler la liste de séances
            _populatePlanSessionList();
            // Widget Discipline Engine compact
            DisciplineEngine.renderWidget('planDisciplineWidget', getHistory());
            AppMode.set('plan');
            document.getElementById('planPanel').focus?.();
        }

        function _closePlan() {
            // Revenir au mode précédent (execute si séance en cours, sinon neutre)
            if (state.workoutStartTime) AppMode.set('execute');
            else AppMode.clear();
        }

        // ── SWIPE GESTURE — Panneau Plan (droite ↔ gauche) ──────────────────
        // Ouvre en swipant depuis le bord droit (zone 80px), ferme en swipant droite
        // touch-action: pan-y sur #planPanel + overscroll-behavior-x: none sur body
        // → iOS Safari ne déclenche PAS le retour arrière natif
        (function initPlanSwipe() {
            let _sx = 0, _sy = 0, _dragging = false;

            // ── TOUCH (mobile) ──────────────────────────────────────────
            document.addEventListener('touchstart', e => {
                _sx = e.changedTouches[0].clientX;
                _sy = e.changedTouches[0].clientY;
            }, { passive: true });

            document.addEventListener('touchend', e => {
                const ex = e.changedTouches[0].clientX;
                const ey = e.changedTouches[0].clientY;
                const dx = _sx - ex;
                const dy = _sy - ey;
                if (Math.abs(dx) <= Math.abs(dy)) return;

                const isOpen = document.body.dataset.mode === 'plan';
                if (dx > 50 && !isOpen
                    && document.body.dataset.mode === 'execute'
                    && _sx > window.innerWidth - 80) {
                    _openPlan();
                }
                if (dx < -50 && isOpen) {
                    _closePlan();
                }
            }, { passive: true });

            // ── MOUSE (desktop) — drag depuis bord droit ou panneau ouvert ──
            document.addEventListener('mousedown', e => {
                _sx = e.clientX;
                _sy = e.clientY;
                _dragging = true;
            });

            document.addEventListener('mousemove', e => {
                if (!_dragging) return;
                // Éviter les drags accidentels (seulement si déplacement > 5px)
            });

            document.addEventListener('mouseup', e => {
                if (!_dragging) return;
                _dragging = false;
                const ex = e.clientX;
                const ey = e.clientY;
                const dx = _sx - ex;   // > 0 = vers gauche
                const dy = _sy - ey;

                // Mouvement principalement horizontal ?
                if (Math.abs(dx) <= Math.abs(dy)) return;
                // Seuil plus élevé sur desktop (évite les clics accidentels)
                if (Math.abs(dx) < 60) return;

                const isOpen = document.body.dataset.mode === 'plan';

                // Drag vers la gauche depuis bord droit 120px — mode execute
                if (dx > 60 && !isOpen
                    && document.body.dataset.mode === 'execute'
                    && _sx > window.innerWidth - 120) {
                    _openPlan();
                }

                // Drag vers la droite quand panneau ouvert
                if (dx < -60 && isOpen) {
                    _closePlan();
                }
            });

            // Annuler si on sort de la fenêtre
            document.addEventListener('mouseleave', () => { _dragging = false; });
        })();

        function _populatePlanSessionList() {
            const list = document.getElementById('planSessionList');
            if (!list) return;
            list.innerHTML = '';
            (state.sessions || []).forEach((sess, idx) => {
                const btn = document.createElement('button');
                btn.className = 'plan-session-btn' + (idx === state.currentSessionIndex ? ' active' : '');
                btn.textContent = sess.name || ('Séance ' + (idx + 1));
                btn.setAttribute('aria-pressed', idx === state.currentSessionIndex ? 'true' : 'false');
                btn.addEventListener('click', () => {
                    Actions.switchSession(idx);
                    dom.sessionSelect.value = idx;
                    _closePlan();
                    showNotification('Séance ' + (sess.name || (idx + 1)) + ' chargée.', 'info', 2000);
                });
                list.appendChild(btn);
            });
        }

        // ── RÉSUMÉ RAPIDE ─────────────────────────────────────────────────
        function renderQuickSummary() {
            const history  = getHistory().filter(s => !s.isAutoSave);
            const goal     = getWeeklyGoal();
            const weekDone = getSessionsThisWeek(history);
            const streak   = calcStreak(history);
            const total    = history.length;

            const elWeek   = document.getElementById('dqsWeekSessions');
            const elPlural = document.getElementById('dqsWeekPlural');
            const elStreak = document.getElementById('dqsStreak');
            const elGoal   = document.getElementById('dqsGoalRatio');
            const elTotal  = document.getElementById('dqsTotal');

            if (elWeek) {
                elWeek.textContent = weekDone;
                elWeek.className = 'dqs-value' + (weekDone >= goal ? ' highlight' : weekDone === 0 ? ' warning' : '');
            }
            if (elPlural) elPlural.textContent = weekDone > 1 ? 's' : '';
            if (elStreak) {
                elStreak.textContent = streak;
                elStreak.className = 'dqs-value' + (streak >= 3 ? ' highlight' : streak === 0 ? ' warning' : '');
            }
            if (elGoal) {
                elGoal.textContent = weekDone + '/' + goal;
                elGoal.className = 'dqs-value' + (weekDone >= goal ? ' highlight' : '');
            }
            if (elTotal) elTotal.textContent = total;

            // Salutation dynamique
            const greeting = document.getElementById('dashGreeting');
            const profile  = StorageAPI.get('lyftiv_profile');
            const name     = profile?.name || '';
            const hour     = new Date().getHours();
            const salut    = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
            if (greeting) greeting.textContent = name ? salut + ', ' + name + ' 👋' : salut + " ! Prêt à t'entraîner ?";
        }

        // ── BADGES DANS LE PROFIL ─────────────────────────────────────────
        function renderBadgesInProfile() {
            const container = document.getElementById('badgeGridProfile');
            const emptyMsg  = document.getElementById('badgeGridProfileEmpty');
            if (!container) return;
            const history = getHistory();
            const earned  = getEarnedBadges(history);
            container.innerHTML = '';
            if (earned.length === 0) {
                if (emptyMsg) emptyMsg.style.display = 'block';
                return;
            }
            if (emptyMsg) emptyMsg.style.display = 'none';
            earned.forEach(b => {
                const el = document.createElement('div');
                el.className = 'badge-item earned';
                el.innerHTML = '<div class="badge-icon">' + b.icon + '</div><div class="badge-label">' + b.label + '</div>';
                container.appendChild(el);
            });
        }

        function initDashboard() {
            populateDashChartExercise();
            renderDashChart('1rm');
            renderDashStats();
            renderDashDeload();
            renderDashSuppl('');
            renderHeatmap();
            renderWeeklyGoal();
            renderBadgeGrid();
            renderPeriodisationWidget();
            renderQuickSummary();
            renderBadgesInProfile();

            // Discipline Engine — Execution Rate widget
            const history = getHistory();
            DisciplineEngine.renderWidget('disciplineWidget', history);

            // Next Action Trigger + Score Authority
            _updateNextAction();
            _applyScoreAura();
        }

        /**
         * NEXT ACTION TRIGGER
         * Identifie la prochaine séance logique et peuple la carte de déclenchement.
         * Logique : dernière séance enregistrée → séance suivante dans le plan cyclique.
         * Fallback : première séance si aucun historique.
         */
        function _updateNextAction() {
            const naName     = document.getElementById('naSessionName');
            const naMeta     = document.getElementById('naSessionMeta');
            const naRecovery = document.getElementById('naRecovery');
            const naBtn      = document.getElementById('naExecuteBtn');
            if (!naName || !naBtn) return;

            const history = getHistory().filter(s => !s.isAutoSave);
            const sessions = state.sessions;
            if (!sessions || sessions.length === 0) {
                naName.textContent = 'Crée ta première séance';
                naMeta.textContent = '';
                naRecovery.textContent = '';
                naBtn.addEventListener('click', () => {
                    dashboard.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    sessionStorage.setItem('dashboardShown', 'true');
                });
                return;
            }

            // Trouver la prochaine séance logique
            let nextIdx = 0;
            if (history.length > 0) {
                const lastSessionName = history
                    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
                    ?.sessionName || '';
                const lastIdx = sessions.findIndex(s =>
                    s.name.toLowerCase() === lastSessionName.toLowerCase()
                );
                nextIdx = lastIdx >= 0 ? (lastIdx + 1) % sessions.length : 0;
            }
            const nextSession = sessions[nextIdx];

            // Affichage
            naName.textContent = nextSession.name;
            naMeta.textContent = nextSession.exercises.length + ' exercices';

            // Récupération estimée
            const recovResult = history.length > 0
                ? AppMode.computeRecoveryScore({ sessionName: nextSession.name }, history)
                : 80;
            const recovScore = typeof recovResult === 'number' ? recovResult : 80;
            let recovLabel, recovClass;
            if (recovScore >= 70)      { recovLabel = '● Recovery optimal';  recovClass = 'optimal'; }
            else if (recovScore >= 45) { recovLabel = '● Recovery modéré';   recovClass = ''; }
            else                       { recovLabel = '● Recovery faible — repos recommandé'; recovClass = 'low'; }
            naRecovery.textContent = recovLabel;
            naRecovery.className   = 'next-action-recovery ' + recovClass;

            // Listener CTA — démarrage direct
            naBtn.onclick = () => startSessionFromDashboard(nextIdx);
        }

        /**
         * SCORE AUTHORITY — applyScoreAura()
         * Calcule le Lyftiv Score courant et l'applique en identité visuelle :
         * body[data-league] pilote les CSS variables globales.
         */
        function _applyScoreAura() {
            const history = getHistory();
            if (history.length === 0) return;

            const lastSession = history
                .filter(s => !s.isAutoSave)
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            if (!lastSession) return;

            const result = AppMode.computeLyftivScore(lastSession, history);
            const score  = result.score || result; // compat v1/v2
            const league = result.league?.name || (
                score >= 90 ? 'TITAN' :
                score >= 75 ? 'ÉLITE' :
                score >= 60 ? 'PERFORMER' :
                score >= 40 ? 'SILVER' : 'BRONZE'
            );

            document.body.dataset.league = league;
            document.body.dataset.lyftivScore = score;
        }

        /* ============================================================
           WIDGET PÉRIODISATION — Cycle Force / Hypertrophie / Deload
        ============================================================ */
        function renderPeriodisationWidget() {
            const container = document.getElementById('dashDeloadWidget');
            if (!container) return;

            const history = getHistory().sort((a, b) => new Date(a.date) - new Date(b.date));
            if (history.length < 3) return; // pas assez de données

            // Lire ou initialiser le cycle
            let cycle = StorageAPI.get('lyftiv_cycle');
            if (!cycle) {
                cycle = { phase: 'hypertrophie', weekStart: Date.now(), week: 1, totalWeeks: 8 };
                StorageAPI.set('lyftiv_cycle', cycle);
            }

            // Calculer la semaine courante du cycle
            const weeksPassed = Math.floor((Date.now() - cycle.weekStart) / (7 * 24 * 3600 * 1000));
            const currentWeek = Math.min(cycle.week + weeksPassed, cycle.totalWeeks);

            // Déterminer la phase automatique selon la semaine
            let autoPhase = cycle.phase;
            // Cycle typique 8 semaines : S1-3 Force, S4-6 Hypertrophie, S7-8 Deload
            if (cycle.totalWeeks === 8) {
                if (currentWeek <= 3) autoPhase = 'force';
                else if (currentWeek <= 6) autoPhase = 'hypertrophie';
                else autoPhase = 'deload';
            }

            const phaseConfig = {
                force: { label: '💪 Force', emoji: '💪', desc: 'Charges lourdes · 3–5 reps · 85–95% 1RM · Repos 3–5 min', color: 'hsl(220,60%,50%)' },
                hypertrophie: { label: '📈 Hypertrophie', emoji: '📈', desc: 'Volume modéré · 8–12 reps · 65–80% 1RM · Repos 60–120s', color: 'hsl(140,50%,42%)' },
                deload: { label: '🔄 Deload', emoji: '🔄', desc: 'Récupération active · −40% volume & intensité · Repos prioritaire', color: 'hsl(35,85%,52%)' }
            };

            const pc = phaseConfig[autoPhase];
            const weeksLeft = cycle.totalWeeks - currentWeek;

            // Insérer le widget périodisation APRÈS le widget deload existant
            const periodEl = document.getElementById('dashPeriodWidget');
            if (periodEl) periodEl.remove();

            const widget = document.createElement('div');
            widget.id = 'dashPeriodWidget';
            widget.className = 'cycle-widget';
            widget.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--spacing-sm);">
                    <h3 style="font-size:1rem;font-weight:800;color:var(--color-text-header);margin:0;">🗓 Cycle d'entraînement</h3>
                    <span style="font-size:0.78rem;color:var(--color-text-subheader);">Semaine ${currentWeek}/${cycle.totalWeeks}</span>
                </div>
                <div class="cycle-phases">
                    <div class="cycle-phase force ${autoPhase==='force'?'active':''}" data-cycle-phase="force">
                        <div>💪</div><div>Force</div><div style="font-size:0.65rem;opacity:0.7">S1–3</div>
                    </div>
                    <div class="cycle-phase hypertrophie ${autoPhase==='hypertrophie'?'active':''}" data-cycle-phase="hypertrophie">
                        <div>📈</div><div>Hypertrophie</div><div style="font-size:0.65rem;opacity:0.7">S4–6</div>
                    </div>
                    <div class="cycle-phase deload ${autoPhase==='deload'?'active':''}" data-cycle-phase="deload">
                        <div>🔄</div><div>Deload</div><div style="font-size:0.65rem;opacity:0.7">S7–8</div>
                    </div>
                </div>
                <div style="background:var(--color-surface-muted);border-radius:var(--radius-base);padding:var(--spacing-sm) var(--spacing-md);border:1px solid var(--color-border-default);">
                    <div style="font-weight:700;color:${pc.color};margin-bottom:4px;">${pc.label} — Phase actuelle</div>
                    <div style="font-size:0.82rem;color:var(--color-text-subheader);">${pc.desc}</div>
                    ${weeksLeft > 0 ? `<div style="font-size:0.76rem;color:var(--color-text-subheader);margin-top:4px;">⏳ ${weeksLeft} semaine${weeksLeft>1?'s':''} restante${weeksLeft>1?'s':''} dans ce cycle</div>` : '<div style="font-size:0.76rem;color:var(--color-warning-default);margin-top:4px;">✅ Cycle terminé — relance un nouveau cycle</div>'}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:var(--spacing-sm);margin-top:var(--spacing-sm);">
                    <button class="btn btn-outline" style="flex:1;min-width:120px;font-size:0.8rem;" data-cycle-reset="8">🔄 Nouveau cycle (8 sem.)</button>
                    <button class="btn btn-outline" style="flex:1;min-width:120px;font-size:0.8rem;" data-cycle-reset="12">🔄 Cycle long (12 sem.)</button>
                </div>
            `;

            // Insérer après le widget deload
            container.parentNode.insertBefore(widget, container.nextSibling);
        }

        function setCyclePhase(phase) {
            let cycle = StorageAPI.get('lyftiv_cycle', {});
            cycle.phase = phase;
            StorageAPI.set('lyftiv_cycle', cycle);
            renderPeriodisationWidget();
            showNotification(`Phase définie : ${phase}`, 'info', 2500);
        };

        function resetCycle(weeks) {
            const cycle = { phase: 'force', weekStart: Date.now(), week: 1, totalWeeks: weeks };
            StorageAPI.set('lyftiv_cycle', cycle);
            renderPeriodisationWidget();
            showNotification(`Nouveau cycle de ${weeks} semaines démarré ! Phase : Force (S1–${Math.floor(weeks*0.375)})`, 'success', 4000);
        };


        function renderHeatmap() {
            const grid = document.getElementById('heatmapGrid');
            const monthsBar = document.getElementById('heatmapMonths');
            const summary = document.getElementById('heatmapSummary');
            if (!grid) return;

            const history = getHistory();

            // Construire un map date (YYYY-MM-DD) -> count
            const counts = {};
            history.forEach(s => {
                if (!s.date) return;
                const d = new Date(s.date);
                const key = d.toISOString().slice(0, 10);
                counts[key] = (counts[key] || 0) + 1;
            });

            // Calculer 52 semaines en arrière depuis aujourd'hui
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dayOfWeek = today.getDay(); // 0=dim
            // Début = lundi de la semaine il y a 51 semaines
            const start = new Date(today);
            start.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 51 * 7);

            const WEEKS = 52;
            const DAYS = 7;
            const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

            // Construire la grille
            // Vider les conteneurs
            while (grid.firstChild) grid.removeChild(grid.firstChild);
            while (monthsBar.firstChild) monthsBar.removeChild(monthsBar.firstChild);

            let totalActive = 0;
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 0;
            let monthPositions = {}; // week index -> month label

            const allDays = [];
            for (let w = 0; w < WEEKS; w++) {
                for (let d = 0; d < DAYS; d++) {
                    const date = new Date(start);
                    date.setDate(start.getDate() + w * 7 + d);
                    const key = date.toISOString().slice(0, 10);
                    const count = counts[key] || 0;
                    allDays.push({ date, key, count, w, d });

                    // Détecter début de mois pour label
                    if (date.getDate() <= 7 && d === 0) {
                        const monthKey = MONTHS[date.getMonth()];
                        if (!monthPositions[w]) monthPositions[w] = monthKey;
                    }
                }
            }

            // Calculer streaks (jours consécutifs avec séance)
            const sortedDays = [...allDays].sort((a, b) => a.date - b.date);
            for (let i = 0; i < sortedDays.length; i++) {
                if (sortedDays[i].count > 0) {
                    totalActive++;
                    tempStreak++;
                    if (tempStreak > longestStreak) longestStreak = tempStreak;
                    // Streak courant (depuis la fin)
                } else {
                    tempStreak = 0;
                }
            }
            // Calculer streak courant à rebours depuis aujourd'hui
            const todayKey = today.toISOString().slice(0, 10);
            let checkDate = new Date(today);
            while (true) {
                const k = checkDate.toISOString().slice(0, 10);
                if (counts[k]) {
                    currentStreak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }

            // Labels des mois au-dessus
            for (let w = 0; w < WEEKS; w++) {
                const span = document.createElement('span');
                span.className = 'heatmap-month-label';
                span.style.width = '16px';
                span.style.minWidth = '16px';
                span.textContent = monthPositions[w] || '';
                monthsBar.appendChild(span);
            }

            // Cells par colonne (semaine)
            const gridFrag = document.createDocumentFragment();
            for (let w = 0; w < WEEKS; w++) {
                const col = document.createElement('div');
                col.className = 'heatmap-col';
                for (let d = 0; d < DAYS; d++) {
                    const day = allDays[w * 7 + d];
                    const cell = document.createElement('div');
                    cell.className = 'heatmap-cell';
                    const c = Math.min(day.count, 4);
                    if (c > 0) cell.setAttribute('data-count', c);

                    // Tooltip natif
                    const label = day.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
                    cell.title = day.count > 0
                        ? `${label} — ${day.count} séance${day.count > 1 ? 's' : ''}`
                        : label;

                    // Marquer aujourd'hui
                    if (day.key === todayKey) {
                        cell.style.outline = '2px solid var(--color-primary-default)';
                        cell.style.outlineOffset = '1px';
                    }

                    col.appendChild(cell);
                }
                gridFrag.appendChild(col);
            }
            grid.appendChild(gridFrag);

            // Résumé stats
            const last30 = allDays.filter(d => {
                const diff = (today - d.date) / (1000 * 60 * 60 * 24);
                return diff >= 0 && diff <= 30 && d.count > 0;
            }).length;

            summary.innerHTML = `
                <div class="dash-stat-pill"><div class="dsp-label">Total séances</div><div class="dsp-value">${totalActive}</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">30 derniers jours</div><div class="dsp-value">${last30}</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">Streak actuel</div><div class="dsp-value">${currentStreak > 0 ? '🔥 ' + currentStreak + 'j' : '—'}</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">Meilleur streak</div><div class="dsp-value">${longestStreak > 0 ? longestStreak + 'j' : '—'}</div></div>
            `;
        }

        function populateDashChartExercise() {
            const history = getHistory();
            const exercises = new Set();
            history.forEach(s => s.exercises && s.exercises.forEach(ex => exercises.add(ex.name)));
            const sel = document.getElementById('dashChartExercise');
            sel.innerHTML = '';
            exercises.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                sel.appendChild(opt);
            });
        }

        function renderDashStats() {
            const history = getHistory().sort((a, b) => new Date(a.date) - new Date(b.date));
            const grid = document.getElementById('dashChartStats');
            if (!grid || history.length < 1) { if(grid) grid.innerHTML = ''; return; }

            const allKg = history.map(s => parseFloat(s.totalKgRep) || 0);
            const maxKgRep = Math.max(...allKg).toFixed(1);
            const total = history.length;
            const last = allKg[allKg.length - 1];
            const prev = allKg.length > 1 ? allKg[allKg.length - 2] : last;
            const delta = (last - prev).toFixed(1);

            const trend = allKg.slice(-5);
            const slope = trend.length >= 2 ? (trend[trend.length-1] - trend[0]) / trend.length : 0;
            let scoreEmoji = slope > 1.5 ? '🚀' : slope > 0.5 ? '📈' : slope > -0.5 ? '➡️' : '⚠️';
            let scoreLabel = slope > 1.5 ? 'Excellent' : slope > 0.5 ? 'Bon' : slope > -0.5 ? 'Stable' : 'Stagnation';

            const streak = calcStreak(history);
            const streakDisplay = streak > 0 ? `🔥 ${streak}j` : '—';

            grid.innerHTML = `
                <div class="dash-stat-pill"><div class="dsp-label">Séances</div><div class="dsp-value">${total}</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">Record kg/rép</div><div class="dsp-value">${maxKgRep} kg</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">Streak actuel</div><div class="dsp-value">${streakDisplay}</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">Évolution</div><div class="dsp-value" style="color:${delta>=0?'var(--color-success-default)':'var(--color-danger-default)'}">${delta>=0?'+':''}${delta} kg</div></div>
                <div class="dash-stat-pill"><div class="dsp-label">Tendance</div><div class="dsp-value">${scoreEmoji} ${scoreLabel}</div></div>
            `;
        }

        function renderDashChart(type) {
            const canvas = document.getElementById('dashProgressCanvas');
            const empty = document.getElementById('dashChartEmpty');
            const exSel = document.getElementById('dashChartExercise');
            if (!canvas) return;

            exSel.style.display = type === '1rm' ? 'block' : 'none';
            destroyChart('dashMain');
            dashChartInstance = null;

            const history = getHistory().sort((a, b) => new Date(a.date) - new Date(b.date));
            let labels = [], data = [], data2 = [], label = '', label2 = '', color = '', color2 = '200,130,80';

            if (type === '1rm') {
                const exName = exSel.value;
                if (!exName) { canvas.style.display='none'; empty.style.display='block'; return; }
                history.forEach(s => {
                    const ex = s.exercises?.find(e => e.name === exName);
                    if (ex?.series) {
                        let best = 0;
                        ex.series.forEach(sr => { const rm = calculate1RM(sr.weight, sr.reps); if(rm>best) best=rm; });
                        if (best > 0) { labels.push(new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})); data.push(parseFloat(best.toFixed(1))); }
                    }
                });
                label = `1RM — ${exName} (kg)`; color = '82,130,200';
                // Comparatif : tonnage de l'exercice
                data2 = [];
                label2 = `Tonnage ${exName}`;
                history.forEach(s => {
                    const ex = s.exercises?.find(e => e.name === exName);
                    if (ex?.series) {
                        let t = 0; ex.series.forEach(sr => { t += (sr.weight||0)*(sr.reps||0); });
                        if (t > 0) data2.push(Math.round(t)); else data2.push(null);
                    }
                });
            } else if (type === 'tonnage') {
                history.forEach(s => {
                    let t = 0;
                    s.exercises?.forEach(ex => ex.series?.forEach(sr => { t += (sr.reps||0)*(sr.weight||0); }));
                    if (t>0) { labels.push(new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})); data.push(Math.round(t)); }
                });
                label = 'Tonnage (kg)'; color = '80,175,130';
                // Calcul moyenne mobile 3 sessions
                data2 = data.map((v, i, arr) => {
                    const slice = arr.slice(Math.max(0, i-2), i+1);
                    return Math.round(slice.reduce((a,b)=>a+b,0)/slice.length);
                });
                label2 = 'Moyenne mobile (3 séances)';
            } else if (type === 'volume') {
                history.forEach(s => {
                    const v = s.exercises?.reduce((a,ex)=>a+(ex.series?.length||0),0)||0;
                    if (v>0) { labels.push(new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})); data.push(v); }
                });
                label = 'Séries'; color = '200,130,80';
                data2 = [];
            } else if (type === 'frequency') {
                const weeks = {};
                history.forEach(s => { const d=new Date(s.date); const w=`S${getWeekNumber(d)} ${d.getFullYear()}`; weeks[w]=(weeks[w]||0)+1; });
                Object.entries(weeks).forEach(([w,c])=>{ labels.push(w); data.push(c); });
                label = 'Séances/semaine'; color = '160,90,200';
                // Objectif hebdo comme ligne de référence
                const goal = parseInt(StorageAPI.getRaw('weeklyGoal')||'3');
                data2 = data.map(() => goal);
                label2 = `Objectif (${goal}/sem.)`;
            }

            if (data.length < 2) { canvas.style.display='none'; empty.style.display='block'; return; }
            canvas.style.display='block'; empty.style.display='none';

            const isDark = document.body.classList.contains('dark-mode');
            dashChartInstance = drawChart(canvas, labels, data, label, color,
                isDark?'#b0c0d8':'#3a4a6a', isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
                data2.length === data.length ? data2 : null, label2, color2);

            // Afficher la légende comparatif
            let legendEl = document.getElementById('dashChartLegend');
            if (!legendEl) {
                legendEl = document.createElement('div');
                legendEl.id = 'dashChartLegend';
                legendEl.className = 'chart-compare-bar';
                canvas.parentNode.appendChild(legendEl);
            }
            let legendHtml = `<span class="chart-compare-dot" style="background:rgb(${color})"></span><span>${label}</span>`;
            if (data2.length === data.length && label2) {
                legendHtml += `&nbsp;&nbsp;<span class="chart-compare-dot" style="background:rgb(${color2})"></span><span>${label2}</span>`;
            }
            legendEl.innerHTML = legendHtml;
        }

        function getWeekNumber(d) {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        }

        // Graphique Canvas pur (pas de dépendance externe)
        function drawChart(canvas, labels, data, label, colorRgb, textColor, gridColor, data2, label2, colorRgb2) {
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const W = canvas.offsetWidth; const H = canvas.offsetHeight;
            canvas.width  = W * dpr; canvas.height = H * dpr;
            canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
            ctx.scale(dpr, dpr);

            const padL = 44, padR = 16, padT = 22, padB = 36;
            const chartW = W - padL - padR;
            const chartH = H - padT - padB;

            const allData = data2 ? [...data, ...data2.filter(v => v != null)] : data;
            const minVal = Math.min(...allData) * 0.94;
            const maxVal = Math.max(...allData) * 1.06;
            const range  = maxVal - minVal || 1;

            const toX = i => padL + (i / (data.length - 1)) * chartW;
            const toY = v => padT + chartH - ((v - minVal) / range) * chartH;

            // Helper : tracé Bézier catmull-rom → courbe douce
            function smoothPath(pts) {
                if (pts.length < 2) return;
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 0; i < pts.length - 1; i++) {
                    const p0 = pts[Math.max(i - 1, 0)];
                    const p1 = pts[i];
                    const p2 = pts[i + 1];
                    const p3 = pts[Math.min(i + 2, pts.length - 1)];
                    const cp1x = p1.x + (p2.x - p0.x) / 6;
                    const cp1y = p1.y + (p2.y - p0.y) / 6;
                    const cp2x = p2.x - (p3.x - p1.x) / 6;
                    const cp2y = p2.y - (p3.y - p1.y) / 6;
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
                }
            }

            ctx.clearRect(0, 0, W, H);

            // Grilles horizontales — légères, minimalistes (3 lignes seulement)
            ctx.lineWidth = 0.5;
            for (let i = 0; i <= 3; i++) {
                const y = padT + (chartH / 3) * i;
                ctx.strokeStyle = gridColor;
                ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
                if (i > 0) {
                    const val = maxVal - (range / 3) * i;
                    ctx.fillStyle = textColor;
                    ctx.font = `${10 / dpr + 10}px var(--font-mono, monospace)`;
                    ctx.textAlign = 'right';
                    ctx.fillText(Math.round(val), padL - 5, y + 4);
                }
            }

            const pts = data.map((v, i) => ({ x: toX(i), y: toY(v) }));

            // Gradient fill — plus riche, fond sombre
            const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
            grad.addColorStop(0,   `rgba(${colorRgb},0.30)`);
            grad.addColorStop(0.5, `rgba(${colorRgb},0.10)`);
            grad.addColorStop(1,   `rgba(${colorRgb},0.01)`);
            ctx.beginPath();
            smoothPath(pts);
            ctx.lineTo(toX(data.length - 1), padT + chartH);
            ctx.lineTo(toX(0), padT + chartH);
            ctx.closePath();
            ctx.fillStyle = grad; ctx.fill();

            // Ligne principale — Bézier smooth
            ctx.beginPath();
            smoothPath(pts);
            ctx.strokeStyle = `rgb(${colorRgb})`; ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

            // 2e courbe comparatif — tiretée
            if (data2 && data2.length === data.length) {
                const pts2 = data2.map((v, i) => v != null ? { x: toX(i), y: toY(v) } : null).filter(Boolean);
                if (pts2.length > 1) {
                    ctx.beginPath();
                    ctx.setLineDash([5, 4]);
                    smoothPath(pts2);
                    ctx.strokeStyle = `rgba(${colorRgb2 || '200,130,80'},0.8)`; ctx.lineWidth = 1.8;
                    ctx.stroke(); ctx.setLineDash([]);
                }
            }

            // Points — anneau lumineux
            data.forEach((v, i) => {
                const x = toX(i), y = toY(v);
                // Halo
                ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${colorRgb},0.12)`; ctx.fill();
                // Point
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${colorRgb})`; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
            });

            // Labels X — minimalistes, sautés si trop denses
            const skip = data.length > 10 ? Math.ceil(data.length / 7) : 1;
            data.forEach((_, i) => {
                if (labels[i] && i % skip === 0) {
                    ctx.fillStyle = textColor;
                    ctx.font = `${10 / dpr + 10}px var(--font-body, sans-serif)`;
                    ctx.textAlign = 'center';
                    ctx.fillText(labels[i], toX(i), padT + chartH + 14);
                }
            });

            // Label courbe — petit, en haut à gauche
            ctx.fillStyle = `rgb(${colorRgb})`;
            ctx.font = `bold ${10 / dpr + 11}px var(--font-body, sans-serif)`;
            ctx.textAlign = 'left';
            ctx.fillText(label, padL, padT - 6);

            return { destroy: () => { ctx.clearRect(0, 0, W, H); } };
        }

        /* ============================================================
           DELOAD — Widget dashboard
        ============================================================ */
        function renderDashDeload() {
            const widget = document.getElementById('dashDeloadWidget');
            if (!widget) return;

            const history = getHistory().sort((a, b) => new Date(a.date) - new Date(b.date));
            const dismissed = StorageAPI.getRaw('deloadDismissed');
            const wasDismissed = dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 3600 * 1000;

            if (history.length < 2) {
                widget.innerHTML = '<p style="text-align:center;color:var(--color-text-subheader);font-size:var(--font-size-sm);padding:8px 0;">Enregistre au moins 2 séances pour activer l\'analyse.</p>';
                return;
            }

            // Calcul stagnation
            const recent = history.slice(-4).map(s => parseFloat(s.totalKgRep) || 0);
            const oldest = recent[0], latest = recent[recent.length - 1];
            const isStagnating = recent.length >= 4 && latest <= oldest * 1.02;
            const last7 = history.filter(s => Date.now() - new Date(s.date).getTime() < 7 * 24 * 3600 * 1000);
            const isOvertraining = last7.length >= 5;

            // Stats récupération
            const lastSession = history[history.length - 1];
            const daysSinceLast = Math.floor((Date.now() - new Date(lastSession.date).getTime()) / 86400000);
            const sessionsLast7 = last7.length;
            const trend = history.slice(-5).map(s => parseFloat(s.totalKgRep)||0);
            const slope = trend.length>=2 ? (trend[trend.length-1]-trend[0])/trend.length : 0;

            const needsDeload = (isStagnating || isOvertraining) && !wasDismissed;

            if (needsDeload) {
                const reason = isOvertraining
                    ? `${last7.length} séances en 7 jours — surcharge détectée.`
                    : `Aucune progression sur les 4 dernières séances (${oldest.toFixed(1)} → ${latest.toFixed(1)} kg/rép).`;
                widget.innerHTML = `
                    <div class="deload-warn">
                        <strong>⚠️ Semaine de Deload recommandée</strong>
                        <span>${reason}</span>
                        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                            <button class="deload-apply-btn" id="dashApplyDeloadBtn">🔄 Appliquer le Deload</button>
                            <button class="deload-dismiss-btn" id="dashDismissDeloadBtn">Ignorer 7 jours</button>
                        </div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                        <span style="padding:4px 12px;border-radius:20px;background:var(--color-surface-muted);border:1px solid var(--color-border-default);font-size:0.8rem;">📅 Dernière séance : il y a ${daysSinceLast}j</span>
                        <span style="padding:4px 12px;border-radius:20px;background:var(--color-surface-muted);border:1px solid var(--color-border-default);font-size:0.8rem;">🗓️ ${sessionsLast7} séance(s) cette semaine</span>
                    </div>`;
            } else {
                const statusIcon = slope > 0.5 ? '🚀' : slope > -0.5 ? '✅' : '📉';
                const statusMsg = slope > 0.5 ? 'Bonne progression — continue ainsi !' : slope > -0.5 ? 'Charge bien gérée — pas de deload nécessaire.' : 'Légère régression — surveille ta récupération.';
                widget.innerHTML = `
                    <div class="deload-ok">
                        <span style="font-size:1.6rem;">${statusIcon}</span>
                        <div>
                            <strong>${statusMsg}</strong>
                            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
                                <span style="padding:3px 10px;border-radius:20px;background:hsla(140,40%,80%,0.4);font-size:0.78rem;">📅 ${daysSinceLast}j depuis la dernière séance</span>
                                <span style="padding:3px 10px;border-radius:20px;background:hsla(140,40%,80%,0.4);font-size:0.78rem;">🗓️ ${sessionsLast7} séance(s)/7 jours</span>
                            </div>
                        </div>
                    </div>`;
            }
        }

        function checkDeload() {
            // Désormais géré directement dans renderDashDeload() sur le dashboard
            renderDashDeload();
        }

        function applyDeload() {
            const session = state.sessions[state.currentSessionIndex];
            if (!session) {
                showNotification('Lance une séance d\'abord pour appliquer le deload.', 'info');
                return;
            }
            session.exercises.forEach(ex => {
                const deloadCount = Math.max(2, Math.ceil(ex.series.length * 0.6));
                ex.series = ex.series.slice(0, deloadCount);
                ex.series.forEach(s => {
                    if (s.weight) s.weight = Math.round(parseFloat(s.weight) * 0.6 * 2) / 2;
                });
            });
            createTable();
            StorageAPI.setRaw('deloadDismissed', Date.now());
            renderDashDeload();
            showNotification('🔄 Deload appliqué : volume −40%, intensité −40%. Bonne récupération !', 'info', 7000);
        }

// ──  SUPPLEMENT_DB → js/data/supplement-db.js  ───────────────────────────

        function renderDashSuppl(query) {
            const grid = document.getElementById('dashSupplGrid');
            if (!grid) return;
            const filtered = SUPPLEMENT_DB.filter(s =>
                s.name.toLowerCase().includes(query.toLowerCase()) ||
                s.desc.toLowerCase().includes(query.toLowerCase())
            );
            if (filtered.length === 0) {
                grid.innerHTML = `<p style="color:var(--color-text-subheader);text-align:center;padding:var(--spacing-xl);grid-column:1/-1;">Aucun résultat pour &ldquo;${escapeHTML(query)}&rdquo;.</p>`;
                return;
            }

            // Séparer les cartes normales des cartes danger/warning
            const safe = filtered.filter(s => s.rating !== 'DANGER' && s.rating !== 'ATTENTION');
            const warnings = filtered.filter(s => s.rating === 'DANGER' || s.rating === 'ATTENTION');

            const renderCard = (s) => {
                const isDanger = s.rating === 'DANGER';
                const isWarning = s.rating === 'ATTENTION';
                const cardClass = isDanger ? 'suppl-card suppl-danger' : isWarning ? 'suppl-card suppl-warning' : 'suppl-card';
                return `
                <div class="${cardClass}">
                    <div class="suppl-card-header">
                        <div class="suppl-name">${s.emoji} ${s.name}</div>
                        <div class="suppl-rating rating-${s.rating}">${isDanger ? '🚨 DANGER' : isWarning ? '⚠️ ATTENTION' : 'Grade ' + s.rating}</div>
                    </div>
                    <div class="suppl-desc">${s.desc}</div>
                    <div class="suppl-dose-info">
                        <span class="suppl-dose-badge">💊 ${s.dose}</span>
                        <span class="suppl-dose-badge">⏰ ${s.timing}</span>
                    </div>
                    ${s.alert ? `<div class="suppl-alert">⚠️ <span>${s.alert}</span></div>` : ''}
                    <div class="suppl-detail open">
                        <p><strong>Détail scientifique :</strong> ${s.detail}</p>
                        <p style="margin-top:6px;font-size:0.78rem;opacity:0.7">📚 ${s.sources}</p>
                    </div>
                </div>`;
            };

            let html = safe.map(renderCard).join('');

            if (warnings.length > 0) {
                html += `<div style="grid-column:1/-1;margin-top:var(--spacing-lg);margin-bottom:var(--spacing-sm);">
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:hsl(0,60%,96%);border:1.5px solid hsl(0,55%,80%);border-radius:12px;">
                        <span style="font-size:1.3rem">🚨</span>
                        <div>
                            <strong style="color:hsl(0,60%,35%);font-size:0.9rem;">Compléments à risque — Avis Pharmacien</strong>
                            <p style="margin:2px 0 0;font-size:0.78rem;color:hsl(0,40%,45%);">Les compléments suivants présentent des risques en automédication. Consultez un professionnel de santé avant toute prise.</p>
                        </div>
                    </div>
                </div>`;
                html += warnings.map(renderCard).join('');
            }

            grid.innerHTML = html;
        }


        /* ============================================================
           CALCULATEUR TDEE + MACROS
           Formules : Mifflin-St Jeor (défaut) | Katch-McArdle (si %BF)
        ============================================================ */
        
        function toggleHipField(radio) {
            const isFemale = radio ? radio.value === 'female'
                : document.querySelector('input[name="bf_gender"]:checked')?.value === 'female';
            const hipField = document.getElementById('bf_hip_field');
            if (hipField) hipField.style.display = isFemale ? '' : 'none';
        }

        function calculateTDEE() {
            const gender = document.querySelector('input[name="tdee_gender"]:checked')?.value || 'male';
            const age    = parseFloat(document.getElementById('tdee_age').value);
            const weight = parseFloat(document.getElementById('tdee_weight').value);
            const height = parseFloat(document.getElementById('tdee_height').value);
            const bf     = parseFloat(document.getElementById('tdee_bf').value);
            const activity = parseFloat(document.getElementById('tdee_activity').value);
            const goal   = document.getElementById('tdee_goal').value;

            if (!age || !weight || !height || age < 15 || weight < 30 || height < 130) {
                showNotification('Remplis tous les champs obligatoires (âge, poids, taille).', 'info');
                return;
            }

            let bmr, formula, formulaSub;

            if (!isNaN(bf) && bf > 4 && bf < 60) {
                // Katch-McArdle — si % graisse connu
                const lbm = weight * (1 - bf / 100);
                bmr = 370 + 21.6 * lbm;
                formula = 'Katch-McArdle';
                formulaSub = `(LBM = ${lbm.toFixed(1)} kg)`;
            } else {
                // Mifflin-St Jeor
                const s = gender === 'male' ? 5 : -151;
                bmr = 10 * weight + 6.25 * height - 5 * age + s;
                formula = 'Mifflin-St Jeor';
                formulaSub = gender === 'male' ? 'Homme' : 'Femme';
            }

            const tdee = Math.round(bmr * activity);
            bmr = Math.round(bmr);

            // Cible calorique selon objectif
            let targetKcal, goalTitle, goalDesc, goalBg, goalColor;
            if (goal === 'cut') {
                targetKcal = Math.round(tdee * 0.80); // déficit 20%
                goalTitle = '📉 Perte de graisse — Déficit calorique recommandé';
                goalDesc  = `Cible : ${targetKcal} kcal/jour (−${tdee - targetKcal} kcal, soit −20% du TDEE). Déficit modéré pour préserver la masse musculaire. Ne pas descendre sous ${Math.round(weight * 22)} kcal (seuil de sécurité).`;
                goalBg    = 'linear-gradient(135deg,hsl(0,50%,95%),hsl(0,40%,97%))';
                goalColor = 'hsl(0,50%,30%)';
            } else if (goal === 'bulk') {
                targetKcal = Math.round(tdee * 1.10); // surplus 10%
                goalTitle = '📈 Prise de masse — Surplus calorique recommandé';
                goalDesc  = `Cible : ${targetKcal} kcal/jour (+${targetKcal - tdee} kcal, soit +10% du TDEE). Surplus lean pour minimiser la prise de graisse. Suivi mensuel conseillé.`;
                goalBg    = 'linear-gradient(135deg,hsl(140,40%,94%),hsl(140,35%,96%))';
                goalColor = 'hsl(140,45%,28%)';
            } else {
                targetKcal = tdee;
                goalTitle = '⚖️ Recomposition — Maintien calorique';
                goalDesc  = `Cible : ${targetKcal} kcal/jour (= TDEE). Recomposition lente : perte de graisse + gain musculaire simultanés. Optimiser les macros et la progression en salle.`;
                goalBg    = 'linear-gradient(135deg,hsl(220,40%,95%),hsl(200,40%,97%))';
                goalColor = 'hsl(220,50%,30%)';
            }

            // Macros (en g)
            // Protéines : 2.0 g/kg en cut, 1.8 g/kg en recomp, 2.0 g/kg en bulk
            const proteinMultiplier = goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 2.0;
            const proteinG = Math.round(weight * proteinMultiplier);
            const proteinKcal = proteinG * 4;

            // Lipides : 25% des calories
            const fatKcal = Math.round(targetKcal * 0.25);
            const fatG = Math.round(fatKcal / 9);

            // Glucides : reste des calories
            const carbKcal = targetKcal - proteinKcal - fatKcal;
            const carbG = Math.max(0, Math.round(carbKcal / 4));

            // Pourcentages pour les barres
            const totalKcalMacros = proteinKcal + fatKcal + Math.max(0, carbKcal);
            const pProt = Math.round(proteinKcal / totalKcalMacros * 100);
            const pCarb = Math.round(Math.max(0, carbKcal) / totalKcalMacros * 100);
            const pFat  = 100 - pProt - pCarb;

            // Conseils selon objectif
            const tips = [];
            if (goal === 'cut') {
                tips.push(`Maintiens ${proteinG}g de protéines/jour pour préserver le muscle en déficit.`);
                tips.push('Planifie 1–2 "refeed days" par semaine à TDEE pour éviter l\'adaptation métabolique.');
                tips.push('Préfère un cardio à faible intensité (marche, vélo doux) pour préserver la récupération musculaire.');
                tips.push('Pèse-toi le matin à jeun, 3× par semaine — fais la moyenne pour éviter les fluctuations hydrique.');
            } else if (goal === 'bulk') {
                tips.push(`Vise +0.3–0.5 kg/semaine maximum pour limiter la prise de graisse (${proteinG}g de protéines/jour).`);
                
                tips.push('Un surplus trop élevé (>500 kcal/j) augmente la prise de graisse sans accélérer la croissance musculaire.');
                tips.push('Suis ta progression de force : si les charges stagnent, augmente légèrement les calories.');
            } else {
                tips.push(`Vise ${proteinG}g de protéines/jour — c'est le levier le plus important.`);
                tips.push('La recompo est plus lente mais durable — résultats visibles en 12–16 semaines.');
                tips.push('Priorise la progression en force à l\'entraînement plutôt que la balance.');
                tips.push('Ajuste les calories à la hausse les jours d\'entraînement intense, à la baisse les jours de repos.');
            }
            tips.push(`Hydratation : vise ${(weight * 0.035).toFixed(1)}L d'eau/jour (35ml/kg de poids corporel).`);

            // Affichage des résultats
            document.getElementById('res_bmr').textContent = bmr.toLocaleString('fr-FR');
            document.getElementById('res_tdee').textContent = tdee.toLocaleString('fr-FR');
            document.getElementById('res_formula').textContent = formula;
            document.getElementById('res_formula_sub').textContent = formulaSub;

            const banner = document.getElementById('res_goal_banner');
            banner.style.background = goalBg;
            banner.style.color = goalColor;
            banner.style.border = `1px solid ${goalColor}22`;
            banner.style.borderLeft = `4px solid ${goalColor}`;
            document.getElementById('res_goal_title').textContent = goalTitle;
            document.getElementById('res_goal_desc').textContent = goalDesc;

            document.getElementById('res_protein').textContent = `${proteinG}g`;
            document.getElementById('res_protein_kcal').textContent = `${proteinKcal} kcal`;
            document.getElementById('res_carbs').textContent = `${carbG}g`;
            document.getElementById('res_carbs_kcal').textContent = `${Math.max(0,carbKcal)} kcal`;
            document.getElementById('res_fat').textContent = `${fatG}g`;
            document.getElementById('res_fat_kcal').textContent = `${fatKcal} kcal`;

            document.getElementById('bar_protein').style.width = pProt + '%';
            document.getElementById('bar_carbs').style.width = pCarb + '%';
            document.getElementById('bar_fat').style.width = pFat + '%';
            document.getElementById('bar_protein_pct').textContent = pProt;
            document.getElementById('bar_carbs_pct').textContent = pCarb;
            document.getElementById('bar_fat_pct').textContent = pFat;

            const tipsList = document.getElementById('res_tips_list');
            tipsList.innerHTML = tips.map(t => `<li>${t}</li>`).join('');

            // Afficher les résultats avec animation
            const resDiv = document.getElementById('tdee_results');
            resDiv.style.display = 'block';
            resDiv.style.opacity = '0';
            resDiv.style.transform = 'translateY(10px)';
            setTimeout(() => {
                resDiv.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                resDiv.style.opacity = '1';
                resDiv.style.transform = 'translateY(0)';
                resDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        }


// ──  TRAINING_ZONES → js/data/training-zones.js  ─────────────────────────

        // detectZone et roundToQuarter → délégués à PhysioCompute (conservés pour compatibilité)
        function detectZone(avgReps) { return PhysioCompute.trainingZone(avgReps); }
        function roundToQuarter(kg)  { return PhysioCompute.roundToPlate(kg); }

        // ── MEMOIZATION — computeNextSessionData ──────────────────────────
        // Coûteux (PhysioCompute.analyzeExercise sur chaque exercice × N séries).
        // Résultat caché tant que la session active n'a pas changé.
        // Invalidé par : invalidateNextSessionCache() → appelé depuis updateSingleSerie,
        // Actions.switchSession, et après une séance terminée.
        const _nextSessionCache = { key: null, result: null };

        function _computeNextSessionCacheKey() {
            const idx = state.currentSessionIndex;
            const session = state.sessions?.[idx];
            if (!session) return null;
            // Clé = index + contenu sérialisé des séries (léger : strings uniquement)
            const seriesSnapshot = (session.exercises || [])
                .map(ex => (ex.series || []).map(s => (s.weight || '') + ':' + (s.reps || '')).join(','))
                .join('|');
            return idx + '§' + session.name + '§' + seriesSnapshot;
        }

        function invalidateNextSessionCache() {
            _nextSessionCache.key = null;
            _nextSessionCache.result = null;
        }

        function computeNextSessionData() {
            const cacheKey = _computeNextSessionCacheKey();

            // Cache hit — résultat déjà calculé pour cette session dans cet état
            if (cacheKey && cacheKey === _nextSessionCache.key) {
                return _nextSessionCache.result;
            }

            const session = state.sessions[state.currentSessionIndex];
            if (!session) return null;

            const sessionName = dom.sessionSelect.selectedOptions[0]?.text || session.name;
            const results = [];

            session.exercises.forEach((ex) => {
                if (!ex || typeof ex.name !== 'string' || !Array.isArray(ex.series) || ex.series.length === 0) return;

                const rawSeries = [];
                ex.series.forEach(s => {
                    const wRaw = parseInputValues(s.weight);
                    const rRaw = parseInputValues(s.reps);
                    const len  = Math.min(wRaw.length, rRaw.length);
                    for (let k = 0; k < len; k++) rawSeries.push({ weight: wRaw[k], reps: rRaw[k] });
                });

                const analysis = PhysioCompute.analyzeExercise(rawSeries);
                if (!analysis) return;
                results.push({ name: ex.name, ...analysis });
            });

            let totalTonnage = 0, totalReps = 0;
            results.forEach(r => {
                totalTonnage += r.avgWeightCurrent * r.avgReps * r.seriesCount;
                totalReps    += r.avgReps * r.seriesCount;
            });
            const currentKgRep = totalReps > 0 ? parseFloat((totalTonnage / totalReps).toFixed(2)) : null;

            const result = { sessionName, results, lastKgRep: currentKgRep };

            // Stocker en cache
            _nextSessionCache.key    = cacheKey;
            _nextSessionCache.result = result;

            return result;
        }

        function renderNextSessionModal(data) {
            if (!data || data.results.length === 0) {
                showNotification("Remplis d'abord au moins une série avec poids et répétitions.", "info");
                return;
            }

            document.getElementById('nspSessionName').textContent = data.sessionName;

            const list = document.getElementById('nspExerciseList');
            list.innerHTML = data.results.map(r => {
                const deltaClass = r.delta > 0 ? 'nsp-delta-up' : 'nsp-delta-same';
                const deltaText = r.delta > 0
                    ? `+${r.delta.toFixed(2).replace(/\.?0+$/, '')} kg 📈`
                    : r.delta === 0 ? '= maintien' : `${r.delta.toFixed(2).replace(/\.?0+$/, '')} kg`;

                const progressionReason = r.allHitCeiling
                    ? `Plafond atteint (${r.zone.repsMax < 100 ? r.zone.repsMax : '15+'}r) → +${r.zone.progressionKg} kg`
                    : `Cible : ${(r.zone.targetPct * 100).toFixed(0)}% du 1RM estimé`;

                const outlierNote = r.outlierCount > 0
                    ? `<span style="font-size:0.70rem;color:var(--color-text-subheader);font-style:italic;">⚠️ ${r.outlierCount} série(s) écartée(s) — hors zone ou charge incohérente</span>`
                    : '';

                return `
                    <div class="nsp-exercise-card" data-ex-name="${r.name.replace(/"/g,'&quot;')}" data-recommended="${r.recommendedWeight}">
                        <div class="nsp-ex-name">${r.name}</div>
                        <div class="nsp-ex-meta">
                            <span class="nsp-zone-badge ${r.zone.cssClass}">${r.zone.icon} ${r.zone.name} · ${r.zone.repsLabel}</span>
                            <span style="color:var(--color-text-subheader);font-size:0.72rem;">1RM estimé : <strong>${r.oneRM} kg</strong></span>
                            <span style="color:var(--color-text-subheader);font-size:0.72rem;">${r.seriesCount} série(s) de travail · ${r.avgReps} reps moy.</span>
                            <span style="font-size:0.72rem;color:var(--color-text-subheader);">${progressionReason}</span>
                            ${outlierNote}
                        </div>
                        <div class="nsp-ex-charge">
                            <div class="nsp-ex-charge-value">${r.recommendedWeight % 1 === 0 ? r.recommendedWeight.toFixed(0) : r.recommendedWeight.toFixed(2).replace(/0+$/, '')} kg</div>
                            <div class="nsp-ex-charge-label">charge recommandée</div>
                            <div class="nsp-ex-delta ${deltaClass}" style="margin-top:4px;">${deltaText}</div>
                        </div>
                    </div>`;
            }).join('');

            // Stocker les données pour le pré-remplissage
            document.getElementById('nextSessionModal')._nspData = data;

            const _nspModal = document.getElementById('nextSessionModal'); _nspModal.classList.remove('hidden'); _nspModal.classList.add('show');
        }

        function prefillNextSession(data) {
            const session = state.sessions[state.currentSessionIndex];
            if (!session) return;

            // Arrondir au 0.5 kg le plus proche
            function roundToHalf(kg) {
                return Math.round(kg * 2) / 2;
            }

            data.results.forEach(r => {
                const exIdx = session.exercises.findIndex(e => e.name === r.name);
                if (exIdx === -1) return;

                const ex = session.exercises[exIdx];
                const weightStr = String(roundToHalf(r.recommendedWeight)).replace(/\.0$/, '');

                ex.series.forEach((s, sIdx) => {
                    if (sIdx === 0) {
                        // Série 1 : remplir le poids recommandé, vider les reps
                        s.weight = weightStr;
                        s.reps   = '';
                    } else {
                        // Autres séries : tout vider
                        s.weight = '';
                        s.reps   = '';
                    }
                });
            });

            // Reconstruire le tableau complet depuis l'état mis à jour
            createTable();

            // Remplir "Semaine précédente" avec le kg/rep de la séance analysée
            // (APRÈS createTable pour ne pas être écrasé)
            if (data.lastKgRep !== null) {
                dom.previousWeekInput.value = data.lastKgRep.toFixed(2);
                dom.previousWeekInput.dispatchEvent(new Event('input'));
            }

            saveCurrentState(true);

            ModalManager.close(document.getElementById('nextSessionModal'));

            showNotification(`✅ ${data.results.length} exercice(s) pré-rempli(s) — poids série 1 uniquement, reste vidé.`, 'success', 5000);
        }

        // Listener bouton principal
        document.getElementById('nextSessionBtn').addEventListener('click', () => {
            const data = computeNextSessionData();
            renderNextSessionModal(data);
        });

        // Confirmer → pré-remplir
        document.getElementById('nspConfirmBtn').addEventListener('click', () => {
            const modal = document.getElementById('nextSessionModal');
            const data = modal._nspData;
            if (data) prefillNextSession(data);
        });

        // Fermer
        const _nspModal = document.getElementById('nextSessionModal');
        const _closeNsp = () => ModalManager.close(_nspModal);
        document.getElementById('closeNextSessionModal').addEventListener('click', _closeNsp);
        document.getElementById('nspCancelBtn').addEventListener('click', _closeNsp);
        _nspModal.addEventListener('click', e => { if (e.target === _nspModal) _closeNsp(); });

        // ── Phase 0.2 — Exposition globale pour tests console ────────────────
        window.saveCurrentState = saveCurrentState;
        window.__LYFTIV_TEST__ = {
            state, Store, StorageAPI, PhysioCompute, DisciplineEngine,
            saveCurrentState,
            get finishAndSaveSession() { return finishAndSaveSession; },
        };

        init();
        initNewFeatures();
    });
