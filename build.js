#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
//  LYFTIV — BUILD SCRIPT (zéro dépendance npm)
//  Usage : node build.js
//  Produit : dist/ (tous les fichiers minifiés + copiés)
// ══════════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import zlib from 'zlib';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');

// ── Minifieur JS léger ────────────────────────────────────────────────
function minifyJS(src) {
    let s = src;
    // Supprimer commentaires multi-lignes /* ... */  (pas dans les strings)
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    // Supprimer commentaires single-line // (attention aux URLs https://)
    s = s.replace(/(?<![:"'])\/\/(?!\/)[^\n]*/g, '');
    // Supprimer lignes vides et espaces en début/fin de ligne
    s = s.replace(/^\s+|\s+$/gm, '');
    // Réduire les multiples espaces/tabs en un seul espace
    s = s.replace(/[ \t]{2,}/g, ' ');
    // Réduire les espaces autour des opérateurs courants
    s = s.replace(/\s*([=+\-*/%&|^<>!?,;:{}()[\]])\s*/g, '$1');
    // Restaurer espace après keywords critiques
    s = s.replace(/(return|typeof|instanceof|new|delete|void|throw|in|of|var|let|const|function|class|if|else|for|while|do|switch|try|catch|finally|async|await|import|export)([(\w$_"'`{[])/g, '$1 $2');
    // Supprimer lignes vides multiples
    s = s.replace(/\n{2,}/g, '\n');
    return s.trim();
}

// ── Minifieur CSS léger ───────────────────────────────────────────────
function minifyCSS(src) {
    let s = src;
    // Supprimer commentaires
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    // Supprimer espaces autour de : ; { } ,
    s = s.replace(/\s*([{}:;,>+~])\s*/g, '$1');
    // Réduire espaces multiples
    s = s.replace(/[ \t]{2,}/g, ' ');
    // Supprimer lignes vides
    s = s.replace(/\n{2,}/g, '\n');
    // Supprimer ; avant }
    s = s.replace(/;}/g, '}');
    // Réduire 0px/0em à 0
    s = s.replace(/\b0(px|em|rem|%|vh|vw)\b/g, '0');
    return s.trim();
}

// ── Helpers ───────────────────────────────────────────────────────────
function copy(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function write(dest, content) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
}

function sizeKB(str) { return (Buffer.byteLength(str, 'utf8') / 1024).toFixed(1); }
function fileSizeKB(p) { return (fs.statSync(p).size / 1024).toFixed(1); }

function gzipSize(content) {
    return new Promise(res => {
        zlib.gzip(Buffer.from(content, 'utf8'), {level:9}, (_, buf) => res((buf.length/1024).toFixed(1)));
    });
}

// ── Fichiers JS à minifier ────────────────────────────────────────────
const JS_FILES = [
    'lyftiv-config.js',
    'js/data/training-zones.js',
    'js/data/training-science.js',
    'js/data/default-sessions.js',
    'js/data/supplement-db.js',
    'js/core/feature-flags.js',
    'js/core/storage.js',
    'js/core/render-scheduler.js',
    'js/core/state.js',
    'js/fitness/physio-compute.js',
    'js/fitness/discipline-engine.js',
    'js/app.js',
    'js/features/global-nav.js',
    'js/features/plan-panel.js',
    'js/features/profile.js',
    'js/features/onboarding.js',
    'js/features/ai-coach.js',
    'js/features/program-builder.js',
    'js/features/fuzzy-search.js',
    'js/features/supabase-sync.js',
    'js/features/gamification.js',
    'js/features/pro-coach.js',
];

// ── Fichiers statiques à copier tel quel ─────────────────────────────
const STATIC_FILES = [
    'index.html',
    'manifest.json',
    'sw.js',
    'icon-192.png',
    'icon-512.png',
];

console.log('\n🔨 LYFTIV BUILD\n' + '═'.repeat(50));
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let totalOrig = 0, totalMin = 0;

// Minifier JS
console.log('\n📦 JavaScript');
for (const file of JS_FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) { console.log(`  ⚠️  SKIP ${file} (not found)`); continue; }
    const orig = fs.readFileSync(src, 'utf8');
    const min  = minifyJS(orig);
    const dest = path.join(DIST, file);
    write(dest, min);
    const origKB = sizeKB(orig), minKB = sizeKB(min);
    const saved = ((1 - minKB/origKB)*100).toFixed(0);
    totalOrig += parseFloat(origKB);
    totalMin  += parseFloat(minKB);
    console.log(`  ✅ ${file.padEnd(45)} ${origKB}KB → ${minKB}KB  (-${saved}%)`);
}

// Minifier CSS
console.log('\n🎨 CSS');
const cssSrc = path.join(ROOT, 'css/styles.css');
if (fs.existsSync(cssSrc)) {
    const orig = fs.readFileSync(cssSrc, 'utf8');
    const min  = minifyCSS(orig);
    const dest = path.join(DIST, 'css/styles.css');
    write(dest, min);
    const origKB = sizeKB(orig), minKB = sizeKB(min);
    const saved = ((1 - minKB/origKB)*100).toFixed(0);
    totalOrig += parseFloat(origKB);
    totalMin  += parseFloat(minKB);
    console.log(`  ✅ css/styles.css  ${origKB}KB → ${minKB}KB  (-${saved}%)`);
}

// Copier les fichiers statiques
console.log('\n📄 Fichiers statiques');
for (const file of STATIC_FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) { console.log(`  ⚠️  SKIP ${file}`); continue; }
    copy(src, path.join(DIST, file));
    console.log(`  ✅ ${file}`);
}

// Résumé
const savedTotal = ((1 - totalMin/totalOrig)*100).toFixed(0);
console.log('\n' + '═'.repeat(50));
console.log(`📊 Total JS+CSS : ${totalOrig.toFixed(0)}KB → ${totalMin.toFixed(0)}KB  (-${savedTotal}%)`);
console.log(`📁 Output : ${DIST}`);
console.log('✅ Build terminé\n');
