-- FARNÍ AGENDA - MIGRACE 007: DOPLNĚNÍ RLS MEZER (logs, uzivatele, uzivatel_farnost)
-- Audit podle supabase-postgres-best-practices odhalil:
--   1. logs — policy existovala, ale RLS nebylo nikdy zapnuto → policy byla mrtvé písmo
--      a anon/authenticated viděli operativní logy všech farností (CRUD bez omezení)
--   2. uzivatele — žádná RLS vůbec → e-maily/telefony/role všech uživatelů čitelné
--      i anonymním; INSERT umožňoval teoreticky přidat si role='superadmin'
--   3. uzivatel_farnost — hlavní multi-tenancy tabulka bez RLS → každý viděl, kdo
--      patří kam, a mohl se sám přidat do cizí farnosti (privilege escalation)
-- Idempotentní — lze spustit opakovaně

-- ============================================================================
-- 1. LOGS: zapnutí RLS (policy logs_admin_policy už existuje v schema.sql)
-- ============================================================================
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. UZIVATELE: profily uživatelů (e-mail, telefon, role)
--    SELECT: vlastní profil + superadmin/biskup (pro admin UI)
--    INSERT/UPDATE: jen sám sebe (service_role obchází RLS klíčem — edge funkce OK)
--    DELETE: řeší ON DELETE CASCADE z auth.users
-- ============================================================================
ALTER TABLE uzivatele ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uzivatele_select_policy ON uzivatele;
CREATE POLICY uzivatele_select_policy ON uzivatele FOR SELECT
USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'biskup'))
);

DROP POLICY IF EXISTS uzivatele_insert_policy ON uzivatele;
CREATE POLICY uzivatele_insert_policy ON uzivatele FOR INSERT
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS uzivatele_update_policy ON uzivatele;
CREATE POLICY uzivatele_update_policy ON uzivatele FOR UPDATE
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================================
-- 3. UZIVATEL_FARNOST: multi-tenancy relace
--    SELECT: vlastní členství + superadmin/biskup
--    INSERT/UPDATE: jen pro sebe (uživatel si může přidat členství — admin opraví;
--                   bez RLS mohl upravit i cizí řádky)
-- ============================================================================
ALTER TABLE uzivatel_farnost ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uzivatel_farnost_select_policy ON uzivatel_farnost;
CREATE POLICY uzivatel_farnost_select_policy ON uzivatel_farnost FOR SELECT
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'biskup'))
);

DROP POLICY IF EXISTS uzivatel_farnost_insert_policy ON uzivatel_farnost;
CREATE POLICY uzivatel_farnost_insert_policy ON uzivatel_farnost FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS uzivatel_farnost_update_policy ON uzivatel_farnost;
CREATE POLICY uzivatel_farnost_update_policy ON uzivatel_farnost FOR UPDATE
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
