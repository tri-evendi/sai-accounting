/**
 * `/platform` — PENDARATAN pasca-masuk setiap pelanggan (issue #172).
 *
 * Sebelumnya halaman ini beralamat `/tenant` dan menjaga dirinya dengan
 * `tenant.settings` (OWNER saja). Dua hal berubah, dan keduanya punya alasan
 * yang sama: pelanggan harus melihat KONTEKS AKUNNYA sebelum masuk ke buku.
 *
 *   1. ALAMATNYA. "tenant" adalah kosakata arsitektur; yang dibuka orang di
 *      sini adalah akunnya. Alamat lama dipantulkan 307 oleh `proxy.ts`
 *      (`renamedPagePath`) — bookmark dan tautan di surel yang sudah terkirim
 *      tetap sampai. ⚠ `/api/tenant/*` TIDAK ikut pindah: itu permukaan API
 *      bertingkat tenant (#135) yang namanya memang benar.
 *
 *   2. PENJAGANYA. Menjadikan halaman berpenjaga owner sebagai tujuan
 *      pasca-masuk berarti memantulkan hampir setiap staf pada langkah
 *      pertamanya. Karena itu penjaganya `tenant.home` — izin yang dipegang
 *      SETIAP anggota tenant.
 *
 * ══ SATU HALAMAN PANJANG → EMPAT RUTE ══════════════════════════════════════
 * Sampai audit rute, seluruh permukaan tenant (akun, perusahaan, tim,
 * langganan, privasi) tinggal di SATU halaman, dan menu panel menunjuknya
 * dengan jangkar `#tim`, `#privasi`, …. Dua hal salah di sana:
 *
 *   • jangkar bukan halaman: tidak bisa di-bookmark, tidak masuk riwayat
 *     sebagai tempat, dan tombol Kembali tidak mengembalikan apa pun;
 *   • pemisahan kewenangan bergantung pada `{canX && …}` yang benar di setiap
 *     cabang SATU pohon render. Sebagai rute tersendiri, penjaga di kepala tiap
 *     halaman yang menolak — dan penolakannya adalah PANTULAN, bukan halaman
 *     kosong. Itu batas yang jauh lebih sulit dilanggar tanpa sengaja.
 *
 * Yang tersisa di sini karena itu hanya yang menjawab "saya mendarat di mana":
 * ringkasan kuota, identitas akun, dan perusahaan yang boleh ia buka.
 *
 * ══ DAFTAR PERUSAHAAN = KEANGGOTAANNYA SENDIRI, BUKAN ISI TENANT ═══════════
 * `companiesForUser()` membaca `memberships` milik PEMANGGIL. Membacanya dari
 * daftar perusahaan milik TENANT akan membocorkan keberadaan PT lain kepada,
 * misalnya, seorang kepala gudang di salah satu PT — ia tidak berhak tahu
 * pemilik akunnya memegang badan hukum lain.
 *
 * Grup `(tenant)` dengan sengaja: halaman ini harus terbuka TANPA perusahaan
 * aktif — pelanggan baru yang belum punya satu pun PT, dan pemilik yang
 * seluruh PT-nya sedang hanya-baca, justru pemakai terpentingnya.
 *
 * ══ SATU SUMBER WARNA (issue #203) ═════════════════════════════════════════
 * Server component: tanpa `antd`, tanpa `theme.useToken()`. Dulu berkas ini
 * memakai DUA sumber — token AntD di dalam `Card`, token `:root` aplikasi untuk
 * pita "hanya-baca" yang berdiri sendiri di atas kartu pertama — karena
 * variabel `--ant-…` dikira hanya teratasi di dalam komponen AntD. Sejak #227
 * itu tidak berlaku lagi: kelas `ANTD_CSS_VAR_KEY` dipikul `<html>` oleh root
 * layout, jadi variabelnya teratasi di dalam maupun di luar `Card`. Seluruh
 * berkas kini satu sumber, token AntD — dan memang harus, sebab #203 mencabut
 * token `:root` itu dari `globals.css`. Kartu angkanya (`StatCard`,
 * `QuotaMeter`) mewarnai dirinya sendiri.
 *
 * ══ NADA WILAYAH (issue #303) ══════════════════════════════════════════════
 * Kepala kartu & kotak ikon memakai nada `components/tenant/platform-tone.ts` —
 * bidang opak yang dideklarasikan `PlatformShell` di dalam `[data-platform]`.
 * Yang TIDAK ikut bernada, dan itu keputusan bukan kelalaian:
 *
 *   • **baris ringkasan** (`StatCard`, `QuotaMeter`) — isinya uang dan status
 *     langganan. Warnanya sudah bahasa (`tone="warning"` untuk hanya-baca,
 *     `success` untuk aktif); nada dekoratif di sekitarnya akan bersaing
 *     dengan satu-satunya warna di halaman ini yang berarti sesuatu;
 *   • **pita penangguhan** `READ_ONLY_NOTE` — `colorWarningBg` +
 *     `colorMoneyPending`, dan keduanya pernyataan tentang keadaan akun.
 *
 * Aturannya satu kalimat: di halaman yang menampilkan uang, hue yang sudah
 * punya arti tidak pernah dipakai ulang sebagai hiasan (#186/#187).
 */
