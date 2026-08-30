/**
 * Resep produksi: penurunan bertingkat & biaya standar (issue #495 butir 3).
 *
 * Modul MURNI — tanpa Prisma, tanpa I/O. Sikap yang sama dengan
 * `@/lib/document-chain` dan `@/lib/manufacturing`: aritmetika yang menentukan
 * harga pokok harus bisa diuji tanpa MySQL, sebab itulah bagian yang salahnya
 * paling mahal dan paling sulit terlihat.
 *
 * ══ TIDAK ADA MESIN PERSEDIAAN KEDUA ═══════════════════════════════════════
 * Berkas ini tidak pernah menghitung saldo, tidak pernah menyentuh gerakan
 * stok, dan tidak pernah menilai persediaan. Ia menjawab dua pertanyaan saja:
 *
 *   1. "untuk membuat N keluaran, berapa banyak tiap bahan DAUN yang dibutuhkan"
 *   2. "berapa biaya STANDAR-nya" (bahan + tenaga kerja + overhead diserap)
 *
 * Yang benar-benar keluar dari gudang tetap ditentukan perintah produksi, dan
 * dinilai rata-rata tertimbang yang sudah ada.
 *
 * ══ KENAPA "DAUN", DAN KENAPA LEVELNYA TIDAK DISIMPAN ══════════════════════
 * Sebuah bahan boleh merupakan keluaran resep lain. Yang benar-benar diambil
 * dari gudang adalah DAUN pohonnya — bahan yang tidak punya resep aktif. Level
 * sebuah bahan adalah sifat pohon saat dihitung, bukan fakta yang disimpan:
 * menyimpannya berarti ia bisa basi terhadap resep yang melahirkannya.
 */

/** Kuantitas dibulatkan ke 3 desimal — grain `Decimal(15,3)` di basis data. */
export const round3 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Uang dibulatkan ke 2 desimal — grain `Decimal(15,2)`. */
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface BomComponentInput {
  itemId: number;
  itemName: string;
  /** Kebutuhan BERSIH sekali jalan resep, sebelum susut. */
  quantity: number;
  /** Susut yang diharapkan, persen. 0 = tanpa susut. */
  scrapPercent?: number;
}

export interface BomOperationInput {
  sequence: number;
  name: string;
  workCenterId: number;
  /** Jam standar sekali jalan resep. */
  standardHours: number;
  laborRate: number;
  overheadRate: number;
}

export interface BomInput {
  id: number;
  code: string;
  outputItemId: number;
  /** Berapa banyak dihasilkan sekali jalan. Harus > 0. */
  outputQuantity: number;
  components: BomComponentInput[];
  operations?: BomOperationInput[];
}

/**
 * Kebutuhan KOTOR sebuah bahan: bersih dinaikkan supaya yang TERSISA sesudah
 * susut tepat sebanyak kebutuhan bersihnya.
 *
 * `bersih / (1 - susut)`, BUKAN `bersih × (1 + susut)`. Keduanya terlihat mirip
 * dan berbeda arti: yang kedua menaikkan sebanyak persen dari kebutuhan,
 * padahal susut dihitung dari yang DIKELUARKAN. Pada susut 50% selisihnya dua
 * kali lipat — 200 lawan 150 untuk kebutuhan 100.
 */
export function kebutuhanKotor(bersih: number, scrapPercent = 0): number {
  if (!scrapPercent) return round3(bersih);
  if (scrapPercent < 0) throw new BomInvalidError("Susut tidak boleh negatif.");
  if (scrapPercent >= 100) {
    throw new BomInvalidError(
      "Susut 100% atau lebih bukan resep melainkan pembuangan: tidak ada keluaran yang tersisa."
    );
  }
  return round3(bersih / (1 - scrapPercent / 100));
}

/** Resep yang tidak masuk akal — ditolak sebelum sempat dipakai menghitung. */
export class BomInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BomInvalidError";
  }
}

/**
 * Resep yang MELINGKAR: A butuh B, B butuh A (atau lebih panjang).
 *
 * Dilempar dengan JALURNYA, bukan sekadar "ada lingkaran": pada pohon sepuluh
 * tingkat, "ada lingkaran" tidak memberi tahu siapa pun resep mana yang harus
 * diperbaiki. Tanpa penjaga ini penurunannya berulang selamanya sampai tumpukan
 * panggilan habis — kegagalan yang terbaca sebagai aplikasi mati, bukan sebagai
 * resep yang salah.
 */
export class BomCycleError extends Error {
  readonly jalur: string[];
  constructor(jalur: string[]) {
    super(`Resep melingkar: ${jalur.join(" → ")}. Perbaiki salah satu tautannya.`);
    this.name = "BomCycleError";
    this.jalur = jalur;
  }
}

/** Satu baris kebutuhan hasil penurunan. */
export interface KebutuhanBahan {
  itemId: number;
  itemName: string;
  /** Kedalaman di pohon resep; 1 = bahan langsung resep teratas. */
  level: number;
  /** Kuantitas KOTOR yang dibutuhkan, susut sudah diperhitungkan. */
  quantity: number;
}

export interface PenurunanBom {
  /** Bahan DAUN — yang benar-benar diambil dari gudang. Digabung per barang. */
  daun: KebutuhanBahan[];
  /** Rakitan antara — keluaran resep lain yang dibuat sendiri, bukan diambil. */
  antara: KebutuhanBahan[];
}

