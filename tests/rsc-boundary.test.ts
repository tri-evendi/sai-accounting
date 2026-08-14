/**
 * Batas RSC — penjaga arsitektur migrasi Ant Design (issue #185, fase A2).
 *
 * ── Garis dasar tercatat, 2026-08-05 ───────────────────────────────────────
 * Garis dasar yang dicatat issue #185 dan epik #206: **287 berkas `.tsx`, 147
 * di antaranya `"use client"` — sisanya 140 server component**. Angka itu bukan
 * statistik hiasan; server component itu adalah halaman yang membaca buku besar
 * lewat Prisma lalu merender tabelnya DI SERVER, tanpa mengirim satu baris
 * JavaScript pun untuk tabel itu. Halaman neraca saldo dengan 2.000 akun adalah
 * HTML, bukan bundel.
 *
 * Setelah #184 (fondasi AntD) mendarat, `"use client"` bertambah satu berkas:
 * `components/providers/antd-provider.tsx`, jembatan tema/locale yang memang
 * wajib client. **Jumlah server component tidak berubah.** Itulah bentuk
 * kenaikan yang sah — primitif dan provider yang memikul batas, bukan halaman
 * yang menyerah.
 *
 * ── Koreksi terhadap angka 147/140 ─────────────────────────────────────────
 * Angka garis dasar itu dihitung dengan `grep -l '"use client"'`, dan grep
 * tidak bisa membedakan DIREKTIF dari kata yang kebetulan DISEBUT di dalam
 * komentar. Satu berkas tertangkap keliru: `components/ui/table.tsx`, yang
 * komentar kepalanya berbunyi "**Sengaja TANPA `"use client"`**" — kalimat
 * yang menjelaskan justru kebalikan dari yang disimpulkan grep.
 *
 * Jadi angka sebenarnya sebelum migrasi adalah **146 client / 141 server**,
 * dan sesudah #184 **147 client / 141 server** dari 288 berkas `.tsx`
 * (+3 modul `.ts` yang juga client = 150 modul, yang dikunci `AMBANG_KLIEN`;
 * 151 sejak #186 menaikkan `money.tsx` — alasannya di dekat konstanta itu).
 * Selisih satu berkas ini kecil, tapi berkasnya bukan berkas sembarangan:
 * `table.tsx` adalah primitif tabel, permukaan terbesar aplikasi ini, dan
 * satu-satunya primitif yang SENGAJA netral supaya 36 dari 50 tabel bisa tetap
 * dirender di server. Penjaga ini karena itu mendeteksi direktif dengan
 * membuang komentar di kepala berkas lebih dulu, bukan dengan mencocokkan teks.
 *
 * ── Kelas kesalahan yang dijaga di sini ────────────────────────────────────
 * Komponen AntD adalah komponen client. Pembacaan yang SALAH dari fakta itu
 * adalah "berarti 141 server component harus jadi client" — dan itu membunuh
 * model data aplikasi ini: setiap halaman laporan berubah dari HTML jadi
 * `useEffect` + endpoint JSON, dan seluruh buku besar menyeberang ke peramban.
 * Yang BENAR: **primitif yang memikul `"use client"`**, sementara server
 * component tetap server dan merender primitif itu sebagai DAUN.
 *
 *     // page.tsx — TETAP server component
 *     export default async function ReportPage() {
 *       const rows = await getTrialBalance();   // Prisma, di server
 *       return <ReportTable rows={rows} />;     // daun client, props polos
 *     }
 *
 * Aturan itu gampang disetujui dan gampang bocor: satu `"use client"` yang
 * ditambahkan di puncak halaman karena "lebih cepat begitu" tidak menghasilkan
 * galat apa pun — tidak di `tsc`, tidak di ESLint, tidak di `next build`.
 * Halamannya tetap jalan, hanya saja pengambilan datanya diam-diam pindah ke
 * peramban. Berkas ini mengubah kesepakatan itu menjadi STRUKTUR.
 *
 * ── Kenapa daftar, bukan sekadar angka ─────────────────────────────────────
 * Ambang telanjang ("maksimal 150") menjawab "berapa" tapi tidak pernah
 * menjawab "yang mana". Ketika angkanya naik, orang berikutnya hanya melihat
 * `150` berubah jadi `151` di diff — tidak ada yang bisa ditinjau. Karena itu
 * daftarnya ditulis penuh: menambah komponen client menjadi satu baris berisi
 * NAMA BERKAS di dalam diff, yang bisa dibaca dan dipertanyakan seorang
 * peninjau. Ambangnya tetap ada sebagai pagar kedua — menambah baris ke daftar
 * saja tidak cukup, `AMBANG_KLIEN` harus ikut dinaikkan secara sadar.
 *
 * Daftarnya memuat `.ts` maupun `.tsx`: `"use client"` adalah sifat MODUL, dan
 * hook seperti `lib/use-effective-permissions.ts` ikut menyeberang meski tidak
 * berisi JSX.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src");

/**
 * Ambang jumlah modul `"use client"`, terukur 2026-08-05 setelah #184.
 *
 * Menaikkannya adalah keputusan arsitektur, bukan pemeliharaan: setiap kenaikan
 * berarti ada satu permukaan lagi yang datanya berpindah ke peramban. Naikkan
 * hanya bersama satu baris baru di `KLIEN_TERSAHKAN` dan alasan di pesan commit.
 */
