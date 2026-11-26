-- =========================================================
-- Migration: Store Guest ID Cards (Photos & PDFs) in PostgreSQL BYTEA
-- =========================================================

-- 1. Add metadata columns to guests table for fast directory rendering
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_card_file_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_card_mime_type VARCHAR(100) DEFAULT NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_card_file_size INT DEFAULT NULL;

-- 2. Create dedicated table storing raw binary Photos & PDFs inside PostgreSQL
CREATE TABLE IF NOT EXISTS guest_id_cards (
  id VARCHAR(64) PRIMARY KEY,
  guest_id VARCHAR(64) UNIQUE NOT NULL,
  wedding_id VARCHAR(64) DEFAULT 'wedding_01',
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT NOT NULL DEFAULT 0,
  file_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guest_id_cards_guest_id ON guest_id_cards (guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_id_cards_wedding_id ON guest_id_cards (wedding_id);

DROP TRIGGER IF EXISTS trigger_guest_id_cards_updated_at ON guest_id_cards;
CREATE TRIGGER trigger_guest_id_cards_updated_at
  BEFORE UPDATE ON guest_id_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE guest_id_cards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow full access to guest_id_cards" ON guest_id_cards;
  CREATE POLICY "Allow full access to guest_id_cards" ON guest_id_cards FOR ALL USING (true) WITH CHECK (true);
END $$;
