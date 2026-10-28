-- FARNÍ AGENDA - UNIT TESTY PRO SQL FUNKCE
-- Supabase/PostgreSQL testovací skript

\echo '========================================'
\echo 'TESTOVÁNÍ SQL FUNKCÍ - FARNÍ AGENDA v2.0'
\echo '========================================'

-- ============================================================================
-- SETUP: VYTVOŘENÍ TESTOVACÍCH DAT
-- ============================================================================

-- Vytvoření testovací farnosti
INSERT INTO farnosti (nazev, zkratka, adresa, obec, psc, aktivni) 
VALUES ('Testovací Farnost', 'TF', 'Testovací 1', 'Praha', '100 00', true);

-- Vytvoření testovacích osob
INSERT INTO osoby (farnost_id, krestni_jmeno, prijmeni, datum_narozeni, clenstvi_od, clenstvi_zdroj, status) 
VALUES 
    ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'Jan', 'Novák', '1974-05-14', CURRENT_DATE, 'krest', 'aktivni'),
    ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'Marie', 'Svobodová', '1964-08-20', CURRENT_DATE, 'prihlaska', 'aktivni'),
    ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'Petr', 'Dvořák', '2020-03-15', CURRENT_DATE, 'krest', 'aktivni');

-- ============================================================================
-- TEST 1: get_monthly_statistics() - Měsíční statistiky
-- ============================================================================

\echo ''
\echo 'TEST 1: get_monthly_statistics()'
\echo '----------------------------------------'

DO $$
DECLARE
    result RECORD;
    test_count INTEGER := 0;
    pass_count INTEGER := 0;
BEGIN
    -- Test 1.1: Funkce vrací data pro aktuální měsíc
    RAISE NOTICE 'Test 1.1: Vracení dat pro aktuální měsíc...';
    
    FOR result IN 
        SELECT * FROM get_monthly_statistics(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER)
    LOOP
        test_count := test_count + 1;
        
        -- Kontrola, že farnost je vrácena
        IF result.farnost_nazev IS NOT NULL THEN
            RAISE NOTICE '  ✓ Farnost: %', result.farnost_nazev;
            pass_count := pass_count + 1;
        END IF;
        
        -- Kontrola, že členové jsou počítáni
        IF result.celkem_clenu >= 0 THEN
            RAISE NOTICE '  ✓ Počet členů: %', result.celkem_clenu;
            pass_count := pass_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Test 1.1 Výsledek: %/% testů prošlo', pass_count, test_count;
END $$;

-- Test 1.2: Kontrola pro neexistující měsíc (prosinec 2023)
\echo ''
\echo 'TEST 1.2: Statistika pro minulý rok (edge case)...'

DO $$
DECLARE
    result RECORD;
BEGIN
    FOR result IN 
        SELECT * FROM get_monthly_statistics(2023, 12)
    LOOP
        RAISE NOTICE '  Farnost: %, Členů: %', result.farnost_nazev, result.celkem_clenu;
    END LOOP;
    
    IF NOT FOUND THEN
        RAISE NOTICE '  ✓ Žádná data pro minulý rok (správné chování)';
    END IF;
END $$;

-- ============================================================================
-- TEST 2: get_birthday_people() - Kontrola narozenin
-- ============================================================================

\echo ''
\echo 'TEST 2: get_birthday_people()'
\echo '----------------------------------------'

DO $$
DECLARE
    result RECORD;
    test_count INTEGER := 0;
    pass_count INTEGER := 0;
BEGIN
    -- Test 2.1: Kontrola narozenin dnešního data
    RAISE NOTICE 'Test 2.1: Hledání osob s narozeninami dnes...';
    
    FOR result IN 
        SELECT * FROM get_birthday_people(
            EXTRACT(DAY FROM CURRENT_DATE)::INTEGER,
            EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
        )
    LOOP
        test_count := test_count + 1;
        
        IF result.jmeno IS NOT NULL THEN
            RAISE NOTICE '  ✓ Osoba s narozeninami: %, Věk: % let', result.jmeno, result.vek;
            pass_count := pass_count + 1;
        END IF;
    END LOOP;
    
    IF test_count = 0 THEN
        RAISE NOTICE '  ℹ Žádné osoby s narozeninami dnes (očekáváno pro testovací data)';
    ELSE
        RAISE NOTICE 'Test 2.1 Výsledek: %/% testů prošlo', pass_count, test_count;
    END IF;
