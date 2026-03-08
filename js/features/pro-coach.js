// js/features/pro-coach.js — Lyftiv Pro Coachs
// Interface de suivi coach/athlète
// Mode coach : accède aux données partagées de ses athlètes
// Mode athlète : partage ses données avec son coach
// ══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    const SUPABASE_URL  = 'https://VOTRE_PROJET.supabase.co';
    const SUPABASE_ANON = 'VOTRE_ANON_KEY';
    const IS_CONFIGURED = !SUPABASE_URL.includes('VOTRE_PROJET');

    // ══════════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════════

    function getProfile() {
        try { return JSON.parse(localStorage.getItem('lyftiv_profile') || '{}'); } catch(e) { return {}; }
    }

    function getHistory() {
        try { return JSON.parse(localStorage.getItem('workoutHistory') || '[]'); } catch(e) { return []; }
    }

    async function _req(path, method = 'GET', body = null) {
        const token = window.LyftivAuth?.getToken?.() || SUPABASE_ANON;
        const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` };
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(SUPABASE_URL + path, opts);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
    }

    // ══════════════════════════════════════════════════════════════════
    //  RAPPORT ATHLÈTE
    // ══════════════════════════════════════════════════════════════════

    function generateAthleteReport(history, profile) {
        const last4weeks = history.filter(s =>
            new Date(s.date) > new Date(Date.now() - 28 * 86400000)
        );

        const totalSessions = history.length;
        const recentSessions = last4weeks.length;
        const avgPerWeek = Math.round((recentSessions / 4) * 10) / 10;

        const tonnageRecent = last4weeks.reduce((t, s) =>
            t + (s.exercises||[]).reduce((a, ex) =>
                a + (ex.series||[]).reduce((b, sr) => b + (sr.reps||0)*(sr.weight||0), 0), 0), 0);

        const exerciseFreq = {};
        history.forEach(s => {
            (s.exercises||[]).forEach(ex => {
                exerciseFreq[ex.name] = (exerciseFreq[ex.name] || 0) + 1;
            });
        });
        const topExercises = Object.entries(exerciseFreq)
            .sort((a,b) => b[1]-a[1]).slice(0, 5);

        const prs = {};
        history.forEach(s => {
            (s.exercises||[]).forEach(ex => {
                const maxW = Math.max(0, ...(ex.series||[]).map(sr => sr.weight || 0));
                if (!prs[ex.name] || maxW > prs[ex.name]) prs[ex.name] = maxW;
            });
        });
        const topPRs = Object.entries(prs).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 5);

        const weeklyTonnage = [];
        for (let w = 3; w >= 0; w--) {
            const start = new Date(Date.now() - (w+1) * 7 * 86400000);
            const end   = new Date(Date.now() - w * 7 * 86400000);
            const wSessions = history.filter(s => new Date(s.date) >= start && new Date(s.date) < end);
            const t = wSessions.reduce((acc, s) =>
                acc + (s.exercises||[]).reduce((a, ex) =>
                    a + (ex.series||[]).reduce((b, sr) => b + (sr.reps||0)*(sr.weight||0), 0), 0), 0);
            weeklyTonnage.push({ week: `S-${w}`, tonnage: Math.round(t), sessions: wSessions.length });
        }

        return { totalSessions, recentSessions, avgPerWeek, tonnageRecent, topExercises, topPRs, weeklyTonnage, profile };
    }

    // ══════════════════════════════════════════════════════════════════
    //  PARTAGE AVEC COACH
    // ══════════════════════════════════════════════════════════════════

    async function shareWithCoach(coachCode) {
        const userId = window.LyftivAuth?.getUser?.()?.id;
        if (!userId) return { error: 'Non connecté' };

        if (IS_CONFIGURED) {
            const history = getHistory();
            const profile = getProfile();
            const report  = generateAthleteReport(history, profile);

            const { ok } = await _req('/rest/v1/lyftiv_coach_athletes', 'POST', {
                athlete_id: userId,
                coach_code: coachCode.toUpperCase(),
                report: JSON.stringify(report),
                shared_at: new Date().toISOString(),
            });
            return ok ? { ok: true } : { error: 'Code coach invalide ou erreur réseau.' };
        }

        // Mode local : copier le code de partage
        return { ok: true, localMode: true };
    }

    function generateCoachCode() {
        const userId = window.LyftivAuth?.getUser?.()?.id || 'local';
        return (userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) +
                Math.random().toString(36).slice(2, 5).toUpperCase()).slice(0, 8);
    }

    // ══════════════════════════════════════════════════════════════════
    //  RENDER — Panel Pro Coach
    // ══════════════════════════════════════════════════════════════════

    function renderCoachPanel(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const profile   = getProfile();
        const history   = getHistory();
        const report    = generateAthleteReport(history, profile);
        const isCoach   = profile.isCoach || false;

        const maxTonnage = Math.max(...report.weeklyTonnage.map(w => w.tonnage), 1);

        container.innerHTML = `<div style="max-width:560px;margin:0 auto;padding-bottom:40px;">

            <!-- HEADER -->
            <div style="background:linear-gradient(135deg,hsla(260,70%,55%,.15),hsla(214,80%,55%,.1));border:1.5px solid hsla(260,70%,55%,.3);border-radius:var(--radius-large,16px);padding:var(--spacing-xl,20px);margin-bottom:var(--spacing-lg,16px);text-align:center;">
                <div style="font-size:2.5rem;margin-bottom:8px;">👨‍💼</div>
                <h2 style="font-size:1.1rem;font-weight:900;color:var(--color-text-header);margin:0 0 6px;">Lyftiv Pro Coachs</h2>
                <p style="font-size:.78rem;color:var(--color-text-subheader);margin:0;">Suivi coach-athlète · Rapports détaillés · Communication directe</p>
            </div>

            <!-- RAPPORT PERSONNEL -->
            <div style="background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);margin-bottom:var(--spacing-lg,16px);">
                <h3 style="font-size:.9rem;font-weight:800;margin:0 0 14px;color:var(--color-text-header);">📊 Ton rapport athlète</h3>

                <!-- Stats grid -->
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
                    ${[
                        ['🏋️', report.totalSessions, 'séances total'],
                        ['📅', report.avgPerWeek + 'x', 'par semaine'],
                        ['⚡', Math.round(report.tonnageRecent/1000) + 'T', '28 derniers jours'],
                    ].map(([icon, val, label]) => `
                    <div style="background:var(--color-surface-muted);border-radius:10px;padding:10px;text-align:center;">
                        <div style="font-size:1rem;">${icon}</div>
                        <div style="font-size:1rem;font-weight:900;color:var(--color-text-header);">${val}</div>
                        <div style="font-size:.65rem;color:var(--color-text-subheader);">${label}</div>
                    </div>`).join('')}
                </div>

                <!-- Volume hebdomadaire (mini chart) -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:.75rem;font-weight:700;color:var(--color-text-subheader);margin-bottom:8px;">Volume hebdomadaire (4 sem.)</div>
                    <div style="display:flex;align-items:flex-end;gap:6px;height:60px;">
                        ${report.weeklyTonnage.map((w, i) => {
                            const h = maxTonnage > 0 ? Math.max(4, Math.round((w.tonnage / maxTonnage) * 56)) : 4;
                            const isLast = i === report.weeklyTonnage.length - 1;
                            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                                <div style="font-size:.62rem;color:var(--color-text-subheader);">${w.sessions}s</div>
                                <div style="width:100%;height:${h}px;background:${isLast?'hsl(214,72%,55%)':'var(--color-surface-muted)'};border-radius:4px 4px 0 0;"></div>
                                <div style="font-size:.6rem;color:var(--color-text-subheader);">${w.week}</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Top PRs -->
                ${report.topPRs.length ? `
                <div style="margin-bottom:14px;">
                    <div style="font-size:.75rem;font-weight:700;color:var(--color-text-subheader);margin-bottom:8px;">🏆 Records personnels</div>
                    ${report.topPRs.slice(0, 3).map(([name, w]) => `
                    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border-default);">
                        <span style="font-size:.78rem;color:var(--color-text-default);">${name}</span>
                        <span style="font-size:.78rem;font-weight:700;color:hsl(145,65%,50%);">${w} kg</span>
                    </div>`).join('')}
                </div>` : ''}

                <!-- Export rapport -->
                <button id="exportReportBtn" style="width:100%;padding:10px;border:1.5px solid var(--color-border-default);border-radius:10px;background:var(--color-surface-muted);color:var(--color-text-default);font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">📄 Exporter le rapport (PDF)</button>
            </div>

            <!-- PARTAGER AVEC UN COACH -->
            <div style="background:var(--color-surface-default);border:1px solid var(--color-border-default);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);margin-bottom:var(--spacing-lg,16px);">
                <h3 style="font-size:.9rem;font-weight:800;margin:0 0 10px;color:var(--color-text-header);">🔗 Partager avec mon coach</h3>
                <p style="font-size:.78rem;color:var(--color-text-subheader);margin:0 0 12px;">Entre le code fourni par ton coach pour lui partager tes données.</p>
                <div style="display:flex;gap:8px;">
                    <input type="text" id="coachCodeInput" placeholder="CODE COACH (ex: ALEX1234)" style="flex:1;padding:11px 14px;border-radius:10px;border:1.5px solid var(--color-border-default);background:var(--color-surface-muted);color:var(--color-text-default);font-size:.88rem;font-family:inherit;outline:none;text-transform:uppercase;letter-spacing:.1em;" maxlength="8"/>
                    <button id="shareWithCoachBtn" style="padding:10px 16px;border:none;border-radius:10px;background:var(--color-primary-default,hsl(214,72%,50%));color:#fff;font-weight:800;font-size:.82rem;cursor:pointer;font-family:inherit;">Envoyer</button>
                </div>
                <div id="coachShareStatus" style="margin-top:8px;font-size:.75rem;"></div>
            </div>

            <!-- MODE COACH -->
            <div style="background:linear-gradient(135deg,hsla(260,70%,55%,.08),transparent);border:1.5px solid hsla(260,70%,55%,.25);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);margin-bottom:var(--spacing-lg,16px);">
                <h3 style="font-size:.9rem;font-weight:800;margin:0 0 8px;color:hsl(260,70%,65%);">👨‍💼 Mode Coach</h3>
                <p style="font-size:.78rem;color:var(--color-text-subheader);margin:0 0 12px;">Active le mode coach pour suivre tes athlètes. Donne-leur ton code personnel.</p>

                <div style="background:var(--color-surface-muted);border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <div>
                        <div style="font-size:.72rem;color:var(--color-text-subheader);margin-bottom:2px;">Ton code coach</div>
                        <div style="font-size:1.1rem;font-weight:900;color:var(--color-text-header);letter-spacing:.12em;" id="coachCodeDisplay">${generateCoachCode()}</div>
                    </div>
                    <button id="copyCoachCodeBtn" style="padding:8px 14px;border:1px solid var(--color-border-default);border-radius:8px;background:var(--color-surface-default);color:var(--color-text-default);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;">📋 Copier</button>
                </div>

                ${IS_CONFIGURED ? `
                <div id="athletesList">
                    <div style="font-size:.78rem;color:var(--color-text-subheader);text-align:center;padding:12px;">Aucun athlète connecté pour l'instant.</div>
                </div>` : `
                <div style="font-size:.75rem;color:hsl(35,80%,54%);background:hsla(35,80%,54%,.1);padding:10px;border-radius:8px;">
                    ⚠️ Configure Supabase pour activer le mode coach multi-athlètes.
                </div>`}
            </div>

            <!-- TEASER PREMIUM -->
            <div style="background:linear-gradient(135deg,hsla(45,90%,55%,.1),hsla(260,70%,55%,.05));border:1.5px dashed hsla(45,90%,55%,.4);border-radius:var(--radius-large,16px);padding:var(--spacing-lg,16px);text-align:center;">
                <div style="font-size:1.5rem;margin-bottom:6px;">👑</div>
                <h3 style="font-size:.88rem;font-weight:900;color:hsl(45,90%,55%);margin:0 0 8px;">Lyftiv Pro — Bientôt disponible</h3>
                <p style="font-size:.75rem;color:var(--color-text-subheader);margin:0 0 12px;">Messagerie coach-athlète · Plans hebdomadaires personnalisés · Vidéos techniques · Suivi nutrition</p>
                <button id="notifyProBtn" style="padding:10px 20px;border:1.5px solid hsl(45,90%,55%);border-radius:10px;background:hsla(45,90%,55%,.1);color:hsl(45,90%,60%);font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">🔔 Me notifier au lancement</button>
            </div>
        </div>`;

        // Events
        document.getElementById('copyCoachCodeBtn')?.addEventListener('click', () => {
            const code = document.getElementById('coachCodeDisplay')?.textContent;
            navigator.clipboard?.writeText(code || '');
            if (typeof window.showNotification === 'function') window.showNotification('Code copié !', 'success', 2000);
        });

        document.getElementById('shareWithCoachBtn')?.addEventListener('click', async () => {
            const code = document.getElementById('coachCodeInput')?.value?.trim().toUpperCase();
            const status = document.getElementById('coachShareStatus');
            if (!code || code.length < 4) {
                if (status) { status.textContent = '❌ Code invalide.'; status.style.color = 'hsl(0,65%,55%)'; }
                return;
            }
            if (!window.LyftivAuth?.isLoggedIn?.()) {
                window.LyftivAuth?.openAuthModal?.('signup');
                return;
            }
            const { ok, error } = await shareWithCoach(code);
            if (status) {
                status.textContent = ok ? '✅ Données partagées avec ton coach !' : `❌ ${error}`;
                status.style.color = ok ? 'hsl(145,65%,50%)' : 'hsl(0,65%,55%)';
            }
        });

        document.getElementById('exportReportBtn')?.addEventListener('click', () => {
            _exportReportPDF(report, profile);
        });

        document.getElementById('notifyProBtn')?.addEventListener('click', () => {
            const email = window.LyftivAuth?.getUser?.()?.email;
            if (email) {
                localStorage.setItem('lyftiv_pro_notify', email);
                if (typeof window.showNotification === 'function') window.showNotification('Tu seras notifié(e) au lancement de Lyftiv Pro ! 🎉', 'success', 4000);
                document.getElementById('notifyProBtn').textContent = '✅ Inscription confirmée';
                document.getElementById('notifyProBtn').disabled = true;
            } else {
                window.LyftivAuth?.openAuthModal?.('signup');
            }
        });
    }

    function _exportReportPDF(report, profile) {
        // Créer une page HTML propre pour window.print()
        const name = profile.name || 'Athlète';
        const date = new Date().toLocaleDateString('fr-FR');
        const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Rapport Lyftiv — ${name}</title>
<style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 40px auto; color: #111; line-height: 1.6; }
    h1 { color: #1a56db; } h2 { color: #333; font-size: 1rem; border-bottom: 2px solid #eee; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
    .card { background: #f8f8f8; border-radius: 8px; padding: 12px; text-align: center; }
    .card .val { font-size: 1.4rem; font-weight: 900; color: #1a56db; }
    .card .label { font-size: .72rem; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    td, th { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: .88rem; }
    th { text-align: left; color: #666; font-weight: 600; }
    .footer { margin-top: 40px; font-size: .75rem; color: #999; text-align: center; }
</style></head><body>
<h1>🏋️ Rapport Lyftiv — ${name}</h1>
<p style="color:#666;margin-top:-8px;">Généré le ${date} · ${report.totalSessions} séances au total</p>

<h2>📊 Statistiques 28 derniers jours</h2>
<div class="grid">
    <div class="card"><div class="val">${report.recentSessions}</div><div class="label">Séances</div></div>
    <div class="card"><div class="val">${report.avgPerWeek}×</div><div class="label">Par semaine</div></div>
    <div class="card"><div class="val">${Math.round(report.tonnageRecent/1000)}T</div><div class="label">Tonnage</div></div>
</div>

<h2>🏆 Records personnels (Top 5)</h2>
<table>
    <tr><th>Exercice</th><th>PR (kg)</th></tr>
    ${report.topPRs.map(([n, w]) => `<tr><td>${n}</td><td><strong>${w}</strong></td></tr>`).join('')}
</table>

<h2>📅 Exercices les plus fréquents</h2>
<table>
    <tr><th>Exercice</th><th>Séances</th></tr>
    ${report.topExercises.map(([n, c]) => `<tr><td>${n}</td><td>${c}</td></tr>`).join('')}
</table>

<div class="footer">Rapport généré par Lyftiv · lyftiv.app</div>
</body></html>`;

        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
    }

    // ══════════════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════════════

    function init() {
        const tabCoachPro = document.getElementById('tabCoachPro');
        if (tabCoachPro) {
            tabCoachPro.addEventListener('click', () => renderCoachPanel('panelCoachPro'));
            if (tabCoachPro.classList.contains('active')) renderCoachPanel('panelCoachPro');
        }
    }

    window.addEventListener('load', init);
    window.LyftivProCoach = { renderCoachPanel, generateAthleteReport };

})();