/**
 * Turunkan resep menjadi kebutuhan bahan untuk `jumlahKeluaran` unit.
 *
 * `resepPerBarang` memetakan barang → resep yang menghasilkannya. Bahan yang
 * ADA di peta itu diturunkan lagi (rakitan antara); yang tidak ada adalah daun.
 *
 * Skalanya proporsional: resep yang menghasilkan 950 kg lalu diminta 1900 kg
 * dijalankan dua kali. Pecahan DIIZINKAN — setengah kali jalan adalah hal biasa
 * pada proses curah, dan memaksanya bulat akan diam-diam mengubah kebutuhan.
 */
export function explodeBom(
  bom: BomInput,
  jumlahKeluaran: number,
  resepPerBarang: ReadonlyMap<number, BomInput> = new Map(),
  /** Dipakai rekursi; jangan diisi pemanggil pertama. */
  _jalur: readonly string[] = []
): PenurunanBom {
  if (!(bom.outputQuantity > 0)) {
    throw new BomInvalidError(
      `Resep ${bom.code} menghasilkan ${bom.outputQuantity} — kuantitas keluaran harus lebih dari nol.`
    );
  }
  if (_jalur.includes(bom.code)) {
    throw new BomCycleError([..._jalur, bom.code]);
  }
  const jalur = [..._jalur, bom.code];
  const kali = jumlahKeluaran / bom.outputQuantity;

  const daun = new Map<number, KebutuhanBahan>();
  const antara = new Map<number, KebutuhanBahan>();
  const level = jalur.length;

  const tambah = (peta: Map<number, KebutuhanBahan>, baris: KebutuhanBahan) => {
    const ada = peta.get(baris.itemId);
    if (ada) {
      ada.quantity = round3(ada.quantity + baris.quantity);
      // Level DANGKAL yang menang: bahan yang muncul di dua tingkat dilaporkan
      // pada tempat ia pertama kali dibutuhkan.
      ada.level = Math.min(ada.level, baris.level);
      return;
    }
    peta.set(baris.itemId, { ...baris });
  };

  for (const komponen of bom.components) {
    const kotor = round3(kebutuhanKotor(komponen.quantity, komponen.scrapPercent) * kali);
    const sub = resepPerBarang.get(komponen.itemId);

    if (!sub) {
      tambah(daun, { itemId: komponen.itemId, itemName: komponen.itemName, level, quantity: kotor });
      continue;
    }

    // Rakitan antara: dicatat sebagai yang DIBUAT, lalu diturunkan lagi.
    tambah(antara, { itemId: komponen.itemId, itemName: komponen.itemName, level, quantity: kotor });
    const bawah = explodeBom(sub, kotor, resepPerBarang, jalur);
    for (const b of bawah.daun) tambah(daun, b);
    for (const b of bawah.antara) tambah(antara, b);
  }

  const urut = (a: KebutuhanBahan, b: KebutuhanBahan) =>
    a.level - b.level || a.itemName.localeCompare(b.itemName, "id");
  return { daun: [...daun.values()].sort(urut), antara: [...antara.values()].sort(urut) };
}

// ─── Biaya standar ──────────────────────────────────────────────────────────

export interface BiayaStandar {
  /** Nilai bahan DAUN pada harga pokok yang diberikan. */
  bahan: number;
  /** Tenaga kerja langsung yang diserap = Σ jam standar × tarif upah. */
  tenagaKerja: number;
  /** Overhead yang DISERAP = Σ jam standar × tarif overhead. */
  overhead: number;
  /** bahan + tenagaKerja + overhead. */
  total: number;
  /** total ÷ jumlah keluaran. */
  perUnit: number;
  /**
   * Bahan daun yang harga pokoknya TIDAK diketahui.
   *
   * Dipulangkan, bukan dianggap nol: barang tanpa harga pokok bukan barang
   * gratis, dan biaya standar yang diam-diam melewatkannya akan menyatakan
   * margin yang tidak pernah ada.
   */
  bahanTanpaHarga: KebutuhanBahan[];
}

/**
 * Biaya standar sekali jalan `jumlahKeluaran` unit.
 *
 * `hargaPokok` memetakan barang → harga pokok per unit (IDR). Barang yang tak
 * ada di peta dilaporkan lewat `bahanTanpaHarga` dan TIDAK dihitung nol.
 *
 * Operasi diskalakan sama dengan bahan: resep yang menghasilkan 950 kg lalu
 * dijalankan untuk 1900 kg memakai dua kali jam standarnya.
 */
export function biayaStandar(
  bom: BomInput,
  jumlahKeluaran: number,
  hargaPokok: ReadonlyMap<number, number>,
  resepPerBarang: ReadonlyMap<number, BomInput> = new Map()
): BiayaStandar {
  const { daun } = explodeBom(bom, jumlahKeluaran, resepPerBarang);

  let bahan = 0;
  const bahanTanpaHarga: KebutuhanBahan[] = [];
  for (const b of daun) {
    const harga = hargaPokok.get(b.itemId);
    if (harga == null) {
      bahanTanpaHarga.push(b);
      continue;
    }
    bahan += b.quantity * harga;
  }

  const kali = jumlahKeluaran / bom.outputQuantity;
  let tenagaKerja = 0;
  let overhead = 0;
  for (const op of bom.operations ?? []) {
    const jam = op.standardHours * kali;
    tenagaKerja += jam * op.laborRate;
    overhead += jam * op.overheadRate;
  }

  bahan = round2(bahan);
  tenagaKerja = round2(tenagaKerja);
  overhead = round2(overhead);
  const total = round2(bahan + tenagaKerja + overhead);
  return {
    bahan,
    tenagaKerja,
    overhead,
    total,
    perUnit: jumlahKeluaran > 0 ? round2(total / jumlahKeluaran) : 0,
    bahanTanpaHarga,
  };
}