/*
 * 151 sejak #186 (2026-08-05): `money.tsx` naik jadi modul client karena warna
 * nominal kini dibaca dari token AntD lewat `theme.useToken()` — hook, jadi ia
 * tidak bisa lagi dirender di server. Kenaikan ini disengaja dan terbatas pada
 * SATU daun: halaman yang memakainya tetap server component, dan `table.tsx`
 * sengaja tetap netral (lihat komentar kepala berkas itu).
 *
 * 152 sejak #189 (2026-08-05): `pagination.tsx`. Primitif tabel dipecah dua —
 * `static-table.tsx` (server) dan `data-table.tsx` (client, AntD `Table`) —
 * dan pemecahan itu sengaja dipilih JUSTRU supaya angka ini tidak melonjak:
 * `table.tsx` tetap netral, `static-table.tsx` tetap server, dan 46 halaman
 * yang merender tabel dari Prisma tetap server component. Satu-satunya
 * kenaikan adalah kendali paginasi, yang kini memakai AntD `Pagination`.
 *
 * Yang menyeberang di situ adalah KENDALInya, bukan datanya: empat angka
 * (halaman ke berapa, dari berapa, jalur dasar, query yang dipertahankan).
 * Butir-butirnya tetap `<Link href>` sungguhan lewat `itemRender`, jadi URL
 * per halaman, klik tengah, dan prefetch tidak ikut hilang — lihat komentar
 * kepala `components/ui/pagination.tsx`.
 *
 * 155 sejak #187 + #188 (2026-08-05), dua issue yang mendarat bersamaan.
 *
 * #188 menaikkan SATU: `textarea.tsx`. Tujuh primitif isian ditulis ulang di
 * atas AntD, dan enam di antaranya sudah modul client sebelumnya (`input`,
 * `select`, `password-input`, `searchable-select`, `server-searchable-select`,
 * `command`) — jadi permukaan isian terbesar aplikasi ini, 69 + 39 berkas
 * pemanggil, hanya menambah satu. `textarea.tsx` menyeberang karena ia dulu
 * `<textarea>` + kelas Tailwind, tanpa hook.
 *
 * #187 menaikkan TIGA dan menurunkan SATU: `button.tsx`, `badge.tsx`, dan
 * `progress.tsx` kini merender komponen AntD; `label.tsx` justru turun —
 * melepas Radix membuatnya kembali `<label>` biasa, modul netral yang boleh
 * dirender di server.
 *
 * Perhatikan bentuk kenaikannya, karena itulah taruhan seluruh migrasi ini:
 * `button.tsx` dipakai 128 berkas dan `badge.tsx` 52, tetapi tidak SATU pun di
 * antaranya ikut menyeberang. Batasnya berhenti di primitif; halaman yang
 * membaca buku besar lewat Prisma tetap server component dan merender tombol,
 * label status, serta isiannya sebagai DAUN. Angka server component tidak
 * bergerak: 152 + 1 (#188) + 3 − 1 (#187) = 155.
 *
 * 158 sejak #191 (2026-08-06): tata letak & navigasi. Naik EMPAT
 * (`card.tsx`, `page-header.tsx`, `empty-state.tsx`, `quota-meter.tsx`) dan
 * turun SATU (`collapsible.tsx` dihapus — `DisclosureSection` kini memakai
 * `Collapse` AntD, jadi re-ekspor Radix itu tidak punya pemakai lagi).
 * `breadcrumb.tsx` juga hilang, tapi ia server component sehingga tidak pernah
 * ada di daftar ini: isinya larut ke `page-header.tsx` bersama tipenya.
 *
 * Empat kenaikan itu adalah pemakai primitif TERBANYAK di aplikasi ini —
 * `card.tsx` 107 berkas, `page-header.tsx` 87 — dan justru itu yang perlu
 * diperiksa di diff: yang menyeberang adalah KEEMPAT primitifnya, bukan satu
 * pun dari 194 berkas pemanggilnya. Halaman yang membaca buku besar lewat
 * Prisma tetap server component dan merender kartu serta kepala halamannya
 * sebagai DAUN; `StaticTable` (#189) tetap server dan hanya keadaan KOSONG-nya
 * (`EmptyState`) yang kini client.
 *
 * 159 sejak #194 (2026-08-06, fase C2 — `components/shared`). Naik SATU:
 * `components/shared/document-chain-timeline.tsx`. Yang memindahkannya bukan
 * interaktivitas — komponen itu tetap tanpa satu pun penangan kejadian —
 * melainkan WARNA: cincin tahapnya memakai pasangan token AntD
 * (`colorSuccessBg` + `colorMoneyPositive`), dan token AntD hanya bisa dibaca
 * lewat `theme.useToken()`, sebuah hook.
 *
 * Jalan tanpa hook sudah dicoba dan gagal terukur: `ConfigProvider` v6 memang
 * menulis setiap token sebagai variabel CSS, tetapi ia memasangnya pada elemen
 * ber-kelas `css-var-root` yang digambar komponen AntD sendiri — BUKAN pada
 * `:root`. Di halaman kontrak tidak ada satu pun komponen AntD di ATAS
 * komponen ini, jadi `var(--ant-color-success-bg)` tidak pernah teratasi dan
 * warnanya jatuh diam-diam ke warisan. Kalau `AntdProvider` kelak memberi
 * `cssVar` sebuah kunci yang dipasang di `<html>`, kenaikan ini bisa dibalik.
 *
 * Ongkosnya sempit dan disebutkan supaya bisa ditimbang: komponen ini dirender
 * SEKALI per halaman rincian kontrak, dengan empat tahap; propnya data biasa
 * yang halamannya sudah hitung, dan halaman kontraknya sendiri tetap server
 * component.
 *
 * Yang TIDAK ikut, dan itu bagian penting dari diff ini: `aging.tsx` dan
 * `variance-badge.tsx` tetap server component meski ikut dikonversi di issue
 * yang sama. `aging.tsx` tidak boleh menyeberang sama sekali — ia mengimpor
 * `AGING_BUCKETS` dari `lib/receivables.ts`, yang menarik Prisma.
 *
 * 158 sejak #227 (2026-08-06) — **angka ini TURUN untuk pertama kalinya sejak
 * epik #206 dimulai**, dan itu bukan kebetulan melainkan hasil yang dikejar.
 * `components/shared/document-chain-timeline.tsx` kembali menjadi server
 * component: satu-satunya alasannya menyeberang di #194 adalah warna, dan #227
 * menghapus alasan itu.
 *
 * Yang berubah bukan komponennya melainkan LAPISAN TEMANYA: `AntdProvider`
 * memberi `cssVar` sebuah kunci tetap (`ANTD_CSS_VAR_KEY`) dan root layout
 * memasang kunci itu di `<html>`, jadi blok `.sai-tokens{--ant-…}` yang selama
 * ini sudah ikut di HTML pertama — `extractStyle` memang mengeluarkannya,
 * berlawanan dengan catatan #194 — akhirnya punya pemikul yang diwarisi
 * SELURUH dokumen, bukan hanya pohon di bawah sebuah komponen AntD. Server
 * component karena itu boleh menulis `var(--ant-color-success-bg)` biasa.
 *
 * Ukur ulangnya ada di `tests/antd-css-var-ssr.test.tsx`, yang membuktikannya
 * dari string SSR — bukan dari layar, karena kedipan warna justru tidak
 * terlihat kalau kotaknya kecil dan cepat.
 *
 * 157 saat penanda langkah disatukan dan wisaya penyiapan pindah ke kulit panel
 * — angka ini TURUN dua, dan itu hasil yang dikejar. `components/setup/
 * setup-shell.tsx` DIHAPUS (wisaya memakai `PlatformShell`, kulit yang sama
 * dengan panel akun) dan `app/(setup)/layout.tsx` kembali menjadi SERVER
 * component: ia kini menyusun menu dari matriks izin lewat
 * `requireTenantPagePermission`, pekerjaan yang memang milik server. Yang naik
 * satu hanyalah komponen penanda langkah bersama.
 *
 * 159 saat kerangka fokus wisaya DIKEMBALIKAN (#352, membalik sebagian #341).
 * `components/setup/setup-shell.tsx` hidup lagi sebagai komponen klien — ia
 * membaca sesi untuk menu penggunanya — jadi angkanya naik satu. Yang TIDAK
 * ikut naik: `app/(setup)/layout.tsx` tetap SERVER component. Versi lamanya
 * memikul `"use client"`; itu tidak pernah perlu, sebab provider dan kulitnya
 * masing-masing sudah menjadi batas kliennya sendiri. Menaikkan ambang ini
 * karena sebuah KERANGKA kembali adalah harga yang disengaja; menaikkannya
 * karena sebuah HALAMAN merayap ke klien tidak pernah.
 *
 * Catatan penanda langkah: `components/ui/wizard-steps.tsx` lahir
 * sebagai client component. Naiknya satu, dan yang dibeli dengan satu itu
 * adalah DUA penanda langkah tulisan tangan yang lenyap — deretan kartu di
 * `components/shared/wizard.tsx` dan deretan pil di wisaya penyiapan, keduanya
 * sudah client sejak semula. Jadi jumlah modulnya +1 sementara jumlah KOSAKATA
 * penanda langkah 2 → 1; tidak ada satu pun berkas yang menyeberangi batas RSC
 * karena perubahan ini.
 */
