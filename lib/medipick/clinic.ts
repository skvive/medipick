import { db } from '@/lib/db';
import { nowKst } from '@/lib/medipick/constants';
import { tokenDigest } from '@/lib/medipick/helpers';

type AccessRow = {
  id: number;
  provider_id: number;
  label: string;
  permission?: string;
  expires_at: string;
  revoked: number;
};

export async function authenticateClinic(authHeader: string | null): Promise<AccessRow | null> {
  const token = authHeader?.startsWith('Bearer mpclinic_') ? authHeader.slice(7) : null;
  if (!token || authHeader!.length > 180) return null;
  const digest = tokenDigest('clinic', token);
  const sql = db();
  const rows = await sql<AccessRow>`SELECT * FROM clinic_access WHERE token_hash = ${digest} AND revoked = 0`;
  const r = rows[0];
  if (!r) return null;
  if (new Date(r.expires_at).getTime() <= Date.now()) return null;
  return r;
}

export async function clinicSchedule(providerId: number, start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('날짜 형식은 YYYY-MM-DD');
  }
  const lo = new Date(start);
  const hi = new Date(end);
  if (lo > hi || (hi.getTime() - lo.getTime()) / 86400000 > 90) throw new Error('조회 범위는 최대 90일');
  const sql = db();
  const rows = await sql<{ id: number; public_id: string; visit_date: string; visit_time: string; status: string }>`
    SELECT id, public_id, visit_date, visit_time, status FROM appointments
    WHERE provider_id = ${providerId} AND visit_date >= ${start} AND visit_date <= ${end}
    ORDER BY visit_date, visit_time, id LIMIT 500
  `;
  return rows.map((r) => ({
    id: r.id,
    public_id: r.public_id,
    date: r.visit_date,
    time: r.visit_time,
    status: r.status,
    title: `예약 ${r.public_id.slice(-6)}`,
  }));
}

export async function clinicDashboard(providerId: number) {
  const sql = db();
  const statusRows = await sql<{ status: string; n: number }>`
    SELECT status, count(*)::int AS n FROM appointments WHERE provider_id = ${providerId} GROUP BY status
  `;
  const status_counts: Record<string, number> = {};
  for (const r of statusRows) status_counts[r.status] = r.n;
  const pending = await sql<{ c: number }>`
    SELECT count(*)::int AS c FROM notifications n
    JOIN appointments a ON a.id = n.appointment_id
    WHERE a.provider_id = ${providerId} AND n.state IN ('pending_configuration', 'retry')
  `;
  return {
    provider_id: providerId,
    status_counts,
    pending_notifications: pending[0]?.c ?? 0,
    notice: '가상 예약 포함, 실제 병원 확정 여부는 별도 확인 필요. 진료 정보·환자 실명 미표시',
  };
}

const transitions: Record<string, Set<string>> = {
  requested: new Set(['confirmed', 'declined', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
  declined: new Set(),
  cancelled: new Set(),
  completed: new Set(),
};

export async function clinicTransition(
  providerId: number,
  actorKeyId: number,
  appointmentId: number,
  newStatus: string,
) {
  if (!['confirmed', 'declined', 'cancelled', 'completed'].includes(newStatus)) {
    throw new Error('허용되지 않은 예약 상태');
  }
  const sql = db();
  const rows = await sql<{ id: number; status: string }>`
    SELECT id, status FROM appointments WHERE id = ${appointmentId} AND provider_id = ${providerId}
  `;
  const row = rows[0];
  if (!row) throw new Error('해당 의료기관의 예약을 찾을 수 없습니다');
  if (row.status === newStatus) return { ok: true, status: newStatus, unchanged: true };
  if (!transitions[row.status]?.has(newStatus)) throw new Error('예약 상태 전이 규칙에 맞지 않습니다');
  try {
    await sql`UPDATE appointments SET status = ${newStatus} WHERE id = ${appointmentId} AND provider_id = ${providerId}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      throw new Error('같은 날짜·시간에 이미 확정된 예약이 있습니다');
    }
    throw e;
  }
  await sql`
    INSERT INTO clinic_audit (provider_id, actor_key_id, action, appointment_id, created_at)
    VALUES (${providerId}, ${actorKeyId}, ${'status_' + newStatus}, ${appointmentId}, ${nowKst()})
  `;
  const eventMap: Record<string, string> = {
    confirmed: 'booking_confirmed',
    cancelled: 'booking_cancelled',
    declined: 'booking_declined',
  };
  const event = eventMap[newStatus];
  if (event) {
    for (const channel of ['kakao', 'sms']) {
      await sql`
        INSERT INTO notifications (appointment_id, channel, event_type, created_at)
        VALUES (${appointmentId}, ${channel}, ${event}, ${nowKst()})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  return { ok: true, status: newStatus, notification_queued: Boolean(event), delivery: 'not_sent' };
}

export async function adminTransition(providerId: number, appointmentId: number, newStatus: string) {
  const allowed = ['requested', 'confirmed', 'declined', 'completed', 'cancelled'];
  if (!allowed.includes(newStatus)) throw new Error('예약 상태 오류');
  const sql = db();
  const rows = await sql<{ provider_id: number }>`SELECT provider_id FROM appointments WHERE id = ${appointmentId}`;
  if (!rows[0]) throw new Error('예약 없음');
  return clinicTransition(rows[0].provider_id, 0, appointmentId, newStatus);
}
