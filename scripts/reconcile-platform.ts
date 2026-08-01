/**
 * REKONSILIASI platform ↔ kendali (issue #137) — KERANGKA.
 *
 *   bun run reconcile:platform
 *
 * ══ KENAPA PEKERJAAN INI ADA ═══════════════════════════════════════════════
 * FK dan transaksi tidak menyeberangi basis data (docs/MULTI-TENANT.md §4A).
 * Konsistensi platform↔kendali karena itu ditegakkan URUTAN TULIS:
 *
 *     Tulis di `sai_platform` DULU, baru tandai di `sai_control`.
 *
 * Urutan itu memilih arah kegagalannya: crash di tengah meninggalkan catatan
 * platform tanpa jejak di kendali (yatim yang BISA ditemukan), tidak pernah
 * tenant yang naik kelas tanpa pembayaran (drift yang tanpa pemeriksaan ini
 * tidak akan pernah ketahuan). Skrip inilah pemeriksanya — ia MEMBACA kedua
 * sisi dan MELAPORKAN selisih; ia tidak memperbaiki apa pun sendiri, sebab
 * setiap perbaikan penagihan adalah keputusan uang yang harus diambil orang.
 *
 * ══ STATUS: LENGKAP sejak issue #140 ═══════════════════════════════════════
 * Empat pemeriksaan: langganan yatim, tenant berbayar tanpa langganan,
 * kecocokan status tenant ↔ langganan terbarunya (aturannya dari mesin
 * siklus hidup `src/lib/subscription-lifecycle.ts`), dan usage_counters vs
 * jumlah sesungguhnya. Penjadwal (`bun run scheduler:subscriptions`)
 * menjalankannya berkala lewat `runReconciliation` yang diekspor dari sini;
 * pemasangan pra-#134 tetap melewati pemeriksaan lintas-sisi dengan
 * pengumuman — bukan pura-pura hijau.
 *
 * Exit code: 0 = tidak ada selisih (atau pemeriksaan dilewati dengan alasan
 * yang tercetak), 1 = ADA selisih yang menuntut tindakan orang.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { tenantStatusForSubscription } from "../src/lib/subscription-lifecycle";

function clientFor<T>(
  Ctor: new (args: { adapter: PrismaMariaDb }) => T,
  rawUrl: string
): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}

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

    // 2. Arah yang TIDAK BOLEH terjadi: tenant yang statusnya berbayar di
    //    kendali tanpa satu pun langganan di platform. Urutan tulis yang
    //    ditaati tidak akan pernah menghasilkan ini — kemunculannya berarti
    //    ada kode yang menulis kendali lebih dulu, dan itu bug yang harus
    //    dicari, bukan sekadar baris yang harus dibetulkan.
    const PAID_TENANT_STATUSES = new Set(["trialing", "active", "past_due", "suspended"]);
    for (const tenant of tenants) {
      if (PAID_TENANT_STATUSES.has(tenant.status) && !subsByTenant.has(tenant.id)) {
        findings.push({
          check: "tenant-tanpa-langganan",
          detail:
            `tenant #${tenant.id} berstatus \`${tenant.status}\` di kendali tanpa ` +
            "langganan apa pun di platform — arah drift yang seharusnya mustahil",
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

async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();

  if (!platformUrl) {
    console.warn(
      "⚠ PLATFORM_DATABASE_URL belum diset — pemasangan ini berjalan tanpa " +
        "penagihan, tidak ada yang direkonsiliasi. Selesai."
    );
    process.exit(0);
  }
  if (!controlUrl) {
    console.error("✗ CONTROL_DATABASE_URL belum diset — tidak tahu sisi kendalinya.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);

  const report = await runReconciliation(platform, control);

  await platform.$disconnect();
  await control.$disconnect();

  console.log(
    `Rekonsiliasi platform ↔ kendali — ${report.subscriptionsChecked} langganan diperiksa.`
  );
  for (const item of report.skipped) console.log(`  ⏭  dilewati: ${item}`);
  if (report.findings.length === 0) {
    console.log("✓ Tidak ada selisih pada pemeriksaan yang berjalan.");
    process.exit(0);
  }
  console.error(`✗ ${report.findings.length} selisih ditemukan:`);
  for (const f of report.findings) console.error(`  [${f.check}] ${f.detail}`);
  process.exit(1);
}

/* Hanya berjalan bila dipanggil langsung (bun run reconcile:platform) — bukan
 * saat diimpor penjadwal. */
if (process.argv[1]?.endsWith("reconcile-platform.ts")) {
  main().catch((error) => {
    console.error("Rekonsiliasi gagal berjalan:", error);
    process.exit(1);
  });
}
