-- FARNÍ AGENDA - MIGRACE 008: SECURITY DEFINER GUARDS + BLIND INDEX FIXE + UŽIVATELSKÉ PROFILY
-- Audit podle supabase-postgres-best-practices odhalil:
--   1. osoby_blind_index.email_hash NOT NULL, ale trigger/backfill z 005 insertovaly
--      jen (osoba_id, search_vector) → každá NOVÁ osoba spadla s NOT NULL violation
--      a backfill existujících osob se nikdy nenačetl (DO NOTHING přeskočil konflikty)
--   2. SECURITY DEFINER funkce bez auth checku uvnitř → anon mohl vyčíst statistiky
--      všech farností i narozeniny s šifrovanými e-maily
--   3. Nový Google OAuth uživatel neměl řádek v uzivatele (žádný trigger na auth.users)
--      → RLS ho neviděla = prázdná aplikace po přihlášení
-- Idempotentní — lze spustit opakovaně

-- ============================================================================
-- 1. BLIND INDEX: oprava NOT NULL + UNIQUE a synchronizace vektoru
-- ============================================================================

-- Pomocná funkce ze schema.sql (idempotentně — na live DB nemusí existovat)
CREATE OR REPLACE FUNCTION generate_blind_index(value TEXT) RETURNS TEXT AS $$
BEGIN
    IF value IS NULL THEN RETURN NULL; END IF;
    RETURN lower(trim(value)); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- email_hash už nemusí být NOT NULL (staré řádky nemají hash, app ho zatím nepoužívá)
ALTER TABLE osoby_blind_index ALTER COLUMN email_hash DROP NOT NULL;

-- UNIQUE na email_hash mohl blokovat osoby se stejným veřejným e-mailem → běžný index
ALTER TABLE osoby_blind_index DROP CONSTRAINT IF EXISTS osoby_blind_index_email_hash_key;
CREATE INDEX IF NOT EXISTS idx_osoby_blind_email ON osoby_blind_index(email_hash);

-- Opravený trigger: doplní i email/phone hashy (pro budoucí vyhledávání ve šifrovaných datech)
CREATE OR REPLACE FUNCTION sync_person_search_index() RETURNS trigger AS $$
BEGIN
    INSERT INTO osoby_blind_index (osoba_id, search_vector, email_hash, phone_hash)
    VALUES (
        NEW.id,
        setweight(to_tsvector('czech', coalesce(NEW.prijmeni, '')), 'A') ||
        setweight(to_tsvector('czech', coalesce(NEW.krestni_jmeno, '')), 'B'),
        generate_blind_index(NEW.verejny_email),
        generate_blind_index(NEW.verejna_telefon)
    )
    ON CONFLICT (osoba_id) DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        email_hash = coalesce(EXCLUDED.email_hash, osoby_blind_index.email_hash),
        phone_hash = coalesce(EXCLUDED.phone_hash, osoby_blind_index.phone_hash);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Opravený backfill: DO UPDATE (ne DO NOTHING) → existující řádky dostanou vektor.
-- Bez NOT NULL na email_hash už INSERT nemůže spadnout u osob bez veřejného e-mailu.
INSERT INTO osoby_blind_index (osoba_id, search_vector)
SELECT id,
       setweight(to_tsvector('czech', coalesce(prijmeni, '')), 'A') ||
       setweight(to_tsvector('czech', coalesce(krestni_jmeno, '')), 'B')
FROM osoby
ON CONFLICT (osoba_id) DO UPDATE SET search_vector = EXCLUDED.search_vector;

-- ============================================================================
-- 2. UŽIVATELSKÉ PROFILY: trigger na auth.users + backfill existujících uživatelů
--    Nový Google OAuth login automaticky dostane řádek v uzivatele (role redaktor_webu).
--    Bez profilu ho RLS nevidí → prázdná aplikace.
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
DECLARE
    v_email TEXT;
