
    // ══════════════════════════════════════════════════════════════
    // PROFIL UTILISATEUR — JS
    // Stocke en 'lyftiv_profile'. Synchronise avec tdee_* inputs.
    // Zéro dépendance au code métier existant.
    // ══════════════════════════════════════════════════════════════
    (function() {
        var PROFILE_KEY = 'lyftiv_profile';

        var goalLabels = {
            prise:   '💪 Prise de masse',
            seche:   '🔥 Sèche',
            recompo: '⚡ Recomposition',
            force:   '🏋️ Force',
            sante:   '❤️ Santé'
        };

        function loadProfile() {
            try {
                return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
            } catch(e) { return {}; }
        }

        function saveProfile(data) {
            localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
        }

        function syncToTDEEInputs(profile) {
            // Synchroniser les champs TDEE avec le profil pour éviter double-saisie
            var fields = [
                ['tdee_age',    profile.age,    'value'],
                ['tdee_weight', profile.weight, 'value'],
                ['tdee_height', profile.height, 'value'],
                ['bf_age',      profile.age,    'value'],
                ['bf_weight',   profile.weight, 'value'],
                ['bf_height',   profile.height, 'value'],
            ];
            fields.forEach(function(f) {
                var el = document.getElementById(f[0]);
                if (el && f[1]) el.value = f[1];
            });
            // Genre
            if (profile.gender) {
                var maleEl = document.getElementById('tdee_male');
                var femaleEl = document.getElementById('tdee_female');
                var bfMale = document.getElementById('bf_male');
                var bfFemale = document.getElementById('bf_female');
                if (maleEl && femaleEl) {
                    maleEl.checked = profile.gender === 'male';
                    femaleEl.checked = profile.gender === 'female';
                }
                if (bfMale && bfFemale) {
                    bfMale.checked = profile.gender === 'male';
                    bfFemale.checked = profile.gender === 'female';
                }
            }
        }

        function updateDisplay(profile) {
            // Nom
            var nameEl = document.getElementById('profileNameDisplay');
            if (nameEl) nameEl.textContent = profile.name || 'Athlète';

            // Avatar initiale
            var avatarEl = document.getElementById('profileAvatar');
            if (avatarEl) {
                avatarEl.textContent = profile.name ? profile.name.charAt(0).toUpperCase() : '👤';
            }

            // Objectif
            var goalEl = document.getElementById('profileGoalDisplay');
            if (goalEl) goalEl.textContent = goalLabels[profile.goal] || 'Objectif non défini';

            // Stats
            var statW = document.getElementById('profileStatWeight');
            var statH = document.getElementById('profileStatHeight');
            var statA = document.getElementById('profileStatAge');
            if (statW) statW.textContent = profile.weight || '—';
            if (statH) statH.textContent = profile.height || '—';
            if (statA) statA.textContent = profile.age || '—';

            // Score Lyftiv (récupéré depuis body dataset)
            var scoreEl = document.getElementById('profileScore');
            var leagueEl = document.getElementById('profileLeague');
            if (scoreEl) {
                var score = document.body.dataset.lyftivScore;
                scoreEl.textContent = score || '—';
            }
            if (leagueEl) {
                var league = document.body.dataset.league;
                leagueEl.textContent = league ? 'Ligue ' + league : '';
            }
        }

        function fillForm(profile) {
            var nameIn = document.getElementById('profileName');
            var genderIn = document.getElementById('profileGender');
            var ageIn = document.getElementById('profileAge');
            var weightIn = document.getElementById('profileWeight');
            var heightIn = document.getElementById('profileHeight');

            if (nameIn && profile.name) nameIn.value = profile.name;
            if (genderIn && profile.gender) genderIn.value = profile.gender;
            if (ageIn && profile.age) ageIn.value = profile.age;
            if (weightIn && profile.weight) weightIn.value = profile.weight;
            if (heightIn && profile.height) heightIn.value = profile.height;

            // Boutons objectif
            document.querySelectorAll('.profile-goal-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.dataset.goal === profile.goal);
            });

            // Thème toggle
            var themeToggle = document.getElementById('profileThemeToggle');
            if (themeToggle) {
                themeToggle.checked = document.body.classList.contains('dark-mode');
            }
        }

        function initProfile() {
            var profile = loadProfile();
            updateDisplay(profile);
            fillForm(profile);
            syncToTDEEInputs(profile);

            // Boutons objectif
            document.querySelectorAll('.profile-goal-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.profile-goal-btn').forEach(function(b) {
                        b.classList.remove('active');
                    });
                    btn.classList.add('active');
                });
            });

            // Bouton save
            var saveBtn = document.getElementById('profileSaveBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                    var nameVal = (document.getElementById('profileName') || {}).value || '';
                    var genderVal = (document.getElementById('profileGender') || {}).value || 'male';
                    var ageVal = (document.getElementById('profileAge') || {}).value || '';
                    var weightVal = (document.getElementById('profileWeight') || {}).value || '';
                    var heightVal = (document.getElementById('profileHeight') || {}).value || '';
                    var activeGoal = document.querySelector('.profile-goal-btn.active');
                    var goalVal = activeGoal ? activeGoal.dataset.goal : '';

                    var newProfile = {
                        name: nameVal.trim(),
                        gender: genderVal,
                        age: ageVal ? parseInt(ageVal) : null,
                        weight: weightVal ? parseFloat(weightVal) : null,
                        height: heightVal ? parseInt(heightVal) : null,
                        goal: goalVal,
                        savedAt: Date.now()
                    };

                    saveProfile(newProfile);
                    updateDisplay(newProfile);
                    syncToTDEEInputs(newProfile);

                    // Confirmation visuelle
                    var confirmEl = document.getElementById('profileSaveConfirm');
                    if (confirmEl) {
                        confirmEl.textContent = '✓ Profil enregistré';
                        setTimeout(function() { confirmEl.textContent = ''; }, 2500);
                    }
                    // Vibration haptique
                    if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
                });
            }

            // Toggle thème
            var themeToggle = document.getElementById('profileThemeToggle');
            if (themeToggle) {
                themeToggle.addEventListener('change', function() {
                    var themeBtn = document.getElementById('themeToggleBtn') || document.getElementById('dashThemeBtn');
                    if (themeBtn) themeBtn.click();
                    // Mettre à jour le toggle après le clic
                    setTimeout(function() {
                        if (themeToggle) themeToggle.checked = document.body.classList.contains('dark-mode');
                    }, 50);
                });
            }

            // Export données
            var exportBtn = document.getElementById('profileExportBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', function() {
                    try {
                        var data = {};
                        for (var i = 0; i < localStorage.length; i++) {
                            var k = localStorage.key(i);
                            if (k && k.startsWith('lyftiv')) {
                                data[k] = localStorage.getItem(k);
                            }
                        }
                        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'lyftiv-backup-' + new Date().toISOString().slice(0,10) + '.json';
                        a.click();
                        URL.revokeObjectURL(url);
                    } catch(e) { alert('Export non disponible dans ce contexte.'); }
                });
            }

            // Reset données
            var resetBtn = document.getElementById('profileResetBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', function() {
                    if (confirm('Supprimer toutes vos données Lyftiv ? Cette action est irréversible.')) {
                        var keysToRemove = [];
                        for (var i = 0; i < localStorage.length; i++) {
                            var k = localStorage.key(i);
                            if (k && k.startsWith('lyftiv')) keysToRemove.push(k);
                        }
                        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
                        location.reload();
                    }
                });
            }

            // Mettre à jour le score si body.dataset change (MutationObserver)
            var observer = new MutationObserver(function() {
                updateDisplay(loadProfile());
            });
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-lyftiv-score', 'data-league'] });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initProfile);
        } else {
            initProfile();
        }
    })();

