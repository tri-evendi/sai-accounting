/**
 * BADAN PERMINTAAN BERBATAS (03 §4, Batas muatan masuk).
 *
 * ⚠ Satu baris yang menjelaskan kenapa modul ini ada: `await request.json()`
 * SUDAH mematerialkan seluruh badan dan mengurainya sebelum validator mana pun
 * berjalan. Skema zod yang paling ketat pun tidak melindungi apa pun dari badan
 * 500 MB — prosesnya sudah mati sebelum baris pertama skema itu dibaca. Jadi
 * batasnya harus bekerja pada ALIRANNYA, bukan pada hasil urainya.
 *
 * Dipakai di jalur ekspor (muatan laporan dari peramban). Modul app, bukan
 * paket: ia menyentuh `Request`, dan pekerja antrean tidak melayani HTTP.
 */

export type BoundedBody =
  | { ok: true; text: string }
  | { ok: false; bytes: number; declared: boolean };

/**
 * Baca badan permintaan sebagai teks, berhenti begitu melewati `maxBytes`.
 *
 * Dua lapis, dan yang pertama saja TIDAK cukup:
 *
 * 1. `content-length` yang jelas kebesaran ditolak tanpa membaca apa pun —
 *    penyaring murah, mengikuti pola yang sudah ada di rute logo perusahaan.
 * 2. Byte yang sungguh datang DIHITUNG. Header itu tidak ada pada permintaan
 *    ber-*chunked encoding*, dan pada yang lain ia hanya pernyataan pengirim:
 *    sebuah angka yang bisa ditulis apa saja. Lapis pertama menyaring yang
 *    jujur-tapi-kebesaran; lapis kedua yang bohong.
 *
 * `reader.cancel()` bukan kebersihan: tanpanya kita sudah menjawab 413
 * sementara sisa unggahannya tetap mengalir masuk, dan batas yang membiarkan
 * byte-nya tetap datang tidak membatasi apa pun selain memori kita sendiri.
 */
export async function readBoundedText(request: Request, maxBytes: number): Promise<BoundedBody> {
  const header = request.headers.get("content-length");
  if (header !== null) {
    const dinyatakan = Number(header);
    if (Number.isFinite(dinyatakan) && dinyatakan > maxBytes) {
      return { ok: false, bytes: dinyatakan, declared: true };
    }
  }

  const body = request.body;
  if (body === null) return { ok: true, text: "" };

  const reader = body.getReader();
  const potongan: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, bytes: total, declared: false };
    }
    potongan.push(value);
  }

  const gabungan = new Uint8Array(total);
  let posisi = 0;
  for (const p of potongan) {
    gabungan.set(p, posisi);
    posisi += p.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(gabungan) };
}
