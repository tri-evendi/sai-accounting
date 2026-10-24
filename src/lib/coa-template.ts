/**
 * Bagan akun yang MENGIKUTI MODUL — sengaja BUKAN di `accounting.ts`.
 *
 * ══ KENAPA BERKAS TERSENDIRI ═══════════════════════════════════════════════
 * `tests/business-modules-ledger.test.ts` melarang mesin buku besar (laporan,
 * jurnal, posting, saldo awal) menjangkau `business-modules.ts` lewat jalur
 * impor mana pun. Aturan itu bukan kerapian: kalau angka laporan bisa berubah
 * mengikuti modul yang menyala, mematikan sebuah modul berhenti menjadi tombol
 * fitur dan menjadi bug integritas akuntansi.
 *
 * `accounting.ts` termasuk yang dijangkau mesin itu (lewat `reports.ts` dan
 * `budget-report.ts`), jadi ia tidak boleh tahu apa pun tentang modul —
 * bahkan lewat impor TIPE saja, sebab penjaganya menelusuri jalur impor, bukan
 * niat. Karena itu `COA_TEMPLATE` hanya membawa `module?: string`, dan
 * penerjemahannya menjadi himpunan modul tinggal di sini: berkas yang hanya
 * dipakai jalur PENYIAPAN, tidak pernah oleh jalur perhitungan.
 *
 * Kesahihan nilai tag-nya tetap dijaga — lihat `tests/coa-template-modules.test.ts`.
 */
import { COA_TEMPLATE, type CoaTemplateRow } from "@/lib/accounting";
import type { BusinessModule } from "@/lib/business-modules";
import { equityModelFor, type LegalForm } from "@sai/core/legal-form";
import {
  nextChildCode,
  PARTNER_CAPITAL_PARENT,
  PARTNER_DRAWING_PARENT,
  partnerAccountName,
  type PartnerDraft,
} from "@/lib/partners";

/**
 * Templat EKUITAS yang diminta pemanggil (bentuk usaha, 24 Okt 2026).
 *
 *   • `undefined` — perilaku lama: ekuitas PT dari `COA_TEMPLATE` (3101 Modal,
 *     3102 Laba Ditahan). Skrip `seed-coa` dan tes lama memakai ini.
 *   • `null`      — TANPA akun ekuitas sama sekali. Dipakai saat sebuah MODUL
 *     dinyalakan belakangan: bagan ekuitas hanya disemai sekali, saat buku
 *     dibuat. Menyemai templat PT ke buku CV di sana akan melahirkan 3102 Laba
 *     Ditahan berikut slot pemetaannya — persis yang tidak boleh terjadi.
 *   • `{ legalForm, partners }` — templat menurut bentuk usaha.
 */
export interface EquityTemplateInput {
  legalForm: LegalForm;
  /** Sekutu (CV/Firma) atau pemilik (perorangan), urut seperti diisi. */
  partners: readonly PartnerDraft[];
}

/** Satu baris sekutu beserta KODE akun modal/prive-nya di templat. */
export interface PartnerTemplateRow extends PartnerDraft {
  capitalCode: string;
  drawingCode: string;
  sortOrder: number;
}

export interface EquityTemplate {
  rows: CoaTemplateRow[];
  partners: PartnerTemplateRow[];
}

/** Kode akun ekuitas milik templat PT di `COA_TEMPLATE`. */
const PT_EQUITY_CODES = new Set(
  COA_TEMPLATE.filter((r) => r.type === "equity").map((r) => r.code)
);

/** Kode akun pemilik tunggal (usaha perorangan). */
export const SOLE_OWNER_CODES = { capital: "3101", drawing: "3103" } as const;

/**
 * Akun ekuitas + baris sekutu untuk satu bentuk usaha.
 *
 *   • PT / PT Perorangan / lainnya — `COA_TEMPLATE` apa adanya (3101 Modal,
 *     3102 Laba Ditahan). Tidak ada baris sekutu.
 *   • Usaha perorangan — 3101 Modal Pemilik, 3103 Prive Pemilik; satu baris
 *     pemilik 100%. Tanpa Laba Ditahan: laba menambah modal pemilik.
 *   • CV / Firma — 3101 "Modal Belum Dibagi" (penampung selisih saldo awal,
 *     slot `opening_equity`: selisih aset − kewajiban pada hari pertama milik
 *     para sekutu dalam bagian yang TIDAK diketahui aplikasi — bukan porsi
 *     laba — jadi ia diparkir terang-terangan dan dibagi dengan jurnal oleh
 *     yang tahu), lalu 3110 Modal Sekutu → 3110NN "Modal <nama>" dan 3120 Prive
 *     Sekutu → 3120NN "Prive <nama>" per sekutu. Tanpa Laba Ditahan: tutup
 *     buku membagi laba langsung ke modal tiap sekutu, jadi akun "Ikhtisar"
 *     penampung tidak dibutuhkan.
 */