END $$;

-- Test 2.2: Kontrola pro neexistující datum (30. února - edge case)
\echo ''
\echo 'TEST 2.2: Hledání narozenin na neexistující datum...'

DO $$
DECLARE
    result RECORD;
BEGIN
    BEGIN
        FOR result IN 
            SELECT * FROM get_birthday_people(30, 2)
        LOOP
            RAISE NOTICE '  Osoba nalezena: %', result.jmeno;
        END LOOP;
        
        IF NOT FOUND THEN
            RAISE NOTICE '  ✓ Žádné osoby s narozeninami 30.2 (správné chování)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ⚠ Výjimka při hledání neexistujícího data: %', SQLERRM;
    END;
END $$;

-- ============================================================================
-- TEST 3: RLS POLICY TESTY - Row Level Security
-- ============================================================================

\echo ''
\echo 'TEST 3: RLS POLICIES'
\echo '----------------------------------------'

DO $$
DECLARE
    result RECORD;
BEGIN
    -- Test 3.1: Superadmin vidí všechny osoby
    RAISE NOTICE 'Test 3.1: Superadmin přístup...';
    
    SET LOCAL ROLE supertest_superadmin;
    
    FOR result IN 
        SELECT COUNT(*) as count FROM osoby
    LOOP
        IF result.count > 0 THEN
            RAISE NOTICE '  ✓ Superadmin vidí % osob', result.count;
        END IF;
    END LOOP;
    
    RESET ROLE;
END $$;

-- Test 3.2: Farnost admin vidí jen svou farnost
\echo ''
\echo 'TEST 3.2: Farnost admin přístup (omezený)...'

DO $$
DECLARE
    result RECORD;
BEGIN
    SET LOCAL ROLE supertest_farnost_admin;
    
    FOR result IN 
        SELECT COUNT(*) as count FROM osoby WHERE farnost_id = (SELECT id FROM farnosti WHERE zkratka = 'TF')
    LOOP
        IF result.count > 0 THEN
            RAISE NOTICE '  ✓ Farnost admin vidí osoby své farnosti: %', result.count;
        END IF;
    END LOOP;
    
    RESET ROLE;
END $$;

-- ============================================================================
-- TEST 4: VALIDACE DAT - CHECK CONSTRAINTS
-- ============================================================================

\echo ''
\echo 'TEST 4: DATA VALIDATION'
\echo '----------------------------------------'

DO $$
BEGIN
    -- Test 4.1: Validní vložení osoby
    RAISE NOTICE 'Test 4.1: Vložení validní osoby...';
    
    BEGIN
        INSERT INTO osoby (farnost_id, krestni_jmeno, prijmeni, datum_narozeni, status)
        VALUES ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'Test', 'User', '1990-01-01', 'aktivni');
        
        RAISE NOTICE '  ✓ Validní osoba vložena';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ⚠ Chyba při vložení: %', SQLERRM;
    END;
    
    -- Test 4.2: Nevalidní datum narození (budoucnost)
    RAISE NOTICE '';
    RAISE NOTICE 'Test 4.2: Vložení osoby s datem narození v budoucnosti...';
    
    BEGIN
        INSERT INTO osoby (farnost_id, krestni_jmeno, prijmeni, datum_narozeni, status)
        VALUES ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'Test', 'Future', '2030-01-01', 'aktivni');
        
        RAISE NOTICE '  ⚠ Nevalidní data byla přijata (potřeba validace)';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ✓ Chyba detekována: %', SQLERRM;
    END;
    
    -- Test 4.3: Validní finance záznam
    RAISE NOTICE '';
    RAISE NOTICE 'Test 4.3: Vložení validního finančního záznamu...';
    
    BEGIN
        INSERT INTO finance (farnost_id, typ, kategorie, castka, datum_příjmu)
        VALUES ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'příjem', 'dar', 1000.00, CURRENT_DATE);
        
        RAISE NOTICE '  ✓ Validní finance vloženy';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ⚠ Chyba při vložení: %', SQLERRM;
    END;
    
    -- Test 4.4: Nevalidní finance (záporná částka)
    RAISE NOTICE '';
    RAISE NOTICE 'Test 4.4: Vložení nevalidního finančního záznamu (záporná částka)...';
    
    BEGIN
        INSERT INTO finance (farnost_id, typ, kategorie, castka, datum_příjmu)
        VALUES ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'výdaj', 'údržba', -500.00, CURRENT_DATE);
        
        RAISE NOTICE '  ⚠ Nevalidní data byla přijata';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ✓ Chyba detekována: %', SQLERRM;
    END;
