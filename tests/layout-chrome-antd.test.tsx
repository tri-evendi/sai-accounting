/**
 * Chrome aplikasi di atas Ant Design (issue #193, fase C1).
 *
 * Yang dijaga di sini adalah SATU janji aksesibilitas yang baru saja diperbaiki
 * sebagai bug dan sangat mudah diregresikan lagi, plus dua janji tetangganya.
 *
 * ══ LACI TERTUTUP TIDAK BOLEH BISA DI-TAB ═════════════════════════════════
 * Bug aslinya: menu samping adalah satu `<aside>` yang di layar sempit hanya
 * DIGESER ke luar layar (`-translate-x-full`). Menggeser bukan menyembunyikan —
 * ~30 tautan tetap di urutan fokus, jadi pengguna papan ketik di ponsel menekan
 * Tab dari bilah atas lalu fokusnya lenyap ke menu yang tak terlihat di mana
 * pun, dan pembaca layar membacakan seluruh menu itu sebagai isi halaman.
 *
 * ── Apa yang benar-benar dibuktikan berkas ini, dan apa yang TIDAK ─────────
 * Tes ini berjalan di `environment: "node"` — **tidak ada DOM, jadi tidak ada
 * yang menekan Tab di sini.** Yang bisa dibuktikan tanpa peramban adalah
 * rantai sebab yang membuat penekanan Tab itu tidak punya sasaran, dan
 * rantainya dipecah menjadi tiga mata yang masing-masing bisa gagal sendiri:
 *
 *   1. **Fakta paket terpasang.** `@rc-component/drawer` benar-benar
 *      `return null` selama tertutup bila `destroyOnHidden` menyala. Dibaca
 *      dari berkas yang benar-benar di-`require` aplikasi ini, bukan dari
 *      ingatan tentang API AntD — versi baru yang menghapus klausa itu akan
 *      memerahkan tes ini, bukan diam-diam mengembalikan bugnya.
 *   2. **Kontrak komponen kita.** `Sidebar` menyerahkan `destroyOnHidden` dan
 *      TIDAK menyerahkan `forceRender` — satu prop itu saja cukup untuk
 *      mengembalikan bug aslinya secara utuh.
 *   3. **Akibatnya pada markup.** Dengan laci yang menghormati kontrak itu,
 *      keadaan tertutup tidak menghasilkan satu simpul pun — nol `<a>`, nol
 *      `role="menu"`. Tidak ada yang bisa difokuskan karena tidak ada yang ada.
 *
 * Yang tersisa di luar jangkauan: urutan fokus sebenarnya di peramban (mis.
 * `tabindex` positif liar dari komponen lain). Itu bagian sapuan #205.
 *
 * ══ ESCAPE & TIRAI ════════════════════════════════════════════════════════
 * Keduanya berpindah tuan dari kode kita ke AntD, jadi keduanya diperiksa
 * sebagai kontrak: laci tidak boleh mematikan `keyboard` (Escape) maupun
 * `mask` (tirai). Warna tirainya sendiri sudah diukur di
 * `tests/ui-overlay-antd.test.tsx` — konstanta `rgba(0,0,0,0.45)` di kedua
 * algoritma, jadi ia tidak bisa berbalik menjadi kabut putih di tema gelap.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { ROLES } from "@/lib/constants";

/*
 * Menu samping memakai `useAppRouter()` (dan lewat itu `useRouter()`) untuk
 * menutup sisa tinggi baris yang tidak tertutup tautannya. Hook itu menuntut
 * konteks App Router yang tidak ada di perenderan SSR telanjang seperti di
 * sini; yang diuji pun bukan navigasinya, melainkan ada-tidaknya markup.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/invoices",
}));

/**
 * Laci palsu yang MENIRU kontrak rc-drawer, bukan menggantikannya.
 *
 * Perlu karena `Drawer` sungguhan merender lewat portal, dan portal tidak
 * menghasilkan markup apa pun di server — jadi keadaan terbuka dan tertutup
 * akan terlihat sama-sama kosong, dan tesnya lulus tanpa menguji apa pun.
 * Tiruan ini menyalin persis satu baris keputusan milik rc-drawer, dan baris
 * itu diverifikasi terhadap paket terpasang di tes pertama di bawah — jadi
 * tiruannya tidak bisa menjadi lebih ramah daripada barang aslinya.
 */
const drawerProps: Record<string, unknown>[] = [];

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("antd")>();
  const FakeDrawer = (props: Record<string, unknown>) => {
    drawerProps.push(props);
    if (!props.forceRender && !props.open && props.destroyOnHidden) return null;
    return <>{props.children as React.ReactNode}</>;
  };
  return { ...actual, Drawer: FakeDrawer };
});

const { Sidebar } = await import("@/components/layout/sidebar");

