/**
 * JALUR `ledger` — satu-satunya jalur yang MENULIS buku besar (invarian I-2).
 *
 *   bun workers/ledger.ts
 *
 * ══ KENAPA JALUR INI ADA SAMA SEKALI ═══════════════════════════════════════
 * Enam jalur lain pindah ke Go (rancangan §3.3). Yang ini tidak, dan bukan
 * karena mahal: `app-customer` memposting SECARA SINKRON saat pengguna menekan
 * tombol — 44 pemanggil `postForSource` di Next.js — dan ia tidak pindah.
 * Pintu posting kedua di Go berarti dua mesin menulis buku besar, dan ketika
 * keduanya menyimpang, yang menyimpang adalah buku tanpa satu galat pun. I-3
 * menutup jalan keluarnya: layanan tidak saling memanggil, jadi Go tidak bisa
 * menitip posting ke Node.
 *
 * Satu-satunya alasan keberadaan jalur ini adalah menjaga pintu posting tetap
 * TUNGGAL. Kalau suatu hari `app-customer` berhenti memposting sinkron,
 * pertimbangkan ulang — jangan tambahkan pintu kedua di sini.
 *
 * ══ HANDLER MENDELEGASIKAN, TIDAK MENGULANG ════════════════════════════════
 * `runRecurringForCompany` adalah mesin yang sudah berjalan di produksi dan
 * sudah diuji. Jalur ini TIDAK menulis ulang aturannya; ia hanya memindahkan
 * PEMICU-nya dari `while true` di compose ke baris antrean. Kalau logikanya
 * mulai disalin ke sini, dua implementasi aturan akuntansi akan hidup
 * berdampingan — kelas kegagalan yang I-2 ada untuk mencegah.
 */
import { controlDb } from "@sai/core/control-db";

import { runLane, type JobContext } from "./runner";
import { runWithCompany } from "../src/lib/company-context";
import { runRecurringForCompany } from "../src/lib/recurring-run";

/**
 * Dokumen berulang satu perusahaan.
 *
 * `payload` memuat `companyId` dan `today` (ISO). Tanggal diterima dari
 * PENERBIT, bukan dibaca di sini: pekerjaan yang diterbitkan tengah malam lalu
 * dikerjakan setelah antrean padat tidak boleh memposting dengan tanggal hari
 * berikutnya — dan selisih satu hari pada dokumen berulang adalah selisih
 * PERIODE pembukuan.
 */
async function dokumenBerulang(ctx: JobContext): Promise<string | null> {
  const p = (ctx.job.payload ?? {}) as { companyId?: number; today?: string };
  const companyId = ctx.job.companyId ?? p.companyId;
  if (typeof companyId !== "number") {
    throw new Error("payload tanpa `companyId` — pekerjaan ini tidak bisa tahu buku mana");
  }

  const today = p.today ? new Date(p.today) : new Date();
  if (Number.isNaN(today.getTime())) throw new Error(`payload.today bukan tanggal: ${p.today}`);

  /* Registry perusahaan ada di basis data KENDALI; `slug` dan `databaseName`
     dibaca dari sana, tidak pernah dari payload. Payload datang dari penerbit
     dan bisa basi — perusahaan yang slug-nya berubah atau yang sudah dihapus
     tidak boleh menentukan ke basis data mana pekerjaan ini menulis. */
  const company = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, databaseName: true, isActive: true },
  });
  if (!company) {
    throw new Error(
      `perusahaan #${companyId} tidak ada di registry kendali — pekerjaan ini ` +
        "TIDAK dijalankan. Konteks perusahaan yang hilang harus melempar, dan " +
        "tidak pernah jatuh ke basis data bawaan (#104)."
    );
  }
  if (!company.isActive) {
    throw new Error(`perusahaan #${companyId} (${company.slug}) nonaktif — tidak diposting`);
  }

  /* `runWithCompany` WAJIB: konteks perusahaan yang hilang harus MELEMPAR, dan
     tidak pernah jatuh ke basis data bawaan — jatuh ke bawaan berarti transaksi
     PT A tertulis ke buku PT B tanpa galat dan tanpa jejak (#104). */
  const hasil = await runWithCompany(
    { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
    () => runRecurringForCompany(today)
  );

  const dibuat = hasil.filter((o) => o.status === "created").length;
  const ditahan = hasil.length - dibuat;
  console.log(
    `[ledger] perusahaan #${companyId}: ${dibuat} dibuat, ${ditahan} ditahan ` +
      `(${hasil.length} kejadian dinilai)`
  );

  /* Tidak ada `resultRef`: yang dihasilkan pekerjaan ini adalah BARIS DI BUKU,
     bukan berkas. Mengembalikan kunci objek di sini akan menyarankan ada
     artefak yang bisa diunduh, dan tidak ada. */
  return null;
}

/**
 * Dunning — pengingat yang MENCATAT di buku.
 *
 * Belum diimplementasikan: jalurnya ada lebih dulu dengan sengaja, supaya
 * pekerjaan dunning yang diterbitkan punya tempat jatuh dan tidak menumpuk
 * sebagai baris tanpa pengklaim. Handler yang melempar membuat kontrak dan
 * pelari TETAP sepakat; `kind` tanpa handler justru yang berbahaya.
 */
async function dunning(_ctx: JobContext): Promise<string | null> {
  throw new Error(
    "`ledger.dunning` belum diimplementasikan — jalurnya sudah ada supaya " +
      "pekerjaannya tidak menumpuk tanpa pengklaim. Lihat 04 §8.9."
  );
}

await runLane({
  lane: "ledger",
  handlers: {
    "ledger.recurring": dokumenBerulang,
    "ledger.dunning": dunning,
  },
});