import { PlusOutlined, ShopOutlined, WarningOutlined } from "@ant-design/icons";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  platformChip,
  platformGlyph,
  platformHead,
  type PlatformHue,
} from "@/components/tenant/platform-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QuotaMeter } from "@/components/ui/quota-meter";
import { formatMoney } from "@/lib/money-format";
import { formatDateMedium } from "@/lib/utils";
import { platformInvoiceAmounts } from "@/lib/subscription-lifecycle";
import { companiesForUser } from "@/lib/company-registry";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { isReadOnlyTenantStatus } from "@/lib/subscription-lifecycle";
import { tenantCan } from "@/lib/tenant-authz";
import { requireTenantPagePermission } from "@/lib/tenant-guard";
import { tenantPath } from "@/lib/tenant-routes";

export const dynamic = "force-dynamic";

/** Pita penangguhan — DI LUAR `Card`, tapi tetap token AntD (lihat kepala). */
const READ_ONLY_NOTE: React.CSSProperties = {
  display: "flex",
  gap: 12,
  padding: 16,
  borderRadius: 8,
  border: "1px solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
  color: "var(--ant-color-money-pending)",
};

/**
 * Baris ringkasan yang membagi lebarnya sendiri — pengganti
 * `grid-cols-2 lg:grid-cols-3`. Satu kolom di 375px, dan itu perbaikan yang
 * disengaja: dua kartu berdampingan di 375px menyisakan ±115px untuk sebuah
 * nilai, terlalu sempit bagi kata status maupun untaian nominal.
 */
const SUMMARY_GRID: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
};

/** Kisi kartu perusahaan — bekas `sm:grid-cols-2 xl:grid-cols-3`. */
const COMPANY_GRID: React.CSSProperties = {
  listStyle: "none",
  display: "grid",
  gap: 12,
  margin: 0,
  padding: 0,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
};

/* ── Gaya DI DALAM `Card` — token AntD lewat variabel CSS ───────────────── */

const CARD_HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const CARD_BODY: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

const TRUNCATE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * Kotak ikon — bekas `h-9 w-9` / `h-10 w-10`, kini BERNADA (#303).
 *
 * Latarnya dulu `colorFillQuaternary`: warna translusen 2–4% yang, digambar di
 * atas kartu, praktis tidak ada di layar — persis keluhan yang melahirkan
 * issue #266. `platformChip` opak (32% hue di atas `colorBgContainer`) dan
 * glifnya anak tangga -8 sehue, pasangan yang bergerak SEARAH saat tema
 * berbalik: terukur 4,83–7,69:1, jauh di atas ambang ikon 3:1.
 *
 * Hue-nya WILAYAH, bukan baris: setiap kartu perusahaan memakai nada yang
 * sama. Nada yang berputar per baris akan menjanjikan pengelompokan yang tidak
 * ada di data mana pun.
 */
function iconBox(size: number, hue: PlatformHue): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: "var(--ant-border-radius)",
    background: platformChip(hue),
    color: platformGlyph(hue),
  };
}

