/**
 * REKONSILIASI platform ↔ kendali (issue #137) — INTINYA.
 *
 * Dipisahkan dari `scripts/reconcile-platform.ts` saat penggelaran #151.
 * Sebabnya konkret: konsol operator (#154) memakai ulang fungsi ini, dan
 * mengimpor sebuah SKRIP CLI dari dalam `src/` menyeret impor gaya-skrip
 * (`../src/generated/<x>/client.js`) ke dalam bundel aplikasi. `tsc`
 * menyelesaikan jalur itu, Turbopack TIDAK — jadi `next build` mati dengan
 * "module not found" pada modul yang sebenarnya ada. Tes lulus, typecheck
 * bersih, dan build produksinya tetap gagal.
 *
 * Aturan yang lahir dari situ: KODE APLIKASI TIDAK PERNAH MENGIMPOR DARI
 * `scripts/`. Yang dipakai bersama tinggal di `src/lib/`, dan skripnya menjadi
 * pembungkus tipis — pola yang sama dengan skrip operator (#155).
 *
 * NB: namanya `platform-reconciliation`, bukan `reconciliation` — yang kedua
 * sudah dipakai REKONSILIASI BANK, urusan yang sama sekali berbeda.
 *
 * Membaca kedua sisi, tidak menulis apa pun.
 */

import type { PrismaClient as PlatformClient } from "@/generated/platform/client";
import type { PrismaClient as ControlClient } from "@/generated/control/client";
import { tenantStatusForSubscription } from "@/lib/subscription-lifecycle";

export type Finding = { check: string; detail: string };

export interface ReconciliationReport {
  findings: Finding[];
  skipped: string[];
  subscriptionsChecked: number;
}

/**
 * Inti rekonsiliasi — DIEKSPOR sejak issue #140 supaya penjadwal
 * (`scripts/subscription-scheduler.ts`) menjalankannya berkala tanpa
 * menduplikasi satu pemeriksaan pun. Membaca kedua sisi, tidak menulis apa pun.
 */
