-- ══════════════════════════════════════════════════════════════════════
--  LYFTIV — SUPABASE SCHEMA COMPLET
--  Colle ce script dans : Supabase Dashboard → SQL Editor → Run
--  URL : https://app.supabase.com → ton projet → SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. TABLE DONNÉES UTILISATEUR (sync historique + sessions + profil)
CREATE TABLE IF NOT EXISTS lyftiv_data (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    history     text DEFAULT '[]',       -- JSON stringifié
    sessions    text DEFAULT '[]',       -- JSON stringifié
    profile     text DEFAULT '{}',       -- JSON stringifié
    updated_at  timestamptz DEFAULT now() NOT NULL
);

-- Index pour accès rapide par user_id
CREATE INDEX IF NOT EXISTS idx_lyftiv_data_user_id ON lyftiv_data(user_id);

-- RLS : chaque utilisateur ne voit que ses propres données
ALTER TABLE lyftiv_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
    ON lyftiv_data FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data"
    ON lyftiv_data FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data"
    ON lyftiv_data FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own data"
    ON lyftiv_data FOR DELETE
    USING (auth.uid() = user_id);

-- ── 2. TABLE CLASSEMENT / LEADERBOARD
CREATE TABLE IF NOT EXISTS lyftiv_scores (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    username    text NOT NULL,
    score       integer NOT NULL DEFAULT 0,
    league      text NOT NULL DEFAULT 'Recrue',
    sessions    integer NOT NULL DEFAULT 0,
    avatar      text DEFAULT '🏋️',
    updated_at  timestamptz DEFAULT now() NOT NULL
);

-- Index pour tri par score (classement)
CREATE INDEX IF NOT EXISTS idx_lyftiv_scores_score ON lyftiv_scores(score DESC);

-- RLS : lecture publique du classement, écriture uniquement par le propriétaire
ALTER TABLE lyftiv_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scores are publicly readable"
    ON lyftiv_scores FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Users can upsert own score"
    ON lyftiv_scores FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own score"
    ON lyftiv_scores FOR UPDATE
    USING (auth.uid() = user_id);

-- ── 3. TABLE RELATIONS COACH / ATHLÈTE (Pro Coach)
CREATE TABLE IF NOT EXISTS lyftiv_coach_relations (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    athlete_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status      text NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
    created_at  timestamptz DEFAULT now() NOT NULL,
    UNIQUE(coach_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_relations_coach   ON lyftiv_coach_relations(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_relations_athlete ON lyftiv_coach_relations(athlete_id);

ALTER TABLE lyftiv_coach_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can see their relations"
    ON lyftiv_coach_relations FOR SELECT
    USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

CREATE POLICY "Coaches can create relations"
    ON lyftiv_coach_relations FOR INSERT
    WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Athletes can update relation status"
    ON lyftiv_coach_relations FOR UPDATE
    USING (auth.uid() = athlete_id);

-- ── 4. TABLE DONNÉES ATHLÈTE PARTAGÉES (visible par le coach)
CREATE TABLE IF NOT EXISTS lyftiv_athlete_shares (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    athlete_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    coach_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    history     text DEFAULT '[]',
    profile     text DEFAULT '{}',
    updated_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE lyftiv_athlete_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athlete can manage own share"
    ON lyftiv_athlete_shares FOR ALL
    USING (auth.uid() = athlete_id);

CREATE POLICY "Coach can read assigned athlete shares"
    ON lyftiv_athlete_shares FOR SELECT
    USING (
        auth.uid() = coach_id AND
        EXISTS (
            SELECT 1 FROM lyftiv_coach_relations r
            WHERE r.coach_id = auth.uid()
            AND r.athlete_id = lyftiv_athlete_shares.athlete_id
            AND r.status = 'accepted'
        )
    );

-- ── 5. FONCTION AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_lyftiv_data_updated_at
    BEFORE UPDATE ON lyftiv_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_lyftiv_scores_updated_at
    BEFORE UPDATE ON lyftiv_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════
--  VÉRIFICATION — exécute après le script principal
-- ══════════════════════════════════════════════════════════════════════
SELECT table_name, row_security
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public'
AND t.table_name LIKE 'lyftiv_%';
