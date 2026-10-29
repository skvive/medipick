import { db, dbQuery } from '@/lib/db';
import { nowKst } from '@/lib/medipick/constants';
import { field } from '@/lib/medipick/helpers';
import { createHmac, randomBytes } from 'node:crypto';

type Row = Record<string, unknown>;

function positiveInt(v: unknown, name: string, allowZero = true, maxv = 10 ** 12): number {
  if (typeof v === 'boolean' || !/^\d{1,13}$/.test(String(v))) throw new Error(`${name}은(는) 원 단위 정수여야 합니다`);
  const n = Number(v);
  if (n > maxv || (!allowZero && n === 0)) throw new Error(`${name}의 범위가 올바르지 않습니다`);
  return n;
}

function isDate(s: unknown): string {
  const v = field(s, '날짜', 10, true);
  if (new Date(v).toISOString().slice(0, 10) !== v) throw new Error('날짜는 YYYY-MM-DD');
  return v;
}

async function audit(pid: number, actor: string, action: string, typ: string, rid: number) {
  const sql = db();
  await sql`
    INSERT INTO billing_audit (provider_id, actor, action, record_type, record_id, created_at)
    VALUES (${pid}, ${actor}, ${action}, ${typ}, ${rid}, ${nowKst()})
  `;
}

export async function authenticateDoctor(authHeader: string | null) {
  const secret = process.env.MEDIPICK_SECRET || 'dev-only-change-me';
  if (!authHeader?.startsWith('Bearer mpdoc_') || authHeader.length > 180) return null;
  const digest = createHmac('sha256', secret).update(authHeader.slice(7)).digest('hex');
  const sql = db();
  const rows = await sql<Row>`SELECT * FROM doctor_access WHERE token_hash = ${digest} AND revoked = 0`;
  const r = rows[0];
  if (!r) return null;
  if (new Date(String(r.expires_at)).getTime() <= Date.now()) return null;
  return r as { id: number; provider_id: number; label: string; expires_at: string };
}

export async function feeList(pid: number) {
  const sql = db();
  return sql`SELECT * FROM fee_catalog WHERE provider_id = ${pid} ORDER BY code, effective_from DESC`;
}

export async function addFee(pid: number, keyId: number, data: Record<string, unknown>) {
  const code = field(data.code, '수가 코드', 40, true, /^[A-Z0-9._-]{2,40}$/);
  const name = field(data.name, '수가명', 140, true);
  const amount = positiveInt(data.amount_won, '수가금액', false, 100_000_000);
  const start = isDate(data.effective_from);
  const end = data.effective_to ? isDate(data.effective_to) : '';
  if (end && end < start) throw new Error('수가 유효 종료일은 시작일 이후여야 합니다');
  const url = field(data.source_url, '출처 URL', 500);
  const src = field(data.source_label, '수가 고시/버전', 160, true);
  const sql = db();
  const rows = await sql<{ id: number }>`
    INSERT INTO fee_catalog (provider_id, code, name, amount_won, effective_from, effective_to, source_url, source_label, demo, created_at)
    VALUES (${pid}, ${code}, ${name}, ${amount}, ${start}, ${end}, ${url}, ${src}, 0, ${nowKst()})
    RETURNING id
  `;
  await audit(pid, String(keyId), 'add_fee', 'fee_catalog', rows[0].id);
  return { id: rows[0].id, officially_verified: false, warning: '등록 수가는 내부 참고용이며 법정 산정·고시 검증 완료를 의미하지 않습니다.' };
}

export async function listClaims(pid: number) {
  const sql = db();
  const rows = await dbQuery<Row>(
    `SELECT b.*, r.reviewed_won, r.notice_ref,
      COALESCE((SELECT SUM(amount_won) FROM deposit_allocations WHERE claim_id = b.id), 0) AS paid_won
     FROM billing_claims b
     LEFT JOIN claim_reviews r ON r.claim_id = b.id
     WHERE b.provider_id = $1 ORDER BY b.id DESC LIMIT 300`,
    [pid],
  );
  return rows.map((d) => ({
    ...d,
    unpaid_won: Math.max(0, Number(d.reviewed_won ?? d.requested_won) - Number(d.paid_won)),
  })) as Row[];
}