BEGIN
    v_email := coalesce(new.email, new.raw_user_meta_data->>'email');
    IF v_email IS NULL THEN
        RETURN new; -- bez e-mailu profil nevytvoříme (NOT NULL constraint)
    END IF;

    INSERT INTO uzivatele (id, jmeno, prijmeni, email, role)
    VALUES (new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name', v_email, 'redaktor_webu')
    ON CONFLICT (id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill: existující uživatelé v auth.users, kteří ještě nemají profil
INSERT INTO uzivatele (id, jmeno, prijmeni, email, role)
SELECT u.id,
       u.raw_user_meta_data->>'first_name',
       u.raw_user_meta_data->>'last_name',
       coalesce(u.email, u.raw_user_meta_data->>'email'),
       'redaktor_webu'
FROM auth.users u
WHERE coalesce(u.email, u.raw_user_meta_data->>'email') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM uzivatele z WHERE z.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. AUTH GUARDY V SECURITY DEFINER FUNKCÍCH
--    DEFINER běží jako owner → obchází RLS volajícího. Bez explicitního checku
--    mohl anon vyčíst data všech farností. Guard povoluje:
--      - service_role (edge funkce)
--      - přihlášeného uživatele s aktivním profilem v uzivatele
--      - postgres/supabase_admin (migrace, ruční testy přes psql)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_monthly_statistics(rok INTEGER, mesic INTEGER)
RETURNS TABLE (
    farnost_id UUID,
    farnost_nazev TEXT,
    celkem_clenu INTEGER,
    aktivni_clenu INTEGER,
    nove_prijati INTEGER,
    kresty INTEGER,
    birovani INTEGER,
    svatby INTEGER,
    pohreby INTEGER
) AS $$
BEGIN
    IF NOT (
        coalesce(auth.role(), '') = 'service_role'
        OR EXISTS (SELECT 1 FROM uzivatele WHERE id = auth.uid() AND aktivni)
        OR current_user IN ('postgres', 'supabase_admin')
    ) THEN
        RAISE EXCEPTION 'Neautorizovany pristup k RPC get_monthly_statistics' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        f.id,
        f.nazev,
        
        (SELECT COUNT(*) FROM osoby WHERE farnost_id = f.id) AS celkem_clenu,
        -- FIX: clenstvi_status jako hlavní stavový sloupec
        (SELECT COUNT(*) FROM osoby WHERE farnost_id = f.id AND clenstvi_status = 'aktivni') AS aktivni_clenu,
        (SELECT COUNT(*) FROM osoby o 
         JOIN krestni_zapis kz ON kz.pokrteny_id = o.id
         WHERE o.farnost_id = f.id 
           AND EXTRACT(YEAR FROM kz.datum_krstu) = rok 
           AND EXTRACT(MONTH FROM kz.datum_krstu) = mesic) AS nove_prijati,
        
        (SELECT COUNT(*) FROM krestni_zapis kz JOIN osoby o ON kz.pokrteny_id = o.id WHERE o.farnost_id = f.id AND EXTRACT(YEAR FROM datum_krstu) = rok AND EXTRACT(MONTH FROM datum_krstu) = mesic) AS kresty,
        (SELECT COUNT(*) FROM birovani_zapis bz JOIN osoby o ON bz.birovan_id = o.id WHERE o.farnost_id = f.id AND EXTRACT(YEAR FROM datum_birovani) = rok AND EXTRACT(MONTH FROM datum_birovani) = mesic) AS birovani,
        (SELECT COUNT(*) FROM svatby s JOIN osoby m ON s.muz_id = m.id WHERE m.farnost_id = f.id AND EXTRACT(YEAR FROM datum_svatby) = rok AND EXTRACT(MONTH FROM datum_svatby) = mesic) AS svatby,
        (SELECT COUNT(*) FROM pohreby p JOIN osoby o ON p.zemrel_id = o.id WHERE o.farnost_id = f.id AND EXTRACT(YEAR FROM datum_pohrbu) = rok AND EXTRACT(MONTH FROM datum_pohrbu) = mesic) AS pohreby
    
    FROM farnosti f
    WHERE f.aktivni = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_birthday_people(den INTEGER, mesic INTEGER)
RETURNS TABLE (
    id UUID,
    jmeno TEXT,
    vek INTEGER,
    email_encrypted BYTEA,
    farnost_id UUID
) AS $$
BEGIN
    IF NOT (
        coalesce(auth.role(), '') = 'service_role'
        OR EXISTS (SELECT 1 FROM uzivatele WHERE id = auth.uid() AND aktivni)
        OR current_user IN ('postgres', 'supabase_admin')
    ) THEN
        RAISE EXCEPTION 'Neautorizovany pristup k RPC get_birthday_people' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        o.id,
        o.krestni_jmeno || ' ' || o.prijmeni AS jmeno,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, o.datum_narozeni))::INTEGER AS vek,
        o.email_encrypted,
        o.farnost_id
    FROM osoby o
    WHERE EXTRACT(DAY FROM datum_narozeni) = den
      AND EXTRACT(MONTH FROM datum_narozeni) = mesic
      -- FIX: clenstvi_status místo status
      AND clenstvi_status IN ('aktivni');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Funkce z migrace 003 (volá je birthday-watcher edge funkce)
CREATE OR REPLACE FUNCTION check_birthday_notifications()
RETURNS TABLE (
  person_id uuid,
  jmeno text,
  vek integer,
  email_encrypted text,
  farnost_id uuid
) AS $$
DECLARE
  today_day INTEGER := EXTRACT(DAY FROM CURRENT_DATE)::INTEGER;
  today_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
