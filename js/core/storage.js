    // ── Utilitaires globaux (accessibles à tous les scripts) ─────────────

    // Audio utilitaire global — accessible depuis tous les scripts <script> du fichier
    function beep(freq = 500, dur = 0.5, vol = 0.4) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            if (Array.isArray(freq)) {
                freq.forEach(([f, t]) => osc.frequency.setValueAtTime(f, ctx.currentTime + t));
            } else {
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
            }
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
        } catch(e) {}
    }

    const StorageAPI = {
        get(key, defaultValue = null) {
            try {
                const raw = localStorage.getItem(key);
                return raw !== null ? JSON.parse(raw) : defaultValue;
            } catch(e) {
                console.error(`[Storage] Lecture échouée (${key}):`, e);
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch(e) {
                console.error(`[Storage] Écriture échouée (${key}):`, e);
            }
        },
        remove(key) { localStorage.removeItem(key); },
        getRaw(key, fallback = null) { return localStorage.getItem(key) ?? fallback; },
        setRaw(key, value) { localStorage.setItem(key, value); }
    };

    // ── parseInputValues — parsing sécurisé des inputs poids/reps ──
    // Retourne toujours un tableau de nombres positifs, jamais d'exception
    function parseInputValues(raw) {
        if (raw === null || raw === undefined) return [];
        return String(raw)
            .split('+')
            .map(v => parseFloat(v.trim().replace(',', '.')))
            .filter(v => Number.isFinite(v) && v > 0);
    }

window.StorageAPI     = StorageAPI;
window.parseInputValues = parseInputValues;
window.beep           = beep;