const AMBANG_KLIEN = 160;

/**
 * Daftar modul yang SAH memikul `"use client"` per 2026-08-05.
 *
 * Perhatikan bentuknya — ini yang membuat migrasi AntD tetap murah:
 *  • `components/ui/*` — primitif; di sinilah batas client seharusnya menumpuk,
 *    dan di sinilah AntD boleh diimpor;
 *  • `*-form.tsx`, `*-client.tsx`, `*-actions.tsx` — pulau interaktif yang
 *    dirender server component sebagai daun;
 *  • halaman di bawah `app/(auth)` — tujuh halaman auth, satu-satunya HALAMAN
 *    client di aplikasi ini (formulir murni, tanpa pembacaan buku besar).
 *
 * Yang TIDAK ada di sini, dan tidak boleh muncul, adalah halaman laporan,
 * halaman daftar, dan halaman detail. Kalau salah satunya muncul di diff,
 * pertanyaannya bukan "boleh tidak" melainkan "kenapa datanya perlu di
 * peramban".
 */
const KLIEN_TERSAHKAN = [
  "app/(auth)/accept-invitation/page.tsx",
  "app/(auth)/change-password/page.tsx",
  "app/(auth)/forgot-password/page.tsx",
  "app/(auth)/layout.tsx",
  "app/(auth)/login/page.tsx",
  "app/(auth)/register/page.tsx",
  "app/(auth)/reset-password/page.tsx",
  "app/(auth)/select-company/company-choices.tsx",
  "app/(auth)/unlock/unlock-form.tsx",
  "app/(auth)/verify-email/page.tsx",
  "app/(dashboard)/error.tsx",
  "app/(dashboard)/layout.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/accounts/[id]/edit/account-edit-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/accounts/import/import-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/accounts/new/account-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/advances/new/advance-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/approvals/approval-queue-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/approvals/rules/approval-rules-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/budget/accounts/budget-accounts-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/budget/targets/sales-target-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/consignees/[id]/edit/consignee-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/consignees/new/consignee-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/[id]/edit/contract-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/[id]/payment-section.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/[id]/pdf-buttons.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/contracts/new/contract-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/cost-centers/cost-center-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/customers/[id]/edit/customer-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/customers/new/customer-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/[id]/pdf-button.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/new/delivery-order-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/documents/document-preview-button.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/documents/upload/upload-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/finance/finance-actions.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/finance/new/transaction-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/[id]/asset-actions.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/categories/category-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/new/asset-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/fixed-assets/run-depreciation.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/glossary/glossary-browser.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/inventory-actions.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/opname/opname-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/inventory/update/stock-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices/[id]/advance-section.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices/[id]/edit/invoice-edit-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices/[id]/payment-section.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices/[id]/pdf-button.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/invoices/new/invoice-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/journal/[id]/reverse-button.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/journal/new/journal-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/ledger/ledger-filter.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/periods/period-manager.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/permissions/permissions-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/permissions/role-manager.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/purchases/new/purchase-wizard.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/reconciliation/[id]/reconciliation-workspace.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/reconciliation/new/reconciliation-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/reports/report-filters.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/returns/new/return-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/returns/pdf-button.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/sales/new/sales-wizard.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/settings/settings-client.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/[id]/advance-panel.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/[id]/allocation-editor.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/[id]/edit/supplier-edit-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/[id]/transaction-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/suppliers/new/supplier-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/tax/efaktur/seller-identity-form.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/users/user-permissions-panel.tsx",
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/users/users-client.tsx",
  "app/(operator)/operator/login/login-form.tsx",
  "app/(setup)/t/[tenantSlug]/[companySlug]/setup/setup-wizard.tsx",
  "app/(tenant)/(panel)/companies/new/company-form.tsx",
  "app/(tenant)/(panel)/companies/new/provision-progress.tsx",
  "app/(tenant)/(panel)/platform/billing-actions.tsx",
  "app/(tenant)/(panel)/platform/billing/plans/plan-actions.tsx",
  "app/(tenant)/(panel)/platform/error.tsx",
  "app/(tenant)/(panel)/platform/privacy-section.tsx",
  "app/(tenant)/layout.tsx",
  "components/auth/auth-shell.tsx",
  "components/auth/signed-in-as.tsx",
  "components/dashboard/dashboard-export-actions.tsx",
  "components/help/guided-tour.tsx",
  "components/layout/accountant-mode-toggle.tsx",
  "components/layout/approval-badge.tsx",
  "components/layout/command-palette.tsx",
  "components/layout/company-indicator.tsx",
  "components/layout/company-session-sync.tsx",
  "components/layout/help-menu.tsx",
  "components/layout/navbar.tsx",
  "components/layout/sidebar.tsx",
  "components/layout/user-menu.tsx",
  "components/operator/mail-settings-form.tsx",
  "components/operator/operator-nav.tsx",
  "components/operator/tenant-actions.tsx",
  "components/providers/antd-provider.tsx",
  "components/reports/report-launch-dialog.tsx",
  "components/settings/audit-log-panel.tsx",
  "components/settings/module-picker.tsx",
  "components/settings/module-settings-panel.tsx",
  // Pulau client kecil: satu tombol + dialog konfirmasi + `router.refresh()`.
  // Halaman Pengaturan yang memanggilnya tetap server component; angkanya
  // dihitung di sana dan diturunkan sebagai prop.
  "components/settings/sample-data-panel.tsx",
  "components/setup/setup-shell.tsx",
  "components/shared/advance-compensation.tsx",
  "components/shared/consignee-select.tsx",
  "components/shared/cost-center-field.tsx",
  "components/shared/currency-rate-fields.tsx",
  "components/shared/dashboard-charts.tsx",
  "components/shared/delete-document-button.tsx",
  "components/shared/document-preview.tsx",
  "components/shared/due-date-field.tsx",
  "components/shared/invoice-fx-fields.tsx",
  "components/shared/ledger-filter.tsx",
  "components/shared/payment-form.tsx",
  "components/shared/pdf-document-button.tsx",
  "components/shared/pdf-export-buttons.tsx",
  "components/shared/period-picker.tsx",
  "components/shared/status-badge.tsx",
  "components/shared/stock-period-filter.tsx",
  "components/shared/use-wizard-draft.ts",
  "components/shared/wizard-partner-step.tsx",
  "components/shared/wizard.tsx",
  "components/tenant/platform-shell.tsx",
  "components/ui/alert-dialog.tsx",
  "components/ui/app-link.tsx",
  "components/ui/badge.tsx",
  "components/ui/button.tsx",
  "components/ui/card.tsx",
  "components/ui/checkbox.tsx",
  "components/ui/command.tsx",
  "components/ui/confirm-dialog.tsx",
  "components/ui/data-table.tsx",
  "components/ui/dialog.tsx",
  "components/ui/disclosure-section.tsx",
  "components/ui/empty-state.tsx",
  "components/ui/form.tsx",
  "components/ui/input.tsx",
  "components/ui/learn-more.tsx",
  "components/ui/loading.tsx",
  "components/ui/locale-toggle.tsx",
  "components/ui/money-input.tsx",
  "components/ui/money.tsx",
  "components/ui/page-header.tsx",
  "components/ui/pagination.tsx",
  "components/ui/password-input.tsx",
  "components/ui/popover.tsx",
  "components/ui/progress.tsx",
  "components/ui/quota-meter.tsx",
  "components/ui/searchable-select.tsx",
  "components/ui/select.tsx",
  "components/ui/server-searchable-select.tsx",
  "components/ui/term-tooltip.tsx",
  "components/ui/textarea.tsx",
  "components/ui/theme-toggle.tsx",
  "components/ui/toast.tsx",
  "components/ui/wizard-steps.tsx",
  "lib/company-identity-client.tsx",
  "lib/i18n/client.tsx",
  "lib/report-files.ts",
  "lib/theme/client.tsx",
  "lib/use-effective-permissions.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    // Klien Prisma hasil `prisma generate` — ribuan berkas, bukan kode kita,
    // dan tidak ada di git. Memindainya hanya memperlambat tes.
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = new Map<string, string>(
  sourceFiles(SRC).map((f) => [f, readFileSync(f, "utf8")])
);

/**
 * Direktif hanya berlaku bila ia PERNYATAAN PERTAMA berkas — komentar dan baris
 * kosong boleh mendahuluinya, kode tidak.
 *
 * Sengaja tidak memakai "cek 200 karakter pertama" seperti penjaga tetangganya
 * (`server-only-boundary.test.ts`): berkas paling ekstrem di repo ini,
 * `components/ui/table.tsx`, menaruh direktifnya di offset 177 — 23 karakter
 * dari ambang itu. Satu kalimat tambahan di komentar kepalanya akan membuat
 * berkas client berubah "menghilang" dari penjaga tanpa ada yang gagal.
 */
function stripLeadingComments(code: string): string {
  let i = 0;
  for (;;) {
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code.startsWith("//", i)) {
      const end = code.indexOf("\n", i);
      if (end === -1) return "";
      i = end + 1;
    } else if (code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i);
      if (end === -1) return "";
      i = end + 2;
    } else {
      return code.slice(i);
    }
  }
}

