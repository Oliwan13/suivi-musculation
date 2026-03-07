    // ══════════════════════════════════════════════════════════════════════
    //  CONFIG — Drapeaux d'activation des fonctionnalités
    //  Toute évolution conditionnelle du codebase passe par ici.
    //  Jamais de if(premium)/if(beta) éparpillés → un seul endroit à modifier.
    // ══════════════════════════════════════════════════════════════════════
    const FeatureFlags = Object.freeze({
        aiCoach:        false,   // Suggestions IA basées sur l'historique
        cloudSync:      false,   // Sync multi-appareils (Supabase/Firebase)
        advancedStats:  true,    // Graphiques et analyses détaillées (déjà actif)
        premiumExport:  false,   // Export PDF / rapport de progression
        socialSharing:  false,   // Partage des PRs et séances
    });

window.FeatureFlags = FeatureFlags;
