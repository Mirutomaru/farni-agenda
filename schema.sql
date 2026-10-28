-- FARNÍ AGENDA - KONSOLIDOVANÉ SCHEMA (v2 + v3)
-- Verze 3.0 — sloučení schema-v2.sql a schema-v3-improvements.sql
-- Opravy: sjednocení status sloupce, uzivatele tabulka, blind_index, audit vylepšení

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. ZÁKLADNÍ TABULKY
-- ============================================================================

CREATE TABLE farnosti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nazev TEXT NOT NULL,
    zkratka TEXT UNIQUE NOT NULL,
    adresa TEXT,
    psc TEXT,
    obec TEXT,
    telefon TEXT,
    email TEXT,
    web_url TEXT,
    socialni_site JSONB DEFAULT '{}',
    farar_id UUID REFERENCES osoby(id),
    farni_rada UUID[],
    bohosluzby_cas JSONB DEFAULT '{}',
    koordinat GEOGRAPHY(POINT, 4326),
    aktivni BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_farnosti_farar ON farnosti(farar_id);
CREATE INDEX idx_farnosti_aktivni ON farnosti(aktivni);
CREATE INDEX idx_farnosti_obec ON farnosti(obec);

CREATE TABLE osoby (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farnost_id UUID REFERENCES farnosti(id) ON DELETE SET NULL,
    
    krestni_jmeno TEXT NOT NULL,
    prijmeni TEXT NOT NULL,
    datum_narozeni DATE NOT NULL,
    pohlavi BOOLEAN,
    
    -- Šifrovaná citlivá data (TEXT formát pro hex_iv:base64_data)
    ico_encrypted TEXT,
    obcan_prukaz_encrypted TEXT,
    adresa_trvaly_bydlist_encrypted TEXT,
    email_encrypted TEXT,
    telefon_encrypted TEXT,
    
    -- Veřejné kontakty (nešifrované, pro komunikaci)
    verejny_email TEXT,
    verejna_telefon TEXT,
    
    -- Církevní role a funkce
    role_cirkinni TEXT[],
    funkce TEXT,
    funkce_začátek DATE,
    funkce_konec DATE,
    
    -- Duchovní stav
    duchovni_stav BOOLEAN DEFAULT false,
    vysvěcení_datum DATE,
    vysvěcení_biskupem UUID REFERENCES osoby(id),
    
    -- Členství — SJEDNOCENÝ SLOUPEC (v2 schema)
    clenstvi_od DATE,
    clenstvi_zdroj TEXT CHECK (clenstvi_zdroj IN ('krest', 'prihlaska', 'přestup')),
    puvodni_farnost_id UUID REFERENCES farnosti(id),
    clenstvi_status TEXT DEFAULT 'aktivni' CHECK (clenstvi_status IN ('aktivni', 'bez_farnosti', 'inactive', 'vystoupil')),
    
    -- Rodina
    manzel_id UUID REFERENCES osoby(id),
    
    -- Svátostní data
    krest_datum DATE,
    krest_misto TEXT,
    krestni_zapis_id UUID REFERENCES krestni_zapis(id),
    
    birovani_datum DATE,
    birovani_misto TEXT,
    birovani_zapis_id UUID REFERENCES birovani_zapis(id),
    
    svatba_datum DATE,
    svatební_zapis_id UUID REFERENCES svatby(id),
    
    -- Celkový status osoby (nahrazeno clenstvi_status, zachováno pro zpětnou kompatibilitu)
    status TEXT DEFAULT 'aktivni',
    datum_zesnuti DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_osoby_farnost ON osoby(farnost_id);
CREATE INDEX idx_osoby_prijmeni ON osoby(prijmeni);
CREATE INDEX idx_osoby_datum_narozeni ON osoby(datum_narozeni);
CREATE INDEX idx_osoby_clenstvi_status ON osoby(clenstvi_status);
-- status index zachován pro zpětnou kompatibilitu s existujícími query
CREATE INDEX idx_osoby_status ON osoby(status);
CREATE INDEX idx_osoby_duchovni_stav ON osoby(duchovni_stav);

-- ============================================================================
-- 2. MAJETEK A FINANCE
-- ============================================================================

CREATE TABLE majetek (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farnost_id UUID REFERENCES farnosti(id) ON DELETE CASCADE,
    nazev TEXT NOT NULL,
    popis TEXT,
    kategorie TEXT CHECK (kategorie IN ('nemovitost', 'movitost', 'duchovní_pomůcky', 'finance')),
    inventární_cislo TEXT UNIQUE,
    počiáteční_hodnota DECIMAL(12, 2),
    aktuální_hodnota DECIMAL(12, 2),
    umistění TEXT,
    zodpovedna_osoba_id UUID REFERENCES osoby(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_majetek_farnost ON majetek(farnost_id);
CREATE INDEX idx_majetek_zodpovedny ON majetek(zodpovedna_osoba_id);

CREATE TABLE finance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farnost_id UUID REFERENCES farnosti(id) ON DELETE CASCADE,
    typ TEXT NOT NULL CHECK (typ IN ('příjem', 'výdaj')),
    kategorie TEXT NOT NULL,
    castka DECIMAL(12, 2) NOT NULL CHECK (castka > 0),
    měna TEXT DEFAULT 'CZK',
    datum_příjmu DATE NOT NULL,
    datum_zaznamu DATE DEFAULT CURRENT_DATE,
    protiplatitel TEXT,
    variabilni_symbol TEXT,
    popisek TEXT,
    doklad_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_finance_farnost ON finance(farnost_id);
CREATE INDEX idx_finance_datum ON finance(datum_příjmu);
CREATE INDEX idx_finance_typ ON finance(typ);

-- ============================================================================
-- 3. SVÁTOSTI A AKCE
-- ============================================================================

CREATE TABLE krestni_zapis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pokrteny_id UUID REFERENCES osoby(id) ON DELETE CASCADE,
    datum_krstu DATE NOT NULL,
    misto_krstu TEXT NOT NULL,
    farar_vedouci UUID REFERENCES osoby(id),
    otec_id UUID REFERENCES osoby(id),
    matka_id UUID REFERENCES osoby(id),
    kmotr_id UUID REFERENCES osoby(id),
    kmotra_id UUID REFERENCES osoby(id),
    priprava_datum DATE,
    priprava_zapis TEXT,
    krestni_listina_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_krestni_zapis_pokrteny ON krestni_zapis(pokrteny_id);
CREATE INDEX idx_krestni_zapis_datum ON krestni_zapis(datum_krstu);

CREATE TABLE birovani_zapis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    birovan_id UUID REFERENCES osoby(id) ON DELETE CASCADE,
    datum_birovani DATE NOT NULL,
    misto_birovani TEXT NOT NULL,
    biskup_ktery_podelil UUID REFERENCES osoby(id),
    priprava_datum DATE,
    priprava_zapis TEXT,
    kmotr_id UUID REFERENCES osoby(id),
    birovani_listina_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_birovani_zapis_birovan ON birovani_zapis(birovan_id);
CREATE INDEX idx_birovani_zapis_datum ON birovani_zapis(datum_birovani);

CREATE TABLE svatby (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    muz_id UUID REFERENCES osoby(id) ON DELETE SET NULL,
    zena_id UUID REFERENCES osoby(id) ON DELETE SET NULL,
    datum_svatby DATE NOT NULL,
    misto_svatby TEXT NOT NULL,
    farar_vedouci UUID REFERENCES osoby(id),
    priprava_datum DATE,
    priprava_zapis TEXT,
    doklad_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_svatby_muz ON svatby(muz_id);
CREATE INDEX idx_svatby_zena ON svatby(zena_id);
CREATE INDEX idx_svatby_datum ON svatby(datum_svatby);

-- Mnoho-ke-mnoha relace pro svatební svědky (schema-v3 vylepšení)
CREATE TABLE IF NOT EXISTS svatba_svedkove (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    svatba_id UUID REFERENCES svatby(id) ON DELETE CASCADE,
    svedek_id UUID REFERENCES osoby(id) ON DELETE RESTRICT,
    CONSTRAINT uq_svatba_svedek UNIQUE(svatba_id, svedek_id)
);

CREATE INDEX idx_svatba_svedkove ON svatba_svedkove(svatba_id);

CREATE TABLE pohreby (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zemrel_id UUID REFERENCES osoby(id) ON DELETE SET NULL,
    datum_zesnuti DATE NOT NULL,
    datum_pohrbu DATE NOT NULL,
    misto_pohrbu TEXT NOT NULL,
    farar_vedouci UUID REFERENCES osoby(id),
    rodina_kontakt TEXT,
    telefon_rodiny_encrypted BYTEA,
    doklad_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pohreby_zemrel ON pohreby(zemrel_id);
CREATE INDEX idx_pohreby_datum ON pohreby(datum_pohrbu);

-- ============================================================================
-- 4. SPRÁVA A LOGY (uzivatele — oprava #3 z dokumentu)
-- ============================================================================

CREATE TABLE uzivatele (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    jmeno TEXT,
    prijmeni TEXT,
    email TEXT UNIQUE NOT NULL,
    telefon TEXT,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'biskup', 'synodalni_rada', 'farar', 'farni_rada', 'farni_admin', 'redaktor_webu')),
    PRIMARY_farnost_id UUID REFERENCES farnosti(id) ON DELETE SET NULL,
    DALSI_farnosti UUID[],
    aktivni BOOLEAN DEFAULT true,
    posledni_prihlaseni TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_uzivatele_role ON uzivatele(role);
CREATE INDEX idx_uzivatele_farnost ON uzivatele(PRIMARY_farnost_id);
CREATE INDEX idx_uzivatele_email ON uzivatele(email);

-- Nový Google OAuth uživatel automaticky dostane profil (migrace 008).
-- Bez řádku v uzivatele ho RLS nevidí → prázdná aplikace po přihlášení.
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

-- ============================================================================
-- 5. MULTI-TENANCY: Uzivatel-Farnost relace (schema-v3 vylepšení)
-- ============================================================================

CREATE TABLE IF NOT EXISTS uzivatel_farnost (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    farnost_id UUID REFERENCES farnosti(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'redaktor', 'jen_prestrih')),
    aktivni BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, farnost_id)
);

CREATE INDEX idx_uzivatel_farnost_user ON uzivatel_farnost(user_id);
CREATE INDEX idx_uzivatel_farnost_farnost ON uzivatel_farnost(farnost_id);

-- ============================================================================
-- 6. BLIND INDEX PRO VYHLEDÁVÁNÍ V ŠIFROVANÝCH DATECH (schema-v3 vylepšení)
-- ============================================================================

CREATE TABLE IF NOT EXISTS osoby_blind_index (
    osoba_id UUID PRIMARY KEY REFERENCES osoby(id) ON DELETE CASCADE,
    email_hash TEXT, -- UNIQUE NOT NULL → běžný text (migrace 008): staré řádky bez hashu, app ho zatím nepoužívá
    phone_hash TEXT,
    ico_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funkce pro generování blind indexu
CREATE OR REPLACE FUNCTION generate_blind_index(value TEXT) RETURNS TEXT AS $$
BEGIN
    IF value IS NULL THEN RETURN NULL; END IF;
    RETURN lower(trim(value)); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. LOGY A AUDIT (schema-v3 vylepšený trigger)
-- ============================================================================

CREATE TABLE logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    farnost_id UUID REFERENCES farnosti(id) ON DELETE SET NULL,
    akce TEXT NOT NULL CHECK (akce IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'BIRTHDAY_CHECK', 'BACKUP')),
    tabulka TEXT NOT NULL,
    objekt_id UUID,
    data_před JSONB,
    data_po JSONB,
    ip_adresa INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_user ON logs(user_id);
CREATE INDEX idx_logs_farnost ON logs(farnost_id);
CREATE INDEX idx_logs_tabulka ON logs(tabulka);
CREATE INDEX idx_logs_created ON logs(created_at);

-- ============================================================================
-- 8. RLS POLITIKY (jednotný clenstvi_status)
-- ============================================================================

ALTER TABLE osoby ENABLE ROW LEVEL SECURITY;
ALTER TABLE farnosti ENABLE ROW LEVEL SECURITY;
ALTER TABLE majetek ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE krestni_zapis ENABLE ROW LEVEL SECURITY;
ALTER TABLE birovani_zapis ENABLE ROW LEVEL SECURITY;
ALTER TABLE svatby ENABLE ROW LEVEL SECURITY;
ALTER TABLE pohreby ENABLE ROW LEVEL SECURITY;
-- Svědkové svatby — přístup dle stejného pravidla jako svatba (superadmin/biskup nebo farář jednoho z manželů)
ALTER TABLE svatba_svedkove ENABLE ROW LEVEL SECURITY;
-- Logy: policy logs_admin_policy níže bez tohoto řádku byla mrtvé písmo (audit 007)
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
-- Profily uživatelů + multi-tenancy relace — bez RLS čitelné i pro anon (audit 007)
ALTER TABLE uzivatele ENABLE ROW LEVEL SECURITY;
ALTER TABLE uzivatel_farnost ENABLE ROW LEVEL SECURITY;

-- Superadmin - vidí všechno
CREATE POLICY superadmin_farnosti_policy ON farnosti FOR ALL
  USING (EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup')));

-- Farnost: admin/reditel vidí jen svou, superadmin všechno
CREATE POLICY farnost_admin_policy ON farnosti FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- Osoby: vidí jen osoby z farností, ke kterým má přístup
CREATE POLICY osoby_admin_policy ON osoby FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = osoby.farnost_id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- Finance: jen správci farnosti a výše
CREATE POLICY finance_admin_policy ON finance FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = finance.farnost_id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- Audit logy: jen superadmin a správci příslušné farnosti
CREATE POLICY logs_admin_policy ON logs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR farnost_id IS NULL
    OR EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = logs.farnost_id AND uf.aktivni)
  );

-- Uzivatele: vlastní profil + superadmin/biskup vidí všechny profily (audit 007)
CREATE POLICY uzivatele_select_policy ON uzivatele FOR SELECT
  USING (
    id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

CREATE POLICY uzivatele_insert_policy ON uzivatele FOR INSERT
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY uzivatele_update_policy ON uzivatele FOR UPDATE
  USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));

-- Uzivatel-farnost: vlastní členství + superadmin/biskup vidí vše (audit 007)
CREATE POLICY uzivatel_farnost_select_policy ON uzivatel_farnost FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

CREATE POLICY uzivatel_farnost_insert_policy ON uzivatel_farnost FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY uzivatel_farnost_update_policy ON uzivatel_farnost FOR UPDATE
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Majetek: stejná pravidla jako finance
CREATE POLICY majetek_admin_policy ON majetek FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatel_farnost uf WHERE uf.user_id = (select auth.uid()) AND uf.farnost_id = majetek.farnost_id AND uf.aktivni)
    OR EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
  );

