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
import { verifyLicence } from "@sai/core/licence";
import {
  entitlementFromLicence,
  entitlementFromPlan,
  type Entitlement,
} from "@sai/core/entitlement";
import { CORE_MODULE } from "@/lib/business-modules";

/** Jalur berkas lisensi; di compose ia di-mount HANYA-BACA. */
const JALUR_LISENSI = process.env.LICENCE_FILE?.trim() || "/etc/sai/licence.sai";

/**
 * TTL cache. Pendek dengan sengaja: lisensi yang baru dipasang customer harus
 * berlaku tanpa restart container — menuntut restart untuk memasang lisensi
 * berarti satu panggilan dukungan untuk setiap pembaruan lisensi.
 */
const TTL_MS = 60_000;

let cache: { nilai: Entitlement; at: number } | null = null;

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

async function bacaLisensi(): Promise<Entitlement> {
  let isi: string;
  try {
    const { readFile } = await import("node:fs/promises");
    isi = await readFile(JALUR_LISENSI, "utf8");
  } catch {
    console.error(
      `[entitlement] berkas lisensi tidak terbaca di ${JALUR_LISENSI} — ` +
        "memakai entitlement tersempit (modul inti saja). Pembukuan tetap terbuka."
    );
    return cadanganTersempit();
  }

  const vonis = verifyLicence(isi);
  if (!vonis.ok) {
    console.error(
      `[entitlement] lisensi TIDAK sah (${vonis.reason}) — memakai entitlement ` +
        "tersempit (modul inti saja). Pembukuan tetap terbuka."
    );
    return cadanganTersempit();
  }

  /* `supportExpired` TIDAK mengubah entitlement. Ia dilaporkan di tempat lain
     (kesehatan, bundel diagnostik); dukungan yang berakhir bukan hak yang
     dicabut — rancangan §7. */
  return entitlementFromLicence(vonis.licence);
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

/** Entitlement pemasangan ini, ber-cache. */
export async function currentEntitlement(): Promise<Entitlement> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.nilai;
  const nilai = billingPlaneInstalled() ? await bacaPaket() : await bacaLisensi();
  cache = { nilai, at: Date.now() };
  return nilai;
}

/** Dipakai tes dan server action yang memasang lisensi baru. */
export function resetEntitlementCache(): void {
  cache = null;
}
