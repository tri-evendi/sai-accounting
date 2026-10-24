/**
 * Nomor telepon → nomor WhatsApp yang bisa dipakai `wa.me` (issue #465).
 *
 * ══ KENAPA INI MODUL TERSENDIRI, DAN MURNI ══════════════════════════════════
 * Satu nomor Indonesia ditulis dengan lima gaya berbeda oleh lima orang
 * berbeda, dan `customers.phone` adalah teks bebas yang menerima kelimanya:
 *
 *     0812-3456-7890 · +62 812 3456 7890 · 62 812 3456 7890
 *     (021) 555 1234 · 81234567890
 *
 * `wa.me` hanya menerima SATU dari kelimanya: digit saja, berkode negara, tanpa
 * `+` dan tanpa pemisah. Menyusun tautannya di dalam komponen berarti aturan
 * ini hidup di tempat yang tidak bisa diuji tanpa merender apa pun — padahal
 * yang mudah salah di sini bukan tombolnya, melainkan penerjemahan angkanya.
 *
 * ══ SATU KEPUTUSAN YANG PERLU DIJELASKAN: `0` DI DEPAN ══════════════════════
 * `0` pembuka adalah PREFIKS SAMBUNGAN DOMESTIK, bukan bagian dari nomornya.
 * Menerjemahkannya menjadi `620…` — yang dilakukan siapa pun yang sekadar
 * membuang karakter non-digit lalu menempelkan `62` — menghasilkan nomor yang
 * SAH bentuknya, diterima `wa.me` tanpa keluhan, dan menuju entah ke mana.
 * Kesalahan itu tidak pernah terlihat sebagai galat; ia terlihat sebagai
 * pelanggan yang tidak membalas.
 *
 * ══ NOMOR ASING TIDAK DIPAKSA MENJADI INDONESIA ═════════════════════════════
 * Buku ini memang punya pelanggan luar negeri (faktur ekspor adalah fitur —
 * lihat `efaktur.ts`). Nomor yang ditulis dengan `+` diperlakukan sebagai sudah
 * berkode negara dan dibiarkan apa adanya. Yang TANPA `+` dan tanpa `0`/`62`
 * ditolak, bukan ditebak: menempelkan `62` di depan nomor Malaysia menghasilkan
 * nomor Indonesia milik orang lain.
 */

/** Batas E.164 — 15 digit termasuk kode negara. Di bawah 8 bukan nomor utuh. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Nomor `wa.me` (digit saja, berkode negara) dari teks bebas, atau `null` bila
 * nomornya tidak bisa dipahami dengan yakin.
 *
 * `null` berarti PERMUKAANNYA HARUS DIAM — tombol WhatsApp tidak ditampilkan.
 * Menebak lebih buruk daripada tidak menawarkan: yang ditebak salah tetap
 * membuka WhatsApp, tetap terlihat berhasil, dan pesannya sampai ke nomor
 * orang lain.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  /* `+` hanya bermakna di posisi PERTAMA. Yang muncul di tengah adalah tanda
     bahwa selnya berisi dua nomor ("0812… / +62813…") — dan memilih salah
     satunya adalah tebakan, jadi seluruhnya ditolak. */
  const plus = trimmed.startsWith("+");
  const rest = plus ? trimmed.slice(1) : trimmed;
  if (rest.includes("+")) return null;

  /* Pemisah yang lazim dibuang; huruf TIDAK. "0812 ext 4" atau "0812 (rumah)"
     bukan nomor yang boleh dikirimi pesan tanpa ada yang membacanya dulu. */
  if (/[^0-9\s().-]/.test(rest)) return null;

  const digits = rest.replace(/[^0-9]/g, "");
  if (!digits) return null;

  const withCountry = plus
    ? digits // sudah berkode negara — apa pun negaranya
    : digits.startsWith("62")
      ? digits
      : digits.startsWith("0")
        ? `62${digits.slice(1)}`
        : /* Tanpa `+`, tanpa `62`, tanpa `0`: hanya bentuk yang khas Indonesia
             (`8…`, mis. "81234567890") yang boleh diselesaikan. Selain itu kode
             negaranya tidak diketahui, dan menebaknya berarti mengirim ke
             nomor orang lain di negara yang salah. */
          digits.startsWith("8")
          ? `62${digits}`
          : null;

  if (!withCountry) return null;
  if (withCountry.length < MIN_DIGITS || withCountry.length > MAX_DIGITS) return null;
  /* `620…` = `0` yang terbawa masuk (mis. "+62 0812…"): kode negara benar,
     nomornya tetap tidak bisa dihubungi. */
  if (withCountry.startsWith("620")) return null;

  return withCountry;
}

/**
 * Tautan `wa.me` berisi teks siap kirim.
 *
 * TIDAK mengirim apa pun — ia membuka percakapan dengan pesan yang sudah
 * diketikkan, dan manusialah yang menekan kirim. Itu sebabnya riwayatnya
 * dicatat sebagai "disiapkan", bukan "terkirim" (lihat model `InvoiceSend`).
 */
export function whatsAppShareUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
