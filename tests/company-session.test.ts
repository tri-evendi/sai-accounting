/**
 * Dari sesi ke konteks perusahaan (lib/company-session.ts) — issue #104.
 *
 * Ini gerbang yang dilewati SETIAP permintaan sebelum menyentuh basis data,
 * jadi yang diuji bukan sekadar "mengembalikan true/false" melainkan tiga hal
 * yang masing-masing punya akibat berbeda bila salah:
 *
 *  1. Konteksnya benar-benar DITANAM — kalau tidak, setiap query di halaman itu
 *     melempar dan halamannya kosong.
 *  2. Perusahaan NONAKTIF ditolak — buku yang sengaja ditutup tidak boleh
 *     dibuka hanya karena token lama masih menyebut id-nya.
 *  3. Ketiga kegagalannya DIBEDAKAN — "belum memilih perusahaan" bukan masalah
 *     kredensial, dan melempar orang ke halaman masuk untuk itu membuatnya
 *     mengetik ulang kata sandi yang tidak pernah salah.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCompany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/company-registry", () => ({ getCompany }));
vi.mock("server-only", () => ({}));

import { enterCompanyFromSession } from "@/lib/company-session";
import { getCompanyContext } from "@/lib/company-context";
import { TEST_COMPANY } from "./setup-company-context";

const PT_A = {
  companyId: 7,
  slug: "pt-a",
  name: "PT A",
  databaseName: "sai_pt_a",
  isActive: true,
};

const session = (user: Record<string, unknown> | null) => (user ? { user } : { user: null });

beforeEach(() => {
  getCompany.mockReset();
  getCompany.mockResolvedValue(PT_A);
});

describe("enterCompanyFromSession", () => {
  it("menanam konteks perusahaan dari sesi", async () => {
    const result = await enterCompanyFromSession(
      session({ id: "3", role: "finance_manager", companyId: 7 })
    );

    expect(result).toEqual({ ok: true, companyId: 7, slug: "pt-a", role: "finance_manager" });

    /*
     * Konteks yang ditanam TIDAK diperiksa di sini, dan alasannya bukan bahwa
     * `enterWith` tak pernah merambat — ia merambat, ASAL belum ada store.
     * Berkas tes ini sudah punya store bawaan (tests/setup-company-context.ts),
     * dan dalam keadaan itu `enterWith` di fungsi yang di-`await` tidak
     * menimpanya untuk pemanggil. Kedua sifat itu diukur dan dikunci di
     * tests/company-context.test.ts.
     */
  });

  it("membedakan 'belum masuk' dari 'belum memilih perusahaan'", async () => {
    expect(await enterCompanyFromSession(null)).toEqual({ ok: false, reason: "no-session" });
    expect(await enterCompanyFromSession(session(null))).toEqual({
      ok: false,
      reason: "no-session",
    });
    expect(await enterCompanyFromSession(session({ id: "3", companyId: null }))).toEqual({
      ok: false,
      reason: "no-company",
    });
  });

  it("menolak perusahaan yang sudah tidak ada — dan TIDAK memindahkan konteks", async () => {
    getCompany.mockResolvedValue(null);
    const result = await enterCompanyFromSession(session({ id: "3", role: "x", companyId: 99 }));
    expect(result).toEqual({ ok: false, reason: "company-unavailable" });
    // Konteksnya tetap seperti sebelum panggilan gagal ini: resolusi yang gagal
    // tidak boleh meninggalkan permintaan menunjuk basis data mana pun yang baru.
    expect(getCompanyContext()).toEqual(TEST_COMPANY);
  });

  it("menolak perusahaan yang DINONAKTIFKAN — token lama tidak membukanya", async () => {
    getCompany.mockResolvedValue({ ...PT_A, isActive: false });
    const result = await enterCompanyFromSession(session({ id: "3", role: "x", companyId: 7 }));
    expect(result).toEqual({ ok: false, reason: "company-unavailable" });
    expect(getCompanyContext()).toEqual(TEST_COMPANY);
  });

  it("sesi berperusahaan tapi tanpa peran tidak diberi peran tebakan", async () => {
    const result = await enterCompanyFromSession(session({ id: "3", companyId: 7 }));
    expect(result).toEqual({ ok: false, reason: "company-unavailable" });
  });
});
