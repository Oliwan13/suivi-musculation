        // ── PhysioCompute — Moteur de calcul physiologique ─────────────────────
        // Pur JS, zéro DOM : prend des données brutes, retourne des résultats.
        // Toute la mathématique de l'app est ici — testable sans l'interface.
        const PhysioCompute = {

            /** Estimation du 1RM (Brzycki/Mayhew/Epley/Lander/Lombardi)
             *  Au-delà de 12 reps : Lombardi seul (plus stable sur hautes répétitions). */
            oneRM(weight, reps) {
                if (!Number.isFinite(weight) || !Number.isFinite(reps)) return 0;
                if (weight <= 0 || reps <= 0) return 0;
                if (reps > 12) return weight * Math.pow(reps, 0.10);
                const formulas = [
                    weight / (1.0278 - 0.0278 * reps),
                    (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * reps)),
                    weight * (1 + reps / 30),
                    (100 * weight) / (101.3 - 2.67123 * reps),
                    weight * Math.pow(reps, 0.10)
                ].filter(v => Number.isFinite(v) && v > 0);
                return formulas.length ? formulas.reduce((s, v) => s + v, 0) / formulas.length : 0;
            },

            /** Détecte la zone d'entraînement selon le nombre de reps */
            trainingZone(reps) {
                for (const z of TRAINING_ZONES) {
                    if (reps >= z.repsMin && reps <= z.repsMax) return z;
                }
                return TRAINING_ZONES[1]; // hypertrophie par défaut
            },

            /** Arrondi au 0.5 kg le plus proche (granularité standard des disques) */
            roundToPlate(kg) {
                return Math.round(kg * 2) / 2;
            },

            /** Tonnage total [{weight, reps}] → kg soulevés */
            tonnage(series) {
                return series.reduce((sum, s) => sum + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0);
            },

            /** 1RM pondéré : les séries lourdes (peu de reps) pèsent davantage */
            weightedOneRM(workSeries) {
                let sumW = 0, sumWts = 0;
                workSeries.forEach(s => {
                    const est = this.oneRM(s.weight, s.reps);
                    if (est > 0) { const wt = 1 / s.reps; sumW += est * wt; sumWts += wt; }
                });
                return sumWts > 0 ? sumW / sumWts : 0;
            },

            /**
             * Analyse complète d'un exercice.
             * Entrée : [{weight, reps}] (données parsées brutes)
             * Sortie : objet résultat ou null si données insuffisantes.
             * Ne touche jamais au DOM.
             */
            analyzeExercise(rawSeries) {
                if (!rawSeries.length) return null;

                // Étape 1 — Zone majoritaire (vote)
                const zoneCounts = {};
                TRAINING_ZONES.forEach(z => { zoneCounts[z.key] = []; });
                rawSeries.forEach(s => { zoneCounts[this.trainingZone(s.reps).key].push(s); });

                let dominantZoneKey = TRAINING_ZONES[1].key;
                let maxVotes = 0;
                TRAINING_ZONES.forEach(z => {
                    if (zoneCounts[z.key].length > maxVotes) {
                        maxVotes = zoneCounts[z.key].length;
                        dominantZoneKey = z.key;
                    }
                });
                const zone = TRAINING_ZONES.find(z => z.key === dominantZoneKey);

                // Étape 2 — Filtrer les outliers (charge < 60% de la médiane de la zone)
                let workSeries = zoneCounts[dominantZoneKey];
                if (workSeries.length >= 2) {
                    const sorted = [...workSeries].sort((a, b) => a.weight - b.weight);
                    const mid = Math.floor(sorted.length / 2);
                    const median = sorted.length % 2 ? sorted[mid].weight
                        : (sorted[mid - 1].weight + sorted[mid].weight) / 2;
                    const filtered = workSeries.filter(s => s.weight >= median * 0.60);
                    if (filtered.length) workSeries = filtered;
                }

                // Étape 3 — 1RM pondéré + recommandation
                const oneRM = this.weightedOneRM(workSeries);
                if (oneRM <= 0) return null;

                const avgW  = workSeries.reduce((s, x) => s + x.weight, 0) / workSeries.length;
                const avgR  = workSeries.reduce((s, x) => s + x.reps,   0) / workSeries.length;
                const ceil  = zone.repsMax < 100 ? zone.repsMax : 20;
                const allHitCeiling = workSeries.every(s => s.reps >= ceil - 1);

                let recommended = allHitCeiling ? avgW + zone.progressionKg : oneRM * zone.targetPct;
                recommended = this.roundToPlate(recommended);

                return {
                    zone,
                    oneRM:            Math.round(oneRM * 10) / 10,
                    avgReps:          Math.round(avgR  * 10) / 10,
                    avgWeightCurrent: this.roundToPlate(avgW),
                    recommendedWeight: recommended,
                    delta:            this.roundToPlate(recommended - avgW),
                    allHitCeiling,
                    seriesCount:      workSeries.length,
                    outlierCount:     rawSeries.length - workSeries.length,
                    totalSeriesCount: rawSeries.length
                };
            },

            /**
             * Sanitize une valeur de série : nettoie les saisies invalides.
             * Accepte : "80", "70.5", "35+35" (haltères asymétriques), "70,5"
             * Rejette : NaN, négatifs, chaînes non numériques → retourne ''
             */
            sanitizeValue(raw) {
                if (raw === '' || raw === null || raw === undefined) return '';
                const segments = String(raw).split('+')
                    .map(v => parseFloat(v.trim().replace(',', '.')));
                if (segments.some(v => !Number.isFinite(v) || v < 0)) return '';
                return segments.join('+');
            }
        };

        window.PhysioCompute = PhysioCompute;
