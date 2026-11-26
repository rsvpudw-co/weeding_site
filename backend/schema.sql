-- =========================================================
-- Emitly Database Schema for PostgreSQL / Supabase
-- Multi-Wedding, Guest Logistics & Call Center System
-- =========================================================

-- 1. Helper function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- 2. System Users Table (Admin & Call Center Telecallers)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'call_center', -- 'admin' or 'call_center'
  phone VARCHAR(50) DEFAULT NULL,
  avatar VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------
-- 3. Weddings / Marriage Events Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS weddings (
  id VARCHAR(64) PRIMARY KEY,
  groom_name VARCHAR(255) NOT NULL,
  bride_name VARCHAR(255) NOT NULL,
  wedding_date VARCHAR(50) DEFAULT NULL,
  venue VARCHAR(255) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  cover_theme VARCHAR(50) DEFAULT 'emerald',
  notes TEXT DEFAULT NULL,
  client_username VARCHAR(100) UNIQUE DEFAULT NULL,
  client_password VARCHAR(255) DEFAULT NULL,
  google_sheet_id VARCHAR(255) DEFAULT NULL,
  google_sheet_url VARCHAR(500) DEFAULT NULL,
  google_sheet_sync_status VARCHAR(50) DEFAULT 'connected',
  google_sheet_last_synced TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_weddings_wedding_date ON weddings (wedding_date);
CREATE INDEX IF NOT EXISTS idx_weddings_client_username ON weddings (client_username);
CREATE INDEX IF NOT EXISTS idx_weddings_google_sheet_id ON weddings (google_sheet_id);

DROP TRIGGER IF EXISTS trigger_weddings_updated_at ON weddings;
CREATE TRIGGER trigger_weddings_updated_at
  BEFORE UPDATE ON weddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------
-- 4. Guests & Logistics Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS guests (
  id VARCHAR(64) PRIMARY KEY,
  wedding_id VARCHAR(64) DEFAULT 'wedding_01',
  sr_no INT DEFAULT 1,
  guest_name VARCHAR(255) NOT NULL,
  contact VARCHAR(255) DEFAULT NULL,
  side VARCHAR(50) DEFAULT 'Groom', -- 'Bride', 'Groom', or 'Both'
  relation VARCHAR(100) DEFAULT NULL, -- Relation to Bride or Groom (e.g. Sister, Friend, Cousin, Colleague)
  rsvp_status VARCHAR(50) DEFAULT 'Confirmed',
  id_card_received VARCHAR(10) DEFAULT 'No',
  
  -- Arrival Section
  arrival_date VARCHAR(50) DEFAULT NULL,
  arrival_time VARCHAR(50) DEFAULT NULL,
  arrival_location VARCHAR(255) DEFAULT NULL,
  arrival_flight_train_no VARCHAR(100) DEFAULT NULL,
  
  -- Departure Section
  departure_date VARCHAR(50) DEFAULT NULL,
  departure_time VARCHAR(50) DEFAULT NULL,
  departure_location VARCHAR(255) DEFAULT NULL,
  departure_flight_train_no VARCHAR(100) DEFAULT NULL,
  
  -- ID Card & Logistics Documents
  id_card_copy TEXT DEFAULT NULL,
  id_card_file_name VARCHAR(255) DEFAULT NULL,
  id_card_mime_type VARCHAR(100) DEFAULT NULL,
  id_card_file_size INT DEFAULT NULL,
  special_request TEXT DEFAULT NULL,
  
  -- Call Center Tracking & Checkpoints
  call_count INT DEFAULT 0,
  call_status VARCHAR(50) DEFAULT 'Not Called',
  last_called_at TIMESTAMPTZ DEFAULT NULL,
  last_call_summary TEXT DEFAULT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Ensure column exists if table was already created earlier
ALTER TABLE guests ADD COLUMN IF NOT EXISTS relation VARCHAR(100) DEFAULT NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_card_file_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_card_mime_type VARCHAR(100) DEFAULT NULL;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_card_file_size INT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_guests_wedding_id ON guests (wedding_id);
CREATE INDEX IF NOT EXISTS idx_guests_guest_name ON guests (guest_name);
CREATE INDEX IF NOT EXISTS idx_guests_side ON guests (side);
CREATE INDEX IF NOT EXISTS idx_guests_relation ON guests (relation);
CREATE INDEX IF NOT EXISTS idx_guests_rsvp_status ON guests (rsvp_status);
CREATE INDEX IF NOT EXISTS idx_guests_call_status ON guests (call_status);
CREATE INDEX IF NOT EXISTS idx_guests_call_count ON guests (call_count);
CREATE INDEX IF NOT EXISTS idx_guests_created_at ON guests (created_at);

DROP TRIGGER IF EXISTS trigger_guests_updated_at ON guests;
CREATE TRIGGER trigger_guests_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------
-- 5. Call Center Detailed Logs & Summary History
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_call_logs (
  id VARCHAR(64) PRIMARY KEY,
  guest_id VARCHAR(64) NOT NULL,
  wedding_id VARCHAR(64) DEFAULT 'wedding_01',
  call_number INT NOT NULL DEFAULT 1,
  agent_id VARCHAR(64) DEFAULT NULL,
  agent_name VARCHAR(255) DEFAULT 'Call Desk Agent',
  call_outcome VARCHAR(50) NOT NULL,
  call_summary TEXT NOT NULL,
  callback_date VARCHAR(50) DEFAULT NULL,
  called_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guest_call_logs_guest_id ON guest_call_logs (guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_call_logs_wedding_id ON guest_call_logs (wedding_id);
CREATE INDEX IF NOT EXISTS idx_guest_call_logs_called_at ON guest_call_logs (called_at);

-- ---------------------------------------------------------
-- 5b. Direct Chat / Messages Table (User & Admin Communication)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS wedding_messages (
  id VARCHAR(64) PRIMARY KEY,
  wedding_id VARCHAR(64) NOT NULL,
  sender_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_role VARCHAR(50) NOT NULL, -- 'admin', 'client', or 'bot'
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wedding_messages_wedding_id ON wedding_messages (wedding_id);
CREATE INDEX IF NOT EXISTS idx_wedding_messages_created_at ON wedding_messages (created_at);

-- ---------------------------------------------------------
-- 5c. Guest ID Cards Binary Storage Table (Photos & PDFs)
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- 6. Row Level Security (RLS) Policies for Public / Service Access
-- ---------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_id_cards ENABLE ROW LEVEL SECURITY;

-- Allow full access to all tables for authenticated/anon/service roles
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow full access to users" ON users;
  CREATE POLICY "Allow full access to users" ON users FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow full access to weddings" ON weddings;
  CREATE POLICY "Allow full access to weddings" ON weddings FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow full access to guests" ON guests;
  CREATE POLICY "Allow full access to guests" ON guests FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow full access to guest_call_logs" ON guest_call_logs;
  CREATE POLICY "Allow full access to guest_call_logs" ON guest_call_logs FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow full access to wedding_messages" ON wedding_messages;
  CREATE POLICY "Allow full access to wedding_messages" ON wedding_messages FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow full access to guest_id_cards" ON guest_id_cards;
  CREATE POLICY "Allow full access to guest_id_cards" ON guest_id_cards FOR ALL USING (true) WITH CHECK (true);
END $$;

-- ---------------------------------------------------------
-- 7. Initial Seed Data (Users, Weddings, Guests, Logs)
-- ---------------------------------------------------------
INSERT INTO users (id, name, email, password, role, phone, avatar)
VALUES
  ('user_admin_01', 'Manish', 'admin@emitly.com', 'manish1122', 'admin', '+91 98765 00001', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'),
  ('user_agent_01', 'Sarah (Call Center Desk)', 'callcenter@emitly.com', 'call123', 'call_center', '+91 98765 00002', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80')
ON CONFLICT (id) DO NOTHING;


