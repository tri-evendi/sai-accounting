/**
 * JALAN PINTAS HALAMAN PENDARATAN — dan BATASNYA.
 *
 * ══ APA YANG DIUJI ═════════════════════════════════════════════════════════
 * `/` yang dibuka pengguna bersesi dulu menempuh DUA pantulan dan satu render:
 * halaman pendaratan dirender → `auth()` → `redirect("/dashboard")` → proxy
 * memantulkannya ke `/t/{tenant}/{company}`. Proxy sekarang memotong langkah
 * pertama — tetapi HANYA ketika tokennya sudah membawa kedua slug.
 *
 * ══ KENAPA BERKAS INI MEMANGGIL `proxy()` SUNGGUHAN ════════════════════════
 * Alasan yang sama dengan `proxy-bearer-api.test.ts`, dan pelajarannya sudah
 * dibayar sekali: cacat 401-sebelum-penjaga (#389) lolos `verify` DAN `build`
 * karena setiap tes menguji lapisan yang SALAH. Menguji `isPublicPath` saja
 * akan mengulang kesalahan itu dalam bentuk baru.
 *
 * ══ YANG PALING PENTING DI BERKAS INI ══════════════════════════════════════
 * Bukan kasus yang DIPANTULKAN, melainkan tiga kasus yang TIDAK. Syarat "kedua
 * slug ada" adalah satu-satunya hal yang menjaga sesi lama, pengguna
 * multi-PT yang belum memilih, dan pelanggan tanpa PT supaya tetap ditangani
 * `app/(app)/(dashboard)/dashboard/page.tsx` — satu-satunya tempat yang boleh
 * menjalankan `routeForCompany()`, query yang runtime Edge tidak punya
 * aksesnya. Melonggarkan syarat itu mengirim mereka ke `/platform` alih-alih ke
 * bukunya, TANPA satu pun galat.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

/** Token dipalsukan SEBELUM `proxy` diimpor — pola `proxy-bearer-api`. */
const state: { token: Record<string, unknown> | null } = { token: null };
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => state.token) }));

import { NextRequest } from "next/server";

import { proxy } from "@/proxy";
import { COMPANY_HOME_PATH, tenantPath } from "@sai/core/tenant-routes";

const HOST = "https://buku.contoh.test";

function get(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, HOST), { method: "GET" });
}

/** Jalur tujuan pantulan, atau `null` bila permintaan diteruskan. */
async function tujuan(pathname: string): Promise<string | null> {
  const res = await proxy(get(pathname));
  const lokasi = res?.headers.get("location");
  return lokasi ? new URL(lokasi, HOST).pathname : null;
}

const SESI_LENGKAP = {
  sub: "7",
  companyId: 3,
  tenantSlug: "akme",
  companySlug: "pt-akme",
  tenantRole: "owner",
};

beforeEach(() => {
  state.token = null;
});

describe("jalan pintas `/` untuk sesi yang slug-nya lengkap", () => {
  it("memantul LANGSUNG ke beranda buku — satu pantulan, bukan dua", async () => {
    state.token = { ...SESI_LENGKAP };
    expect(await tujuan("/")).toBe("/t/akme/pt-akme");
  });

  it("tujuannya PERSIS sama dengan yang dicapai lewat `/dashboard`", async () => {
    /*
     * Ini yang membuat perubahan itu optimasi dan bukan perubahan perilaku:
     * alamat akhirnya identik, dan `tenantPath` yang memutuskannya — bukan
     * literal yang diketik ulang di proxy.
     */
    state.token = { ...SESI_LENGKAP };
    const lewatPendaratan = await tujuan("/");
    const lewatDashboard = await tujuan("/dashboard");
    expect(lewatPendaratan).toBe(lewatDashboard);
    expect(lewatPendaratan).toBe(tenantPath("akme", "pt-akme", COMPANY_HOME_PATH));
  });

  it("memakai 307, bukan pantulan permanen", async () => {
    /*
     * PT tujuan bergantung pada SESI. 308/301 tersimpan di cache peramban
     * selamanya dan akan membawa pengguna ke buku PT LAIN berbulan-bulan
     * sesudahnya — alasan yang sama dengan pantulan jalur lama.
     */
    state.token = { ...SESI_LENGKAP };
    const res = await proxy(get("/"));
    expect(res?.status).toBe(307);
  });
});

describe("BATAS jalan pintas — yang TIDAK boleh dipantulkan proxy", () => {
  it("pengunjung TANPA sesi tetap melihat halaman pendaratan", async () => {
    // Pembaca halaman ini justru orang yang belum punya akun. Memantulkannya
    // adalah keadaan yang halaman itu dibuat untuk mengakhiri.
    state.token = null;
    expect(await tujuan("/")).toBeNull();
  });

  it("sesi dengan companyId TAPI TANPA slug diteruskan ke halamannya", async () => {
    /*
     * Rombongan paling penting di berkas ini: sesi lama yang terbit sebelum
     * #157. Jawaban benar baginya menuntut `routeForCompany()` — satu query —
     * jadi proxy HARUS menyerah dan membiarkan halamannya memutuskan.
     */
    state.token = { sub: "7", companyId: 3 };
    expect(await tujuan("/")).toBeNull();
  });

  it("sesi tanpa perusahaan sama sekali diteruskan ke halamannya", async () => {
    // Pelanggan baru yang belum punya PT, atau pemegang banyak PT yang belum
    // memilih. Keduanya butuh jawaban yang tidak bisa disusun di Edge.
    state.token = { sub: "7", companyId: null };
    expect(await tujuan("/")).toBeNull();
  });

  it("slug yang hanya SEPARUH lengkap tidak cukup", async () => {
    state.token = { ...SESI_LENGKAP, companySlug: undefined };
    expect(await tujuan("/")).toBeNull();
    state.token = { ...SESI_LENGKAP, tenantSlug: undefined };
    expect(await tujuan("/")).toBeNull();
  });

  it("yang WAJIB ganti sandi tidak dibawa ke buku", async () => {
    /*
     * `mustChangePassword` adalah gerbang yang mendahului tujuan mana pun.
     * Memotongnya ke buku akan melewati satu-satunya layar yang memaksa
     * penggantian sandi.
     */
    state.token = { ...SESI_LENGKAP, mustChangePassword: true };
    expect(await tujuan("/")).toBeNull();
  });

  it("`/pricing` TIDAK ikut dipotong — perilakunya sengaja dibiarkan", async () => {
    /*
     * `/pricing` juga memantulkan pengguna bersesi ke `/dashboard`, tetapi
     * APAKAH ia seharusnya begitu adalah pertanyaan PRODUK (pelanggan yang
     * ingin naik paket justru datang untuk melihat harga), bukan pertanyaan
     * pantulan. Tes ini mengunci lingkupnya supaya tidak ada yang "merapikan"
     * `/pricing` ke sini tanpa memutuskan pertanyaan itu lebih dulu.
     */
    state.token = { ...SESI_LENGKAP };
    expect(await tujuan("/pricing")).toBeNull();
  });
});
