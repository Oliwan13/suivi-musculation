        // ══════════════════════════════════════════════════════════════════════
        //  DISCIPLINE ENGINE — Taux d'adhérence protocole (14 jours glissants)
        //  Un repos prévu = réussite. Une séance manquée = écart.
        //  Remplace le streak (punitif) par un ratio (précis et juste).
        // ══════════════════════════════════════════════════════════════════════
        const DisciplineEngine = {

            /** Calcule le taux d'adhérence sur les N derniers jours */
            calculateAdherence(history, programmedDaysPerWeek = 4, windowDays = 14) {
                const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
                const sessions = history.filter(s => new Date(s.date).getTime() > cutoff);
                const actual   = sessions.length;
                const target   = (programmedDaysPerWeek / 7) * windowDays;
                const score    = Math.min(100, target > 0 ? Math.round((actual / target) * 100) : 0);

                let status, statusLabel, color;
                if (score >= 90) { status = 'ELITE';      statusLabel = 'Élite';      color = '#22c55e'; }
                else if (score >= 75) { status = 'STEADY'; statusLabel = 'Régulier';   color = '#3b82f6'; }
                else if (score >= 50) { status = 'BUILDING'; statusLabel = 'En construction'; color = '#f59e0b'; }
                else                  { status = 'RECOVERY'; statusLabel = 'Récupération';    color = '#ef4444'; }

                return { score, status, statusLabel, color, actual, target: Math.round(target), windowDays };
            },

            /** Enregistre un jour de repos volontaire (compte comme adhérence) */
            logRestDay() {
                const today = new Date().toISOString().split('T')[0];
                const rests = StorageAPI.get('lyftiv_rest_days', []);
                if (!rests.includes(today)) {
                    rests.push(today);
                    StorageAPI.set('lyftiv_rest_days', rests);
                }
                return today;
            },

            /** Vérifie si aujourd'hui est déjà validé (séance ou repos) */
            isTodayLogged(history) {
                const today = new Date().toISOString().split('T')[0];
                const rests = StorageAPI.get('lyftiv_rest_days', []);
                const trained = history.some(s => s.date && s.date.startsWith(today));
                return { trained, rested: rests.includes(today), today };
            },

            /** Render le widget adherence dans un container */
            renderWidget(containerId, history, programmedDaysPerWeek = 4) {
                const el = document.getElementById(containerId);
                if (!el) return;

                const data    = this.calculateAdherence(history, programmedDaysPerWeek);
                const todayStatus = this.isTodayLogged(history);
                const circumference = 100; // stroke-dasharray base sur 100

                const todayHtml = (() => {
                    if (todayStatus.trained)
                        return `<span style="color:${data.color};font-weight:700;font-size:0.78rem;">✅ Séance aujourd'hui validée</span>`;
                    if (todayStatus.rested)
                        return `<span style="color:#3b82f6;font-weight:700;font-size:0.78rem;">🛌 Repos validé aujourd'hui</span>`;
                    return `<button id="restDayBtn" style="
                        background:none;border:1px solid var(--color-border-default);
                        border-radius:20px;padding:4px 12px;font-size:0.75rem;
                        color:var(--color-text-subheader);cursor:pointer;
                        transition:all 0.2s ease;font-family:inherit;
                    " title="Valider ce jour de repos — maintient ton taux d'adhérence">
                        🛌 Valider le repos
                    </button>`;
                })();

                el.innerHTML = `
                    <div style="display:flex;align-items:center;gap:var(--spacing-md);flex-wrap:wrap;">
                        <!-- Anneau SVG de progression -->
                        <div style="position:relative;width:64px;height:64px;flex-shrink:0;">
                            <svg class="discipline-ring-svg" width="64" height="64" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15.9155" fill="none"
                                    stroke="var(--color-border-default)" stroke-width="3"/>
                                <circle cx="18" cy="18" r="15.9155" fill="none"
                                    stroke="${data.color}" stroke-width="3"
                                    stroke-linecap="round"
                                    stroke-dasharray="${data.score} ${circumference}"
                                    style="transform:rotate(-90deg);transform-origin:18px 18px;transition:stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1);"/>
                            </svg>
                            <div style="
                                position:absolute;inset:0;display:flex;align-items:center;
                                justify-content:center;font-size:0.72rem;font-weight:900;
                                font-family:var(--font-mono);color:${data.color};
                            ">${data.score}%</div>
                        </div>

                        <!-- Texte statut -->
                        <div style="flex:1;min-width:120px;">
                            <div style="font-size:0.65rem;font-weight:900;letter-spacing:0.12em;
                                text-transform:uppercase;color:var(--color-text-subheader);
                                margin-bottom:2px;">Execution Rate · ${data.windowDays}j</div>
                            <div style="font-size:1rem;font-weight:800;color:var(--color-text-header);
                                letter-spacing:-0.02em;margin-bottom:4px;">
                                PROTOCOLE&thinsp;:&thinsp;<span style="color:${data.color};">${data.statusLabel.toUpperCase()}</span>
                            </div>
                            <div style="font-size:0.75rem;color:var(--color-text-subheader);">
                                ${data.actual} séance${data.actual > 1 ? 's' : ''} effectuée${data.actual > 1 ? 's' : ''}
                                sur ${data.target} prévues
                            </div>
                        </div>

                        <!-- Validation repos -->
                        <div style="display:flex;align-items:center;">
                            ${todayHtml}
                        </div>
                    </div>`;

                // Handler bouton repos
                const btn = el.querySelector('#restDayBtn');
                if (btn) {
                    btn.addEventListener('click', () => {
                        DisciplineEngine.logRestDay();
                        if (navigator.vibrate) navigator.vibrate([10, 20, 10]);
                        DisciplineEngine.renderWidget(containerId, history, programmedDaysPerWeek);
                        showNotification('🛌 Repos validé — ton protocole est respecté.', 'success', 3000);
                    });
                    btn.addEventListener('mouseenter', () => {
                        btn.style.borderColor = '#3b82f6';
                        btn.style.color = '#3b82f6';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.borderColor = 'var(--color-border-default)';
                        btn.style.color = 'var(--color-text-subheader)';
                    });
                }
            }
        };

        window.DisciplineEngine = DisciplineEngine;
