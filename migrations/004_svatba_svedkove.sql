-- FARNÍ AGENDA - MIGRACE 004: SVATBA_SVEDKOVE (relace svědků svatby)
-- Tabulka existovala jen v konsolidovaném schema.sql, ale nikdy nebyla migrována do live DB.
-- Tato migrace ji vytvoří idempotentně + opraví index s překlepem (svateba_id → svatba_id).

CREATE TABLE IF NOT EXISTS svatba_svedkove (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    svatba_id UUID REFERENCES svatby(id) ON DELETE CASCADE,
    svedek_id UUID REFERENCES osoby(id) ON DELETE RESTRICT,
    CONSTRAINT uq_svatba_svedek UNIQUE(svatba_id, svedek_id)
);

-- Oprava indexu: původní verze odkazovala na neexistující sloupec "svateba_id" (překlep)
DROP INDEX IF EXISTS idx_svatebni_svedkove;
CREATE INDEX IF NOT EXISTS idx_svatba_svedkove ON svatba_svedkove(svatba_id);

-- RLS: stejná pravidla jako u tabulky svatby (superadmin/biskup nebo farář jednoho z manželů)
ALTER TABLE svatba_svedkove ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS svatba_svedkove_admin_policy ON svatba_svedkove;
CREATE POLICY svatba_svedkove_admin_policy ON svatba_svedkove FOR ALL
  USING (
    EXISTS (SELECT 1 FROM uzivatele u WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'biskup'))
    OR EXISTS (
      SELECT 1 FROM svatby s
      JOIN osoby o ON o.id = COALESCE(s.muz_id, s.zena_id)
      JOIN uzivatel_farnost uf ON uf.farnost_id = o.farnost_id AND uf.user_id = auth.uid() AND uf.aktivni
      WHERE s.id = svatba_svedkove.svatba_id
    )
  );

-- Audit trigger (konzistentně se zbytkem schématu)
DROP TRIGGER IF EXISTS audit_svatba_svedkove ON svatba_svedkove;
CREATE TRIGGER audit_svatba_svedkove AFTER INSERT OR UPDATE OR DELETE ON svatba_svedkove FOR EACH ROW EXECUTE FUNCTION create_audit_log();
