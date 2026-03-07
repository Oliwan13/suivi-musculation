// js/features/fuzzy-search.js — Lyftiv Fuzzy Exercise Search
// Branche un dropdown de suggestions sur #customExercise
// Dépend : window.TrainingScience (exerciseTiers)
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    //  CONSTRUCTION DE LA BASE D'EXERCICES
    // ══════════════════════════════════════════════════════════════════

    const MUSCLE_FR = {
        chest:               'Pectoraux',
        back_lats:           'Dos — Largeur',
        back_upper:          'Dos — Épaisseur',
        shoulders_lateral:   'Épaules latérales',
        shoulders_anterior:  'Épaules avant',
        shoulders_posterior: 'Épaules arrière',
        biceps:              'Biceps',
        triceps:             'Triceps',
        quads:               'Quadriceps',
        hamstrings:          'Ischios',
        glutes:              'Fessiers',
        calves:              'Mollets',
    };

    const TIER_COLOR = {
        S: 'hsl(45,90%,55%)',
        A: 'hsl(210,80%,60%)',
        B: 'hsl(0,0%,55%)',
    };

    function buildExerciseDB() {
        const TS = window.TrainingScience;
        if (!TS?.exerciseTiers) return [];

        const db = [];
        Object.entries(TS.exerciseTiers).forEach(([muscle, tiers]) => {
            ['S', 'A', 'B'].forEach(tier => {
                (tiers[tier] || []).forEach(name => {
                    db.push({
                        name,
                        muscle,
                        muscleFr: MUSCLE_FR[muscle] || muscle,
                        tier,
                        // Normalisation pour la comparaison : minuscules, sans accents
                        norm: normalise(name),
                    });
                });
            });
        });
        return db;
    }

    // ══════════════════════════════════════════════════════════════════
    //  ALGORITHME FUZZY
    // ══════════════════════════════════════════════════════════════════

    function normalise(str) {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')   // retire les accents
            .replace(/[^a-z0-9\s]/g, ' ')       // garde lettres/chiffres/espaces
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Score fuzzy entre query et target.
     * Retourne un nombre entre 0 (aucun match) et 1 (match parfait).
     * Stratégie multicouche :
     *   1. Correspondance exacte        → score 1.0
     *   2. Débute par query             → score 0.9
     *   3. Contient query (substring)   → score 0.8
     *   4. Tous les mots trouvés        → score 0.7
     *   5. Lettres contiguës (bi-grammes) → score 0.3–0.6
     */
    function fuzzyScore(query, target) {
        if (!query) return 0;
        const q = normalise(query);
        const t = target; // déjà normalisé

        if (t === q) return 1.0;
        if (t.startsWith(q)) return 0.9;
        if (t.includes(q)) return 0.8;

        // Tous les mots de la query trouvés dans le target
        const qWords = q.split(' ').filter(Boolean);
        if (qWords.length > 1 && qWords.every(w => t.includes(w))) return 0.75;

        // Au moins un mot entier
        if (qWords.some(w => w.length >= 3 && t.includes(w))) return 0.65;

        // Bi-gramme : pourcentage de paires de lettres communes
        const bigrams = (s) => {
            const set = new Set();
            for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i + 1]);
            return set;
        };
        const bQ = bigrams(q);
        const bT = bigrams(t);
        if (!bQ.size || !bT.size) return 0;
        let common = 0;
        bQ.forEach(b => { if (bT.has(b)) common++; });
        const dice = (2 * common) / (bQ.size + bT.size);
        return dice > 0.3 ? dice * 0.6 : 0; // seuil bas filtré
    }

    function search(query, db, limit = 7) {
        if (!query || query.length < 2) return [];
        const q = normalise(query);
        return db
            .map(ex => ({ ...ex, score: fuzzyScore(q, ex.norm) }))
            .filter(ex => ex.score > 0.25)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                // Tier S avant A avant B à score égal
                return ['S','A','B'].indexOf(a.tier) - ['S','A','B'].indexOf(b.tier);
            })
            .slice(0, limit);
    }

    // ══════════════════════════════════════════════════════════════════
    //  DROPDOWN UI
    // ══════════════════════════════════════════════════════════════════

    const DROPDOWN_ID = 'fuzzyDropdown';
    let _db = [];
    let _selectedIndex = -1;
    let _results = [];

    function getDropdown() {
        return document.getElementById(DROPDOWN_ID);
    }

    function createDropdown(input) {
        let dd = getDropdown();
        if (dd) return dd;

        dd = document.createElement('div');
        dd.id = DROPDOWN_ID;
        dd.setAttribute('role', 'listbox');
        dd.setAttribute('aria-label', 'Suggestions d\'exercices');
        dd.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0; right: 0;
            background: var(--color-surface-default, #1a1a2e);
            border: 1.5px solid var(--color-border-default, #333);
            border-top: none;
            border-radius: 0 0 12px 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.35);
            z-index: 9999;
            max-height: 280px;
            overflow-y: auto;
            display: none;
        `;

        // Positionner relativement au parent de l'input
        const parent = input.parentElement;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        parent.appendChild(dd);
        return dd;
    }

    function renderDropdown(dd, results, input) {
        _results = results;
        _selectedIndex = -1;

        if (!results.length) {
            dd.style.display = 'none';
            return;
        }

        dd.innerHTML = results.map((ex, i) => `
            <div
                class="fuzzy-item"
                role="option"
                data-index="${i}"
                data-name="${escapeAttr(ex.name)}"
                style="
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 14px; cursor: pointer;
                    border-bottom: 1px solid var(--color-border-default, #2a2a3e);
                    transition: background 0.1s;
                    font-size: 0.85rem;
                "
            >
                <div>
                    <span style="color: var(--color-text-default, #f0f0f0); font-weight: 600;">${highlightMatch(ex.name, input.value)}</span>
                    <span style="display:block; font-size: 0.72rem; color: var(--color-text-subheader, #888); margin-top: 2px;">${ex.muscleFr}</span>
                </div>
                <span style="
                    font-size: 0.68rem; font-weight: 800; letter-spacing: 0.05em;
                    color: ${TIER_COLOR[ex.tier]}; background: ${TIER_COLOR[ex.tier]}20;
                    padding: 2px 8px; border-radius: 10px; border: 1px solid ${TIER_COLOR[ex.tier]}50;
                    flex-shrink: 0; margin-left: 8px;
                ">${ex.tier}</span>
            </div>
        `).join('');

        // Ajouter pied "exercice personnalisé"
        if (input.value.trim().length >= 2) {
            dd.innerHTML += `
                <div
                    class="fuzzy-item fuzzy-custom"
                    role="option"
                    data-index="${results.length}"
                    data-name="${escapeAttr(input.value.trim())}"
                    style="
                        display: flex; align-items: center; gap: 8px;
                        padding: 9px 14px; cursor: pointer;
                        font-size: 0.8rem; color: var(--color-text-subheader, #888);
                        font-style: italic;
                    "
                >
                    ➕ Ajouter <strong style="color:var(--color-text-default,#f0f0f0);font-style:normal;">"${escapeHTML(input.value.trim())}"</strong> comme exercice personnalisé
                </div>`;
        }

        dd.style.display = 'block';
        attachDropdownEvents(dd, input);
    }

    function highlightMatch(name, query) {
        if (!query) return escapeHTML(name);
        const escaped = escapeHTML(name);
        const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!q) return escaped;
        try {
            return escaped.replace(
                new RegExp(`(${q})`, 'gi'),
                '<mark style="background:hsla(45,90%,55%,.25);color:inherit;border-radius:2px;font-weight:700;">$1</mark>'
            );
        } catch { return escaped; }
    }

    function closeDropdown() {
        const dd = getDropdown();
        if (dd) dd.style.display = 'none';
        _selectedIndex = -1;
    }

    function selectItem(input, name) {
        input.value = name;
        closeDropdown();
        input.focus();
        // Déclencher l'ajout immédiat si l'utilisateur appuie Entrée
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function attachDropdownEvents(dd, input) {
        dd.querySelectorAll('.fuzzy-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // éviter blur avant click
                const name = item.dataset.name;
                selectItem(input, name);
            });
            item.addEventListener('mouseover', () => {
                dd.querySelectorAll('.fuzzy-item').forEach(el => el.style.background = '');
                item.style.background = 'var(--color-surface-muted, #22223a)';
                _selectedIndex = parseInt(item.dataset.index, 10);
            });
            item.addEventListener('mouseout', () => {
                item.style.background = '';
            });
        });
    }

    function highlightSelected(dd) {
        dd.querySelectorAll('.fuzzy-item').forEach((el, i) => {
            el.style.background = i === _selectedIndex
                ? 'var(--color-surface-muted, #22223a)'
                : '';
        });
        const active = dd.querySelector(`[data-index="${_selectedIndex}"]`);
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    // ══════════════════════════════════════════════════════════════════
    //  UTILITAIRES
    // ══════════════════════════════════════════════════════════════════

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ══════════════════════════════════════════════════════════════════
    //  BINDING SUR L'INPUT
    // ══════════════════════════════════════════════════════════════════

    function bindInput(input) {
        const dd = createDropdown(input);

        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', DROPDOWN_ID);

        input.addEventListener('input', () => {
            const q = input.value.trim();
            if (q.length < 2) { closeDropdown(); return; }
            const results = search(q, _db);
            renderDropdown(dd, results, input);
        });

        input.addEventListener('keydown', (e) => {
            const dd = getDropdown();
            if (!dd || dd.style.display === 'none') return;

            const totalItems = dd.querySelectorAll('.fuzzy-item').length;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                _selectedIndex = Math.min(_selectedIndex + 1, totalItems - 1);
                highlightSelected(dd);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                _selectedIndex = Math.max(_selectedIndex - 1, 0);
                highlightSelected(dd);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (_selectedIndex >= 0) {
                    e.preventDefault();
                    const active = dd.querySelector(`[data-index="${_selectedIndex}"]`);
                    if (active) selectItem(input, active.dataset.name);
                } else {
                    closeDropdown();
                }
            } else if (e.key === 'Escape') {
                closeDropdown();
            }
        });

        input.addEventListener('blur', () => {
            // Délai pour laisser le mousedown se déclencher
            setTimeout(closeDropdown, 180);
        });

        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 2) {
                const results = search(input.value.trim(), _db);
                renderDropdown(dd, results, input);
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        // Attendre que TrainingScience soit disponible
        const TS = window.TrainingScience;
        if (!TS?.exerciseTiers) {
            console.warn('[FuzzySearch] TrainingScience non disponible — retry dans 300ms');
            setTimeout(init, 300);
            return;
        }

        _db = buildExerciseDB();
        console.log(`[FuzzySearch] Base de ${_db.length} exercices chargée.`);

        // Input principal d'ajout d'exercice
        const mainInput = document.getElementById('customExercise');
        if (mainInput) bindInput(mainInput);

        // Écouter les nouveaux inputs qui pourraient apparaître dynamiquement
        // (modale nouvelle séance, program builder, etc.)
        const observer = new MutationObserver(() => {
            document.querySelectorAll('input[data-fuzzy-exercise]').forEach(input => {
                if (!input.dataset.fuzzyBound) {
                    input.dataset.fuzzyBound = '1';
                    bindInput(input);
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('load', init);

    // Exposer pour usage externe
    window.FuzzySearch = { search, buildExerciseDB, normalise };

})();
