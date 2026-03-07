        /* ============================================================
           FONCTIONS PREMIUM — Compléments alimentaires
        ============================================================ */
        const SUPPLEMENT_DB = [
            {
                name: 'Créatine Monohydrate', rating: 'A', emoji: '💪',
                desc: '⚡ Top pour les entraînements explosifs. La créatine est bien documentée pour les performances lors d\'exercices répétés de courte durée et haute intensité (musculation, sprint).',
                dose: '3–5 g/jour', timing: 'N\'importe quand — la régularité prime sur le timing',
                alert: null,
                detail: 'Les données scientifiques portent sur les performances lors d\'exercices successifs de haute intensité et courte durée (sprint, musculation), avec 3 g/jour minimum. Plus de 500 études soutiennent ces effets. La phase de charge (20 g/j × 5j) est optionnelle — la saturation musculaire est identique à 3–5 g/j sur 3–4 semaines. Sûre à long terme. Préférer la monohydrate aux formes "buffered" ou ethyl ester non validées.',
                sources: 'Rawson & Volek (2003) JSCR · Lanhers et al. (2017) EJSM · Kreider et al. (2017) JISSN'
            },
            {
                name: 'Protéines en poudre', rating: 'A', emoji: '🥛',
                desc: 'Les protéines contribuent à la croissance et au maintien de la masse musculaire. Complément pratique pour atteindre ses apports journaliers.',
                dose: '20–40 g par prise, selon déficit protéique journalier', timing: 'Dans les 2h après l\'entraînement, ou selon les besoins de la journée',
                alert: null,
                detail: 'La Whey Concentrée est le choix standard. La Whey Isolate convient aux intolérants au lactose (filtrée). La Whey Hydrolysate est plus rapide mais souvent inutilement chère. Alternatives végétales : protéine de pois + riz (ratio 70/30) pour un profil en acides aminés complet. Objectif total toutes sources confondues : 1.6–2.2 g de protéines/kg de poids corporel/jour. Les protéines en poudre ne sont qu\'un complément — l\'assiette reste la base.',
                sources: 'Morton et al. (2018) BJSM · Phillips & Van Loon (2011) JSCR · van Vliet et al. (2015) JN'
            },
            {
                name: 'Caféine', rating: 'A', emoji: '☕',
                desc: '⚡ Excellent en pré-entraînement. La caféine contribue à augmenter la vigilance et l\'attention. Des données scientifiques documentent également des effets sur la résistance à l\'effort et la puissance explosive.',
                dose: '3–6 mg/kg de poids corporel (ex : 200–400 mg pour 70 kg)', timing: '30–60 min avant entraînement — ne pas consommer après 14h pour préserver le sommeil',
                alert: '⚠️ Surdosage > 600 mg/jour : risques cardiaques, anxiété, insomnie. Ne pas combiner avec boissons énergisantes. La caféine seule (comprimés ou café) est plus sûre et contrôlable que les pré-workouts complexes.',
                detail: 'La caféine est l\'un des rares ergogènes validés par la science pour les efforts explosifs et d\'endurance. La tolérance se développe rapidement : prévoir des cycles de sevrage (1–2 semaines sans caféine) pour maintenir l\'effet. Conseil clé pour le sommeil : la demi-vie de la caféine est de 5–7h — une prise à 14h laisse encore 50% actif à 21h, ce qui retarde l\'endormissement et réduit la qualité du sommeil profond. Privilégiez les entraînements matinaux ou une consommation avant 13h.',
                sources: 'Grgic et al. (2019) BJSM · Goldstein et al. (2010) JISSN · Drake et al. (2013) Journal of Clinical Sleep Medicine'
            },
            {
                name: 'Citrulline Malate', rating: 'B', emoji: '🍉',
                desc: '⚡ Utilisée en pré-workout, souvent combinée à la caféine. Précurseur de l\'oxyde nitrique (NO). Étudiée pour ses effets sur la sensation de vascularisation ("pump") et la récupération musculaire post-effort.',
                dose: '6–8 g de citrulline malate 2:1 (ou 4–6 g de citrulline pure)', timing: '60 min avant entraînement — parfaite associée à la caféine en pré-workout maison',
                alert: null,
                detail: 'Précurseur de l\'oxyde nitrique (NO). Les données publiées documentent des effets sur la vascularisation musculaire et la récupération. Préférer la citrulline pure ou le malate 2:1. La L-arginine est moins bien absorbée par voie orale. Association courante : Citrulline 6 g + Caféine 200 mg.',
                sources: 'Pérez-Guisado & Jakeman (2010) JSCR · Sureda & Pons (2012) Amino Acids · Wax et al. (2015) JSCR'
            },
            {
                name: 'Oméga-3 (EPA/DHA)', rating: 'B', emoji: '🐟',
                desc: 'L\'EPA et le DHA contribuent à une fonction cardiaque normale (250 mg/j EPA+DHA minimum recommandé). Apports utiles si consommation insuffisante de poissons gras.',
                dose: '2–3 g d\'EPA+DHA combinés par jour', timing: 'Avec les repas (réduit les remontées acides et améliore l\'absorption)',
                alert: null,
                detail: 'Les données portent principalement sur la fonction cardiaque normale (EPA+DHA, 250 mg/j minimum recommandé). Choisir des huiles certifiées IFOS ou avec indice TOTOX contrôlé. La forme triglycéride est mieux absorbée que l\'éthyl ester. Sources alimentaires à privilégier : saumon, maquereau, sardines, hareng (2–3 portions/semaine). Pour les végétaliens : huile d\'algues (DHA + EPA directement biodisponibles).',
                sources: 'Smith et al. (2011) Clinical Nutrition · Calder (2015) Annals of Nutrition & Metabolism · Philpott et al. (2019) EJSM'
            },
            {
                name: 'Vitamine D3', rating: 'B', emoji: '☀️',
                desc: 'La vitamine D contribue au maintien d\'une fonction musculaire normale, d\'une ossature normale et au fonctionnement normal du système immunitaire. Déficit très fréquent en automne-hiver.',
                dose: '1 000–2 000 UI/jour en été · 2 000–4 000 UI/jour en automne-hiver', timing: 'Avec un repas contenant des graisses (liposoluble)',
                alert: '⚠️ Surdosage chronique > 10 000 UI/jour : hypercalcémie. Un dosage sanguin (25-OH-D3) est recommandé pour ajuster la dose précisément.',
                detail: 'La saisonnalité est clé : en France, la synthèse cutanée de vitamine D est quasiment nulle d\'octobre à mars (angle solaire insuffisant), même par beau temps. La supplémentation devient indispensable en hiver pour les sportifs. En été, 15–20 min d\'exposition quotidienne (bras et visage) en milieu de journée suffisent souvent. Associer systématiquement avec la Vitamine K2 (MK-7, 100–200 µg/jour) pour diriger le calcium vers les os et éviter sa déposition vasculaire.',
                sources: 'Dahlquist et al. (2015) JSCR · Pilz et al. (2011) Hormone & Metabolic Research · Webb et al. (1988) Clinical Endocrinology'
            },
            {
                name: 'Magnésium', rating: 'B', emoji: '⚡',
                desc: 'Le magnésium contribue à réduire la fatigue, à un fonctionnement musculaire normal et à un fonctionnement normal du système nerveux. Impliqué dans plus de 300 réactions enzymatiques.',
                dose: '300–400 mg/jour (bisglycinate ou glycérophosphate)', timing: 'Le soir au coucher pour optimiser le sommeil',
                alert: null,
                detail: 'Préférer le bisglycinate ou le glycérophosphate de magnésium : meilleure biodisponibilité intestinale et moins d\'effets laxatifs. L\'oxyde de magnésium (forme la moins chère) est peu absorbé — éviter. Le magnésium est souvent déficitaire chez les sportifs en raison des pertes par la sueur.',
                sources: 'Zhang et al. (2017) Nutrients · Abbasi et al. (2012) Journal of Research in Medical Sciences'
            },
            {
                name: 'EAA (Acides Aminés Essentiels)', rating: 'C', emoji: '🧪',
                desc: 'Inutiles si l\'alimentation est protéiquement complète (viande, poisson, œufs, dairy). Utiles uniquement pour les régimes végétaliens stricts.',
                dose: '10–15 g autour de l\'entraînement si nécessaire', timing: 'Avant ou pendant l\'effort',
                alert: null,
                detail: 'Les BCAA (leucine, isoleucine, valine) sont un sous-ensemble des EAA — ils sont inutiles dès lors que les apports protéiques totaux sont suffisants (1.6+ g/kg/j) avec des protéines complètes. Les EAA (9 acides aminés essentiels) peuvent présenter un intérêt limité pour les végétaliens stricts dont l\'alimentation manque d\'un ou plusieurs acides aminés essentiels (lysine, méthionine notamment). Pour les omnivores ou les végétariens consommant des œufs/laitages : dépense inutile.',
                sources: 'Wolfe (2017) JISSN · van Vliet et al. (2015) JN · Stokes et al. (2018) Frontiers in Nutrition'
            },
            // ── COMPLÉMENTS À RISQUE — Mises en garde Pharmacien ──────────
            {
                name: '⚠️ Potassium (supplémentation)', rating: 'DANGER', emoji: '🚨',
                desc: 'MISE EN GARDE : La supplémentation en potassium en dehors d\'un contexte médical est DANGEREUSE. Un excès peut provoquer des arythmies cardiaques graves, voire un arrêt cardiaque.',
                dose: 'Ne pas supplémenter sans prescription médicale', timing: 'Aucune automédication',
                alert: '🚨 RISQUE VITAL : L\'hyperkaliémie (excès de potassium) est une urgence médicale. Les comprimés de potassium à haute dose sont réservés aux traitements prescrits. Si vous craignez un déficit, privilégiez les sources alimentaires : banane, avocat, patate douce, épinards. Un bilan sanguin est le seul moyen de diagnostiquer un déficit réel.',
                detail: 'Le potassium est un électrolyte régulé finement par les reins. Un apport excessif via des compléments peut saturer la capacité d\'élimination rénale, en particulier en cas d\'insuffisance rénale même modérée (fréquente et souvent non diagnostiquée chez l\'adulte). Les sportifs peuvent perdre du potassium par la sueur, mais ces pertes sont facilement compensées par une alimentation équilibrée. La supplémentation en sel de potassium (KCl) à doses élevées est contre-indiquée sans surveillance médicale.',
                sources: 'EFSA Panel (2016) EFSA Journal · Mahoney et al. (2009) JAMA Internal Medicine · Palmer & Clegg (2016) NEJM'
            },
            {
                name: '⚠️ Vitamine A (Rétinol)', rating: 'DANGER', emoji: '🚨',
                desc: 'MISE EN GARDE : La vitamine A sous forme de rétinol (non bêta-carotène) est liposoluble et s\'accumule dans le foie. Un surdosage chronique provoque une hépatotoxicité grave.',
                dose: 'Maximum 3 000 µg (10 000 UI) de rétinol/jour pour un adulte sain', timing: 'Éviter la supplémentation sauf carence avérée diagnostiquée',
                alert: '🚨 SURDOSAGE HÉPATOTOXIQUE : L\'hypervitaminose A (> 3 000 µg/j chronique) provoque des douleurs hépatiques, une hypertension intracrânienne, des douleurs osseuses et des anomalies cutanées. TÉRATOGÈNE : formellement contre-indiqué en grossesse à hautes doses. Les sportifs n\'ont PAS de besoins accrus en vitamine A par rapport à la population générale. Éviter tout complément contenant du rétinol si l\'alimentation est déjà riche en foie, produits laitiers ou œufs.',
                detail: 'Contrairement au bêta-carotène (précurseur végétal converti à la demande par l\'organisme, sans toxicité connue aux doses alimentaires), le rétinol préformé s\'accumule dans le tissu adipeux et le foie. Les multivitamines standard contiennent souvent de la vitamine A sous les deux formes — vérifier systématiquement les étiquettes. En France, les carences en vitamine A sont exceptionnelles chez les adultes en bonne santé avec une alimentation variée.',
                sources: 'Penniston & Tanumihardjo (2006) AJCN · Myhre et al. (2003) European Journal of Nutrition · WHO Technical Report (2009)'
            },
            {
                name: '⚠️ Fer (supplémentation)', rating: 'DANGER', emoji: '🚨',
                desc: 'MISE EN GARDE : La supplémentation en fer sans diagnostic de carence avérée est inutile et potentiellement toxique. Le fer en excès est un puissant oxydant.',
                dose: 'Uniquement sur prescription après bilan biologique (ferritine + NFS)', timing: 'Aucune automédication',
                alert: '🚨 NE PAS SUPPLÉMENTER SANS BILAN : Un excès de fer génère du stress oxydatif, endommage le foie, le cœur et le pancréas. L\'hémochromatose (surcharge en fer) est une maladie génétique fréquente (1/300) qui contre-indique toute supplémentation. Chez les femmes avec règles abondantes ou végétaliens stricts, une carence est possible mais doit être CONFIRMÉE par bilan biologique avant supplémentation.',
                detail: 'Le fer est le minéral le plus fréquemment prescrit à tort. L\'anémie par carence en fer est souvent confondue avec d\'autres causes d\'anémie ou de fatigue. La supplémentation empirique sans dosage de ferritine expose à une surcharge. Les sportifs d\'endurance intense (notamment femmes) peuvent présenter des pertes accrues, mais la "fatigue du sportif" ne justifie pas à elle seule une supplémentation en fer.',
                sources: 'Beard & Tobin (2000) AJCN · Looker et al. (1997) JAMA · Pasricha et al. (2021) Lancet'
            },
            {
                name: '⚠️ Vitamine E (alpha-tocophérol, haute dose)', rating: 'ATTENTION', emoji: '⚠️',
                desc: 'ATTENTION : À haute dose (> 400 UI/jour), la vitamine E synthétique augmente paradoxalement le risque cardiovasculaire et de mortalité toutes causes.',
                dose: 'Maximum 15 mg/jour (22 UI) depuis les aliments. Éviter les compléments > 200 UI/j.', timing: 'Privilégier les sources alimentaires : huile de tournesol, amandes, noisettes',
                alert: '⚠️ PARADOXE ANTIOXYDANT : Les méga-doses de vitamine E synthétique (dl-alpha-tocophérol) peuvent bloquer des voies de signalisation cellulaire bénéfiques induites par l\'exercice (adaptation musculaire, mitochondriogenèse). L\'étude SELECT (35 000 hommes) a montré une augmentation du risque de cancer de la prostate à 400 UI/j. Éviter les compléments "anti-oxydants" à hautes doses — ils peuvent contrecarrer les bénéfices de l\'entraînement.',
                detail: 'Plusieurs grandes études randomisées (HOPE, SELECT, méta-analyses) montrent que la supplémentation en vitamine E synthétique à haute dose (≥ 400 UI/j) augmente la mortalité totale et les risques cardiovasculaires. La forme naturelle (d-alpha-tocophérol) est moins problématique mais son intérêt reste limité. Le paradoxe : les antioxydants à haute dose peuvent annuler les adaptations positives du stress oxydatif induit par l\'exercice (signal nécessaire à l\'hypertrophie et aux adaptations mitochondriales).',
                sources: 'Klein et al. (2011) JAMA · Miller et al. (2005) Annals of Internal Medicine · Ristow et al. (2009) PNAS'
            },
            {
                name: '⚠️ ZMA / Zinc à haute dose', rating: 'ATTENTION', emoji: '⚠️',
                desc: 'ATTENTION : Le zinc en excès chronique bloque l\'absorption du cuivre et peut provoquer une anémie par carence en cuivre, ainsi que des nausées et vomissements.',
                dose: 'Maximum 25 mg/jour de zinc élémentaire (adulte). Les ZMA contiennent souvent 30–45 mg.', timing: 'À jeun pour absorption maximale — mais peut causer des nausées significatives',
                alert: '⚠️ ANTAGONISME ZINC/CUIVRE : Un apport chronique de zinc > 40 mg/jour inhibe l\'absorption intestinale du cuivre via la métalothionéine. Conséquence : anémie hypochrome microcytaire, neuropathie périphérique (similaire à une carence en B12). Les formules ZMA marketing (souvent 30–45 mg zinc) dépassent les seuils recommandés. Bénéfice sur la testostérone documenté uniquement en cas de carence préexistante en zinc.',
                detail: 'Le ZMA (Zinc + Magnésium + Vitamine B6) est populaire mais l\'evidence est faible pour les sportifs non-carencés. Le zinc et le magnésium sont bien étudiés séparément ; leur combinaison en prise nocturne n\'apporte pas de synergie prouvée supplémentaire. La forme gluconate ou picolinate de zinc est mieux tolérée que le sulfate. Pour le magnésium : préférer le bisglycinate seul, disponible sans les inconvénients du ZMA.',
                sources: 'Fosmire (1990) AJCN · Broun et al. (1990) JAMA · Wilborn et al. (2004) JISSN'
            }
        ];

        window.SUPPLEMENT_DB = SUPPLEMENT_DB;
