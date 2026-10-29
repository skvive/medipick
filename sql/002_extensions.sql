-- MEDIPICK v3.3 extensions (clinic keys, doctor finance, integrations, outreach)

CREATE TABLE IF NOT EXISTS clinic_access (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  permission TEXT NOT NULL CHECK (permission IN ('schedule_read', 'schedule_manage')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_audit (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL,
  actor_key_id INT NOT NULL,
  action TEXT NOT NULL,
  appointment_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_access (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_catalog (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_won INT NOT NULL CHECK (amount_won >= 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  demo INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, code, effective_from)
);

CREATE TABLE IF NOT EXISTS billing_claims (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  claim_ref TEXT NOT NULL,
  encounter_ref TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'outpatient',
  patient_copay_won INT NOT NULL DEFAULT 0,
  requested_won INT NOT NULL DEFAULT 0,
  gross_won INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  external_receipt TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, claim_ref),
  UNIQUE (provider_id, encounter_ref)
);

CREATE TABLE IF NOT EXISTS billing_lines (
  id SERIAL PRIMARY KEY,
  claim_id INT NOT NULL REFERENCES billing_claims(id),
  fee_id INT NOT NULL REFERENCES fee_catalog(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_won INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  total_won INT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  demo INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS claim_reviews (
  id SERIAL PRIMARY KEY,
  claim_id INT NOT NULL UNIQUE REFERENCES billing_claims(id),
  reviewed_won INT NOT NULL CHECK (reviewed_won >= 0),
  adjustment_reason TEXT NOT NULL DEFAULT '',
  notice_ref TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_deposits (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  bank_txn_ref TEXT NOT NULL,
  received_on TEXT NOT NULL,
  amount_won INT NOT NULL CHECK (amount_won > 0),
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, bank_txn_ref)
);

CREATE TABLE IF NOT EXISTS deposit_allocations (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  claim_id INT NOT NULL REFERENCES billing_claims(id),
  deposit_id INT NOT NULL REFERENCES bank_deposits(id),
  amount_won INT NOT NULL CHECK (amount_won > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (claim_id, deposit_id)
);

CREATE TABLE IF NOT EXISTS billing_audit (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_doctor_accounts (
  doctor_id INT PRIMARY KEY REFERENCES doctors(id),
  google_email TEXT NOT NULL DEFAULT '',
  refresh_encrypted TEXT NOT NULL DEFAULT '',
  blog_items TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  order_id TEXT PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  plan TEXT NOT NULL,
  amount_krw INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_contacts (
  id SERIAL PRIMARY KEY,
  contact_hash TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'kakao')),
  consent_campaign INT NOT NULL DEFAULT 0,
  contact_verified INT NOT NULL DEFAULT 0,
  consent_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  purpose TEXT DEFAULT '메디픽 일반 정보 뉴스레터',
  UNIQUE (channel, contact_hash)
);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT '일반 건강상식',
  reviewed INT DEFAULT 0,
  dispatch_state TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benefit_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  benefit_type TEXT NOT NULL,
  discount_won INT DEFAULT 0,
  medical_service INT DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'blocked_legal_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'booking_requested';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_once ON notifications (appointment_id, channel, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_unique_confirmed ON appointments (provider_id, visit_date, visit_time)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments (provider_id, visit_date, visit_time, status);
CREATE INDEX IF NOT EXISTS idx_clinic_audit_provider ON clinic_audit (provider_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bill_claims_provider ON billing_claims (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_bill_deposits_provider ON bank_deposits (provider_id);
