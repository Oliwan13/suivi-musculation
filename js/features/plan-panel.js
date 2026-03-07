    // ── GLOBAL NAV v3 — déclencheurs purs, zéro effet de bord ─────────────
    //
    // CORRECTION POINT 1 :
    //   Pas de tabTraining.click() / tabNutrition.click() — ceux-ci
    //   déclencheraient Router.navigate() en effet de bord non voulu.
    //   À la place : on reproduit EXACTEMENT le pattern du dashMenuBtn
    //   existant (manipulations classList directes, pas de Router).
    //
    // CORRECTION POINT 3 :
    //   Le nav est caché via CSS (#app-container.hidden ~ #global-mobile-nav).
    //   Le JS ne fait qu'un seul job : mettre à jour la classe gnav-active
    //   après chaque navigation.
    //
    (function() {
        function wireGlobalNav() {
            var navHome    = document.getElementById('gnav-home');
            var navTrain   = document.getElementById('gnav-train');
            var navStats   = document.getElementById('gnav-stats');
            var navProfile = document.getElementById('gnav-profile');

            if (!navHome || !navTrain || !navStats) return;

            // Références aux containers (déjà référencées dans le code principal)
            var landing      = document.getElementById('landing');
            var dashboard    = document.getElementById('dashboard');
            var appContainer = document.getElementById('app-container');

            function setActive(btn) {
                [navHome, navTrain, navStats, navProfile].forEach(function(b) {
                    if (b) b.classList.remove('gnav-active');
                });
                btn.classList.add('gnav-active');
            }

            // ── HOME → Dashboard onglet Entraînement ──────────────────
            // Reproduit EXACTEMENT le comportement du dashMenuBtn (ligne ~8820)
            // sans appeler .click() (pas de Router.navigate())
            navHome.addEventListener('click', function() {
                setActive(navHome);
                if (typeof showDashboard === 'function') {
                    showDashboard();
                }
                setTimeout(function() {
                    document.querySelectorAll('.dash-tab-btn').forEach(function(b) {
                        var isTraining = b.dataset.tab === 'panelTraining';
                        b.classList.toggle('active', isTraining);
                        b.setAttribute('aria-selected', isTraining ? 'true' : 'false');
                    });
                    document.querySelectorAll('.dash-tab-panel').forEach(function(p) {
                        p.classList.toggle('hidden', p.id !== 'panelTraining');
                    });
                }, 0);
            });

            // ── TRAIN → app-container ─────────────────────────────────
            // Reproduit exactement startSessionFromDashboard sans dupliquer la logique métier
            navTrain.addEventListener('click', function() {
                setActive(navTrain);
                if (landing)      landing.classList.add('hidden');
                if (dashboard)    dashboard.classList.add('hidden');
                if (appContainer) appContainer.classList.remove('hidden');
                sessionStorage.setItem('dashboardShown', 'true');
                sessionStorage.setItem('landingPassed', 'true');
            });

            // ── STATS → Dashboard onglet Nutrition ────────────────────
            // Même pattern que HOME mais active panelNutrition
            navStats.addEventListener('click', function() {
                setActive(navStats);
                if (typeof showDashboard === 'function') {
                    showDashboard();
                }
                setTimeout(function() {
                    document.querySelectorAll('.dash-tab-btn').forEach(function(b) {
                        var isNutrition = b.dataset.tab === 'panelNutrition';
                        b.classList.toggle('active', isNutrition);
                        b.setAttribute('aria-selected', isNutrition ? 'true' : 'false');
                    });
                    document.querySelectorAll('.dash-tab-panel').forEach(function(p) {
                        p.classList.toggle('hidden', p.id !== 'panelNutrition');
                    });
                }, 0);
            });

            // ── PROFILE → Dashboard onglet Profil ────────────────────
            if (navProfile) {
                navProfile.addEventListener('click', function() {
                    setActive(navProfile);
                    if (typeof showDashboard === 'function') {
                        showDashboard();
                    }
                    setTimeout(function() {
                        document.querySelectorAll('.dash-tab-btn').forEach(function(b) {
                            var isProfile = b.dataset.tab === 'panelProfile';
                            b.classList.toggle('active', isProfile);
                            b.setAttribute('aria-selected', isProfile ? 'true' : 'false');
                        });
                        document.querySelectorAll('.dash-tab-panel').forEach(function(p) {
                            p.classList.toggle('hidden', p.id !== 'panelProfile');
                        });
                    }, 0);
                });
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', wireGlobalNav);
        } else {
            wireGlobalNav();
        }
    })();