/**
 * Kepala kartu bernada — 16%, dan kadar itu diikat tombol GARIS.
 *
 * Kepala kartu "Perusahaan" memikul `<Button variant="outline">`, yang
 * dikenali dari TEPINYA (`colorBorder`, ambang 3:1 sebagai grafis non-teks).
 * Pada 16% tepi itu 3,05–3,22:1 di tema terang; pada 18% violet sudah 2,94:1.
 * Lihat `components/tenant/platform-tone.ts`.
 *
 * ⚠ Radius atas wajib: kepala adalah anak pertama `.ant-card`, dan `.ant-card`
 * tidak memasang `overflow: hidden`.
 */
function cardHead(hue: PlatformHue): React.CSSProperties {
  return {
    background: platformHead(hue),
    borderTopLeftRadius: "var(--ant-border-radius-lg)",
    borderTopRightRadius: "var(--ant-border-radius-lg)",
  };
}

export default async function PlatformPage() {
  const { user, tenant } = await requireTenantPagePermission("tenant.home");
  const t = await getT();

  const companies = await companiesForUser(Number.parseInt(user.id, 10));

  const canCreate = tenantCan(tenant, "company.create");
  const canSeeBilling = tenantCan(tenant, "tenant.billing");

  /* Status hanya-baca ditampilkan kepada SEMUA anggota: seorang staf yang
   * tombol simpannya ditolak berhak tahu alasannya. Ini keadaan operasional,
   * bukan rincian langganan — tidak ada paket, harga, atau kuota di sini. */
  const readOnly = isReadOnlyTenantStatus(tenant.tenantStatus);

  /* Kuota DIBACA di dalam cabang izinnya: bagi yang tidak berhak, query ke
   * basis data kendali & platform tidak pernah berjalan sama sekali. */
  const overview = canSeeBilling ? await billingOverviewForTenant(tenant.tenantId) : null;

  /* ── Dua pertanyaan uang yang selama ini hanya bisa dijawab dengan menggulung
   * ke tabel tagihan dan menghitung sendiri: "kapan & berapa berikutnya" dan
   * "apakah saya sedang menunggak". Keduanya dihitung DI SINI dari data yang
   * memang sudah diambil — tidak ada query tambahan.
   *
   * Nominalnya lewat `platformInvoiceAmounts` yang SAMA dengan yang
   * menerbitkan tagihan: harga paket telanjang akan menyebut angka yang tidak
   * akan pernah sama dengan yang tertagih. */
  const subscription = overview?.billing?.subscription ?? null;
  const nextCharge =
    subscription && subscription.status !== "cancelled"
      ? formatMoney(
          Number(
            platformInvoiceAmounts(subscription.price, process.env.PLATFORM_PPN_DISABLED !== "true")
              .total
          ),
          subscription.currency
        )
      : null;

  /* `issued` = sudah terbit dan BELUM lunas (draft belum ditagihkan, void
   * dibatalkan, paid selesai). Menjumlahkan status lain akan menakut-nakuti
   * dengan angka yang tidak ditagihkan kepada siapa pun. */
  const unpaid = (overview?.billing?.invoices ?? []).filter((inv) => inv.status === "issued");

  /* ⚠ DIJUMLAHKAN PER MATA UANG, bukan satu `reduce` datar.
   *
   * Versi sebelumnya menjumlahkan `Number(inv.total)` seluruh tagihan terbuka
   * lalu memberi hasilnya mata uang `unpaid[0].currency`. Selama semua tagihan
   * ber-IDR angkanya kebetulan benar; pada tenant yang satu tagihannya
   * berdenominasi USD, 100 dolar ikut ditambahkan sebagai 100 rupiah dan
   * seluruh kartu berbohong — tanpa satu pun tanda di layar bahwa ada yang
   * dicampur. Menjumlahkan mata uang berbeda menuntut kurs, dan halaman ini
   * tidak punya (juga tidak boleh mengarangnya): jadi yang ditampilkan adalah
   * SETIAP mata uang apa adanya, dipisah titik-tengah. */
  const unpaidByCurrency = new Map<string, number>();
  for (const inv of unpaid) {
    unpaidByCurrency.set(
      inv.currency,
      (unpaidByCurrency.get(inv.currency) ?? 0) + Number(inv.total)
    );
  }
  const unpaidTotalLabel = Array.from(unpaidByCurrency.entries())
    .map(([currency, total]) => formatMoney(total, currency))
    .join(" · ");

  return (
    <>
      <PageHeader title={t("platform.title")} description={t("platform.description")} />

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Penangguhan langganan — ikon + kata, bukan warna saja (MASTER.md
            §Anti-Patterns). Batasnya `warning`, bukan `border`: bidang
            berstatus yang bertepi netral terbaca sebagai kotak biasa yang
            kebetulan kuning. */}
        {readOnly && (
          <div role="status" style={READ_ONLY_NOTE}>
            <WarningOutlined aria-hidden="true" style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.625 }}>
              {t("tenantSettings.readOnlyNote")}
            </p>
          </div>
        )}

        {/* Baris ringkasan. Untuk pemilik ia adalah PEMAKAIAN vs kuota — angka
            yang paling sering dicari dan dulu terkubur di tengah gulungan;
            untuk anggota biasa cukup satu kartu, sebab kuota bukan urusannya
            (dan datanya memang tidak pernah dibaca untuknya). */}
        <section aria-labelledby={canSeeBilling && overview ? "ringkasan" : undefined}>
          {canSeeBilling && overview && (
            <h2
              id="ringkasan"
              style={{
                margin: "0 0 12px",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--ant-color-text)",
              }}
            >
              {t("tenantSettings.usageHeading")}
            </h2>
          )}
          <div style={SUMMARY_GRID}>
            {canSeeBilling && overview ? (
              <>
                {/* METER, bukan angka telanjang. "2 / 3" benar dan tidak
                    menjawab pertanyaan yang sebenarnya dibawa pemilik akun ke
                    sini: seberapa dekat saya dengan mentok. Bentuknya dipilih
                    dari heuristik — satu rasio terhadap sebuah BATAS adalah
                    meter. Keparahannya juga berupa kata, bukan rona saja. */}
                <QuotaMeter
                  label={t("tenantSettings.usageCompanies")}
                  used={overview.usage.companies}
                  max={overview.tenant.maxCompanies}
                  valueLabel={t("tenantSettings.usageOf", {
                    used: overview.usage.companies,
                    max: overview.tenant.maxCompanies,
                  })}
                  stateLabel={
                    overview.usage.companies >= overview.tenant.maxCompanies
                      ? t("tenantSettings.quotaFull")
                      : t("tenantSettings.quotaNearlyFull")
                  }
                />
                <QuotaMeter
                  label={t("tenantSettings.usageUsers")}
                  used={overview.usage.users}
                  max={overview.tenant.maxUsers}
                  valueLabel={t("tenantSettings.usageOf", {
                    used: overview.usage.users,
                    max: overview.tenant.maxUsers,
                  })}
                  stateLabel={
                    overview.usage.users >= overview.tenant.maxUsers
                      ? t("tenantSettings.quotaFull")
                      : t("tenantSettings.quotaNearlyFull")
                  }
                />
                {/* Status sebagai KATA, bukan warna saja — dan warnanya
                    mengikuti artinya (ditangguhkan = peringatan). `tone`
                    menggantikan `valueClassName` yang dicabut di #200; `size`
                    menjaga nilainya tetap 18px, sebab ia sebuah kata, bukan
                    angka. */}
                <StatCard
                  title={t("tenantSettings.statusLabel")}
                  value={t(`tenantSettings.status.${overview.tenant.status}` as DictionaryKey)}
                  size="phrase"
                  tone={isReadOnlyTenantStatus(overview.tenant.status) ? "warning" : "success"}
                />
                {/* Kapan & berapa berikutnya — pertanyaan yang dulu hanya bisa
                    dijawab dengan menggulung ke tabel tagihan lalu menghitung
                    PPN-nya sendiri. */}
                {nextCharge && subscription && (
                  <StatCard
                    title={t("tenantSettings.nextChargeLabel")}
                    value={nextCharge}
                    size="phrase"
                    hint={t("tenantSettings.nextChargeOn", {
                      date: formatDateMedium(subscription.currentPeriodEnd),
                    })}
                  />
                )}
                {/* Tunggakan hanya muncul bila MEMANG ada. Kartu "Rp 0" yang
                    selalu menyala mengajari pembacanya mengabaikan tempat itu,
                    dan pada hari angkanya bukan nol ia sudah tak terlihat.
                    Nilainya bisa memuat BEBERAPA mata uang sekaligus — itulah
                    kenapa ukurannya `phrase`, bukan `number`. */}
                {unpaid.length > 0 && (
                  <StatCard
                    title={t("tenantSettings.unpaidLabel")}
                    href="/platform/billing"
                    value={unpaidTotalLabel}
                    size="phrase"
                    tone="warning"
                    hint={t("tenantSettings.unpaidCount", { count: unpaid.length })}
                  />
                )}
              </>
            ) : (
              <StatCard title={t("platform.companiesHeading")} value={companies.length} />
            )}
          </div>
        </section>

        {/* Akun — "saya sedang masuk ke akun siapa". Nama pendeknya juga ada di
            bilah atas; yang tinggal di sini adalah slug teknisnya, yang dipakai
            saat menyebut akun ini kepada dukungan. */}
        <Card>
          {/* `brand` = wilayah "akun & langganan": siapa saya, apa yang saya
              punya. Ketiga hue `/platform` dan pembagiannya di
              `components/tenant/platform-tone.ts`. */}
          <CardHeader style={cardHead("brand")}>
            <h2 style={CARD_HEADING}>{t("platform.tenantHeading")}</h2>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={iconBox(40, "brand")} aria-hidden="true">
                <ShopOutlined style={{ fontSize: 20 }} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    ...TRUNCATE,
                    margin: 0,
                    fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                    color: "var(--ant-color-text)",
                  }}
                >
                  {tenant.tenantName}
                </p>
                <p
                  style={{
                    ...TRUNCATE,
                    margin: 0,
                    fontSize: "var(--ant-font-size-sm)",
                    color: "var(--ant-color-text-secondary)",
                  }}
                >
                  {tenant.tenantSlug}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Perusahaan yang boleh DIA buka — dari keanggotaannya sendiri. */}
        <Card>
          {/* `indigo` = wilayah "perusahaan / buku". Kepala ini MEMIKUL tombol
              garis, jadi kadarnya yang 16% — bukan 32% — yang berlaku di sini:
              yang harus tetap ≥3:1 adalah tepi tombolnya. */}
          <CardHeader
            style={{
              ...cardHead("indigo"),
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2 style={CARD_HEADING}>{t("platform.companiesHeading")}</h2>
              {companies.length > 0 && (
                <p style={{ ...CARD_BODY, marginTop: "var(--ant-margin-xxs)" }}>
                  {t("platform.companiesBody")}
                </p>
              )}
            </div>
            {/* Aksi utama di kepala kartu saat daftarnya berisi; saat kosong ia
                pindah ke dalam empty state, tempat ia menjadi satu-satunya
                langkah berikutnya — bukan tombol kedua yang mengulang. */}
            {canCreate && companies.length > 0 && (
              <Button href="/companies/new" variant="outline" size="sm" style={{ flexShrink: 0 }}>
                <PlusOutlined aria-hidden="true" />
                {t("companies.newTitle")}
              </Button>
            )}
          </CardHeader>

          <CardContent>
            {companies.length === 0 ? (
              /*
               * Nol perusahaan punya DUA arti yang berbeda, dan menjawab
               * keduanya dengan kalimat yang sama akan membuat salah satunya
               * jalan buntu:
               *   • boleh membuat (owner/admin) → yang dibutuhkan adalah tombol;
               *   • tidak boleh (staf)          → yang dibutuhkan adalah alasan
               *     dan langkah berikutnya, bukan layar kosong tanpa penjelasan.
               */
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <EmptyState
                  icon={<ShopOutlined style={{ fontSize: 48 }} />}
                  title={t(
                    canCreate
                      ? "auth.selectCompany.noCompanyYetHeading"
                      : "auth.selectCompany.noAccessHeading"
                  )}
                  description={t(
                    canCreate
                      ? "auth.selectCompany.noCompanyYetBody"
                      : "auth.selectCompany.noAccessBody"
                  )}
                  {...(canCreate
                    ? { actionLabel: t("companies.newTitle"), actionHref: "/companies/new" }
                    : {})}
                />
                <p style={{ ...CARD_BODY, maxWidth: "48ch", margin: "0 auto", textAlign: "center" }}>
                  {t(
                    canCreate
                      ? "auth.selectCompany.noCompanyYetOwner"
                      : "auth.selectCompany.noAccessNext"
                  )}
                </p>
              </div>
            ) : (
              /* Kisi, bukan tumpukan: pada 1024px tiga PT muat dalam satu baris
                 pandangan, dan pemilik dengan sepuluh PT tidak lagi menggulung
                 sepuluh kartu selebar layar untuk sampai ke kartu di bawahnya. */
              <ul style={COMPANY_GRID}>
                {companies.map((company) => (
                  <li key={company.companyId}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12,
                        height: "100%",
                        padding: 16,
                        borderRadius: "var(--ant-border-radius-lg)",
                        border: "1px solid var(--ant-color-border-secondary)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
                        <span style={iconBox(36, "indigo")} aria-hidden="true">
                          <ShopOutlined style={{ fontSize: 16 }} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p
                            title={company.name}
                            style={{
                              ...TRUNCATE,
                              margin: 0,
                              fontWeight:
                                "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                              color: "var(--ant-color-text)",
                            }}
                          >
                            {company.name}
                          </p>
                          <p
                            style={{
                              ...TRUNCATE,
                              margin: 0,
                              fontSize: "var(--ant-font-size-sm)",
                              color: "var(--ant-color-text-secondary)",
                            }}
                          >
                            {company.slug}
                          </p>
                        </div>
                      </div>
                      {/*
                       * Tautan LANGSUNG ke jalur kanonik, bukan penukar sesi:
                       * sejak #158 `companyId` di sesi hanya catatan "terakhir
                       * dibuka" (tata letak bertenant yang mencatatnya), jadi
                       * membuka buku = pergi ke alamatnya.
                       */}
                      {/*
                       * `outline`, bukan primer — dan bukan penyeragaman
                       * (MASTER.md §Aksi utama).
                       *
                       * Tombol ini hidup di dalam `.map()`: jumlahnya SEBANYAK
                       * PT yang dipegang pemiliknya. Sepuluh blok biru pekat
                       * bukan sepuluh kali penekanan, melainkan nol — dan di
                       * halaman ini mereka bersaing dengan satu-satunya hal
                       * yang memang harus menarik mata saat menyala: meteran
                       * kuota bernada `warning` dan kartu tunggakan tepat di
                       * atasnya. Kisi yang sama di `/platform/team` sudah
                       * `outline` sejak semula; ini menyamakannya.
                       *
                       * Pengecualian "pilihan setara" (yang membuat baris
                       * `/select-company` boleh primer) TIDAK berlaku di sini:
                       * membuka buku bukan satu-satunya jalan maju halaman ini
                       * — ia juga pendaratan akun.
                       */}
                      <Button
                        href={tenantPath(tenant.tenantSlug, company.slug, "/dashboard")}
                        variant="outline"
                        size="sm"
                        style={{ width: "100%" }}
                      >
                        {t("auth.selectCompany.openLabel")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
