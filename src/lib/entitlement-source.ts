/**
 * SUMBER ENTITLEMENT (celah on-premise #3) — sambungan IO untuk `@sai/core/entitlement`.
 *
 * Pintunya murni dan ada di paket; yang di sini hanya pembacaan: berkas lisensi
 * di on-premise, snapshot paket di basis data KENDALI di SaaS.
 *
 * ══ BERKASNYA DIBACA ULANG, HASILNYA TIDAK DISIMPAN KE BASIS DATA ══════════
 * Rancangan §8 melarang memverifikasi berkas sekali lalu menyimpan hasilnya
 * sebagai baris: itu memindahkan kewenangan lisensi dari tanda tangan ke baris
 * yang bisa ditulis siapa pun yang punya akses `UPDATE`. Verifikasi Ed25519
 * berbiaya mikrodetik, jadi yang diperlukan hanyalah cache dalam-proses
 * ber-TTL — bukan tabel.
 *
 * ══ GAGAL-TERTUTUP, TAPI TIDAK PERNAH MEMATIKAN ════════════════════════════
 * Berkas yang hilang, rusak, atau tanda tangannya tidak cocok di profil
 * on-premise menghasilkan entitlement **paling sempit yang masih berguna**:
 * hanya modul inti, batas satu perusahaan dan beberapa pengguna. Dua hal yang
 * sama-sama penting di kalimat itu — ia tidak membuka seluruh modul kepada
 * berkas yang tidak sah, DAN ia tidak menutup pembukuan. Pemasangan tetap bisa
 * dibuka, dibaca, dicadangkan, dan diekspor; yang hilang hanya modul yang
 * memang tidak terbukti dibeli.
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { billingPlaneInstalled } from "@sai/core/deploy-profile";
import {
  licenceKeyInstalled,
  licenceNotices,
  verifyLicence,
  type LicenceNotice,
} from "@sai/core/licence";
import {
  creationQuota,
  entitlementFromLicence,
  entitlementFromPlan,
  type CreationQuota,
  type Entitlement,
} from "@sai/core/entitlement";
import { APP_VERSION } from "@sai/core/constants";
import type { SeatQuota } from "@sai/platform/invitation-store";
import { CORE_MODULE } from "@/lib/business-modules";
import { registerSharedCache } from "@sai/platform/cache-bus";

/** Jalur berkas lisensi; di compose ia di-mount HANYA-BACA. */
const JALUR_LISENSI = process.env.LICENCE_FILE?.trim() || "/etc/sai/licence.sai";

/**
 * TTL cache. Pendek dengan sengaja: lisensi yang baru dipasang customer harus
 * berlaku tanpa restart container — menuntut restart untuk memasang lisensi
 * berarti satu panggilan dukungan untuk setiap pembaruan lisensi.
 */
const TTL_MS = 60_000;

/**
 * Keadaan berkas lisensi, untuk DIPAJANG (halaman akun, `/api/health`,
 * bundel diagnostik). Tidak satu pun cabangnya menutup pembukuan.
 *
 *   • `not-installed` — profil SaaS; lisensi memang tidak dipakai.
 *   • `key-not-set`   — kunci publik produksi belum ditanam di kode, jadi
 *                       TIDAK ADA berkas yang bisa sah (langkah pemilik).
 *   • `missing` / `invalid` — berkasnya tidak terbaca / tidak lolos verifikasi.
 */
export type LicenceStanding =
  | { status: "not-installed" }
  | { status: "key-not-set" | "missing" | "invalid" }
  | {
      status: "ok";
      licenceId: string;
      customer: string;
      supportEndsAt: string | null;
      maxVersion: string | null;
      notices: LicenceNotice[];
    };

let cache: { nilai: Entitlement; standing: LicenceStanding; at: number } | null = null;

/** Tahap 2: batas paket dibaca dari basis data kendali — bisa berubah di replika lain. */
const shared = registerSharedCache("entitlement", () => {
  cache = null;
});

/** Entitlement tersempit yang masih bisa dipakai bekerja. */
function cadanganTersempit(): Entitlement {
  return {
    source: "licence",
    modules: [CORE_MODULE],
    maxCompanies: 1,
    maxUsers: 3,
    supportEndsAt: null,
    maxVersion: null,
  };
}

