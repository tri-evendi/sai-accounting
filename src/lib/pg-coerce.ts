/**
 * PENYESUAIAN NILAI MariaDB -> PostgreSQL (migrasi data)
 *
 * == KENAPA INI ADA, DAN KENAPA IA MURNI ===================================
 * Pemindahan baris antar dua mesin hampir seluruhnya mekanis — kecuali di
 * beberapa titik yang **tidak melempar galat** saat salah. Titik-titik itu yang
 * dikumpulkan di sini, supaya bisa diuji tanpa dua basis data sekalipun.
 *
 * Yang paling berbahaya: **boolean**. MySQL tidak punya tipe boolean; ia
 * `TINYINT(1)`, dan drivernya memulangkan `0`/`1`. PostgreSQL punya `boolean`
 * sungguhan dan MENOLAK angka — jadi kalau ini tidak diubah, migrasinya gagal
 * keras, dan itu kasus yang BAIK.
 *
 * Yang buruk adalah kebalikannya: nilai `"0"` yang sampai sebagai string dan
 * menjadi `true`, sebab `"0"` di JavaScript bernilai benar. Setiap master data
 * yang dinonaktifkan akan hidup kembali, di 17 buku sekaligus, tanpa satu pun
 * galat di mana pun.
 */

/** Tipe kolom PostgreSQL yang perlu dibedakan saat memindahkan nilai. */
export type PgType = "boolean" | "numeric" | "bigint" | "bytea" | "json" | "lain";

export function pgTypeDari(udtName: string, dataType: string): PgType {
  const t = (udtName || dataType || "").toLowerCase();
  if (t === "bool" || t === "boolean") return "boolean";
  if (t === "numeric" || t === "decimal") return "numeric";
  if (t === "int8" || t === "bigint") return "bigint";
  if (t === "bytea") return "bytea";
  if (t === "json" || t === "jsonb") return "json";
  return "lain";
}

/**
 * Satu nilai, disesuaikan untuk kolom PostgreSQL bertipe `tipe`.
 *
 * `null` tetap `null` SELALU, dan diperiksa lebih dulu dari apa pun: `0` yang
 * menjadi `false` itu benar, tetapi `null` yang menjadi `false` adalah data yang
 * BERUBAH ARTI — kolom "belum diputuskan" menjadi "diputuskan tidak".
 */
export function sesuaikan(nilai: unknown, tipe: PgType): unknown {
  if (nilai === null || nilai === undefined) return null;

  switch (tipe) {
    case "boolean":
      if (typeof nilai === "boolean") return nilai;
      if (typeof nilai === "number") return nilai !== 0;
      if (typeof nilai === "bigint") return nilai !== BigInt(0);
      if (typeof nilai === "string") {
        const s = nilai.trim().toLowerCase();
        if (s === "0" || s === "false") return false;
        if (s === "1" || s === "true") return true;
        throw new Error(`nilai boolean tak dikenali: ${JSON.stringify(nilai)}`);
      }
      if (Buffer.isBuffer(nilai)) return nilai.length > 0 && nilai[0] !== 0;
      throw new Error(`nilai boolean bertipe tak terduga: ${typeof nilai}`);

    case "numeric":
      /* DIKIRIM SEBAGAI STRING, selalu. `Number` atas `Decimal(15,2)` kehilangan
         presisi di atas 2^53 — dan pada uang, kehilangan presisi yang tidak
         melempar galat adalah bentuk kerusakan yang paling mahal. */
      if (typeof nilai === "string") return nilai;
      if (typeof nilai === "bigint") return nilai.toString();
      if (typeof nilai === "number") {
        if (!Number.isFinite(nilai)) throw new Error(`numeric tak hingga: ${nilai}`);
        return String(nilai);
      }
      if (nilai instanceof Date) throw new Error("Date pada kolom numeric");
      return String(nilai);

    case "bigint":
      if (typeof nilai === "bigint") return nilai.toString();
      if (typeof nilai === "number") return String(nilai);
      return typeof nilai === "string" ? nilai : String(nilai);

    case "json":
      return typeof nilai === "string" ? nilai : JSON.stringify(nilai);

    case "bytea":
      return Buffer.isBuffer(nilai) ? nilai : Buffer.from(String(nilai));

    case "lain":
      return nilai;
  }
}

/**
 * Sequence PostgreSQL harus digeser SETELAH pemuatan.
 *
 * `SERIAL` memulai `nextval` dari 1. Baris yang dimuat membawa `id` aslinya,
 * jadi sequence-nya tidak ikut bergerak — dan `INSERT` BERIKUTNYA akan mencoba
 * `id = 1` lalu gagal dengan pelanggaran kunci unik.
 *
 * Gejalanya muncul pada permintaan pengguna PERTAMA sesudah penukaran, bukan
 * saat migrasi. Jadi ia tidak akan tertangkap oleh pemeriksaan jumlah baris, dan
 * ia satu-satunya langkah di migrasi ini yang kegagalannya datang terlambat.
 *
 * `is_called` diisi "apakah tabelnya berisi": tabel kosong harus memulai dari 1,
 * tabel berisi harus memulai dari max+1.
 */
export function sqlGeserSequence(tabel: string, kolom: string): string {
  return (
    `SELECT setval(pg_get_serial_sequence('"${tabel}"', '${kolom}'), ` +
    `COALESCE((SELECT MAX("${kolom}") FROM "${tabel}"), 1), ` +
    `(SELECT COUNT(*) > 0 FROM "${tabel}"))`
  );
}