export function equityTemplateFor(input: EquityTemplateInput): EquityTemplate {
  const model = equityModelFor(input.legalForm);
  if (model === "retained_earnings") {
    return { rows: COA_TEMPLATE.filter((r) => PT_EQUITY_CODES.has(r.code)), partners: [] };
  }
  if (model === "sole_owner") {
    const owner = input.partners[0];
    return {
      rows: [
        { code: SOLE_OWNER_CODES.capital, name: "Modal Pemilik", type: "equity" },
        { code: SOLE_OWNER_CODES.drawing, name: "Prive Pemilik", type: "equity" },
      ],
      partners: owner
        ? [
            {
              name: owner.name,
              role: null,
              shareBp: owner.shareBp,
              capitalCode: SOLE_OWNER_CODES.capital,
              drawingCode: SOLE_OWNER_CODES.drawing,
              sortOrder: 0,
            },
          ]
        : [],
    };
  }

  const rows: CoaTemplateRow[] = [
    { code: "3101", name: "Modal Belum Dibagi", type: "equity" },
    { code: PARTNER_CAPITAL_PARENT.code, name: PARTNER_CAPITAL_PARENT.name, type: "equity" },
    { code: PARTNER_DRAWING_PARENT.code, name: PARTNER_DRAWING_PARENT.name, type: "equity" },
  ];
  const taken: string[] = [];
  const partners: PartnerTemplateRow[] = input.partners.map((p, i) => {
    const capitalCode = nextChildCode(PARTNER_CAPITAL_PARENT.code, taken);
    taken.push(capitalCode);
    const drawingCode = nextChildCode(PARTNER_DRAWING_PARENT.code, taken);
    taken.push(drawingCode);
    rows.push(
      {
        code: capitalCode,
        name: partnerAccountName("capital", p.name),
        type: "equity",
        parent: PARTNER_CAPITAL_PARENT.code,
      },
      {
        code: drawingCode,
        name: partnerAccountName("drawing", p.name),
        type: "equity",
        parent: PARTNER_DRAWING_PARENT.code,
      }
    );
    return { ...p, role: p.role ?? null, capitalCode, drawingCode, sortOrder: i };
  });
  return { rows, partners };
}

/**
 * Bagan akun untuk HIMPUNAN MODUL yang benar-benar dipakai perusahaan
 * (issue #99/#104).
 *
 * Sebelum ini setiap perusahaan disemai template yang sama persis — sehingga
 * perusahaan JASA, yang modul persediaannya memang sudah dimatikan kategori
 * usahanya, tetap mendapat "Persediaan Barang Dagang", "Beban Pokok
 * Penjualan", dan "Selisih Persediaan". Akun-akun itu tidak pernah terpakai,
 * tapi ikut memenuhi setiap pemilih akun, setiap laporan, dan setiap ekspor —
 * persis kebalikan dari "permukaan sederhana" yang dijanjikan aplikasi ini.
 *
 * Baris tanpa `module` selalu ikut: modal, laba ditahan, beban operasional,
 * selisih kurs, dan bunga/administrasi bank tidak dimiliki modul mana pun —
 * mereka milik pembukuan itu sendiri.
 *
 * INDUK IKUT SERTA meski induknya sendiri bertanda modul lain: akun anak tanpa
 * induk akan gagal disemai (relasi `parent`), jadi induk yang dibutuhkan
 * ditarik masuk. Yang tidak dibutuhkan siapa pun tetap ditinggal.
 */
export function coaTemplateFor(
  modules: Iterable<BusinessModule>,
  equity?: EquityTemplateInput | null
): CoaTemplateRow[] {
  const enabled = new Set<string>(modules);
  /* Ekuitas PT di templat dasar diganti templat bentuk usaha (atau dibuang,
     `null`) — lihat `EquityTemplateInput`. `undefined` = perilaku lama. */
  const equityRows =
    equity === undefined || (equity && equityModelFor(equity.legalForm) === "retained_earnings")
      ? null /* PT: templat dasar apa adanya, urutannya pun sama persis. */
      : equity === null
        ? []
        : equityTemplateFor(equity).rows;
  const base =
    equityRows === null ? COA_TEMPLATE : COA_TEMPLATE.filter((r) => !PT_EQUITY_CODES.has(r.code));
  const template = equityRows === null ? base : [...base, ...equityRows];
  const wanted = template.filter((row) => !row.module || enabled.has(row.module));

  const byCode = new Map(template.map((row) => [row.code, row]));
  const chosen = new Map(wanted.map((row) => [row.code, row]));
  for (const row of wanted) {
    let parent = row.parent;
    while (parent && !chosen.has(parent)) {
      const parentRow = byCode.get(parent);
      if (!parentRow) break;
      chosen.set(parentRow.code, parentRow);
      parent = parentRow.parent;
    }
  }

  // Urutan template dipertahankan: induk selalu mendahului anaknya di sana,
  // dan penyemaian bergantung pada urutan itu.
  return template.filter((row) => chosen.has(row.code));
}