-- Sakramentalní záznamy: dědičnost přes farnost_id osoby
CREATE POLICY krestni_zapis_admin_policy ON krestni_zapis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = pokrteny_id)
  );

CREATE POLICY birovani_zapis_admin_policy ON birovani_zapis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = birovan_id)
  );

CREATE POLICY svatby_admin_policy ON svatby FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = COALESCE(muz_id, zena_id))
  );

-- Svědkové svatby — stejná pravidla jako u svatby (přes relaci svatba_id)
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

CREATE POLICY pohreby_admin_policy ON pohreby FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = (select auth.uid()) AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (SELECT 1 FROM osoby o JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = (select auth.uid()) AND uf.aktivni WHERE o.id = zemrel_id)
  );

-- ============================================================================
-- 9. VYLEPŠENÝ AUDIT TRIGGER (schema-v3 improvement)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_action TEXT;
    v_data_před JSONB;
    v_data_po JSONB;
    v_farnost_id UUID := NULL;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'CREATE';
        v_data_před := NULL;
        v_data_po := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_data_před := to_jsonb(OLD);
        v_data_po := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_data_před := to_jsonb(OLD);
        v_data_po := NULL;
    END IF;

    IF TG_TABLE_NAME IN ('farnosti', 'osoby', 'majetek', 'finance') THEN
        v_farnost_id := COALESCE(NEW.farnost_id, OLD.farnost_id);
    END IF;

    INSERT INTO logs (user_id, farnost_id, akce, tabulka, objekt_id, data_před, data_po)
    VALUES (auth.uid(), v_farnost_id, v_action, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_data_před, v_data_po);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_osoby AFTER INSERT OR UPDATE OR DELETE ON osoby FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_farnosti AFTER INSERT OR UPDATE OR DELETE ON farnosti FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_majetek AFTER INSERT OR UPDATE OR DELETE ON majetek FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_finance AFTER INSERT OR UPDATE OR DELETE ON finance FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_krestni_zapis AFTER INSERT OR UPDATE OR DELETE ON krestni_zapis FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_birovani_zapis AFTER INSERT OR UPDATE OR DELETE ON birovani_zapis FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_svatby AFTER INSERT OR UPDATE OR DELETE ON svatby FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_pohreby AFTER INSERT OR UPDATE OR DELETE ON pohreby FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- ============================================================================
-- 10. POMOCNÉ FUNKCE (sjednoceno: clenstvi_status místo status)
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
    -- Auth guard (migrace 008): DEFINER obchází RLS volajícího → explicitní check.
    -- Povoleno: service_role (edge funkce), přihlášený uživatel s aktivním profilem,
    -- postgres/supabase_admin (migrace a ruční testy).
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_birthday_people(den INTEGER, mesic INTEGER)
RETURNS TABLE (
    id UUID,
    jmeno TEXT,
    vek INTEGER,
    email_encrypted BYTEA,
    farnost_id UUID
) AS $$
BEGIN
    -- Auth guard (migrace 008): viz get_monthly_statistics
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- REVOKE/GRANT EXECUTE (migrace 008): nejménější oprávnění pro RPC funkce.
-- Postgres defaultně dává EXECUTE roli PUBLIC (= i anon). Po REVOKE mají
-- přístup jen authenticated (aplikace) a service_role (edge funkce).
-- ============================================================================
REVOKE EXECUTE ON FUNCTION get_monthly_statistics(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_monthly_statistics(integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_birthday_people(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_birthday_people(integer, integer) TO authenticated, service_role;
