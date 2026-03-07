    /* ============================================================
       JEÛNE INTERMITTENT — Timer & Alarmes
    ============================================================ */
    (function() {
        const STORAGE_KEY = 'lyftiv_fasting_state';
        const HYDRO_INTERVAL_MS = 60 * 60 * 1000; // rappel hydratation toutes les 60min

        // État
        let fastState = {
            active: false,
            phase: 'idle',        // 'idle' | 'fasting' | 'eating'
            startTime: null,
            fastHours: 16,
            eatHours: 8,
        };
        let timerInterval = null;
        let hydroInterval = null;
        let notifPermission = ('Notification' in window && Notification.permission === 'granted');

        // DOM refs
        const arc       = document.getElementById('fastingArc');
        const timeDisp  = document.getElementById('fastingTimeDisplay');
        const phaseL    = document.getElementById('fastingPhaseLabel');
        const emoji     = document.getElementById('fastingEmoji');
        const pBar      = document.getElementById('fastingProgressBar');
        const pPct      = document.getElementById('fastingProgressPct');
        const endTime   = document.getElementById('fastingEndTime');
        const startLbl  = document.getElementById('fastingStartLabel');
        const endLbl    = document.getElementById('fastingEndLabel');
        const btnStart  = document.getElementById('fastingStartBtn');
        const btnStop   = document.getElementById('fastingStopBtn');
        const btnEat    = document.getElementById('fastingEatBtn');
        const protoDesc = document.getElementById('fastingProtocolDesc');
        const hydroRem  = document.getElementById('fastingHydroReminder');
        const protoBtns = document.querySelectorAll('.fasting-proto-btn');

        if (!arc) return; // section not in DOM

        // ── Notifications ─────────────────────────────────────
        function requestNotifPermission() {
            if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission().then(p => {
                    notifPermission = (p === 'granted');
                });
            }
        }

        function sendNotif(title, body, icon = '⏱️') {
            if (notifPermission && 'Notification' in window) {
                try {
                    new Notification(title, { body, icon: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${icon}</text></svg>`) });
                } catch(e) {}
            }
            beep([[660,0],[880,0.15],[660,0.3]], 0.6, 0.4);
            showNotification(title + ' — ' + body, 'info', 6000);
        }

        // ── Formatage ──────────────────────────────────────────
        function formatHMS(ms) {
            if (ms < 0) ms = 0;
            const s = Math.floor(ms / 1000);
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sc = s % 60;
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
        }

        function formatClock(date) {
            return date.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        }

        // ── Persistence ────────────────────────────────────────
        function saveState() {
            StorageAPI.set(STORAGE_KEY, fastState);
        }

        function loadState() {
            try {
                const s = StorageAPI.get(STORAGE_KEY);
                if (s && s.startTime) {
                    fastState = s;
                    return true;
                }
            } catch(e) {}
            return false;
        }

        // ── Mise à jour de l'arc SVG ───────────────────────────
        function updateArc(pct, eating) {
            const circ = 527.8;
            const offset = circ - (circ * Math.min(pct, 1));
            arc.style.strokeDashoffset = offset;
            if (eating) {
                arc.setAttribute('stroke', 'url(#fastingGradEat)');
            } else {
                arc.setAttribute('stroke', 'url(#fastingGrad)');
            }
        }

        // ── Rendu du timer ─────────────────────────────────────
        function renderTimer() {
            if (fastState.phase === 'idle') {
                timeDisp.textContent = '00:00:00';
                phaseL.textContent   = 'En attente';
                emoji.textContent    = '⏳';
                pBar.style.width     = '0%';
                pPct.textContent     = '0%';
                endTime.textContent  = 'Lance le jeûne pour voir l\'heure de fin';
                updateArc(0, false);
                return;
            }

            const now       = Date.now();
            const elapsed   = now - fastState.startTime;
            const isFasting = fastState.phase === 'fasting';
            const totalMs   = (isFasting ? fastState.fastHours : fastState.eatHours) * 3600000;
            const remaining = Math.max(0, totalMs - elapsed);
            const pct       = Math.min(elapsed / totalMs, 1);

            timeDisp.textContent = formatHMS(remaining);
            pPct.textContent     = Math.round(pct * 100) + '%';
            pBar.style.width     = (pct * 100) + '%';
            updateArc(pct, !isFasting);

            if (isFasting) {
                phaseL.textContent = 'Jeûne en cours';
                emoji.textContent  = pct < 0.5 ? '⏳' : pct < 0.9 ? '🔥' : '🎯';
                startLbl.textContent = 'Début jeûne';
                endLbl.textContent   = 'Fin jeûne';
                pBar.style.background = 'linear-gradient(90deg,hsl(198,75%,48%),hsl(234,78%,65%))';
                const endDate = new Date(fastState.startTime + totalMs);
                endTime.textContent = `Fin du jeûne à ${formatClock(endDate)} · ${formatHMS(remaining)} restant${remaining > 0 ? 's' : ''}`;
            } else {
                phaseL.textContent = 'Fenêtre alimentaire';
                emoji.textContent  = '🍽️';
                startLbl.textContent = 'Début repas';
                endLbl.textContent   = 'Fin repas';
                pBar.style.background = 'linear-gradient(90deg,hsl(145,62%,52%),hsl(162,68%,46%))';
                const endDate = new Date(fastState.startTime + totalMs);
                endTime.textContent = `Retour au jeûne à ${formatClock(endDate)} · ${formatHMS(remaining)} restant${remaining > 0 ? 's' : ''}`;
            }

            // Fin de phase
            if (remaining <= 0 && fastState.active) {
                onPhaseEnd();
            }
        }

        function onPhaseEnd() {
            const wasFasting = fastState.phase === 'fasting';
            if (wasFasting) {
                sendNotif('🍽️ Jeûne terminé !', `Ta fenêtre alimentaire de ${fastState.eatHours}h commence maintenant. Mange des aliments vrais, riches en protéines.`);
                fastState.phase     = 'eating';
                fastState.startTime = Date.now();
                btnEat.style.display  = 'none';
                // btns already set
            } else {
                sendNotif('⏳ Fenêtre alimentaire terminée', `Ton jeûne de ${fastState.fastHours}h reprend maintenant. Reste hydraté(e) !`);
                fastState.phase     = 'fasting';
                fastState.startTime = Date.now();
            }
            saveState();
        }

        // ── Contrôles ─────────────────────────────────────────
        function startFasting() {
            requestNotifPermission();
            fastState.active    = true;
            fastState.phase     = 'fasting';
            fastState.startTime = Date.now();
            saveState();
            updateButtons();
            startTick();
            startHydroReminders();
            sendNotif('⏳ Jeûne démarré !', `Objectif : ${fastState.fastHours}h · Fin prévue à ${formatClock(new Date(fastState.startTime + fastState.fastHours * 3600000))}. Bois de l'eau !`);
        }

        function stopFasting() {
            fastState.active    = false;
            fastState.phase     = 'idle';
            fastState.startTime = null;
            saveState();
            clearInterval(timerInterval);
            clearInterval(hydroInterval);
            timerInterval = null;
            hydroInterval = null;
            hydroRem.style.display = 'none';
            updateButtons();
            renderTimer();
        }

        function startEating() {
            fastState.phase     = 'eating';
            fastState.startTime = Date.now();
            saveState();
            updateButtons();
            sendNotif('🍽️ Bonne fenêtre alimentaire !', `Tu as ${fastState.eatHours}h pour manger. Priorise protéines et légumes.`);
        }

        function updateButtons() {
            const idle    = fastState.phase === 'idle';
            const fasting = fastState.phase === 'fasting';
            const active  = fastState.active;

            btnStart.classList.toggle('fasting-btn-hidden', !idle);
            btnStop.classList.toggle('fasting-btn-hidden',  !active);
            btnEat.classList.toggle('fasting-btn-hidden',   !fasting);
        }

        function startTick() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(renderTimer, 1000);
            renderTimer();
        }

        function startHydroReminders() {
            if (hydroInterval) clearInterval(hydroInterval);
            hydroInterval = setInterval(() => {
                hydroRem.style.display = 'block';
                setTimeout(() => { hydroRem.style.display = 'none'; }, 12000);
                sendNotif('💧 Hydratation', 'Rappel : as-tu bu de l\'eau récemment ?');
            }, HYDRO_INTERVAL_MS);
        }

        // ── Sélecteur de protocole ────────────────────────────
        protoBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (fastState.active) return; // pas de changement en cours
                protoBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                fastState.fastHours = parseInt(btn.dataset.fast);
                fastState.eatHours  = parseInt(btn.dataset.eat) || 0;
                protoDesc.textContent = fastState.eatHours > 0
                    ? `${fastState.fastHours}h de jeûne · ${fastState.eatHours}h de fenêtre alimentaire`
                    : `Jeûne de 24h complet`;
                saveState();
            });
        });

        // ── Events boutons ────────────────────────────────────
        btnStart.addEventListener('click', startFasting);
        btnStop.addEventListener('click', stopFasting);
        btnEat.addEventListener('click', startEating);

        // ── Init depuis localStorage ──────────────────────────
        if (loadState()) {
            // Restaurer le protocole sélectionné
            protoBtns.forEach(b => {
                b.classList.toggle('active',
                    parseInt(b.dataset.fast) === fastState.fastHours &&
                    parseInt(b.dataset.eat || 0) === fastState.eatHours
                );
            });
            protoDesc.textContent = fastState.eatHours > 0
                ? `${fastState.fastHours}h de jeûne · ${fastState.eatHours}h de fenêtre alimentaire`
                : `Jeûne de 24h complet`;

            if (fastState.active) {
                updateButtons();
                startTick();
                startHydroReminders();
            } else {
                updateButtons();
                renderTimer();
            }
        } else {
            updateButtons();
            renderTimer();
        }

    })();