END $$;

-- ============================================================================
-- TEST 5: TRIGGER TESTY - Audit Logy
-- ============================================================================

\echo ''
\echo 'TEST 5: AUDIT LOG TRIGGERS'
\echo '----------------------------------------'

DO $$
BEGIN
    -- Test 5.1: Vytvoření záznamu vytvoří audit log
    RAISE NOTICE 'Test 5.1: Audit log při INSERT...';
    
    DELETE FROM logs WHERE tabulka = 'osoby' AND objekt_id IN (
        SELECT id FROM osoby WHERE prijmeni = 'AuditTest' LIMIT 1
    );
    
    INSERT INTO osoby (farnost_id, krestni_jmeno, prijmeni, datum_narozeni, status)
    VALUES ((SELECT id FROM farnosti WHERE zkratka = 'TF'), 'Test', 'AuditTest', '1990-01-01', 'aktivni');
    
    IF EXISTS (SELECT 1 FROM logs WHERE tabulka = 'osoby' AND akce = 'CREATE') THEN
        RAISE NOTICE '  ✓ Audit log vytvořen při INSERT';
    ELSE
        RAISE NOTICE '  ⚠ Audit log nebyl vytvořen';
    END IF;
    
    -- Test 5.2: Update vytvoří audit log
    RAISE NOTICE '';
    RAISE NOTICE 'Test 5.2: Audit log při UPDATE...';
    
    UPDATE osoby SET krestni_jmeno = 'Updated' WHERE prijmeni = 'AuditTest';
    
    IF EXISTS (SELECT 1 FROM logs WHERE tabulka = 'osoby' AND akce = 'UPDATE') THEN
        RAISE NOTICE '  ✓ Audit log vytvořen při UPDATE';
    ELSE
        RAISE NOTICE '  ⚠ Audit log nebyl vytvořen';
    END IF;
    
    -- Test 5.3: Delete vytvoří audit log
    RAISE NOTICE '';
    RAISE NOTICE 'Test 5.3: Audit log při DELETE...';
    
    DELETE FROM osoby WHERE prijmeni = 'AuditTest';
    
    IF EXISTS (SELECT 1 FROM logs WHERE tabulka = 'osoby' AND akce = 'DELETE') THEN
        RAISE NOTICE '  ✓ Audit log vytvořen při DELETE';
    ELSE
        RAISE NOTICE '  ⚠ Audit log nebyl vytvořen';
    END IF;
END $$;

-- ============================================================================
-- TEST 6: search_persons() - Full-text vyhledávání (migrace 005)
-- ============================================================================

\echo ''
\echo 'TEST 6: search_persons()'
\echo '----------------------------------------'

DO $$
DECLARE
    result RECORD;
BEGIN
    -- Test 6.1: Plné jméno najde osobu
    RAISE NOTICE 'Test 6.1: Hledání "Novák"...';
    
    FOR result IN SELECT * FROM search_persons('Novák', 10) LOOP
        IF EXISTS (SELECT 1 FROM osoby o WHERE o.id = result.osoba_id AND o.prijmeni = 'Novák') THEN
            RAISE NOTICE '  ✓ Najdena osoba Novák';
        ELSE
            RAISE EXCEPTION '  ✗ Nalezená osoba není Novák';
        END IF;
    END LOOP;

    -- Test 6.2: Krátký dotaz (1-2 znaky) → ILIKE fallback
    RAISE NOTICE 'Test 6.2: Krátký dotaz "No"...';
    
    FOR result IN SELECT * FROM search_persons('No', 10) LOOP
        IF EXISTS (SELECT 1 FROM osoby o WHERE o.id = result.osoba_id AND (o.prijmeni ILIKE '%No%' OR o.krestni_jmeno ILIKE '%No%')) THEN
            RAISE NOTICE '  ✓ Fallback funguje pro krátké dotazy';
        ELSE
            RAISE EXCEPTION '  ✗ Fallback vrátil nesprávnou osobu';
        END IF;
    END LOOP;

    -- Test 6.3: Neexistující jméno → prázdný výsledek
    RAISE NOTICE 'Test 6.3: Hledání "XYZNEEXISTUJE"...';
    
    IF NOT EXISTS (SELECT * FROM search_persons('XYZNEEXISTUJE', 10)) THEN
        RAISE NOTICE '  ✓ Prázdný výsledek pro neexistující jméno';
    ELSE
        RAISE EXCEPTION '  ✗ Očekáván prázdný výsledek';
    END IF;

    -- Test 6.4: Limit respektován
    RAISE NOTICE 'Test 6.4: Limit 1...';
    
    IF (SELECT COUNT(*) FROM search_persons('a', 1)) <= 1 THEN
        RAISE NOTICE '  ✓ Limit respektován';
    ELSE
        RAISE EXCEPTION '  ✗ Limit porušen';
    END IF;
