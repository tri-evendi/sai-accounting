/**
 * JALUR `ledger` — satu-satunya jalur yang MENULIS buku besar (invarian I-2).
 *
 *   bun workers/ledger.ts
 *
 * ══ KENAPA JALUR INI ADA SAMA SEKALI ═══════════════════════════════════════
 * Jalur lain pindah ke Go satu per satu (01 §10, batas Go) — `tenant` lebih
 * dulu di tahap 1b. Yang ini tidak akan pernah pindah, dan bukan karena
 * mahal: `app-customer` memposting SECARA SINKRON saat pengguna menekan
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
import { runLane, type JobContext } from "./runner";
import { dalamKonteksPerusahaan } from "./jalur-perusahaan";
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

  /* `dalamKonteksPerusahaan` membaca registry dari basis data KENDALI dan
     MELEMPAR bila perusahaannya tidak ada — konteks yang hilang tidak pernah
     jatuh ke basis data bawaan (#104). `true` = perusahaan nonaktif menolak:
     jalur ini MENULIS buku, dan memposting ke buku yang tidak bisa dibuka
     adalah angka yang tidak akan dilihat siapa pun sampai ia dibuka lagi. */
  const hasil = await dalamKonteksPerusahaan(companyId, true, () =>
    runRecurringForCompany(today)
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
