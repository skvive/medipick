-- MEDIPICK v3.3 · Neon Postgres (운영 메타·향후 SQLite 이전용)
-- 런타임 v3.3는 Render에서 SQLite(/var/data) 사용. Neon은 배포 추적·확장 스키마용.

CREATE TABLE IF NOT EXISTS deploy_meta (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO deploy_meta (key, value)
VALUES ('product', 'MEDIPICK v3.3'),
       ('site', 'https://medipick.lexid.site'),
       ('runtime', 'python-server-sqlite')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