END $$;

-- ============================================================================
-- TEST 7: check_anniversary_notifications() - Výročí svatb a pohřbů (migrace 006)
-- ============================================================================

\echo ''
\echo 'TEST 7: check_anniversary_notifications()'
\echo '----------------------------------------'

DO $$
DECLARE
    result RECORD;
    test_farnost UUID := (SELECT id FROM farnosti WHERE zkratka = 'TF');
    osoba1 UUID := (SELECT id FROM osoby WHERE prijmeni = 'Novák' LIMIT 1);
    osoba2 UUID := (SELECT id FROM osoby WHERE prijmeni = 'Svobodová' LIMIT 1);
BEGIN
    -- Setup: svatba s výročí dnes a pohřeb s výročí zítra
    INSERT INTO svatby (muz_id, zena_id, datum_svatby, misto_svatby)
    VALUES (osoba1, osoba2, make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 5, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(DAY FROM CURRENT_DATE)::int), 'Testovací kostel');

    INSERT INTO pohreby (zemrel_id, datum_zesnuti, datum_pohrbu, misto_pohrbu)
    VALUES (osoba1, make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 3, EXTRACT(MONTH FROM CURRENT_DATE)::int, GREATEST(1, EXTRACT(DAY FROM CURRENT_DATE)::int - 1)), make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 3, EXTRACT(MONTH FROM CURRENT_DATE)::int, GREATEST(2, EXTRACT(DAY FROM CURRENT_DATE))), 'Testovací hřbitov');

    -- Test 7.1: Výročí svatby dnes je nalezeno
    RAISE NOTICE 'Test 7.1: Výročí svatby (dnes)...';
    
    FOR result IN SELECT * FROM check_anniversary_notifications(3) WHERE typ = 'svatba' LOOP
        IF result.dni_do_vyroci >= 0 AND result.dni_do_vyroci <= 3 THEN
            RAISE NOTICE '  ✓ Výročí svatby nalezeno (za % dní)', result.dni_do_vyroci;
        ELSE
            RAISE EXCEPTION '  ✗ Výročí svatby mimo horizont';
        END IF;
    END LOOP;

    -- Test 7.2: Smuteční výročí úmrtí je nalezeno
    RAISE NOTICE 'Test 7.2: Smuteční výročí (horizont 3 dny)...';
    
    FOR result IN SELECT * FROM check_anniversary_notifications(3) WHERE typ = 'pohreb' LOOP
        IF result.dni_do_vyroci >= 0 AND result.dni_do_vyroci <= 3 THEN
            RAISE NOTICE '  ✓ Smuteční výročí nalezeno (za % dní)', result.dni_do_vyroci;
        ELSE
            RAISE EXCEPTION '  ✗ Smuteční výročí mimo horizont';
        END IF;
    END LOOP;

    -- Test 7.3: Horizont 0 dnů — jen dnes
    RAISE NOTICE 'Test 7.3: Horizont 0 (jen dnes)...';
    
    FOR result IN SELECT * FROM check_anniversary_notifications(0) LOOP
        IF result.dni_do_vyroci = 0 THEN
            RAISE NOTICE '  ✓ Horizont 0 vrací jen dnešní výročí';
        ELSE
            RAISE EXCEPTION '  ✗ Horizont 0 vrátil budoucí výročí';
        END IF;
    END LOOP;

    -- Cleanup testovacích svatb/pohřebů
    DELETE FROM pohreby WHERE zemrel_id = osoba1 AND misto_pohrbu = 'Testovací hřbitov';
    DELETE FROM svatby WHERE muz_id = osoba1 AND zena_id = osoba2;

    RAISE NOTICE '  ✓ Testy výročí dokončeny';
