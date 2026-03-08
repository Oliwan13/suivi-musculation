// ══════════════════════════════════════════════════════════════════════
    //  CONFIG — Drapeaux d'activation des fonctionnalités
    //  Toute évolution conditionnelle du codebase passe par ici.
    //  Jamais de if(premium)/if(beta) éparpillés → un seul endroit à modifier.
    // ══════════════════════════════════════════════════════════════════════
    const FeatureFlags = Object.freeze({
        aiCoach:        true,    // Suggestions IA basées sur l'historique
        cloudSync:      true,    // Sync multi-appareils (Supabase) — configuré dans supabase-sync.js
        advancedStats:  true,    // Graphiques et analyses détaillées
        premiumExport:  true,    // Export PDF / rapport de progression
        socialSharing:  true,    // Partage des PRs et séances
        leagues:        true,    // Ligues & classements
        proCoach:       true,    // Interface Pro Coachs
    });

window.FeatureFlags = FeatureFlags;
