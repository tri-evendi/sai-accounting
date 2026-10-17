/**
 * Entri JSONL lama jejak operator → baris `operator_audit_logs`.
 *
 * MURNI dan terpisah dari `scripts/migrate-operator-audit.ts` supaya aturannya
 * diuji langsung: pemindahan jejak audit tidak punya langkah balik yang enak,
 * dan aturan yang hanya hidup di dalam skrip hanya teruji saat dijalankan di
 * produksi.
 */

export interface LegacyOperatorEntry {
  id?: string;
  operator?: string;
  action?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt?: string;
}

export interface OperatorAuditRow {
  legacyId: string;
  operator: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `null` = entri tidak bisa dipercaya dan DILEWATI (lalu dilaporkan):
 *   - tanpa `id`: satu-satunya pegangan idempotensi; tanpa itu jalan kedua
 *     akan menggandakannya;
 *   - tanpa `action`;
 *   - `createdAt` yang tak terurai: memalsukan waktunya menjadi "sekarang"
 *     akan menaruh peristiwa lama di puncak jejak — lebih buruk daripada
 *     melewatinya dengan berisik.
 */
export function operatorAuditRowFromLegacy(raw: LegacyOperatorEntry): OperatorAuditRow | null {
  if (!raw.id || !raw.action) return null;
  const created = raw.createdAt ? new Date(raw.createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return null;
  return {
    legacyId: raw.id.slice(0, 40),
    operator: String(raw.operator ?? "").slice(0, 100),
    action: String(raw.action).slice(0, 50),
    details: raw.details === undefined ? null : JSON.stringify(raw.details),
    ipAddress: raw.ipAddress ? String(raw.ipAddress).slice(0, 45) : null,
    createdAt: created,
    updatedAt: created,
  };
}
