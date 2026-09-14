-- FARNÍ AGENDA - SUPABASE EDGE FUNCTIONS MIGRATION PLAN
-- Migrace Firebase Cloud Functions na Supabase Edge Functions + pg_cron
-- 
-- Přehled migrací:
-- 1. birthday-watcher → Supabase cron (pg_cron) nebo Edge Function triggered webhook
-- 2. certificates-generator → Supabase Edge Function (HTTP trigger)
-- 3. monthly-statistics → Supabase cron (pg_cron) pro generování, Edge Function pro notifikace
-- 4. weekly-backup → pg_cron s pg_dump
-- 5. audit-logger → Supabase Database Trigger + Webhook

-- === DŮLEŽITÉ: ===
-- Všechny tyto funkce potřebují SUPABASE_SERVICE_ROLE_KEY a ENCRYPTION_KEY
-- Tyto env vars musí být nastavené v Supabase Dashboard → Settings → Environment Variables

/*
MIGRACE 1: Birthday Watcher (Supabase Cron via pg_cron)
========================================================

Vytvoříme funkci, která vrátí osoby s kulatými narozeninami dnes.
pg_cron ji bude spouštět denně v nastavený čas.

CREATE OR REPLACE FUNCTION check_birthday_notifications()
RETURNS void AS $$
DECLARE
  today_day INTEGER := EXTRACT(DAY FROM NOW())::INTEGER;
  today_month INTEGER := EXTRACT(MONTH FROM NOW())::INTEGER;
  
  CURSOR birthday_persons IS
    SELECT 
      id, krestni_jmeno, prijmeni, datum_narozeni,
      email_encrypted, farnost_id
    FROM osoby
    WHERE clenstvi_status = 'aktivni'
      AND EXTRACT(DAY FROM datum_narozeni::date) = today_day
      AND EXTRACT(MONTH FROM datum_narozeni::date) = today_month;

  person RECORD;
  birth_year INTEGER;
  age INTEGER;
BEGIN
  FOR person IN birthday_persons LOOP
    birth_year := EXTRACT(YEAR FROM person.datum_narození::date)::INTEGER;
    age := EXTRACT(YEAR FROM NOW()) - birth_year;
    
    -- Pouze kulaté narozeniny (násobky 5)
    IF age > 0 AND age % 5 = 0 THEN
      -- TODO: Odeslat notifikaci přes Supabase Edge Function nebo email
      INSERT INTO audit_log (user_id, action, table_name, record_id, data_after)
      VALUES (
        'system',
        'BIRTHDAY_CHECK',
        'osoby',
        person.id,
        jsonb_build_object(
          'jmeno', person.krestni_jmeno || ' ' || person.prijmeni,
          'vek', age,
          'datum_narozeni', person.datum_narozeni
        )
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nastavení cronu (spouští se denně v 8:00):
SELECT cron.schedule('birthday-watcher', '0 8 * * *', 
  $$ SELECT check_birthday_notifications() $$);

-- Pro detailnější kontrolu přes Edge Function doporučuji:
-- Spustit Edge Function z pg_cron pomocí pg_net nebo webhook endpointu


MIGRACE 2: Certificates Generator (Supabase Edge Function)
===========================================================
Existuje jako HTTP-triggered Edge Function. Ponechat, ale zmigrovat logiku.

Vytvořit nový Edge Function s názvem 'generate-certificate':
- Request body: { personId: string, type: 'krest' | 'birovan' }
- Vrátí PDF certifikátu (stejná logika jako certificates-generator/index.ts)


MIGRACE 3: Monthly Statistics (Supabase Cron + Edge Function)
=============================================================
pg_cron pro generování statistik na první den měsíce:

CREATE OR REPLACE FUNCTION generate_monthly_statistics(target_rok INTEGER, target_mesic INTEGER)
RETURNS void AS $$
BEGIN
  -- Vyprázdnit předchozí výsledky pro dané období
  DELETE FROM monthly_stats WHERE rok = target_rok AND mesic = target_mesic;
  
  -- Znovu generovat statistiky z osob/křty/birování/svatby/pohřebe tabulek
  INSERT INTO monthly_stats (farnost_id, farnost_nazev, rok, mesic, celkem_clenu, kresty, birovani, svatby, pohreby)
  SELECT 
    o.farnost_id,
    (SELECT nazev FROM farnosti WHERE id = o.farnost_id LIMIT 1),
    target_rok,
    target_mesic,
    COUNT(DISTINCT o.id),
    -- Křty za dané období
    COALESCE((SELECT COUNT(*) FROM krestni_zapis WHERE EXTRACT(YEAR FROM datum_krstu) = target_rok 
              AND EXTRACT(MONTH FROM datum_krstu) = target_mesic), 0),
    ... -- podobně pro birovani, svatby, pohrebe
  FROM osoby o
  GROUP BY o.farnost_id;
  
  -- Trigger notification Edge Function
  PERFORM net.http_post(
    'https://your-project.supabase.co/functions/v1/monthly-report-notification',
    jsonb_build_object('rok', target_rok, 'mesic', target_mesic)::text,
    array[ARRAY['Authorization', 'Bearer YOUR_SERVICE_KEY']]::text[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron: první den měsíce v 1:00
SELECT cron.schedule('monthly-stats-generator', '0 1 1 * *', 
  $$ SELECT generate_monthly_statistics(EXTRACT(YEAR FROM NOW())::INTEGER, EXTRACT(MONTH FROM NOW())::INTEGER) $$);


MIGRACE 4: Weekly Backup (pg_cron s pg_dump)
=============================================
Supabase podporuje automatické zálohy. Pro vlastní řešení:

-- Vytvořit funkci pro backup
CREATE OR REPLACE FUNCTION perform_weekly_backup()
RETURNS void AS $$
DECLARE
  backup_name TEXT := 'backup_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
BEGIN
  -- pg_dump do storage bucket (vyžaduje pgsodium nebo external tool)
  -- Doporučuji použít Supabase自带的 backup feature místo vlastní implementace
  
  -- Nebo: Exportovat data jako CSV a uploadnout na S3/GCS
  INSERT INTO audit_log (user_id, action, table_name, data_after)
  VALUES ('system', 'WEEKLY_BACKUP', 'all', jsonb_build_object('backup_name', backup_name));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule('weekly-backup', '0 3 * * 0', 
  $$ SELECT perform_weekly_backup() $$);


MIGRACE 5: Audit Logger (Supabase Database Trigger)
====================================================
Nahradit Firebase audit-logger function Supabase triggerem na tabulkách.

CREATE OR REPLACE FUNCTION audit_log_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, data_after)
    VALUES (
      current_setting('request.jwt.claims', true)::json->>'sub'::text, -- nebo auth.uid()
      TG_OP,
      TG_TABLE_NAME,
      NEW.id,
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, data_before, data_after)
    VALUES (
      current_setting('request.jwt.claims', true)::json->>'sub'::text,
      TG_OP,
      TG_TABLE_NAME,
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, data_before)
    VALUES (
      current_setting('request.jwt.claims', true)::json->>'sub'::text,
      TG_OP,
      TG_TABLE_NAME,
      OLD.id,
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Přidat trigger na každou tabulku s citlivými daty:
CREATE TRIGGER audit_osoby_trigger
  AFTER INSERT OR UPDATE OR DELETE ON osoby
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_func();


SHRNUJÍCÍ MIGRACE PLAN:
========================

KROK | Akce                                    | Priorita | Riziko
-----|----------------------------------------|----------|-------
1    | Přidat Database Triggers pro audit     | Vysoká   | Nízké (nová tabulka)
2    | Nastavit pg_cron pro birthday + stats  | Vysoká   | Střední (vyžaduje pg_net extensi)
3    | Migrovat certificates-generator na Edge Function | Vysoká | Střední (změna endpointu)
4    | Otestovat Supabase Edge Functions      | Střední  | Nízké
5    | Odstranit Firebase functions           | Nízká    | Nízké (po ověření)

POZNÁMKY:
- Supabase pg_cron vyžaduje Business plan nebo vyšší ($25/měsíc)
- Edge Functions jsou zdarma do určitého počtu volání
- Alternativou je přechod na vlastní server s Docker/Supabase CLI pro plnou kontrolu
*/
