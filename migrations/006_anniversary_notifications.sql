-- FARNÍ AGENDA - MIGRACE 006: VÝROČÍ SVATB A POHŘBŮ (P2)
-- Rozšíření birthday-watcheru o upozornění na výročí svatb a smuteční výročí úmrtí.
-- Idempotentní — lze spustit opakovaně

-- ============================================================================
-- 1. HELPER: VÝROČÍ V AKTUÁLNÍM ROCE (null-safe pro 29.2.)
-- ============================================================================
CREATE OR REPLACE FUNCTION anniversary_in_current_year(d date) RETURNS date AS $$
BEGIN
    RETURN make_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::int,
        EXTRACT(MONTH FROM d)::int,
        EXTRACT(DAY FROM d)::int
    );
EXCEPTION WHEN OTHERS THEN
    -- 29. února v nepřestupném roce → NULL (výročí se přeskočí)
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 2. RPC: check_anniversary_notifications(p_days_ahead)
-- Vrátí výročí svatb a smuteční výročí úmrtí v horizontu p_days_ahead dnů (včetně dneška).
-- SECURITY INVOKER → RLS se aplikuje automaticky (multi-tenancy bez úniku dat)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_anniversary_notifications(p_days_ahead integer DEFAULT 3)
RETURNS TABLE (
    typ text,          -- 'svatba' | 'pohreb'
    jmeno text,        -- popis události (jména účastníků / zemřelého)
    datum_puvodni date,-- původní datum události
    let integer,       -- počet uplynulých let (výročí = let + 1)
    dni_do_vyroci integer, -- kolik dní zbývá do výročí (0 = dnes)
    farnost_id uuid
) AS $$
BEGIN
    RETURN QUERY

    -- === VÝROČÍ SVATB ===
    SELECT
        'svatba'::text,
        coalesce(o1.krestni_jmeno || ' ' || o1.prijmeni, '?') || ' & ' ||
            coalesce(o2.krestni_jmeno || ' ' || o2.prijmeni, '?'),
        s.datum_svatby,
        EXTRACT(YEAR FROM CURRENT_DATE)::int - EXTRACT(YEAR FROM s.datum_svatby)::int,
        (anniversary_in_current_year(s.datum_svatby) - CURRENT_DATE)::int,
        coalesce(o1.farnost_id, o2.farnost_id)
    FROM svatby s
    LEFT JOIN osoby o1 ON o1.id = s.muz_id
    LEFT JOIN osoby o2 ON o2.id = s.zena_id
    WHERE anniversary_in_current_year(s.datum_svatby) IS NOT NULL
      AND anniversary_in_current_year(s.datum_svatby) BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_days_ahead)
      AND EXTRACT(YEAR FROM s.datum_svatby) < EXTRACT(YEAR FROM CURRENT_DATE)

    UNION ALL

    -- === SMUTEČNÍ VÝROČÍ ÚMRTÍ ===
    SELECT
        'pohreb'::text,
        coalesce(o.krestni_jmeno || ' ' || o.prijmeni, '?'),
        p.datum_zesnuti,
        EXTRACT(YEAR FROM CURRENT_DATE)::int - EXTRACT(YEAR FROM p.datum_zesnuti)::int,
        (anniversary_in_current_year(p.datum_zesnuti) - CURRENT_DATE)::int,
        o.farnost_id
    FROM pohreby p
    LEFT JOIN osoby o ON o.id = p.zemrel_id
    WHERE anniversary_in_current_year(p.datum_zesnuti) IS NOT NULL
      AND anniversary_in_current_year(p.datum_zesnuti) BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_days_ahead)
      AND EXTRACT(YEAR FROM p.datum_zesnuti) < EXTRACT(YEAR FROM CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;
