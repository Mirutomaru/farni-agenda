-- FARNÍ AGENDA - MIGRACE 005: FULL-TEXT VYHLEDÁVÁNÍ OSOB PŘES osoby_blind_index
-- Rozšíří blind index o full-text vektor (jména) + GIN index + RPC search_persons()
-- Idempotentní — lze spustit opakovaně

-- ============================================================================
-- 1. ROZŠÍŘENÍ BLIND INDEXU O FULL-TEXT VEKTOR
-- ============================================================================
ALTER TABLE osoby_blind_index ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_osoby_blind_search ON osoby_blind_index USING GIN (search_vector);

-- ============================================================================
-- 2. TRIGGER: SYNCHRONIZACE VAKTORU PŘI ZMĚNĚ OSOBY
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_person_search_index() RETURNS trigger AS $$
BEGIN
    INSERT INTO osoby_blind_index (osoba_id, search_vector)
    VALUES (
        NEW.id,
        setweight(to_tsvector('czech', coalesce(NEW.prijmeni, '')), 'A') ||
        setweight(to_tsvector('czech', coalesce(NEW.krestni_jmeno, '')), 'B')
    )
    ON CONFLICT (osoba_id) DO UPDATE SET search_vector = EXCLUDED.search_vector;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_person_search ON osoby;
CREATE TRIGGER trg_sync_person_search
AFTER INSERT OR UPDATE OF krestni_jmeno, prijmeni ON osoby
FOR EACH ROW EXECUTE FUNCTION sync_person_search_index();

-- Backfill: naplní vektor u všech existujících osob
INSERT INTO osoby_blind_index (osoba_id, search_vector)
SELECT id,
       setweight(to_tsvector('czech', coalesce(prijmeni, '')), 'A') ||
       setweight(to_tsvector('czech', coalesce(krestni_jmeno, '')), 'B')
FROM osoby
ON CONFLICT (osoba_id) DO NOTHING;

-- ============================================================================
-- 3. RLS NA BLIND INDEXU (stejné pravidlo jako u osoby — přes join na osoby)
-- Bez RLS by byl blind index (email/phone hashy) čitelný pro kohokoli s anon klíčem
-- ============================================================================
ALTER TABLE osoby_blind_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osoby_blind_search_policy ON osoby_blind_index;
CREATE POLICY osoby_blind_search_policy ON osoby_blind_index FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM osoby o
        WHERE o.id = osoby_blind_index.osoba_id
          AND (
            EXISTS (SELECT 1 FROM uzivatel_farnost uf
                    WHERE uf.user_id = auth.uid()
                      AND uf.farnost_id = o.farnost_id
                      AND uf.aktivni)
            OR EXISTS (SELECT 1 FROM uzivatele u
                       WHERE u.id = auth.uid()
                         AND u.role IN ('superadmin', 'biskup'))
          )
    )
);

-- ============================================================================
-- 4. RPC: search_persons(p_query, p_limit)
-- Full-text vyhledávání přes blind index (tsvector + czech stemming).
-- Krátké dotazy (< 3 znaky) spadnou na ILIKE fallback — tsvector by je nestemmoval.
-- SECURITY INVOKER → RLS se aplikuje automaticky (multi-tenancy bez úniku dat)
-- ============================================================================
CREATE OR REPLACE FUNCTION search_persons(p_query text, p_limit integer DEFAULT 100)
RETURNS TABLE (osoba_id uuid, relevance real) AS $$
BEGIN
    IF length(trim(coalesce(p_query, ''))) < 3 THEN
        -- Krátký dotaz: ILIKE fallback (funguje i pro 1-2 znaky)
        RETURN QUERY
            SELECT o.id, 0.5::real
            FROM osoby o
            WHERE o.prijmeni ILIKE '%' || trim(p_query) || '%'
               OR o.krestni_jmeno ILIKE '%' || trim(p_query) || '%'
            ORDER BY o.prijmeni
            LIMIT p_limit;
    ELSE
        -- Full-text: websearch_to_tsquery zvládá i celá jména a fráze
        RETURN QUERY
            SELECT bi.osoba_id,
                   ts_rank(bi.search_vector, websearch_to_tsquery('czech', trim(p_query))) AS relevance
            FROM osoby_blind_index bi
            WHERE bi.search_vector @@ websearch_to_tsquery('czech', trim(p_query))
            ORDER BY relevance DESC
            LIMIT p_limit;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