export async function runReconciliation(
  platform: InstanceType<typeof PlatformClient>,
  control: InstanceType<typeof ControlClient>
): Promise<ReconciliationReport> {
  const findings: Finding[] = [];
  const skipped: string[] = [];

  // ── Sisi kendali: tabel `tenants` datang dari issue #134. Pada pemasangan
  //    yang belum menerapkannya, pemeriksaan lintas-sisi dilewati DENGAN
  //    PENGUMUMAN — lewat raw SQL, supaya klien lama pun tidak meledak.
  let tenants: Array<{ id: number; status: string }> | null = null;
  try {
    tenants = await control.$queryRaw<Array<{ id: number; status: string }>>`
      SELECT id, status FROM tenants`;
  } catch {
    skipped.push(
      "tabel `tenants` belum ada di basis data kendali (issue #134 belum " +
        "diterapkan) — pemeriksaan lintas-sisi dilewati"
    );
  }

  const subscriptions = await platform.subscription.findMany({
    select: { id: true, tenantId: true, status: true },
    orderBy: { id: "asc" },
  });

  if (tenants !== null) {
    const tenantById = new Map(tenants.map((t) => [t.id, t]));
    const subsByTenant = new Map<number, (typeof subscriptions)[number][]>();
    for (const sub of subscriptions) {
      const list = subsByTenant.get(sub.tenantId) ?? [];
      list.push(sub);
      subsByTenant.set(sub.tenantId, list);
    }

    // 1. Langganan yatim: catatan platform yang tenantnya tidak ada di
    //    kendali. Inilah sisa yang DIRANCANG mungkin terjadi (tulis platform
    //    dulu, crash sebelum kendali) — temuan di sini normal dan bisa
    //    ditindaklanjuti: ulangi sisi kendalinya, atau batalkan langganannya.
    for (const sub of subscriptions) {
      if (!tenantById.has(sub.tenantId)) {
        findings.push({
          check: "langganan-yatim",
          detail: `subscription #${sub.id} menunjuk tenant #${sub.tenantId} yang tidak ada di kendali`,
        });
      }
    }

    // 2. Tenant berstatus berbayar di kendali tanpa satu pun langganan di
    //    platform. Sejak issue #152 keadaan ini SENGAJA bisa terjadi sebentar:
    //    kelahiran tenant wajib atomik di kendali (§4A), langganannya menyusul
    //    tepat sesudahnya — dan bila `sai_platform` sedang mati/belum di-seed,
    //    tenant tetap lahir. Penyembuhnya otomatis: putaran adopsi yatim
    //    penjadwal (`bun run scheduler:subscriptions`, berjalan SEBELUM
    //    rekonsiliasi pada putaran yang sama). Temuan yang BERTAHAN di sini
    //    berarti adopsinya sendiri gagal — paket `plans` hilang/nonaktif
    //    (jalankan `bun run db:seed:plans`), atau status `suspended` yang
    //    memang tidak diadopsi mesin: melahirkan langganan langsung mati
    //    adalah keputusan uang yang harus diambil orang (change-plan).
    const PAID_TENANT_STATUSES = new Set(["trialing", "active", "past_due", "suspended"]);
    for (const tenant of tenants) {
      if (PAID_TENANT_STATUSES.has(tenant.status) && !subsByTenant.has(tenant.id)) {
        findings.push({
          check: "tenant-tanpa-langganan",
          detail:
            `tenant #${tenant.id} berstatus \`${tenant.status}\` di kendali tanpa ` +
            "langganan apa pun di platform — putaran adopsi yatim (#152) seharusnya " +
            "menyembuhkan ini; bila bertahan, periksa paket di `plans` " +
            "(bun run db:seed:plans) atau putuskan lewat bun run change-plan",
        });
      }
    }

    // 3. Kecocokan STATUS tenant ↔ langganan TERBARUNYA (mesin siklus hidup
    //    #140 kini ada, aturannya tidak lagi ditebak): `tenants.status` adalah
    //    SALINAN dari status langganan (`tenantStatusForSubscription` —
    //    identitas), ditulis kendali-belakangan. Selisih = penjadwal/pemroses
    //    pembayaran menulis platform lalu gagal menandai kendali; obatnya
    //    menjalankan ulang penyalinannya, bukan mengarang status baru.
    //    `pending_verification` dikecualikan: keadaan PRA-langganan yang sah.
    for (const tenant of tenants) {
      if (tenant.status === "pending_verification") continue;
      const subs = subsByTenant.get(tenant.id);
      if (!subs || subs.length === 0) continue; // sudah tertangkap pemeriksaan 2
      const latest = subs[subs.length - 1];
      if (tenantStatusForSubscription(latest.status as never) !== tenant.status) {
        findings.push({
          check: "status-tak-serasi",
          detail:
            `tenant #${tenant.id} berstatus \`${tenant.status}\` di kendali, tetapi ` +
            `langganan terbarunya (#${latest.id}) berstatus \`${latest.status}\` di platform ` +
            "— salinan kendali tertinggal; jalankan ulang penyalinannya",
        });
      }
    }

    // 4. `usage_counters` vs jumlah SESUNGGUHNYA di kendali. Penghitungnya
    //    data turunan (disinkronkan penjadwal #140); selisih berarti
    //    sinkronisasinya tertinggal — bukan bencana, tapi kuota yang dilaporkan
    //    ke pelanggan sedang bohong, dan itu layak berbunyi.
    try {
      const counters = await platform.usageCounter.findMany({
        select: { tenantId: true, key: true, value: true },
      });
      const actualCompanies = await control.$queryRaw<
        Array<{ tenant_id: number; n: bigint }>
      >`SELECT tenant_id, COUNT(*) AS n FROM companies
        WHERE tenant_id IS NOT NULL AND is_active = 1 GROUP BY tenant_id`;
      const actualUsers = await control.$queryRaw<
        Array<{ tenant_id: number; n: bigint }>
      >`SELECT tenant_id, COUNT(*) AS n FROM users
        WHERE tenant_id IS NOT NULL GROUP BY tenant_id`;
      const actualByKey = new Map<string, number>();
      for (const row of actualCompanies) actualByKey.set(`${row.tenant_id}:companies`, Number(row.n));
      for (const row of actualUsers) actualByKey.set(`${row.tenant_id}:users`, Number(row.n));

      for (const counter of counters) {
        const actual = actualByKey.get(`${counter.tenantId}:${counter.key}`) ?? 0;
        if (actual !== counter.value) {
          findings.push({
            check: "usage-counter-basi",
            detail:
              `usage_counters tenant #${counter.tenantId} \`${counter.key}\` = ${counter.value}, ` +
              `kendali menghitung ${actual} — sinkronisasi penjadwal tertinggal`,
          });
        }
      }
    } catch {
      skipped.push("usage_counters — kolom tenant_id kendali belum ada (adopsi #134 belum tuntas)");
    }
  }

  return { findings, skipped, subscriptionsChecked: subscriptions.length };
}
