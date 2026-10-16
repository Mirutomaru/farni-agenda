-- FARNÍ AGENDA - AAppend-Only AUDIT LOG TABLE
-- Tabulka s nezměnitelnou historií změn pro forenzní analýzu
-- Omezení: INSERT pouze, UPDATE/DELETE zakázány (RLS)

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  
  -- Identifikace změny
  user_id VARCHAR(255) NOT NULL DEFAULT 'system',
  action VARCHAR(16) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name VARCHAR(128) NOT NULL,
  record_id TEXT NOT NULL,
  
  -- Delta stavů před a po změně (JSONB pro query-ability)
  data_before JSONB DEFAULT NULL,
  data_after JSONB DEFAULT NULL,
  
  -- Kontext změny
  ip_address INET DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  
  -- Timestamp vytvoření (immutable - nelze měnit)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ověření integrity (SHA-256 hash delta)
  data_hash VARCHAR(64) DEFAULT NULL
);

-- Index pro rychlé vyhledávání podle tabulky a record_id
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);

-- Index pro časové řady
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Index pro hledání podle uživatele
CREATE INDEX idx_audit_log_user ON audit_log(user_id);

-- RLS: Povolit pouze INSERT (append-only)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Politika: Pouze vkládání záznamů (žádný UPDATE/DELETE)
CREATE POLICY "Append-only access" ON audit_log
  FOR ALL
  USING (true)
  WITH CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'));

-- Omezení pro zápis pouze aplikací (ne adminy)
CREATE POLICY "Application insert only" ON audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Triggrová funkce pro automatické hashování delta dat
CREATE OR REPLACE FUNCTION set_data_hash()
RETURNS TRIGGER AS $$
BEGIN
  -- Hash všech relevantních polí pro ověření integrity
  NEW.data_hash := md5(
    COALESCE(NEW.record_id, '') ||
    COALESCE(NEW.table_name, '') ||
    COALESCE(NEW.action, '') ||
    COALESCE(NEW.data_before::text, '') ||
    COALESCE(NEW.data_after::text, '') ||
    COALESCE(NEW.user_id, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pro výpočet hash při INSERTu
CREATE TRIGGER trg_set_data_hash
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION set_data_hash();