BEGIN
  IF NOT (
      coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (SELECT 1 FROM uzivatele WHERE id = auth.uid() AND aktivni)
      OR current_user IN ('postgres', 'supabase_admin')
  ) THEN
      RAISE EXCEPTION 'Neautorizovany pristup k RPC check_birthday_notifications' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT 
      o.id,
      o.krestni_jmeno || ' ' || o.prijmeni AS jmeno,
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - EXTRACT(YEAR FROM o.datum_narozeni::date)::INTEGER AS vek,
      o.email_encrypted,
      o.farnost_id
    FROM osoby o
    WHERE o.clenstvi_status = 'aktivni'
      AND EXTRACT(DAY FROM o.datum_narozeni::date) = today_day
      AND EXTRACT(MONTH FROM o.datum_narozeni::date) = today_month
      AND (EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - EXTRACT(YEAR FROM o.datum_narozeni::date)::INTEGER) > 0
      AND ((EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - EXTRACT(YEAR FROM o.datum_narozeni::date)::INTEGER)) % 5 = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION generate_monthly_stats(p_rok integer, p_mesic integer)
RETURNS TABLE (
  farnost_id uuid,
  farnost_nazev text,
  rok integer,
  mesic integer,
  celkem_clenu bigint,
  kresty bigint,
  birovani bigint,
  svatby bigint,
  pohrebe bigint
) AS $$
BEGIN
  IF NOT (
      coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (SELECT 1 FROM uzivatele WHERE id = auth.uid() AND aktivni)
      OR current_user IN ('postgres', 'supabase_admin')
  ) THEN
      RAISE EXCEPTION 'Neautorizovany pristup k RPC generate_monthly_stats' USING ERRCODE = '42501';
  END IF;

  -- Vrátí výstup z farnosti s agregovanými statistikami
  RETURN QUERY
    SELECT 
      o.farnost_id,
      (SELECT nazev FROM farnosti WHERE id = o.farnost_id LIMIT 1),
      p_rok,
      p_mesic,
      
      -- Celkový počet členů ve farnosti
      (SELECT COUNT(*) FROM osoby WHERE farnost_id = o.farnost_id AND clenstvi_status = 'aktivni') AS celkem_clenu,
      
      -- Počet křtů v daném měsíci
      COALESCE((SELECT COUNT(*) 
                FROM krestni_zapis 
                WHERE EXTRACT(YEAR FROM datum_krstu::date) = p_rok 
                  AND EXTRACT(MONTH FROM datum_krstu::date) = p_mesic), 0) AS kresty,
      
      -- Počet birování v daném měsíci
      COALESCE((SELECT COUNT(*) 
                FROM birovani_zapis 
                WHERE EXTRACT(YEAR FROM datum_birovani::date) = p_rok 
                  AND EXTRACT(MONTH FROM datum_birovani::date) = p_mesic), 0) AS birovani,
      
      -- Počet svatby v daném měsíci (pokud má tabulku)
      COALESCE((SELECT COUNT(*) 
                FROM svatby_zapis 
                WHERE EXTRACT(YEAR FROM datum_svatby::date) = p_rok 
                  AND EXTRACT(MONTH FROM datum_svatby::date) = p_mesic), 0) AS svatby,
      
      -- Počet pohřebů v daném měsíci (pokud má tabulku)
      COALESCE((SELECT COUNT(*) 
                FROM pohreby_zapis 
                WHERE EXTRACT(YEAR FROM datum_pohreb::date) = p_rok 
                  AND EXTRACT(MONTH FROM datum_pohreb::date) = p_mesic), 0) AS pohrebe
      
    FROM (SELECT DISTINCT farnost_id FROM osoby) o
    ORDER BY farnost_nazev;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. REVOKE/GRANT EXECUTE: nejménější oprávnění pro RPC funkce
--    Postgres defaultně dává EXECUTE roli PUBLIC (= i anon). Po REVOKE mají
--    přístup jen authenticated (aplikace) a service_role (edge funkce).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION get_monthly_statistics(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_monthly_statistics(integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_birthday_people(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_birthday_people(integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION check_birthday_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_birthday_notifications() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION generate_monthly_stats(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_monthly_stats(integer, integer) TO authenticated, service_role;

-- INVOKER funkce (RLS se aplikuje automaticky) — stejně omezíme na přihlášené
REVOKE EXECUTE ON FUNCTION search_persons(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_persons(text, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION check_anniversary_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_anniversary_notifications(integer) TO authenticated, service_role;
