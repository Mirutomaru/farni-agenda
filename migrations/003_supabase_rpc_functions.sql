-- FARNÍ AGENDA - SQL RPC FUNKCE PRO EDGE FUNCTIONS
-- Tyto funkce se musí nahrát do Supabase Database (SQL Editor)

/* ==============================================
   1. check_birthday_notifications()
   Vrátí osoby s kulatými narozeninami dnes
   ============================================== */
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

/* ==============================================
   2. generate_monthly_stats(rok, mesic)
   Vrátí statistiky pro každý farnost v daném měsíci
   ============================================== */
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

/* ==============================================
   3. Audit log trigger pro osoby
   Nahrazuje Firebase audit-logger funkci
   ============================================== */
CREATE OR REPLACE FUNCTION audit_log_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  user_id_val text;
BEGIN
  -- Získání user_id z JWT claim (pokud je nastaveno) nebo system
  BEGIN
    user_id_val := current_setting('request.jwt.claims', true)::json->>'sub';
    IF user_id_val IS NULL OR user_id_val = '' THEN
      user_id_val := 'system';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    user_id_val := 'system';
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, data_after)
    VALUES (user_id_val, TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, data_before, data_after)
    VALUES (user_id_val, TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, data_before)
    VALUES (user_id_val, TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  
  RETURN NULL; -- Pro AFTER triggers nemusíme vracet value
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Přidat trigger na osoby:
CREATE TRIGGER audit_osoby_trigger
  AFTER INSERT OR UPDATE OR DELETE ON osoby
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_func();

/* ==============================================
   VERIFIKACE
   ============================================== */
-- Test birthday funkce:
SELECT * FROM check_birthday_notifications();

-- Test monthly stats:
SELECT * FROM generate_monthly_stats(2026, 5);

-- Kontrola triggernů:
SELECT tgname, tgrelid::regclass 
FROM pg_trigger 
WHERE tgname LIKE 'audit%';