END $$;

-- ============================================================================
-- TEST 8: Migrace 008 — blind index fix, handle_new_user, auth guardy RPC
-- ============================================================================

\echo ''
\echo 'TEST 8: migrace 008 (blind index + user trigger + RPC guards)'
\echo '----------------------------------------'

DO $$
DECLARE
    test_farnost UUID := (SELECT id FROM farnosti WHERE zkratka = 'TF');
    nova_osoba UUID;
    auth_user UUID;
BEGIN
    -- Test 8.1: Nová osoba → trigger vytvoří blind index řádek s vektorem
    -- (před migrací 008 spadl NOT NULL violation na email_hash)
    RAISE NOTICE 'Test 8.1: Trigger sync_person_search_index u nové osoby...';

    INSERT INTO osoby (farnost_id, krestni_jmeno, prijmeni, datum_narozeni, clenstvi_od, clenstvi_zdroj, status, verejny_email)
    VALUES (test_farnost, 'Test', 'Blindindexová', '1990-01-01', CURRENT_DATE, 'krest', 'aktivni', 'blind@test.cz')
    RETURNING id INTO nova_osoba;

    IF NOT EXISTS (SELECT 1 FROM osoby_blind_index WHERE osoba_id = nova_osoba AND search_vector IS NOT NULL) THEN
        RAISE EXCEPTION '  ✗ Blind index řádek s vektorem nebyl vytvořen';
    END IF;
    RAISE NOTICE '  ✓ Nová osoba má blind index řádek s plným textovým vektorem';

    -- Test 8.2: Backfill — existující osoby mají search_vector (DO UPDATE, ne DO NOTHING)
    RAISE NOTICE 'Test 8.2: Backfill existujících osob...';

    IF EXISTS (SELECT 1 FROM osoby o WHERE NOT EXISTS (SELECT 1 FROM osoby_blind_index b WHERE b.osoba_id = o.id AND b.search_vector IS NOT NULL)) THEN
        RAISE EXCEPTION '  ✗ Některé osoby nemají search_vector po backfillu';
    END IF;
    RAISE NOTICE '  ✓ Všechny osoby mají naplněný search_vector';

    -- Test 8.3: handle_new_user — nový auth.user dostane profil v uzivatele
    RAISE NOTICE 'Test 8.3: Trigger handle_new_user na auth.users...';

    INSERT INTO auth.users (instance_id, id, aud, role, email)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'novy.user@test.cz')
    RETURNING id INTO auth_user;

    IF NOT EXISTS (SELECT 1 FROM uzivatele WHERE id = auth_user AND email = 'novy.user@test.cz' AND role = 'redaktor_webu') THEN
        RAISE EXCEPTION '  ✗ Nový uživatel nedostal profil v uzivatele';
    END IF;
    RAISE NOTICE '  ✓ Nový Google OAuth uživatel automaticky dostal profil (role redaktor_webu)';

    -- Test 8.4: Auth guard — RPC funkce funguje pro postgres (migrace/testy)
    RAISE NOTICE 'Test 8.4: Auth guard v get_monthly_statistics...';

    IF NOT EXISTS (SELECT * FROM get_monthly_statistics(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER)) THEN
        RAISE EXCEPTION '  ✗ get_monthly_statistics nevrátila žádná data pro postgres';
    END IF;
    RAISE NOTICE '  ✓ RPC funkce funguje pro postgres (guard nepropadá)';

    -- Test 8.5: REVOKE od PUBLIC — anon už nemá EXECUTE na RPC funkcích
    RAISE NOTICE 'Test 8.5: REVOKE EXECUTE od PUBLIC...';

    IF has_function_privilege('anon', 'get_monthly_statistics(integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '  ✗ Anon má stále EXECUTE na get_monthly_statistics (REVOKE neplatí)';
    END IF;
    IF NOT has_function_privilege('authenticated', 'get_monthly_statistics(integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '  ✗ Authenticated nemá EXECUTE na get_monthly_statistics (GRANT chybí)';
    END IF;
    RAISE NOTICE '  ✓ REVOKE/GRANT EXECUTE aplikováno (anon bez přístupu, authenticated s přístupem)';

    -- Cleanup testovacích dat z tohoto testu
    DELETE FROM uzivatele WHERE id = auth_user;
    DELETE FROM auth.users WHERE id = auth_user;
    DELETE FROM osoby_blind_index WHERE osoba_id = nova_osoba;
    DELETE FROM osoby WHERE id = nova_osoba;

    RAISE NOTICE '  ✓ Testy migrace 008 dokončeny';
END $$;

-- ============================================================================
-- TEST 9: Migrace 009 — obal (select auth.uid()) v policies + ILIKE escaping
-- ============================================================================

\echo ''
\echo 'TEST 9: migrace 009 (RLS výkon + ILIKE escaping)'
\echo '----------------------------------------'

DO $$
DECLARE
    test_farnost UUID := (SELECT id FROM farnosti WHERE zkratka = 'TF');
    wildcard_osoba UUID;
    policy_count INTEGER;
BEGIN
    -- Test 9.1: Policies používají obal (select auth.uid()) — konstantní poddotaz
    RAISE NOTICE 'Test 9.1: RLS policies s obalem (select auth.uid())...';

    SELECT COUNT(*) INTO policy_count
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policydef ILIKE '%select auth.uid()%';

    IF policy_count < 17 THEN
        RAISE EXCEPTION '  ✗ Očekáván alespoň 17 policies s obalem (select auth.uid()), nalezeno %', policy_count;
    END IF;
    RAISE NOTICE '  ✓ % RLS policies používá cacheovaný obal (select auth.uid())', policy_count;

    -- Žádná policy nesmí obsahovat holé '= auth.uid()' bez poddotazového obalu
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policydef ILIKE '%= auth.uid()%';

    IF policy_count > 0 THEN
        RAISE EXCEPTION '  ✗ % policies stále používá holé auth.uid() bez obalu', policy_count;
    END IF;

    -- Test 9.2: ILIKE escaping — dotaz '%' musí zachytit jen osoby s doslovným % v jméně
    RAISE NOTICE 'Test 9.2: ILIKE escaping wildcards v search_persons...';

    INSERT INTO osoby (farnost_id, krestni_jmeno, prijmeni, datum_narozeni, clenstvi_od, clenstvi_zdroj, status)
    VALUES (test_farnost, 'Wildcard', 'Test%Osoba', '1985-06-15', CURRENT_DATE, 'krest', 'aktivni')
    RETURNING id INTO wildcard_osoba;

    -- Dotaz '%' by bez escaping zachytil VŠECHNY osoby (wildcard) — s escaping jen doslovné %
    IF NOT EXISTS (SELECT * FROM search_persons('%', 100) WHERE osoba_id = wildcard_osoba) THEN
        RAISE EXCEPTION '  ✗ Dotaz %% nezachytil osobu s doslovným %% v příjmení';
    END IF;

    -- Osoby BEZ % v jméně by dotaz '%' neměl zachytit (před fixem ano — únik dat)
    IF EXISTS (SELECT * FROM search_persons('%', 100) WHERE osoba_id <> wildcard_osoba) THEN
        RAISE EXCEPTION '  ✗ Dotaz %% zachytil i osoby bez %% v jméně (escaping nefunguje)';
    END IF;

    -- Test 9.3: Normální krátký dotaz dál funguje po přepisu funkce
    RAISE NOTICE 'Test 9.3: Krátký dotaz po přepisu search_persons...';

    IF NOT EXISTS (SELECT * FROM search_persons('Nov', 100)) THEN
        RAISE EXCEPTION '  ✗ Krátký dotaz Nov nezachytil osobu Novák';
    END IF;
    RAISE NOTICE '  ✓ Krátké dotazy dál fungují (ILIKE fallback s escapingem)';

    -- Cleanup
    DELETE FROM osoby WHERE id = wildcard_osoba;

    RAISE NOTICE '  ✓ Testy migrace 009 dokončeny';
END $$;

-- ============================================================================
-- CLEANUP: SMYTÍ TESTOVACÍCH DAT
-- ============================================================================

\echo ''
\echo 'CLEANUP: Odstranění testovacích dat...'

DELETE FROM osoby WHERE farnost_id = (SELECT id FROM farnosti WHERE zkratka = 'TF');
DELETE FROM farnosti WHERE zkratka = 'TF';

\echo ''
\echo '========================================'
\echo 'TESTOVÁNÍ SQL FUNKCÍ - DOKONČENO'
\echo '========================================'
