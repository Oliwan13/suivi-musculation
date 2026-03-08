        const RenderScheduler = {
            _pendingTable:  false,
            _pendingTotals: false,
            _frameId:       null,

            // ── Frame Lock — garantie 60 FPS ────────────────────────────
            // Si createTable dépasse le budget frame (>10ms), updateAllTotals
            // est reporté à la frame suivante au lieu de bloquer la frame courante.
            FRAME_BUDGET_MS: 10,

            /** Demande un re-render de la table des exercices */
            scheduleTable() {
                this._pendingTable = true;
                this._flush();
            },

            /** Demande un recalcul des totaux (volume, delta…) */
            scheduleTotals() {
                this._pendingTotals = true;
                this._flush();
            },

            /** Demande les deux en une seule frame */
            scheduleAll() {
                this._pendingTable  = true;
                this._pendingTotals = true;
                this._flush();
            },

            _flush() {
                if (this._frameId) return;
                this._frameId = requestAnimationFrame(() => {
                    const t0 = performance.now();

                    // Priorité 1 — reconstruction DOM (coûteuse, traiter en premier)
                    if (this._pendingTable) {
                        createTable();
                        this._pendingTable = false;
                    }

                    // Priorité 2 — totaux visuels — reportés si budget de frame dépassé
                    if (this._pendingTotals) {
                        const elapsed = performance.now() - t0;
                        if (elapsed < this.FRAME_BUDGET_MS) {
                            updateAllTotals();
                            this._pendingTotals = false;
                        } else {
                            // Hors budget : deuxième frame dédiée pour les totaux
                            this._frameId = null;
                            this._flush();
                            return;
                        }
                    }

                    this._frameId = null;
                });
            }
        };

        window.RenderScheduler = RenderScheduler;
