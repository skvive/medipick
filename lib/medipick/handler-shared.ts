import { db } from '@/lib/db';

export async function isSubscribed(providerId: number): Promise<boolean> {
  const sql = db();
  const rows = await sql<{ expires_at: string; status: string; paid: number; compliance_approved: number }>`
    SELECT expires_at, status, paid, compliance_approved FROM subscriptions WHERE provider_id = ${providerId}
  `;
  const r = rows[0];
  if (!r || r.status !== 'active' || !r.paid || !r.compliance_approved) return false;
  try {
    return new Date(r.expires_at).getTime() > Date.now();
  } catch {
    return false;
  }
}

export async function adminSetAppointmentStatus(appointmentId: number, status: string) {
  const allowed = ['requested', 'confirmed', 'declined', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw new Error('예약 상태 오류');
  const sql = db();
  const rows = await sql<{ id: number }>`SELECT id FROM appointments WHERE id = ${appointmentId}`;
  if (!rows[0]) throw new Error('예약 없음');
  if (['confirmed', 'declined', 'cancelled', 'completed'].includes(status)) {
    const { clinicTransition } = await import('@/lib/medipick/clinic');
    const prov = await sql<{ provider_id: number }>`SELECT provider_id FROM appointments WHERE id = ${appointmentId}`;
    return clinicTransition(prov[0].provider_id, 0, appointmentId, status);
  }
  await sql`UPDATE appointments SET status = ${status} WHERE id = ${appointmentId}`;
  return { ok: true, status };
}
