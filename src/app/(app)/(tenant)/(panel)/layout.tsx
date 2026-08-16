/**
 * Kerangka PANEL AKUN pelanggan — `/platform` **dan** `/companies/new`.
 *
 * ══ KENAPA GRUP `(panel)`, DAN KENAPA URL-NYA TIDAK IKUT BERUBAH ═══════════
 * Sampai perbaikan ini berkas ini bernama `platform/layout.tsx`, jadi yang
 * mewarisi `PlatformShell` hanyalah rute di bawah `/platform`. Yang membuat itu
 * salah bukan selera melainkan menu yang disusun DI BAWAH INI: daftar `nav`
 * memuat butir `/companies/new`, dan rute itu tinggal di luar layout ini —
 * sehingga menekan sebuah butir MENU SAMPING melempar penggunanya keluar dari
 * panel yang memuat menu itu, mendarat di `AuthShell`: layar bergaya login,
 * lengkap dengan panel jualan gelap di kirinya. Pemilik yang menambah PT
 * keduanya tidak sedang dibujuk membeli; ia sedang mengerjakan tugas
 * administratif di panel akunnya.
 *
 * Perbaikannya STRUKTUR, bukan tambalan: layout naik satu tingkat ke grup rute
 * `(panel)`, dan `companies/` pindah ke dalamnya. Grup rute **tidak muncul di
 * URL**, jadi `/platform` tetap `/platform` dan `/companies/new` tetap
 * `/companies/new` — tidak ada pantulan yang perlu ditulis, tidak ada bookmark
 * yang mati, dan tidak ada satu pun dari ±15 pemanggil `"/companies/new"`
 * (alur pasca-masuk, verifikasi surel, `lib/nav.ts`, `lib/docs.ts`) yang harus
 * disentuh. Yang berubah hanya kulit yang membungkusnya.
 *
 * ⚠ Konsekuensi yang harus diketahui: `/companies/new` kini ikut melewati
 * penjaga `tenant.home` di bawah ini SEBELUM penjaganya sendiri
 * (`company.create`). Itu berlapis, bukan berganda — `tenant.home` dipegang
 * setiap anggota tenant, jadi tidak ada yang kehilangan akses; yang bukan
 * anggota tenant sama sekali kini dipantulkan satu langkah lebih awal.
 *
 * ══ KENAPA LAYOUT, DAN KENAPA IA IKUT MENJAGA ══════════════════════════════
 * Sejak permukaan tenant dipecah menjadi rute-rute sendiri (ringkasan, tim,
 * langganan, paket, privasi), chrome-nya tidak boleh ikut tergandakan lima
 * kali: satu berkas yang menyusun menu, satu tempat yang membacanya.
 *
 * Layout ini memanggil `requireTenantPagePermission("tenant.home")` — izin
 * paling dasar, dipegang SETIAP anggota tenant. Ia bukan pengganti penjaga di
 * tiap halaman melainkan lapisan pertamanya: yang bukan anggota tenant sama
 * sekali dipantulkan di sini, dan halaman di dalamnya menambahkan penjaganya
 * yang lebih ketat (`tenant.billing`, `tenant.export`, …). `tests/authz-
 * coverage` tetap menuntut setiap `page.tsx` menyatakan izinnya sendiri, dan
 * itu benar: layout yang menjaga TIDAK boleh membuat halaman berhenti menjaga
 * dirinya — satu perubahan pada layout tidak boleh diam-diam membuka empat
 * halaman sekaligus.
 *
 * ⚠ MENU DISUSUN DI SINI, dari matriks izin. Kulit (`PlatformShell`) hanya
 * menggambar. Kulit yang ikut membaca izin akan menaruh keputusan "siapa
 * melihat apa" di tempat kedua yang tidak diuji siapa pun — dan butir menu
 * menuju halaman yang akan memantulkan pemiliknya adalah bentuk kebocoran
 * tersendiri: ia memberi tahu orang bahwa ruangan itu ada.
 */
import { PlatformShell } from "@/components/tenant/platform-shell";
import { panelNav } from "@/lib/panel-nav";
import { getT } from "@/lib/i18n/server";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await requireTenantPagePermission("tenant.home");
  const t = await getT();

  /* Menunya disusun `lib/panel-nav.tsx` — SATU tempat, dibaca layout ini dan
     layout wisaya penyiapan. Alasannya di kepala berkas itu. */
  const nav = panelNav(tenant, t);

  return (
    <PlatformShell
      tenantName={tenant.tenantName}
      nav={nav}
      userName={user.name ?? ""}
      role={tenant.role ?? ""}
    >
      {children}
    </PlatformShell>
  );
}
