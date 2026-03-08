#!/usr/bin/env node
// bump-cache.js — Lyftiv CI/CD Helper
// Auto-incrémente CACHE_NAME dans sw.js avant chaque déploiement.
//
// Usage :
//   node bump-cache.js             → incrémente le patch (v18 → v19)
//   node bump-cache.js --minor     → incrémente le minor (v18 → v20)
//   node bump-cache.js --dry-run   → affiche sans modifier
//
// Intégration recommandée dans package.json :
//   "scripts": {
//     "predeploy": "node bump-cache.js",
//     "deploy": "gh-pages -d ."
//   }
//
// Ou en pre-commit hook (.git/hooks/pre-commit) :
//   #!/bin/sh
//   node bump-cache.js
//   git add sw.js
// ══════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────
const SW_PATH     = path.join(__dirname, 'sw.js');
const CACHE_REGEX = /const CACHE_NAME\s*=\s*['"]lyftiv-v(\d+)['"]/;

// ── Parse args ────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const isDry   = args.includes('--dry-run');
const isMinor = args.includes('--minor');

// ── Lire sw.js ────────────────────────────────────────────────────────
if (!fs.existsSync(SW_PATH)) {
    console.error('❌  sw.js introuvable à :', SW_PATH);
    process.exit(1);
}

const content = fs.readFileSync(SW_PATH, 'utf8');
const match   = content.match(CACHE_REGEX);

if (!match) {
    console.error('❌  Pattern CACHE_NAME non trouvé dans sw.js');
    console.error('    Attendu : const CACHE_NAME = \'lyftiv-vXX\'');
    process.exit(1);
}

const oldVersion = parseInt(match[1], 10);
const newVersion = oldVersion + (isMinor ? 2 : 1);
const oldStr     = `lyftiv-v${oldVersion}`;
const newStr     = `lyftiv-v${newVersion}`;

// ── Remplacer ─────────────────────────────────────────────────────────
const newContent = content.replace(
    `const CACHE_NAME = '${oldStr}'`,
    `const CACHE_NAME = '${newStr}'`
);

// ── Résultat ──────────────────────────────────────────────────────────
const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

if (isDry) {
    console.log(`🔍  [DRY RUN] ${oldStr} → ${newStr}  (${timestamp})`);
    console.log('    Aucune modification effectuée.');
    process.exit(0);
}

fs.writeFileSync(SW_PATH, newContent, 'utf8');

console.log(`✅  Cache bumped : ${oldStr} → ${newStr}  (${timestamp})`);
console.log(`    sw.js mis à jour.`);

// ── Écrire un fichier de log (optionnel) ──────────────────────────────
const LOG_PATH = path.join(__dirname, '.cache-bump-log');
const logLine  = `${timestamp}  ${oldStr} → ${newStr}\n`;
try {
    fs.appendFileSync(LOG_PATH, logLine, 'utf8');
} catch(e) { /* non bloquant */ }
