// js/core/state.js — État mutable central, Store (CRUD), SaveQueue (persistence)

        let state = {
            sessions: [], 
            currentSessionIndex: 0,
            timers: {}, // For individual exercise rest timers
            
            // Main Workout Timer State
            workoutStartTime: null, // Timestamp (ms) when the session started
            totalWorkoutTimeInterval: null, // Holds the setInterval ID for UI updates
            isWorkoutTimerPaused: true, // Timer starts in a paused state
            totalPausedDuration: 0, // Accumulated time in ms the timer was paused
            pauseStartTime: 0, // Timestamp when the current pause began
            
            sessionToLoad: null,
            lastDeletedExercise: null,
            linkingState: { active: false, fromIndex: null }, 
            quickEditIndex: null,
            isMobileView: window.matchMedia("(max-width: 768px)").matches,
            isNotesSectionVisible: false,
            deferredPwaPrompt: null,
            isInitialized: false,
            pressTimer: null,
            historyLoaded: false  // Historique chargé seulement à l'ouverture de l'onglet (perf)
        };

        const Store = {
            _session() {
                return state.sessions[state.currentSessionIndex];
            },
            exercises() {
                return this._session()?.exercises ?? [];
            },
            addExercise(name) {
                const session = this._session();
                if (!session) return;
                if (!session.exercises) session.exercises = [];
                session.exercises.push({
                    name,
                    rest: '1 min',
                    series: [{weight:'',reps:''},{weight:'',reps:''},{weight:'',reps:''},{weight:''}],
                    isDefault: false
                });
                saveCurrentState(true);
            },
            removeExercise(idx) {
                const exs = this.exercises();
                const removed = exs.splice(idx, 1)[0];
                saveCurrentState(true);
                return removed;
            },
            addSeries(idx) {
                const ex = this.exercises()[idx];
                if (!ex) return;
                ex.series.push({ weight: '', reps: '' });
                saveCurrentState(true);
            },
            updateExercise(idx, patch) {
                const ex = this.exercises()[idx];
                if (!ex) return;
                Object.assign(ex, patch);
                saveCurrentState(true);
            },
            setSupersetLink(fromIdx, toIdx) {
                const exs = this.exercises();
                exs[fromIdx].supersetWith = toIdx;
                exs[fromIdx].supersetGroup = true;
                exs[toIdx].supersetGroup = true;
                saveCurrentState(true);
            },
            removeSupersetLink(idx) {
                const exs = this.exercises();
                const partnerIdx = exs.findIndex((e, i) => e.supersetWith === idx && i !== idx);
                exs[idx].supersetGroup = false;
                exs[idx].supersetWith = undefined;
                if (partnerIdx !== -1) exs[partnerIdx].supersetGroup = false;
                saveCurrentState(true);
            },

            /** Met à jour weight ou reps d'une série avec sanitization.
             *  Empêche NaN de corrompre les calculs de volume / 1RM. */
            updateSeriesValue(exerciseIdx, serieIdx, field, raw) {
                const ex = this.exercises()[exerciseIdx];
                if (!ex || !ex.series[serieIdx]) return;
                const cleaned = PhysioCompute.sanitizeValue(raw);
                // Si la valeur est identique à l'actuelle, pas besoin de sauvegarder
                if (ex.series[serieIdx][field] === cleaned) return;
                ex.series[serieIdx][field] = cleaned;
                saveCurrentState(true);
            }
        };

        // ══════════════════════════════════════════════════════════════════════
        //  SAVE QUEUE — persistence transactionnelle
        //  Les appels rapides à saveCurrentState() sont fusionnés en 1 seule
        //  écriture localStorage (debounce 400ms). Évite le write storm et
        //  garde un snapshot de rollback en cas d'échec.
        // ══════════════════════════════════════════════════════════════════════
        const SaveQueue = {
            _timer:    null,
            _snapshot: null,   // dernier état sauvegardé avec succès
            DEBOUNCE:  400,    // ms — bon équilibre réactivité / perf

            /** Empile une sauvegarde — plusieurs appels rapides → 1 seul write */
            enqueue(payload, silent = false) {
                if (this._timer) clearTimeout(this._timer);
                this._timer = setTimeout(() => {
                    this._commit(payload, silent);
                    this._timer = null;
                }, this.DEBOUNCE);
            },

            /** Écriture effective + sauvegarde du snapshot de rollback */
            _commit(payload, silent) {
                try {
                    StorageAPI.set('inProgressWorkout', payload);
                    this._snapshot = payload;          // rollback disponible
                    if (!silent) showSaveIndicator();
                } catch (e) {
                    console.error('[SaveQueue] Échec écriture localStorage :', e);
                    // En cas d'erreur, proposer un retry au prochain enqueue
                }
            },

            /** Annule le dernier write (rollback) */
            rollback() {
                if (!this._snapshot) return false;
                StorageAPI.set('inProgressWorkout', this._snapshot);
                return true;
            },

            /** Flush immédiat (avant navigation / fermeture) */
            flush(payload) {
                if (this._timer) { clearTimeout(this._timer); this._timer = null; }
                if (payload) this._commit(payload, true);
            }
        };

window.state     = state;
window.Store     = Store;
window.SaveQueue = SaveQueue;