export async function addClaim(pid: number, keyId: number, data: Record<string, unknown>) {
  const encounter = field(data.encounter_ref, '비식별 방문참조', 60, true, /^[A-Za-z0-9._-]{3,60}$/);
  if (/^\d{6,}$/.test(encounter) || /\d{6}-?\d{7}/.test(encounter)) {
    throw new Error('주민번호/전화번호 또는 개인식별번호를 입력하지 마세요');
  }
  const visit = isDate(data.visit_date);
  if (visit > new Date().toISOString().slice(0, 10)) throw new Error('미래 진료일을 청구 초안으로 작성할 수 없습니다');
  const typ = field(data.service_type ?? 'outpatient', '진료유형', 30);
  if (!['outpatient', 'inpatient'].includes(typ)) throw new Error('진료유형 오류');
  const copay = positiveInt(data.patient_copay_won ?? 0, '본인부담금');
  const lines = data.lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 30) throw new Error('수가 항목 1~30개가 필요합니다');
  const sql = db();
  let gross = 0;
  const lineData: unknown[][] = [];
  for (const row of lines) {
    if (!row || typeof row !== 'object') throw new Error('항목 형식 오류');
    const r = row as Record<string, unknown>;
    const code = field(r.code, '수가코드', 40, true, /^[A-Z0-9._-]{2,40}$/);
    const qty = positiveInt(r.quantity ?? 1, '수량', false, 100);
    const fees = await sql<Row>`
      SELECT * FROM fee_catalog WHERE provider_id = ${pid} AND code = ${code}
        AND effective_from <= ${visit} AND (effective_to = '' OR effective_to >= ${visit})
      ORDER BY effective_from DESC LIMIT 1
    `;
    const fee = fees[0];
    if (!fee) throw new Error(`해당 진료일에 적용할 수가가 없습니다: ${code}`);
    const total = Number(fee.amount_won) * qty;
    gross += total;
    lineData.push([
      fee.id,
      fee.code,
      fee.name,
      fee.amount_won,
      qty,
      total,
      fee.source_label,
      fee.source_url,
      fee.demo,
    ]);
  }
  if (copay > gross) throw new Error('본인부담금이 총액을 초과합니다');
  const req = gross - copay;
  const ref = 'SIM-' + randomBytes(6).toString('hex').toUpperCase();
  const claims = await sql<{ id: number }>`
    INSERT INTO billing_claims (provider_id, claim_ref, encounter_ref, visit_date, service_type, patient_copay_won, requested_won, gross_won, created_at, updated_at)
    VALUES (${pid}, ${ref}, ${encounter}, ${visit}, ${typ}, ${copay}, ${req}, ${gross}, ${nowKst()}, ${nowKst()})
    RETURNING id
  `;
  const cid = claims[0].id;
  for (const line of lineData) {
    const [feeId, code, name, amount, qty, total, srcLabel, srcUrl, demo] = line as (string | number)[];
    await sql`
      INSERT INTO billing_lines (claim_id, fee_id, code, name, amount_won, quantity, total_won, source_label, source_url, demo)
      VALUES (${cid}, ${feeId}, ${code}, ${name}, ${amount}, ${qty}, ${total}, ${srcLabel}, ${srcUrl}, ${demo})
    `;
  }
  await audit(pid, String(keyId), 'create_draft', 'billing_claims', cid);
  return {
    id: cid,
    claim_ref: ref,
    status: 'draft',
    gross_won: gross,
    requested_won: req,
    warning: '가상 참조 및 수동 본인부담금으로 계산한 내부 초안입니다.',
  };
}

async function getClaim(pid: number, cid: number) {
  const sql = db();
  const rows = await sql<Row>`SELECT * FROM billing_claims WHERE provider_id = ${pid} AND id = ${cid}`;
  if (!rows[0]) throw new Error('해당 기관의 청구 초안이 없습니다');
  return rows[0];
}

export async function preflight(pid: number, cid: number) {
  const b = await getClaim(pid, cid);
  const sql = db();
  const lines = await sql<Row>`SELECT * FROM billing_lines WHERE claim_id = ${cid}`;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!lines.length) blockers.push('진료행위 항목이 없습니다');
  if (lines.some((x) => Number(x.demo))) blockers.push('가상 수가(DEMO)가 포함되어 내부 제출준비를 통과할 수 없습니다');
  if (Number(b.patient_copay_won) > Number(b.gross_won)) blockers.push('본인부담금 초과');
  const sum = lines.reduce((a, x) => a + Number(x.total_won), 0);
  if (sum !== Number(b.gross_won)) blockers.push('수가 합계 불일치');
  return {
    claim_id: cid,
    can_prepare: blockers.length === 0,
    blockers,
    warnings,
    check_type: 'internal_structural_only',
    hira_validated: false,
  };
}