async function bacaLisensi(): Promise<{ nilai: Entitlement; standing: LicenceStanding }> {
  if (!licenceKeyInstalled()) {
    console.error(
      "[entitlement] kunci publik lisensi BELUM ditanam di image ini — tidak ada " +
        "berkas lisensi yang bisa sah. Memakai entitlement tersempit (modul inti " +
        "saja). Pembukuan tetap terbuka. Langkah pemilik: docs/ONPREM-SERAH-TERIMA.md."
    );
    return { nilai: cadanganTersempit(), standing: { status: "key-not-set" } };
  }

  let isi: string;
  try {
    const { readFile } = await import("node:fs/promises");
    isi = await readFile(JALUR_LISENSI, "utf8");
  } catch {
    console.error(
      `[entitlement] berkas lisensi tidak terbaca di ${JALUR_LISENSI} — ` +
        "memakai entitlement tersempit (modul inti saja). Pembukuan tetap terbuka."
    );
    return { nilai: cadanganTersempit(), standing: { status: "missing" } };
  }

  const vonis = verifyLicence(isi);
  if (!vonis.ok) {
    console.error(
      `[entitlement] lisensi TIDAK sah (${vonis.reason}) — memakai entitlement ` +
        "tersempit (modul inti saja). Pembukuan tetap terbuka."
    );
    return { nilai: cadanganTersempit(), standing: { status: "invalid" } };
  }

  /* `supportExpired` TIDAK mengubah entitlement. Ia dilaporkan di tempat lain
     (kesehatan, bundel diagnostik); dukungan yang berakhir bukan hak yang
     dicabut — rancangan §7. */
  const { licence } = vonis;
  return {
    nilai: entitlementFromLicence(licence),
    standing: {
      status: "ok",
      licenceId: licence.licenceId,
      customer: licence.customer,
      supportEndsAt: licence.supportEndsAt,
      maxVersion: licence.maxVersion,
      notices: licenceNotices(licence, APP_VERSION),
    },
  };
}

async function bacaPaket(): Promise<Entitlement> {
  /* Satu baris tenant. Di SaaS prosesnya melayani banyak tenant, tapi BATAS
     yang dibaca lapis ini milik PEMASANGAN, bukan tenant — dan di SaaS
     batasnya tidak membatasi modul sama sekali (`entitlementFromPlan` selalu
     menjawab `"all"`). Jadi angka mana pun di sini tidak pernah dipakai untuk
     memutuskan modul; yang memakainya adalah titik PEMBUATAN perusahaan dan
     pengguna, yang sudah punya konteks tenantnya sendiri. */
  try {
    const t = await controlDb.tenant.findFirst({
      orderBy: { id: "asc" },
      select: { maxCompanies: true, maxUsers: true },
    });
    return entitlementFromPlan(t ?? { maxCompanies: 1, maxUsers: 3 });
  } catch {
    return entitlementFromPlan({ maxCompanies: 1, maxUsers: 3 });
  }
}

/** Entitlement + keadaan lisensi, dibaca sekali per TTL. */
async function loadCached(): Promise<{ nilai: Entitlement; standing: LicenceStanding }> {
  if (cache && Date.now() - cache.at < TTL_MS && shared.usable()) return cache;
  const result = billingPlaneInstalled()
    ? { nilai: await bacaPaket(), standing: { status: "not-installed" } as const }
    : await bacaLisensi();
  cache = { ...result, at: Date.now() };
  return result;
}

/** Entitlement pemasangan ini, ber-cache. */
export async function currentEntitlement(): Promise<Entitlement> {
  return (await loadCached()).nilai;
}

/** Keadaan lisensi pemasangan ini — untuk dipajang, tidak untuk memutuskan. */
export async function currentLicenceStanding(): Promise<LicenceStanding> {
  return (await loadCached()).standing;
}

/**
 * Batas di titik PEMBUATAN perusahaan/pengguna — SATU-SATUNYA tempat route
 * membaca angka batas (`tests/licence-limits.test.ts`).
 *
 * SaaS tidak membaca berkas maupun cache di sini: jawabannya snapshot paket
 * tenant itu sendiri, sama persis dengan sebelum pintu ini ada. On-premise
 * memakai angka lisensi atas seluruh pemasangan (`creationQuota`).
 */
export async function creationQuotaFor(tenant: {
  maxCompanies: number;
  maxUsers: number;
}): Promise<CreationQuota> {
  if (billingPlaneInstalled()) return creationQuota(entitlementFromPlan(tenant), tenant);
  return creationQuota(await currentEntitlement(), tenant);
}

/**
 * Batas kursi untuk diteruskan ke `@sai/platform/invitation-store` (paket itu
 * tidak boleh mengimpor `@/…`). `undefined` di SaaS — paketnya lalu memakai
 * `tenants.max_users` tenant itu sendiri, perilaku sebelum pintu ini ada.
 */
export async function seatQuotaOverride(): Promise<SeatQuota | undefined> {
  if (billingPlaneInstalled()) return undefined;
  const quota = creationQuota(await currentEntitlement(), { maxCompanies: 0, maxUsers: 0 });
  return { maxUsers: quota.maxUsers, scope: quota.scope };
}

/** Dipakai tes dan server action yang memasang lisensi baru. */
export function resetEntitlementCache(): void {
  cache = null;
  shared.publish();
}
