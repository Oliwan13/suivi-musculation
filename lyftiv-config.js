// ══════════════════════════════════════════════════════════════════════
//  LYFTIV — CONFIG CENTRALE
//  ⚙️  Un seul fichier à modifier pour configurer tout le cloud.
//
//  ÉTAPES :
//  1. Va sur https://app.supabase.com → ton projet → Settings → API
//  2. Copie "Project URL"  → SUPABASE_URL
//  3. Copie "anon public"  → SUPABASE_ANON
//  4. Sauvegarde et déploie (npm run deploy)
//
//  Ce fichier doit être chargé EN PREMIER dans index.html (avant tout autre script)
// ══════════════════════════════════════════════════════════════════════

window.LyftivConfig = Object.freeze({

    // ── SUPABASE ─────────────────────────────────────────────────────
    // Remplace ces deux valeurs avec tes credentials Supabase
    SUPABASE_URL:  'https://VOTRE_PROJET.supabase.co',
    SUPABASE_ANON: 'VOTRE_ANON_KEY',

    // ── FEATURE FLAGS RUNTIME ─────────────────────────────────────────
    // Ces flags surchargent feature-flags.js si Supabase est configuré
    get IS_CONFIGURED() {
        return !this.SUPABASE_URL.includes('VOTRE_PROJET');
    },

    // ── APP META ─────────────────────────────────────────────────────
    APP_VERSION: '1.0.0',
    APP_NAME:    'Lyftiv',

});

// Log de démarrage (retiré en production par le minifier)
if (window.LyftivConfig.IS_CONFIGURED) {
    console.log('[Lyftiv] ☁️ Supabase configuré — cloud sync actif');
} else {
    console.warn('[Lyftiv] ⚠️ Supabase non configuré — mode local uniquement');
    console.warn('[Lyftiv] → Édite lyftiv-config.js pour activer le cloud');
}