export async function prepareClaim(pid: number, keyId: number, cid: number) {
  const b = await getClaim(pid, cid);
  if (b.status !== 'draft') throw new Error('초안만 내부 사전점검 상태로 변경할 수 있습니다');
  const test = await preflight(pid, cid);
  if (!test.can_prepare) throw new Error(`사전점검 실패: ${test.blockers.join(' / ')}`);
  const sql = db();
  await sql`UPDATE billing_claims SET status = 'prepared_internal', updated_at = ${nowKst()} WHERE id = ${cid}`;
  await audit(pid, String(keyId), 'prepare_internal', 'billing_claims', cid);
  return { status: 'prepared_internal', ...test, warning: '심평원 사전점검 통과나 제출 완료를 의미하지 않습니다.' };
}

export async function recordSubmission(pid: number, keyId: number, cid: number, data: Record<string, unknown>) {
  const b = await getClaim(pid, cid);
  if (b.status !== 'prepared_internal') throw new Error('내부점검을 마친 청구만 외부 접수 기록을 남길 수 있습니다');
  if (data.confirm_external !== true) throw new Error('공식 포털에서 별도 제출했다는 확인이 필요합니다');
  const receipt = field(data.portal_receipt, '포털 접수번호', 100, true, /^[\w./-]{4,100}$/);
  const sql = db();
  await sql`
    UPDATE billing_claims SET status = 'external_recorded', external_receipt = ${receipt}, submitted_at = ${nowKst()}, updated_at = ${nowKst()}
    WHERE id = ${cid}
  `;
  await audit(pid, String(keyId), 'record_external_submitted_manually', 'billing_claims', cid);
  return { status: 'external_recorded', portal_receipt: receipt, hira_transmitted_by_medipick: false };
}

export async function recordReview(pid: number, keyId: number, cid: number, data: Record<string, unknown>) {
  const b = await getClaim(pid, cid);
  if (!['external_recorded', 'reviewed'].includes(String(b.status))) {
    throw new Error('외부 접수 기록이 있는 청구만 심사결과를 등록할 수 있습니다');
  }
  const amt = positiveInt(data.reviewed_won, '심사인정액');
  if (amt > Number(b.requested_won)) throw new Error('심사인정액이 청구요청액을 초과합니다.');
  const notice = field(data.notice_ref, '심사통보서 번호', 120, true);
  const reason = field(data.adjustment_reason, '조정사유', 300);
  const sql = db();
  await sql`
    INSERT INTO claim_reviews (claim_id, reviewed_won, adjustment_reason, notice_ref, reviewed_at)
    VALUES (${cid}, ${amt}, ${reason}, ${notice}, ${nowKst()})
    ON CONFLICT (claim_id) DO UPDATE SET reviewed_won = EXCLUDED.reviewed_won, adjustment_reason = EXCLUDED.adjustment_reason,
      notice_ref = EXCLUDED.notice_ref, reviewed_at = EXCLUDED.reviewed_at
  `;
  await sql`UPDATE billing_claims SET status = 'reviewed', updated_at = ${nowKst()} WHERE id = ${cid}`;
  await audit(pid, String(keyId), 'review_manually_recorded', 'billing_claims', cid);
  return { status: 'reviewed', reviewed_won: amt, adjusted_won: Number(b.requested_won) - amt };
}

export async function deposits(pid: number) {
  const rows = await dbQuery<Row>(
    `SELECT b.*, COALESCE((SELECT SUM(amount_won) FROM deposit_allocations WHERE deposit_id = b.id), 0) AS allocated_won
     FROM bank_deposits b WHERE b.provider_id = $1 ORDER BY b.id DESC`,
    [pid],
  );
  return rows;
}

export async function addDeposit(pid: number, keyId: number, data: Record<string, unknown>) {
  const ref = field(data.bank_txn_ref, '은행 거래참조번호', 100, true, /^[A-Za-z0-9._-]{3,100}$/);
  const d = isDate(data.received_on);
  if (d > new Date().toISOString().slice(0, 10)) throw new Error('미래 입금일 오류');
  const amount = positiveInt(data.amount_won, '입금액', false);
  const memo = field(data.memo, '메모', 160);
  const sql = db();
  const rows = await sql<{ id: number }>`
    INSERT INTO bank_deposits (provider_id, bank_txn_ref, received_on, amount_won, memo, created_at)
    VALUES (${pid}, ${ref}, ${d}, ${amount}, ${memo}, ${nowKst()})
    RETURNING id
  `;
  await audit(pid, String(keyId), 'record_bank_deposit', 'bank_deposits', rows[0].id);
  return { id: rows[0].id, note: '은행 자동조회 없이 담당자가 수동 입력한 통장 장부입니다.' };
}

