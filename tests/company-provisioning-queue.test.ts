/**
 * Penyediaan PT lewat antrean (`company.provision`, Okt 2026) — aturan MURNI
 * yang dibagi pekerja (`svc-worker`, penulis) dan rute status (`app-customer`,
 * pembaca). Keduanya proses berbeda; yang mereka bagi hanya baris `jobs` dan
 * aturan di `company-provisioning-shared.ts`. Bila aturan itu menyimpang,
 * layar menampilkan tahap yang salah, kalimat galat yang salah — atau lebih
 * buruk: pengulangan "melanjutkan" basis data yang bukan miliknya.
 */
import { describe, expect, it } from "vitest";

import {
  decodeProvisionFailure,
  encodeProvisionFailure,
  phaseFromProgress,
  PROVISION_PROGRESS,
  ProvisionError,
  provisionDedupeKey,
  provisionErrorMessage,
  progressForEvent,
  provisioningMarker,
  resumeIndex,
  type ProvisionPhase,
} from "@/lib/company-provisioning-shared";
import { JOB_KINDS } from "@sai/core/generated/job-kinds";

describe("kontrak `company.provision`", () => {
  it("jalur `interactive`, tidak menulis buku, tanpa percobaan ulang otomatis", () => {
    const spec = JOB_KINDS["company.provision"];
    expect(spec.lane).toBe("interactive");
    expect(spec.maxAttempts).toBe(1);
    expect(spec.writesLedger).toBe(false);
  });
});

describe("tahap ⇄ angka kemajuan", () => {
  const tahap: ProvisionPhase[] = ["validate", "create_database", "register", "done"];

  it("setiap tahap kembali ke dirinya sendiri", () => {
    for (const phase of tahap) {
      expect(phaseFromProgress(progressForEvent({ phase })).phase).toBe(phase);
    }
  });

  it("migration membawa pecahannya, dan tetap terbaca `migrate` dari awal sampai akhir", () => {
    for (const f of [0, 0.25, 0.5, 1]) {
      const back = phaseFromProgress(progressForEvent({ phase: "migrate", progress: f }));
      expect(back.phase).toBe("migrate");
      expect(back.migrateProgress).toBeCloseTo(f, 1);
    }
  });

  it("angkanya naik searah tahap — layar tidak pernah mundur", () => {
    const urut = [
      progressForEvent({ phase: "validate" }),
      progressForEvent({ phase: "create_database" }),
      progressForEvent({ phase: "migrate", progress: 0 }),
      progressForEvent({ phase: "migrate", progress: 1 }),
      progressForEvent({ phase: "register" }),
      progressForEvent({ phase: "done" }),
    ];
    expect([...urut].sort((a, b) => a - b)).toEqual(urut);
    expect(urut.at(-1)).toBe(PROVISION_PROGRESS.done);
  });

  it("0 = belum mulai (antre / baru diklaim), bukan tahap pertama", () => {
    expect(phaseFromProgress(0).phase).toBeNull();
  });
});

describe("sebab kegagalan menyeberang sebagai KODE, bukan teks driver", () => {
  it("kode, tahap, dan nilainya kembali utuh", () => {
    const e = new ProvisionError("Basis data … sudah berisi 12 tabel", "create_database", {
      code: "database_not_empty",
      values: { database: "sai_t3_pt_a", tables: 12 },
    });
    const teks = `ProvisionError: ${encodeProvisionFailure(e)}`;
    expect(decodeProvisionFailure(teks)).toEqual({
      code: "database_not_empty",
      phase: "create_database",
      values: { database: "sai_t3_pt_a", tables: 12 },
    });
  });

  it("teks tanpa penanda (galat mentah, lease kedaluwarsa) → tanpa kode → pesan umum", () => {
    const d = decodeProvisionFailure(
      "error: permission denied for database sai_t3_x\nlease kedaluwarsa — pekerja diduga mati"
    );
    expect(d.code).toBeNull();
    expect(provisionErrorMessage(null).key).toBe("companies.errFailed");
  });

  it("kode yang tidak dikenal kamus ditolak, bukan diteruskan", () => {
    expect(decodeProvisionFailure('[[provision {"code":"rm_rf","phase":"validate","values":{}}]]').code).toBeNull();
  });

  it("nilai tidak bisa memecah penanda", () => {
    const e = new ProvisionError("x", "validate", {
      code: "slug_taken",
      values: { slug: 'a]]"}{b' },
    });
    expect(decodeProvisionFailure(encodeProvisionFailure(e)).code).toBe("slug_taken");
  });
});

describe("dedupe & tanda: satu basis data, satu penyediaan aktif", () => {
  it("kunci dedupe = nama basis data (ruang nama fisik server)", () => {
    expect(provisionDedupeKey("sai_t3_pt_a")).toBe("company.provision:sai_t3_pt_a");
  });

  it("tanda membedakan tenant DAN slug", () => {
    expect(provisioningMarker(3, "pt-a")).not.toBe(provisioningMarker(4, "pt-a"));
    expect(provisioningMarker(3, "pt-a")).not.toBe(provisioningMarker(3, "pt-b"));
    expect(provisioningMarker(3, " PT-A ")).toBe(provisioningMarker(3, "pt-a"));
  });
});

describe("melanjutkan buku setengah jadi — hanya awalan PERSIS", () => {
  const ours = [
    { nama: "0001_baseline", checksum: "a" },
    { nama: "0002_company_logos", checksum: "b" },
  ];
  const ok = (nama: string, checksum: string) => ({ nama, checksum, selesai: true });

  it("kosong → mulai dari 0; sebagian → lanjut; lengkap → tinggal hibah + registry", () => {
    expect(resumeIndex([], ours)).toBe(0);
    expect(resumeIndex([ok("0001_baseline", "a")], ours)).toBe(1);
    expect(resumeIndex([ok("0001_baseline", "a"), ok("0002_company_logos", "b")], ours)).toBe(2);
  });

  it("checksum berbeda, nama asing, lompatan, atau migration menggantung → TIDAK", () => {
    expect(resumeIndex([ok("0001_baseline", "zzz")], ours)).toBeNull();
    expect(resumeIndex([ok("0001_lain", "a")], ours)).toBeNull();
    expect(resumeIndex([ok("0002_company_logos", "b")], ours)).toBeNull();
    expect(resumeIndex([{ nama: "0001_baseline", checksum: "a", selesai: false }], ours)).toBeNull();
    expect(resumeIndex([...ours.map((o) => ok(o.nama, o.checksum)), ok("0003_x", "c")], ours)).toBeNull();
  });
});
