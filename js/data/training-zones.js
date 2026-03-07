        /* ============================================================
           CALCULATEUR PROCHAINE SÉANCE
           Algo :
           1. Pour chaque exercice → lire séries (poids + reps)
           2. Calculer 1RM moyen pondéré (moyenne de plusieurs séries)
           3. Détecter la zone selon reps moy. par série
           4. Calculer la charge cible (% 1RM selon zone)
           5. Appliquer progression si fourchette haute atteinte
           6. Comparer avec historique du même nom de séance
           7. Afficher dans le modal, proposer de pré-remplir
        ============================================================ */

        // Zones d'entraînement
        const TRAINING_ZONES = [
            {
                key: 'force',
                name: 'Force',
                icon: '🔴',
                repsMin: 1, repsMax: 5,
                pctMin: 0.82, pctMax: 0.92,
                targetPct: 0.87,          // milieu de fourchette
                progressionKg: 2.5,
                repsLabel: '1–5 reps',
                cssClass: 'nsp-zone-force'
            },
            {
                key: 'hypertrophie',
                name: 'Hypertrophie',
                icon: '🔵',
                repsMin: 6, repsMax: 12,
                pctMin: 0.67, pctMax: 0.80,
                targetPct: 0.735,
                progressionKg: 2.5,
                repsLabel: '6–12 reps',
                cssClass: 'nsp-zone-hypertrophie'
            },
            {
                key: 'endurance',
                name: 'Endurance',
                icon: '🟢',
                repsMin: 13, repsMax: 999,
                pctMin: 0.50, pctMax: 0.65,
                targetPct: 0.575,
                progressionKg: 1.25,
                repsLabel: '13+ reps',
                cssClass: 'nsp-zone-endurance'
            }
        ];

        window.TRAINING_ZONES = TRAINING_ZONES;