export async function allocate(pid: number, keyId: number, data: Record<string, unknown>) {
  const cid = positiveInt(data.claim_id, '청구 ID', false);
  const did = positiveInt(data.deposit_id, '입금 ID', false);
  const amount = positiveInt(data.amount_won, '배분액', false);
  const b = await getClaim(pid, cid);
  const sql = db();
  const dep = await sql<Row>`SELECT * FROM bank_deposits WHERE id = ${did} AND provider_id = ${pid}`;
  if (!dep[0]) throw new Error('해당 기관의 통장 거래가 없습니다');
  if (!['reviewed', 'closed'].includes(String(b.status))) throw new Error('심사결과 기록 후 대사할 수 있습니다');
  const rev = await sql<{ reviewed_won: number }>`SELECT reviewed_won FROM claim_reviews WHERE claim_id = ${cid}`;
  if (!rev[0]) throw new Error('심사결과 누락');
  const claimSumRows = await sql<{ s: number }>`SELECT COALESCE(SUM(amount_won), 0)::int AS s FROM deposit_allocations WHERE claim_id = ${cid}`;
  const depositSumRows = await sql<{ s: number }>`SELECT COALESCE(SUM(amount_won), 0)::int AS s FROM deposit_allocations WHERE deposit_id = ${did}`;
  const claimSum = claimSumRows[0]?.s ?? 0;
  const depositSum = depositSumRows[0]?.s ?? 0;
  if (claimSum + amount > rev[0].reviewed_won) throw new Error('배분액이 심사 인정액을 초과합니다');
  if (depositSum + amount > Number(dep[0].amount_won)) throw new Error('배분액이 통장 입금액을 초과합니다');
  const ins = await sql<{ id: number }>`
    INSERT INTO deposit_allocations (provider_id, claim_id, deposit_id, amount_won, created_at)
    VALUES (${pid}, ${cid}, ${did}, ${amount}, ${nowKst()})
    RETURNING id
  `;
  const settled = claimSum + amount === rev[0].reviewed_won;
  if (settled) await sql`UPDATE billing_claims SET status = 'closed', updated_at = ${nowKst()} WHERE id = ${cid}`;
  await audit(pid, String(keyId), 'allocate_deposit', 'deposit_allocations', ins[0].id);
  return {
    ok: true,
    claim_fully_reconciled: settled,
    unpaid_won: rev[0].reviewed_won - claimSum - amount,
    deposit_unallocated_won: Number(dep[0].amount_won) - depositSum - amount,
  };
}

export async function dashboard(pid: number) {
  const claims = await listClaims(pid);
  const dep = await deposits(pid);
  const sql = db();
  const ads = await sql<{ c: number }>`SELECT count(*)::int AS c FROM events WHERE provider_id = ${pid} AND kind = 'ad_click'`;
  const articles = await sql<{ c: number }>`SELECT count(*)::int AS c FROM content WHERE provider_id = ${pid} AND approved = 1`;
  return {
    claims_count: claims.length,
    requested_won: claims.reduce((a, x) => a + Number(x.requested_won), 0),
    reviewed_won: claims.reduce((a, x) => a + Number(x.reviewed_won || 0), 0),
    paid_allocated_won: claims.reduce((a, x) => a + Number(x.paid_won), 0),
    outstanding_reviewed_won: claims.reduce(
      (a, x) => a + Math.max(0, Number(x.reviewed_won || 0) - Number(x.paid_won)),
      0,
    ),
    content_count: articles[0]?.c ?? 0,
    ad_clicks: ads[0]?.c ?? 0,
    notice: '청구·심사·입금 금액은 사용자 입력 및 시연 자료입니다.',
  };
}

export async function auditList(pid: number) {
  const sql = db();
  return sql`SELECT * FROM billing_audit WHERE provider_id = ${pid} ORDER BY id DESC LIMIT 150`;
}

export async function seedDemoFees() {
  const sql = db();
  const providers = await sql<{ id: number }>`SELECT id FROM providers WHERE external_key LIKE 'demo-%' LIMIT 2`;
  for (const p of providers) {
    for (const [code, name, amount] of [
      ['DEMO-EXAM', '가상 외래진찰 (실제 수가 아님)', 23000],
      ['DEMO-PROC', '가상 처치 (실제 수가 아님)', 37000],
    ]) {
      await sql`
        INSERT INTO fee_catalog (provider_id, code, name, amount_won, effective_from, source_label, demo, created_at)
        VALUES (${p.id}, ${code}, ${name}, ${amount}, '2026-01-01', '가상 수가표 / 법적 청구 불가', 1, ${nowKst()})
        ON CONFLICT DO NOTHING
      `;
    }
  }
}
