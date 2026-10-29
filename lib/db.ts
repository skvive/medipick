import { neon, Pool as NeonPool } from '@neondatabase/serverless';
import { Pool, type QueryResultRow } from 'pg';

let neonPool: NeonPool | null = null;

type SqlTagged = {
  <T extends QueryResultRow = QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
};

let localPool: Pool | null = null;

function isLocal(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return /@(localhost|127\.0\.0\.1)/.test(url);
  }
}

function buildQuery(strings: TemplateStringsArray, values: unknown[]) {
  let text = '';
  const params: unknown[] = [];
  strings.forEach((part, i) => {
    text += part;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });
  return { text, values: params };
}

function createLocalSql(url: string): SqlTagged {
  const pool = (localPool ??= new Pool({ connectionString: url }));
  return async (strings, ...values) => {
    const { text, values: params } = buildQuery(strings, values);
    const r = await pool.query(text, params);
    return r.rows;
  };
}

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function db(): SqlTagged {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isLocal(url)) return createLocalSql(url);
  return neon(url) as unknown as SqlTagged;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isLocal(url)) {
    const pool = localPool ?? new Pool({ connectionString: url });
    localPool = pool;
    const r = await pool.query<T>(text, values);
    return r.rows;
  }
  neonPool ??= new NeonPool({ connectionString: url });
  const r = await neonPool.query<T>(text, values);
  return r.rows;
}
