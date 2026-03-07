// js/data/training-science.js
// ══════════════════════════════════════════════════════════════════════
//  BASE DE CONNAISSANCES SCIENTIFIQUE — Lyftiv
//  Extraite de :
//    • "An Analytical Review of Jeff Nippard's Training Methodologies 2022-2025"
//    • "Guide Théorique : L'Entraînement Basé sur les Preuves (2023-2025)"
//
//  Ces règles sont la référence autoritaire pour toute génération de
//  programme dans Lyftiv. Aucun programme ne doit être généré sans
//  passer par ces constantes.
//
//  AUCUNE DÉPENDANCE — chargé en couche DATA (avant core, fitness, app)
// ══════════════════════════════════════════════════════════════════════

const TrainingScience = Object.freeze({

    // ══════════════════════════════════════════════════════════════════
    //  1. PARAMÈTRES DE VOLUME — sets par muscle / semaine
    // ══════════════════════════════════════════════════════════════════
    volume: {
        /** Fourchette productive pour la majorité des individus (sets/muscle/semaine) */
        weeklySetRange: { min: 10, max: 20 },

        /** Fréquence minimale recommandée par groupe musculaire (x/semaine) */
        minFrequencyPerMuscle: 2,

        /** Principe "inverted-U" : au-delà du sweet spot, le volume devient contre-productif */
        invertedU: true,

        /** Volume par niveau d'expérience */
        byLevel: {
            beginner:     { sets: { min: 10, max: 14 }, note: 'Sensibilité élevée aux stimuli — pas besoin de beaucoup' },
            intermediate: { sets: { min: 14, max: 18 }, note: 'Augmenter progressivement selon récupération' },
            advanced:     { sets: { min: 16, max: 20 }, note: 'Proche du plafond — périodisation obligatoire' },
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  2. INTENSITÉ & PROXIMITÉ DE L'ÉCHEC (RIR / RPE)
    // ══════════════════════════════════════════════════════════════════
    intensity: {
        /** Fourchette RIR optimale pour la majorité des séries */
        rirRange: { min: 0, max: 3 },

        /** Au-delà de 3 RIR = sous-optimal pour l'hypertrophie */
        maxRirForGrowth: 3,

        /** L'échec total (0 RIR) n'est PAS obligatoire — 1-2 RIR donne des résultats comparables */
        failureRequired: false,

        /** Utilisation stratégique de l'échec selon le niveau */
        failureByLevel: {
            beginner:     { useFailure: false, note: 'Réserver aux dernières séries sur machines/isolations — but éducatif (calibration RIR)' },
            intermediate: { useFailure: 'last_set', note: 'Dernière série des exercices d\'isolation' },
            advanced:     { useFailure: 'last_set_all', note: 'Dernière série de TOUS les exercices (Bodybuilding Transformation System)' },
        },

        /** RPE recommandé */
        rpeRange: { min: 8, max: 10 },
    },

    // ══════════════════════════════════════════════════════════════════
    //  3. SURCHARGE PROGRESSIVE
    // ══════════════════════════════════════════════════════════════════
    progressiveOverload: {
        /**
         * Double Progression :
         * 1. Atteindre le HAUT de la fourchette de reps sur TOUTES les séries
         * 2. Seulement alors, augmenter le poids
         */
        doubleProgression: true,

        /** Modèle de progression par niveau */
        modelByLevel: {
            beginner:     'linear',       // Ajouter poids/reps chaque séance ou semaine
            intermediate: 'undulating',   // DUP — varier intensité/reps dans la semaine
            advanced:     'block',        // Périodisation par blocs (Base → Overload → Supercompensation)
        },

        /** Incréments de charge suggérés */
        weightIncrements: {
            upperBody: 2.5,   // kg
            lowerBody: 5.0,   // kg
            isolation: 1.25,  // kg — ou +1 rep avant d'augmenter le poids
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  4. CRITÈRES D'UN EXERCICE S-TIER
    //  Un exercice est S-Tier s'il remplit les 4 critères suivants.
    // ══════════════════════════════════════════════════════════════════
    exerciseTierCriteria: {
        stability:          'Stabilité maximale (machines, câbles, appuis fixes) → 100% du signal nerveux vers le muscle cible',
        resistanceProfile:  'Courbe de résistance idéale — tension tout au long du mouvement, pic là où le muscle est le plus fort',
        stretchedPosition:  'Tension maximale en position d\'étirement (SMH — Stretch-Mediated Hypertrophy)',
        overloadPotential:  'Mesure précise et incrémentale de la progression possible sur le long terme',
    },

    // ══════════════════════════════════════════════════════════════════
    //  5. HIÉRARCHIE DES EXERCICES PAR GROUPE MUSCULAIRE
    //  S = optimal | A = très efficace | B = acceptable | F = éviter
    // ══════════════════════════════════════════════════════════════════
    exerciseTiers: {
        chest: {
            S: ['Chest Press machine', 'Cable Pec Flye assis', 'Dips (lestés)'],
            A: ['Développé couché barre', 'Développé incliné haltères', 'Développé couché haltères', 'Pec Deck', 'Cable Press-Around', 'Dips', 'Déficit Pushups'],
            B: ['Développé couché prise serrée', 'Pushups standard'],
            rationale: 'Stabilité + tension en position étirée (Cable Flye). Potentiel de surcharge (Presses).',
        },
        back_lats: {
            S: ['Tirage vertical prise large', 'Tirage vertical prise neutre', 'Tirage unilatéral poulie'],
            A: ['Tractions prise large', 'Tractions prise neutre', 'Pullover câble', 'Pullover haltère', 'Cable Cross-body Lat Pull-Around'],
            B: ['Tirage horizontal prise large', 'Rowing barre prise pronation'],
            rationale: 'Stabilité (tirage machine), tension en position étirée (pullovers), potentiel de surcharge.',
        },
        back_upper: {
            S: ['Rowing soutenu poitrine (chest-supported)', 'Meadows Row', 'Rowing câble'],
            A: ['Rowing haltère unilatéral', 'Deficit Pendlay Row', 'Kroc Row'],
            B: ['Rowing barre penché', 'Rowing TRX'],
            rationale: 'Stabilité élevée sur chest-supported (fatigue systémique réduite). Charge unilatérale.',
        },
        shoulders_lateral: {
            S: ['Élévations latérales câble', 'Cable Y-Raise', 'Élévations latérales câble derrière le dos'],
            A: ['Élévations latérales haltères penchées (Lean-in)', 'Machine élévations latérales', 'Side Lying Raise'],
            B: ['Élévations latérales haltères debout standard'],
            rationale: 'Les câbles fournissent une tension en position étirée contrairement aux haltères.',
        },
        shoulders_anterior: {
            S: ['Développé épaules machine'],
            A: ['Développé épaules haltères assis', 'Développé militaire barre debout'],
            B: ['Élévations frontales haltères'],
            rationale: 'Machine = stabilité + tension directe. Haltères = amplitude + stabilisateurs.',
        },
        shoulders_posterior: {
            S: ['Reverse Pec Deck', 'Reverse Cable Crossover'],
            A: ['Face Pull corde', 'Reverse Fly haltères penché'],
            B: ['Oiseau machine convergente'],
            rationale: 'Isolation et stabilité (Reverse Pec Deck). Tension constante (câbles).',
        },
        biceps: {
            S: ['Curl pupitre haltère', 'Curl pupitre machine', 'Preacher Hammer Curl'],
            A: ['Curl barre EZ', 'Curl incliné haltères', 'Bayesian Cable Curl', 'Hammer Curl'],
            B: ['Curl barre droite debout', 'Curl concentré'],
            rationale: 'Tension pic en position courte + stabilité (Preacher). Tension en position étirée (Incliné, Bayesian).',
        },
        triceps: {
            S: ['Extension triceps overhead câble (corde)', 'Extension triceps overhead câble (barre)', 'Katana Extension', 'Cable Kickback'],
            A: ['Développé couché prise serrée', 'Skullcrusher haltères', 'Dips', 'JM Press Smith Machine'],
            B: ['Pushdown corde', 'Extension triceps unilatéral haltère'],
            rationale: 'Tension en position étirée sur le chef long (Overhead Extensions). Potentiel de surcharge (Presses/Dips).',
        },
        quads: {
            S: ['Hack Squat', 'Pendulum Squat', 'Squat barre', 'Squat Smith Machine'],
            A: ['Squat avant', 'Leg Press', 'Leg Extension', 'Bulgarian Split Squat'],
            B: ['Fentes marchées', 'Step-up'],
            rationale: 'Stabilité + surcharge (machines). Développement global (Squat). Isolation (Leg Extension).',
        },
        hamstrings: {
            S: ['Leg Curl assis (Seated Leg Curl)'],
            A: ['Soulevé de terre roumain (RDL)', 'Leg Curl allongé', 'Glute-Ham Raise'],
            B: ['Good Morning', 'Leg Curl debout'],
            rationale: 'Seated Curl = position étirée supérieure pour l\'hypertrophie. RDL = charge en hip-hinge.',
        },
        glutes: {
            S: ['Hip Thrust', 'Bulgarian Split Squat', 'RDL'],
            A: ['Squat barre', 'Cable Kickback', 'Machine Kickback', 'Fentes'],
            B: ['Abduction machine', 'Donkey Kick'],
            rationale: 'Charge directe en position raccourcie (Hip Thrust). Étirement profond + unilatéral (Split Squat).',
        },
        calves: {
            S: ['Mollets assis (Seated Calf Raise)'],
            A: ['Mollets debout (Standing Calf Raise)', 'Leg Press Calf Raise'],
            B: ['Mollets sur marche poids du corps'],
            rationale: 'Seated = soléaire en position étirée. Standing = gastrocnémiens.',
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  6. SPLITS RECOMMANDÉS PAR NIVEAU ET DISPONIBILITÉ
    // ══════════════════════════════════════════════════════════════════
    splits: {
        beginner: {
            '3j': { name: 'Full Body 3x', sessions: ['Full Body A', 'Full Body B', 'Full Body C'] },
            '4j': { name: 'Upper/Lower 4x', sessions: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
        },
        intermediate: {
            '4j': { name: 'Upper/Lower 4x', sessions: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
            '5j': { name: 'Upper/Lower/Full 5x', sessions: ['Upper', 'Lower', 'Upper', 'Lower', 'Full Body'] },
            '6j': { name: 'PPL 6x', sessions: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'] },
        },
        advanced: {
            '5j': { name: 'Hybrid UL-PPL 5x (Nippard BTS)', sessions: ['Upper', 'Lower', 'Pull', 'Push', 'Legs'] },
            '6j': { name: 'PPL 6x + Volume', sessions: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'] },
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  7. MODÈLES DE PÉRIODISATION
    // ══════════════════════════════════════════════════════════════════
    periodization: {
        linear: {
            level: 'beginner',
            description: 'Ajouter poids ou reps chaque séance / semaine. Simple et efficace pour les débutants.',
            deloadFrequency: 'Toutes les 8-12 semaines',
        },
        dup: {
            level: 'intermediate',
            description: 'Daily Undulating Periodization — varier intensité et fourchettes de reps dans la même semaine.',
            example: 'Lundi : Squat 3-5 reps (force) | Jeudi : Squat 8-12 reps (hypertrophie)',
            deloadFrequency: 'Toutes les 6-8 semaines',
        },
        waveLoading: {
            level: 'intermediate',
            description: 'Mini-cycles de 3 semaines — S1 intro, S2 montée, S3 peak. Le cycle repart à un niveau légèrement supérieur.',
            deloadFrequency: 'Semaine 1 de chaque nouveau cycle = mini-deload',
        },
        block: {
            level: 'advanced',
            description: 'Blocs de 3 phases avec objectifs distincts.',
            phases: {
                base:              { duration: '6 semaines', focus: 'Volume modéré-élevé, intensité modérée — fondation hypertrophique' },
                maximumOverload:   { duration: '4 semaines', focus: 'Volume faible, intensité ultra-haute — potentiation force + adaptation échec' },
                supercompensation: { duration: '2 semaines', focus: 'Volume ultra-élevé, intensité modérée — rebond de croissance musculaire' },
            },
            deloadFrequency: 'Entre chaque bloc',
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  8. RÈGLES DE CONSTRUCTION D'UNE SÉANCE
    // ══════════════════════════════════════════════════════════════════
    sessionConstruction: {
        /**
         * Ordre des exercices dans une séance :
         * 1. Composés multi-articulaires lourds (frais, système nerveux intact)
         * 2. Composés assistés / machines compound
         * 3. Isolations — en dernier (fatigue résiduelle acceptable car muscle ciblé direct)
         *
         * CRITIQUE : ne jamais fatiguer un muscle stabilisateur avant un exercice
         * qui en dépend (ex: pas de curl biceps avant tirage lourd dos)
         */
        exerciseOrder: ['compound_free', 'compound_machine', 'isolation_cable', 'isolation_machine'],

        /** Temps de repos recommandés par type d'exercice */
        restTimes: {
            compound_heavy:   '3-5 min',   // Squat, Deadlift, Bench, OHP
            compound_moderate:'2-3 min',   // Rowing, Tractions, Hack Squat
            isolation:        '1-2 min',   // Curls, Extensions, Élévations latérales
            superset:         '1.5-2 min', // Entre les paires
        },

        /** Fourchettes de répétitions par objectif */
        repRanges: {
            strength:     { min: 3,  max: 6  },
            powerbuilding:{ min: 5,  max: 8  },
            hypertrophy:  { min: 8,  max: 15 },
            endurance:    { min: 15, max: 30 },
        },

        /** Nombre d'exercices recommandé par séance */
        exercisesPerSession: {
            beginner:     { min: 4, max: 6  },
            intermediate: { min: 6, max: 9  },
            advanced:     { min: 7, max: 12 },
        },

        /** Nombre de séries par exercice */
        setsPerExercise: {
            main_compound: { min: 3, max: 5 },
            secondary:     { min: 3, max: 4 },
            isolation:     { min: 2, max: 4 },
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  9. TECHNIQUES AVANCÉES (intermediate / advanced uniquement)
    // ══════════════════════════════════════════════════════════════════
    advancedTechniques: {
        lengthened_partials: {
            name: 'Partiels en position étirée (Long-Length Partials)',
            description: 'Répétitions partielles dans la zone d\'étirement maximal APRÈS l\'échec complet sur amplitude totale.',
            benefit: 'Outil le plus puissant pour l\'hypertrophie mécanique selon la littérature récente.',
            usage: 'Dernières séries d\'isolations : Leg Curl assis, Curl pupitre, Cable Flye',
            level: 'intermediate+',
        },
        drop_sets: {
            name: 'Drop Sets',
            description: 'Réduire la charge de 20-30% immédiatement après l\'échec pour prolonger la série.',
            benefit: 'Augmentation du stress métabolique.',
            usage: '1 drop set par exercice maximum — dernier exercice de la séance de préférence',
            level: 'intermediate+',
        },
        rir_calibration: {
            name: 'Calibration RIR',
            description: 'Former sa perception des répétitions en réserve. Essentiel pour les débutants.',
            usage: 'Finir 1-2 séries à l\'échec contrôlé sur machines pour mémoriser la sensation de 0 RIR',
            level: 'beginner',
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  10. RÈGLES DE SÉCURITÉ ET D'ÉQUILIBRE
    // ══════════════════════════════════════════════════════════════════
    balance: {
        /**
         * Équilibre agoniste/antagoniste obligatoire pour éviter les déséquilibres posturaux.
         * Pour chaque push → un pull de volume équivalent.
         */
        pushPullBalance: true,

        /**
         * Ratio volume recommandé pour les articulations à risque
         */
        ratios: {
            chest_to_back:   '1:1',   // Volume pectoraux = volume dos
            quad_to_hamstring: '1:1', // Équilibre genou critique
            shoulder_pressing_to_rowing: '1:1.2', // Légèrement plus de tirage pour la santé des épaules
        },

        /** Déload — récupération planifiée */
        deload: {
            frequency: 'Toutes les 4-8 semaines selon le niveau et les signes de fatigue',
            method: 'Réduire volume de 40-50%, maintenir intensité (poids). Ne pas supprimer l\'entraînement.',
            signals: ['Baisse de performance sur 2+ séances consécutives', 'Fatigue persistante au réveil', 'Articulations douloureuses', 'Motivation en chute'],
        },
    },

    // ══════════════════════════════════════════════════════════════════
    //  11. MAPPING OBJECTIF → STRATÉGIE
    //  Utilisé par l'onboarding et le Coach IA pour personnaliser
    // ══════════════════════════════════════════════════════════════════
    goalMapping: {
        muscle:    { primary: 'hypertrophy', repRange: [8, 15],  rir: [0, 2], technique: 'lengthened_partials', note: 'Priorité aux S-Tier, 2x/muscle/semaine minimum' },
        strength:  { primary: 'strength',    repRange: [3, 6],   rir: [1, 3], technique: 'wave_loading',        note: 'Composés lourds en premier, progressif linéaire' },
        weight_loss:{ primary: 'hypertrophy', repRange: [10, 15], rir: [0, 2], technique: 'supersets',          note: 'Maintenir le muscle via hypertrophie + déficit calorique' },
        athletic:  { primary: 'powerbuilding',repRange: [5, 10],  rir: [1, 2], technique: 'dup',                note: 'DUP — alterner force et hypertrophie dans la semaine' },
        general:   { primary: 'hypertrophy', repRange: [8, 12],  rir: [1, 3], technique: null,                  note: 'Programme équilibré, bon pour débutants et intermédiaires' },
    },

});

window.TrainingScience = TrainingScience;