const isClient = (code: string) => /^["']use client["']/.test(stripLeadingComments(code));

const rel = (p: string) => p.slice(SRC.length + 1).split("\\").join("/");

const clientFiles = [...files]
  .filter(([, code]) => isClient(code))
  .map(([file]) => rel(file))
  .sort();

describe("batas RSC — 141 server component tetap server", () => {
  it("memindai pohon sumber yang benar", () => {
    // Kalau pemindainya rusak (jalur salah, filter kelewat rakus), semua tes di
    // bawah lulus dengan daftar kosong. Ini yang menahan kegagalan diam itu.
    expect(files.size).toBeGreaterThan(400);
    expect(clientFiles.length).toBeGreaterThan(100);
  });

  it("jumlah modul client tidak melewati ambang 2026-08-05", () => {
    expect(
      clientFiles.length,
      `Jumlah modul "use client" naik menjadi ${clientFiles.length}, melewati ambang ${AMBANG_KLIEN} ` +
        "(terukur 2026-08-05, setelah fondasi AntD #184).\n\n" +
        "Migrasi Ant Design TIDAK boleh menaikkan angka ini. Komponen AntD memang " +
        "komponen client, tapi yang memikul batasnya adalah PRIMITIF di " +
        "src/components/ui — halaman pemanggilnya tetap server component dan " +
        "merender primitif itu sebagai daun. Kalau sebuah halaman terasa 'harus' " +
        "jadi client, biasanya yang dibutuhkan hanya satu pulau client kecil " +
        "(satu tombol, satu filter), bukan seluruh halaman.\n\n" +
        "Kalau kenaikannya memang disengaja: tambahkan berkasnya ke " +
        "KLIEN_TERSAHKAN, naikkan AMBANG_KLIEN, dan tulis alasannya di pesan commit."
    ).toBeLessThanOrEqual(AMBANG_KLIEN);
  });

  it("tidak ada modul client baru di luar daftar yang disahkan", () => {
    const disahkan = new Set(KLIEN_TERSAHKAN);
    const baru = clientFiles.filter((f) => !disahkan.has(f));

    expect(
      baru,
      baru.length === 0
        ? ""
        : 'Modul berikut memikul "use client" tapi tidak ada di KLIEN_TERSAHKAN:\n\n  ' +
            baru.join("\n  ") +
            "\n\nKalau ini pulau client yang memang disengaja (formulir, filter, " +
            "tombol ekspor), tambahkan barisnya ke daftar dan naikkan AMBANG_KLIEN.\n" +
            "Kalau ini HALAMAN atau LAYOUT, berhenti dulu: pertanyaannya bukan " +
            "'boleh tidak' melainkan 'kenapa data buku besarnya perlu ada di " +
            "peramban'. Halaman yang jadi client kehilangan pengambilan data di " +
            "server — Prisma tidak bisa dipanggil dari sana, jadi datanya harus " +
            "lewat endpoint JSON dan seluruh isinya menyeberang ke pengguna."
    ).toEqual([]);
  });

  it("daftar yang disahkan tidak menyimpan berkas yang sudah bukan client", () => {
    const aktual = new Set(clientFiles);
    const basi = KLIEN_TERSAHKAN.filter((f) => !aktual.has(f));

    expect(
      basi,
      basi.length === 0
        ? ""
        : "KLIEN_TERSAHKAN masih menyebut berkas yang sudah tidak lagi client " +
            "(atau sudah dipindah/dihapus):\n\n  " +
            basi.join("\n  ") +
            "\n\nKalau ini hasil migrasi yang menarik batas client kembali ke " +
            "primitif — bagus, itu memang tujuannya. Hapus barisnya dari daftar " +
            "dan turunkan AMBANG_KLIEN, supaya penjaga ini terus mengunci angka " +
            "yang baru, bukan angka lama yang sudah longgar."
    ).toEqual([]);
  });

  it("daftar yang disahkan terurut dan tanpa duplikat", () => {
    // Daftar sepanjang ini hanya bisa ditinjau kalau urutannya bisa ditebak;
    // penyisipan acak membuat diff-nya berpindah-pindah dan konflik merge-nya
    // tidak bisa dibaca.
    const terurut = [...KLIEN_TERSAHKAN].sort();
    expect(KLIEN_TERSAHKAN, "KLIEN_TERSAHKAN harus urut abjad").toEqual(terurut);
    expect(
      new Set(KLIEN_TERSAHKAN).size,
      "ada baris ganda di KLIEN_TERSAHKAN"
    ).toBe(KLIEN_TERSAHKAN.length);
  });
});

/**
 * `import type { … } from "antd"` sengaja DIIZINKAN di server component: impor
 * tipe dihapus saat kompilasi, jadi ia tidak pernah menjadi impor runtime dan
 * tidak bisa menyeret apa pun ke bundel. Server component yang menyebut tipe
 * `ColumnsType` untuk mendeklarasikan bentuk prop adalah pola yang sah.
 */
const IMPOR_RUNTIME = /^\s*import\s+(?!type\s)(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;

const dariAntd = (spec: string) => spec === "antd" || spec.startsWith("antd/");

describe("komponen AntD hanya dirender dari modul client", () => {
  it("tidak ada impor runtime `antd` di berkas tanpa `use client`", () => {
    const pelanggar: string[] = [];
    for (const [file, code] of files) {
      if (isClient(code)) continue;
      const spesifier = [...code.matchAll(IMPOR_RUNTIME)]
        .map((m) => m[1])
        .filter(dariAntd);
      if (spesifier.length > 0) {
        pelanggar.push(`${rel(file)} — ${[...new Set(spesifier)].join(", ")}`);
      }
    }

    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Modul berikut mengimpor Ant Design tanpa `\"use client\"` di kepalanya:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nDua jalan keluar, dan HANYA satu yang benar untuk halaman:\n" +
            "  • Bungkus komponen AntD-nya di sebuah primitif " +
            "src/components/ui yang berawalan `\"use client\"`, lalu render " +
            "primitif itu dari server component. Halaman tetap server, data tetap " +
            "diambil lewat Prisma.\n" +
            "  • Menambahkan `\"use client\"` di halaman itu sendiri — JANGAN, " +
            "kecuali sudah dibahas: halaman itu kehilangan akses Prisma dan " +
            "seluruh datanya harus menyeberang lewat JSON.\n\n" +
            "Catatan: paket `antd` v6 memang menandai berkasnya sendiri dengan " +
            "`\"use client\"`, jadi impor semacam ini BISA lolos `next build` " +
            "tanpa galat. Justru itu alasan penjaga ini ada — kesalahannya baru " +
            "muncul saat prop fungsi (`render`, `onFilter`, `sorter` pada kolom " +
            "Table) dikirim menyeberangi batas, dan itu galat runtime di halaman " +
            "produksi, bukan galat build."
    ).toEqual([]);
  });

  it("setiap primitif yang membungkus AntD memikul `use client`", () => {
    // Sisi sebaliknya dari aturan yang sama, dinyatakan pada lapisan tempat AntD
    // memang boleh hidup: kalau primitifnya sendiri lupa direktifnya, seluruh
    // pemanggil di atasnya ikut tertarik ke client satu per satu.
    const primitifAntd = [...files]
      .filter(([file, code]) => {
        if (!rel(file).startsWith("components/ui/")) return false;
        return [...code.matchAll(IMPOR_RUNTIME)].some((m) => dariAntd(m[1]));
      })
      .map(([file, code]) => ({ file: rel(file), client: isClient(code) }));

    const tanpaDirektif = primitifAntd.filter((p) => !p.client).map((p) => p.file);
    expect(
      tanpaDirektif,
      "Primitif di src/components/ui membungkus komponen AntD tapi tidak " +
        'berawalan `"use client"`. Batas client harus BERHENTI di lapisan ' +
        "primitif; kalau ia bocor ke atas, 220 berkas pemanggil yang menanggung.\n\n  " +
        tanpaDirektif.join("\n  ")
    ).toEqual([]);
  });
});
