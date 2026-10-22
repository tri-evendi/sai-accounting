/**
 * HANDLER `company.provision` — buku PT baru, dikerjakan di `svc-worker`.
 *
 * Didaftarkan di pelari jalur `interactive` (`workers/interactive.ts`). Alasan
 * pemindahannya dari permintaan HTTP ada di kepala
 * `src/lib/company-provisioning.ts`; sisi penerbit & pembaca status di
 * `src/lib/company-provisioning-queue.ts`.
 *
 * ══ YANG DIKERJAKAN DI SINI, DAN YANG TIDAK ═══════════════════════════════
 * Urutan penyediaan (buat → skema → hibah → registry) dan kemampuan
 * melanjutkan buku setengah jadi milik `provisionCompany` — handler ini tidak
 * menambah satu langkah pun ke sana. Yang ia lakukan hanya:
 *
 *  • menerjemahkan peristiwa tahap menjadi angka `jobs.progress`
 *    (`progressForEvent`) — satu-satunya kanal yang dibaca layar penunggu;
 *  • menanam KODE kegagalan di `last_error` (`encodeProvisionFailure`) supaya
 *    rute status bisa mengalimatkannya tanpa membaca teks driver;
 *  • menulis dua jejak audit yang dulu ditulis rute HTTP.
 *
 * ══ `tenantId` DARI KOLOM, PERAN DARI KONSTANTA ════════════════════════════
 * Muatan ditulis `app-customer` — layanan yang menghadap internet. Tenant
 * pemilik dibaca dari `jobs.tenant_id` (diisi penjaga tenant saat
 * menerbitkan), dan peran pembuat di PT baru adalah `ROLES.ADMINISTRATOR` di
 * sini, bukan nilai yang dititipkan penerbit. Bentuk muatan diurai ketat
 * (`parseProvisionPayload`), dan nama basis data tetap melewati
 * `assertSafeDatabaseName` di dalam `provisionCompany`.
 */
import { ROLES } from "@sai/core/constants";
import { writeTenantAuditLog } from "@sai/platform/tenant-audit";

import { LeaseLostError, type JobContext } from "./runner";
import { provisionCompany } from "../src/lib/company-provisioning";
import {
  encodeProvisionFailure,
  progressForEvent,
  ProvisionError,
} from "../src/lib/company-provisioning-shared";
import { parseProvisionPayload } from "../src/lib/company-provisioning-queue";
import { writeAuditLog } from "../src/lib/audit";
import { runWithCompany } from "../src/lib/company-context";

export async function provisionCompanyJob(ctx: JobContext): Promise<string | null> {
  const tenantId = ctx.job.tenantId;
  if (typeof tenantId !== "number" || tenantId <= 0) {
    throw new Error(
      "company.provision tanpa `tenant_id` — tenant pemilik PT baru tidak pernah ditebak (#135)"
    );
  }
  const p = parseProvisionPayload(ctx.job.payload);

  let terakhir = -1;
  let hasil: Awaited<ReturnType<typeof provisionCompany>>;
  try {
    hasil = await provisionCompany(
      {
        slug: p.slug,
        name: p.name,
        databaseName: p.databaseName,
        createdByUserId: p.createdByUserId,
        /*
         * Pembuatnya menjadi ADMINISTRATOR SISTEM di PT yang baru lahir — bukan
         * "perannya di PT yang sedang dibuka" (pembuat PT pertama tidak punya
         * peran per-PT sama sekali, issue #135), dan BUKAN `managing_director`:
         * "Direktur Utama" adalah NAMA JABATAN yang ikut terbaca di daftar
         * pengguna, jejak audit, dan pilihan penyetuju, sedangkan yang
         * mendaftar biasanya staf akunting/IT/konsultan. `administrator`
         * dirancang kembar dengan `managing_director` (FULL_ACCESS_ROLES,
         * migration 0032), jadi tak ada kuasa yang hilang; pemilik yang memang
         * Direktur Utama mengubah perannya sendiri di /users.
         */
        role: ROLES.ADMINISTRATOR,
        tenantId,
      },
      async (event) => {
        console.log(`[company.provision] #${ctx.job.id} ${event.phase}: ${event.message}`);
        const n = progressForEvent(event);
        /* Hanya bila angkanya BERUBAH — satu UPDATE per tahap, bukan per baris log. */
        if (n !== terakhir) {
          terakhir = n;
          await ctx.progress(n);
        }
      }
    );
  } catch (error) {
    if (error instanceof LeaseLostError) throw error;
    if (error instanceof ProvisionError) {
      /* Galat aslinya (dengan `cause` dari driver) ke LOG; yang tertulis di
         baris `jobs` adalah kode yang bisa diurai + kalimat untuk operator. */
      console.error(`[company.provision] #${ctx.job.id} gagal:`, error);
      const e = new Error(encodeProvisionFailure(error), { cause: error });
      e.name = "ProvisionError";
      throw e;
    }
    throw error;
  }

  const { companyId, databaseName, dbInstance } = hasil;
  const details = { slug: p.slug, name: p.name, databaseName };

  /*
   * Dicatat DUA KALI dengan sengaja (issue #142): "siapa yang membuat PT ini"
   * dicari di jejak PT ITU SENDIRI; "PT apa saja yang lahir di tenant ini"
   * milik jejak TENANT. Alamat klien diturunkan rute penerbitnya — pekerja
   * tidak punya permintaan HTTP.
   */
  await writeTenantAuditLog({
    tenantId,
    tenantSlug: p.actor.tenantSlug,
    userId: p.actor.userId,
    username: p.actor.username,
    tenantRole: p.actor.tenantRole,
    action: "tenant.company.create",
    details,
    ipAddress: p.actor.ipAddress,
  });
  await runWithCompany({ companyId, slug: p.slug, databaseName, dbInstance }, async () => {
    await writeAuditLog({
      userId: p.actor.userId,
      username: p.actor.username,
      role: p.actor.tenantRole,
      action: "company.create",
      entity: "company",
      entityId: companyId,
      details,
      ipAddress: p.actor.ipAddress,
    });
  });

  return null;
}