function render(open: boolean) {
  return renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={id as unknown as Dictionary}>
      <Sidebar
        role={ROLES.MANAGING_DIRECTOR}
        accountantMode
        companyCount={2}
        open={open}
        onClose={() => {}}
      />
    </LocaleProvider>
  );
}

/** Berkas rc-drawer yang benar-benar dimuat aplikasi ini, bukan salinan `es/`. */
function sumberRcDrawer(): string {
  const require = createRequire(import.meta.url);
  return readFileSync(join(dirname(require.resolve("@rc-component/drawer")), "Drawer.js"), "utf8");
}

describe("laci menu: tertutup berarti TIDAK ADA, bukan sekadar tak terlihat", () => {
  it("rc-drawer yang terpasang memang melepas seluruh isinya saat tertutup", () => {
    /*
     * Mata rantai #1. Klausa inilah satu-satunya alasan "tertutup = tidak bisa
     * di-Tab" berlaku; kalau versi AntD/rc-drawer berikutnya menghapusnya,
     * kegagalannya harus muncul DI SINI — bukan sebagai laporan pengguna
     * papan ketik enam bulan kemudian.
     */
    expect(sumberRcDrawer()).toContain(
      "if (!forceRender && !animatedVisible && !mergedOpen && destroyOnHidden)"
    );
  });

  it("Escape tetap menutupnya: rc-drawer menyalakan `keyboard` secara bawaan", () => {
    const source = sumberRcDrawer();
    expect(source).toContain("keyboard = true");
    // Dan `keyboard` itulah yang menjaga penangan ESC-nya.
    expect(source).toMatch(/if \(top && keyboard\)/);
  });

  it("Sidebar menyerahkan destroyOnHidden dan TIDAK menyerahkan forceRender", () => {
    // Mata rantai #2 — kontrak milik kita, satu-satunya bagian yang bisa
    // dirusak oleh perubahan di repositori ini.
    drawerProps.length = 0;
    render(false);
    const props = drawerProps.at(-1);
    expect(props, "Sidebar di lebar sempit harus merender Drawer").toBeDefined();
    expect(props?.destroyOnHidden).toBe(true);
    expect(props?.forceRender).toBeUndefined();
  });

  it("Escape & tirai tidak dimatikan dari sisi kita", () => {
    drawerProps.length = 0;
    render(true);
    const props = drawerProps.at(-1);
    // Bawaan keduanya menyala; yang dijaga di sini adalah tidak ada yang
    // mematikannya "supaya tidak mengganggu".
    expect(props?.keyboard).not.toBe(false);
    expect(props?.mask).not.toBe(false);
    expect(props?.placement).toBe("left");
  });

  it("tertutup: nol tautan, nol menu — tidak ada yang bisa difokuskan", () => {
    // Mata rantai #3.
    const html = render(false);
    expect(html).toBe("");
  });

  it("terbuka: menu yang sama muncul utuh, jadi tes di atas bukan tes yang selalu kosong", () => {
    const html = render(true);
    /*
     * Penjaga bagi penjaga: kalau menunya tidak pernah muncul walau terbuka,
     * "tertutup = kosong" lulus tanpa arti.
     *
     * Jumlahnya bukan ~30: `Menu` inline AntD tidak merender isi grup yang
     * TERTUTUP sama sekali (bukan menyembunyikannya), jadi yang ada di sini
     * adalah lambang + Beranda + isi satu grup yang terbuka karena memuat
     * halaman aktif. Itu perilaku yang diinginkan — dan efek sampingnya
     * menguntungkan: urutan fokus menu ikut menyusut bersama grup yang ditutup.
     */
    const tautan = html.match(/<a\s/g) ?? [];
    expect(tautan.length).toBeGreaterThan(5);
    expect(html).toContain('role="menu"');
    // Sasaran langkah tur (`lib/tours.ts`) — namanya tidak boleh berubah.
    expect(html).toContain('data-tour="menu-tugas"');
    // Halaman yang sedang dibuka tetap diumumkan, bukan hanya diwarnai.
    expect(html).toContain('aria-current="page"');
  });
});

describe("baris pilihan di menu akun tetap 'satu dari tiga'", () => {
  it("bahasa & tema memakai menuitemradio + aria-checked", () => {
    /*
     * `Dropdown` merender lewat portal, jadi tidak ada markup untuk diperiksa
     * di server. Yang diperiksa karena itu adalah niatnya di sumber: tipe
     * `items` AntD tidak menyebut atribut ARIA sama sekali, sehingga inilah
     * baris yang paling mungkin "dibersihkan" seseorang menjadi menuitem
     * biasa — dan setelah itu pembaca layar tidak pernah lagi menyebut bahasa
     * mana yang sedang berlaku.
     */
    const source = readFileSync(
      join(__dirname, "..", "src", "components", "layout", "user-menu.tsx"),
      "utf8"
    );
    expect(source).toContain('role: "menuitemradio"');
    expect(source).toContain('"aria-checked"');
  });
});
