-- FARNÍ AGENDA - MIGRACE 009: RLS VÝKON (obal auth.uid()) + ILIKE ESCAPING
-- Audit podle supabase-postgres-best-practices odhalil:
--   1. Policies volají auth.uid() přímo v řádkové predikaci → Postgres funkci
--      re-evaluuje pro každý řádek tabulky. Obal (select auth.uid()) = konstantní
--      poddotaz vyhodnocený jednou za dotaz a cacheovaný → 5–10× rychlejší na velkých tabulkách
--   2. ILIKE fallback v search_persons neescapeuje % a _ → dotaz '%' nebo '_'
--      fungoval jako wildcard a zachytil VŠECHNY osoby (únik dat mezi farnostmi)
-- Logika všech policies zůstává IDENTICKÁ — mění se jen způsob vyhodnocení UID.
-- Idempotentní — lze spustit opakovaně

-- ============================================================================
-- 1. RLS POLICIES: obal auth.uid() → (select auth.uid())
--    DROP + CREATE zachovává idempotenci a přesnou logiku původních policies.
-- ============================================================================

-- FARNOSTI
DROP POLICY IF EXISTS superadmin_farnosti_policy ON farnosti;
CREATE POLICY superadmin_farnosti_policy ON farnosti FOR ALL
  USING (EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup')));

DROP POLICY IF EXISTS farnost_admin_policy ON farnosti;
CREATE POLICY farnost_admin_policy ON farnosti FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- OSOBY
DROP POLICY IF EXISTS osoby_admin_policy ON osoby;
CREATE POLICY osoby_admin_policy ON osoby FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = osoby.farnost_id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- FINANCE
DROP POLICY IF EXISTS finance_admin_policy ON finance;
CREATE POLICY finance_admin_policy ON finance FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = finance.farnost_id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- LOGS
DROP POLICY IF EXISTS logs_admin_policy ON logs;
CREATE POLICY logs_admin_policy ON logs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR farnost_id IS NULL
    OR EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = logs.farnost_id AND uf.aktivni)
  );

-- UZIVATELE
DROP POLICY IF EXISTS uzivatele_select_policy ON uzivatele;
CREATE POLICY uzivatele_select_policy ON uzivatele FOR SELECT
  USING (
    id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

DROP POLICY IF EXISTS uzivatele_insert_policy ON uzivatele;
CREATE POLICY uzivatele_insert_policy ON uzivatele FOR INSERT
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS uzivatele_update_policy ON uzivatele;
CREATE POLICY uzivatele_update_policy ON uzivatele FOR UPDATE
  USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));

-- UZIVATEL_FARNOST
DROP POLICY IF EXISTS uzivatel_farnost_select_policy ON uzivatel_farnost;
CREATE POLICY uzivatel_farnost_select_policy ON uzivatel_farnost FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

DROP POLICY IF EXISTS uzivatel_farnost_insert_policy ON uzivatel_farnost;
CREATE POLICY uzivatel_farnost_insert_policy ON uzivatel_farnost FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS uzivatel_farnost_update_policy ON uzivatel_farnost;
CREATE POLICY uzivatel_farnost_update_policy ON uzivatel_farnost FOR UPDATE
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- MAJETEK
DROP POLICY IF EXISTS majetek_admin_policy ON majetek;
CREATE POLICY majetek_admin_policy ON majetek FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = majetek.farnost_id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- KRESTNI_ZAPIS
DROP POLICY IF EXISTS krestni_zapis_admin_policy ON krestni_zapis;
CREATE POLICY krestni_zapis_admin_policy ON krestni_zapis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = pokrteny_id)
  );

-- BIROVANI_ZAPIS
DROP POLICY IF EXISTS birovani_zapis_admin_policy ON birovani_zapis;
CREATE POLICY birovani_zapis_admin_policy ON birovani_zapis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = birovan_id)
  );

-- SVATBY
DROP POLICY IF EXISTS svatby_admin_policy ON svatby;
CREATE POLICY svatby_admin_policy ON svatby FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = COALESCE(muz_id, zena_id))
  );

-- SVATBA_SVEDKOVE
DROP POLICY IF EXISTS svatba_svedkove_admin_policy ON svatba_svedkove;
CREATE POLICY svatba_svedkove_admin_policy ON svatba_svedkove FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (
      SELECT 1 FROM svatby s
      JOIN osoby o ON o.id = COALESCE(s.muz_id, s.zena_id)
      JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni
      WHERE s.id = svatba_svedkove.svatba_id
    )
  );

-- POHREBY
DROP POLICY IF EXISTS pohreby_admin_policy ON pohreby;
CREATE POLICY pohreby_admin_policy ON pohreby FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = zemrel_id)
  );

-- OSOBY_BLIND_INDEX (původně z migrace 005)
DROP POLICY IF EXISTS osoby_blind_search_policy ON osoby_blind_index;
CREATE POLICY osoby_blind_search_policy ON osoby_blind_index FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM osoby o
        WHERE o.id = osoby_blind_index.osoba_id
          AND (
            EXISTS (SELECT 1 FROM uzivatel_farnost uf
                    WHERE uf.user_id = (select auth.uid())
                      AND uf.farnost_id = o.farnost_id
                      AND uf.aktivni)
            OR EXISTS (SELECT 1 FROM uzivatele u
                       WHERE u.id = (select auth.uid())
                         AND u.role IN ('superadmin', 'biskup'))
          )
    )
);

-- ============================================================================
-- 2. ILIKE ESCAPING v search_persons: % a _ jsou wildcards → escapeuj
--    Před fixem dotaz '%' zachytil všechny osoby (únik dat mezi farnostmi).
--    Po fixu se % a _ interpretují jako doslovné znaky.
-- ============================================================================
CREATE OR REPLACE FUNCTION search_persons(p_query text, p_limit integer DEFAULT 100)
RETURNS TABLE (osoba_id uuid, relevance real) AS $$
DECLARE
    v_q TEXT := trim(coalesce(p_query, ''));
    -- Escape ILIKE wildcards (% a _) aby dotaz '%' nezachytil vše
    v_esc TEXT := replace(replace(v_q, '%', '\%'), '_', '\_');
BEGIN
    IF length(v_q) < 3 THEN
        -- Krátký dotaz: ILIKE fallback (funguje i pro 1-2 znaky), wildcards escapeovány
        RETURN QUERY
            SELECT o.id, 0.5::real
            FROM osoby o
            WHERE o.prijmeni ILIKE '%' || v_esc || '%' ESCAPE '\'
               OR o.krestni_jmeno ILIKE '%' || v_esc || '%' ESCAPE '\'
            ORDER BY o.prijmeni
            LIMIT p_limit;
    ELSE
        -- Full-text: websearch_to_tsquery zvládá i celá jména a fráze
        RETURN QUERY
            SELECT bi.osoba_id,
                   ts_rank(bi.search_vector, websearch_to_tsquery('czech', v_q)) AS relevance
            FROM osoby_blind_index bi
            WHERE bi.search_vector @@ websearch_to_tsquery('czech', v_q)
            ORDER BY relevance DESC
            LIMIT p_limit;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
