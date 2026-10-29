-- MEDIPICK v3.3 · Postgres (Neon) — replaces SQLite on Render

CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  external_key TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '병원',
  region TEXT NOT NULL DEFAULT '서울',
  district TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  hours TEXT DEFAULT '',
  night INT NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  specialties TEXT DEFAULT '',
  source TEXT DEFAULT '운영자 등록',
  verified INT NOT NULL DEFAULT 0,
  image_style TEXT DEFAULT 'mint',
  status TEXT DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  name TEXT NOT NULL,
  specialty TEXT DEFAULT '',
  credentials TEXT DEFAULT '',
  society TEXT DEFAULT '',
  intro TEXT DEFAULT '',
  verification TEXT DEFAULT 'unverified',
  profile_url TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  doctor_id INT REFERENCES doctors(id),
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'blog',
  category TEXT DEFAULT '',
  url TEXT DEFAULT '',
  evidence_url TEXT DEFAULT '',
  author_label TEXT DEFAULT '',
  approved INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editorial_priority INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  category TEXT NOT NULL,
  headline TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  active INT NOT NULL DEFAULT 0,
  approved INT NOT NULL DEFAULT 0,
  start_at TEXT DEFAULT '',
  end_at TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  provider_id INT NOT NULL REFERENCES providers(id),
  visitor_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  visit_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  provider_id INT,
  content_id INT,
  category TEXT DEFAULT '',
  query TEXT DEFAULT '',
  client_key TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  nickname TEXT NOT NULL,
  aspect TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advertiser_keys (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES providers(id),
  label TEXT NOT NULL DEFAULT '광고주 리포트',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  appointment_id INT NOT NULL REFERENCES appointments(id),
  channel TEXT NOT NULL,
  state TEXT DEFAULT 'pending_configuration',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  provider_id INT PRIMARY KEY REFERENCES providers(id),
  status TEXT NOT NULL DEFAULT 'inactive',
  paid INT NOT NULL DEFAULT 0,
  compliance_approved INT NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'basic',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  provider_id INT PRIMARY KEY REFERENCES providers(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  google_place_id TEXT DEFAULT '',
  place_reviewed INT NOT NULL DEFAULT 0,
  coordinate_source TEXT NOT NULL DEFAULT '운영자 확인',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_links (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id),
  provider_id INT NOT NULL REFERENCES providers(id),
  blog_url TEXT NOT NULL,
  code_digest TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'pending_proof',
  editorial_approved INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TEXT DEFAULT '',
  UNIQUE (doctor_id, blog_url)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_slot ON appointments (provider_id, visit_date, visit_time)
  WHERE status IN ('confirmed', 'requested');
