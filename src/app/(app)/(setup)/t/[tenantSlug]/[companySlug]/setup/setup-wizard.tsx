"use client";

/**
 * Setup wizard (issue #20) — company identity → base currency + fiscal year →
 * confirm the seeded COA → opening balances → review & post.
 *
 * The Modal/Ekuitas line is the BALANCING FIGURE: the user enters assets (kas,
 * piutang, persediaan) and liabilities (utang), and equity is derived so the
 * opening journal always balances (Σ debit = Σ credit in IDR base). The running
 * "Aset = Kewajiban + Modal" panel shows that figure live before saving, and the
 * server re-derives and re-checks it (`assertBalanced`) — the client preview is
 * never the authority. A foreign balance with no rate is refused, here and again
 * on the server, rather than valued 1:1.
 *
 * ── Tata letak baris saldo awal setelah AntD (issue #200) ─────────────────
 * Baris kas/piutang/utang dulu `grid sm:grid-cols-12` dengan lebar kolom yang
 * ditulis sebagai kelas per isian. Sekarang `Row`/`Col` AntD dengan `xs`/`sm` —
 * kisi 24 kolom, jadi setiap angka lama dikalikan dua. Yang didapat bukan cuma
 * hilangnya kelas: titik patahnya kini milik satu sistem yang sama dengan
 * seluruh aplikasi, dan kolom kurs yang muncul-hilang tidak lagi memaksa
 * menghitung ulang sisa kolomnya dengan tangan.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Col, Flex, Row, Typography, theme } from "antd";
import type { GlobalToken } from "antd";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/components/ui/app-link";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { WizardSteps } from "@/components/ui/wizard-steps";
import { fieldGrid, formGrid } from "@/lib/layout-width";
import { parseTenantPath, tenantApiPath } from "@/lib/tenant-routes";
import { formatCurrency } from "@/lib/utils";
import { DownloadOutlined, UploadOutlined, ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined, DeleteOutlined, InfoCircleOutlined, LoadingOutlined, PlusOutlined, SaveOutlined, UndoOutlined } from "@ant-design/icons";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import { ModulePicker } from "@/components/settings/module-picker";
import {
  BUSINESS_MODULES,
  isBusinessCategory,
  modulesForCategory,
  normalizeEnabledModules,
  type BusinessCategory,
  type BusinessModule,
} from "@/lib/business-modules";

const { Title, Text } = Typography;


interface CashAccount {
  id: number;
  code: string;
  name: string;
  currency: string;
}
interface Party {
  id: number;
  name: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const baseOf = (amount: number, rate: number) => round2(round2(amount) * rate);

let uid = 0;
const nextId = () => ++uid;

/** Kunci draf sessionStorage — lihat blok "Draf tahan-muat-ulang" di bawah. */
const SETUP_DRAFT_KEY = "setup-wizard-draft";

/** Isian nominal: rata kanan + digit sejajar (MASTER.md §Angka rapi & jujur). */
const AMOUNT_INPUT: React.CSSProperties = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Lihat `Spinner` di bawah — pengganti `animate-spin` + `motion-reduce:`. */
const SPIN_RULE = `
[data-spin]{animation:sai-spin 1s linear infinite}
@keyframes sai-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){[data-spin][data-spin]{animation:none}}
`;

interface CashRow {
  key: number;
  accountId: string;
  amount: string;
  rate: string;
}
interface PartnerRow {
  key: number;
  partnerId: string;
  currency: string;
  amount: string;
  rate: string;
  /**
   * Rincian dokumen — hanya terisi pada baris HASIL IMPOR (#381 tahap 4).
   *
   * Baris yang diketik tangan meninggalkannya kosong, dan `applyOpeningBalances`
   * jatuh ke tanggal jurnal pembuka. Bedanya terlihat di umur piutang: tanpa
   * tanggal terbit asli, seluruh piutang lama menumpuk di ember "0–30 hari"
   * pada hari pertama — dan justru daftar itulah alasan orang membukanya.
   */
  documentNo?: string;
  documentDate?: string;
  dueDate?: string;
}
/**
 * Satu baris saldo awal PERSEDIAAN (issue #379). Selalu IDR — harga pokok
 * persediaan adalah nilai base, dan tidak ada kurs yang perlu ditanyakan.
 */
/**
 * Satu aset tetap hasil impor (issue #381 tahap 4).
 *
 * TIDAK ada bentuk "ketik tangan" untuk jenis ini, dan itu disengaja: sebuah
 * aset menuntut tujuh angka termasuk akumulasi penyusutan dan bulan
 * terakhirnya — mengetiknya baris demi baris di wisaya adalah permukaan yang
 * salah, dan modul Aset Tetap sudah menyediakan formulir yang benar untuk
 * sesudah penyiapan. Yang dibutuhkan di sini hanya jalan masuk massal.
 */
interface AssetRow {
  assetNo: string;
  name: string;
  category: string;
  acquisitionDate: string;
  cost: number;
  residual: number;
  usefulLifeMonths?: number;
  accumulated: number;
  lastDepreciationYear: number | null;
  lastDepreciationMonth: number | null;
  location: string | null;
}

interface StockRow {
  key: number;
  itemId: string;
  quantity: string;
  unitCost: string;
}

/** Judul langkah — `<h2>` yang ukurannya token, bukan `text-lg`. */
function StepTitle({ children, token }: { children: React.ReactNode; token: GlobalToken }) {
  return (
    <Title level={2} style={{ fontSize: token.fontSizeLG, marginBlock: 0 }}>
      {children}
    </Title>
  );
}

export function SetupWizard({
  defaults,
  currencies,
  coaCount: seededCoaCount,
  cashAccounts: seededCashAccounts,
  customers,
  suppliers,
  items,
}: {
  defaults: { name: string; address: string; baseCurrency: string };
  currencies: string[];
  /** Jumlah akun saat halaman dirender; bisa BERTAMBAH di tengah wisaya (#416). */
  coaCount: number;
  cashAccounts: CashAccount[];
  customers: Party[];
  suppliers: Party[];
  /** Barang untuk saldo awal persediaan (#379). */
  items: Party[];
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useAppRouter();
  const { toast } = useToast();

  /*
   * ── BAGAN AKUN ADALAH STATE, BUKAN LAGI PROP MATI (issue #416) ────────────
   *
   * Perusahaan yang baru disediakan tiba di wisaya dengan NOL akun — bagan akun
   * dulu baru disemai di dalam POST yang menutup wisaya. Akibatnya langkah
   * Saldo Awal, yang berdiri sebelum POST itu, tidak punya satu akun kas/bank
   * pun untuk ditawarkan; bagiannya menampilkan keadaan kosong dan
   * menyembunyikan tombol "Tambah", sementara Simpan menuntut minimal satu
   * saldo. Buntu penuh, dan gerbang setup memantulkan setiap halaman lain
   * kembali ke sini — orangnya terkunci di luar aplikasinya sendiri.
   *
   * Sekarang penyemaian terjadi saat meninggalkan langkah MODUL (`seedCoa`),
   * dan hasilnya mendarat DI SINI. Karena itu keduanya state: halaman tidak
   * dimuat ulang di tengah wisaya, jadi prop dari server hanya benar untuk
   * render pertama.
   */
  const [coaCount, setCoaCount] = useState(seededCoaCount);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>(seededCashAccounts);
  const [seedingCoa, setSeedingCoa] = useState(false);
  /** Penyemaian sudah pernah dicoba di sesi ini — penjaga anti-lingkaran (#416). */
  const coaSeedAttempted = useRef(false);

  /** "Mulai tanpa saldo awal" — jalan keluar eksplisit di langkah tinjauan (#416). */
  const [noOpening, setNoOpening] = useState(false);

  /**
   * Langkah dirujuk lewat NAMA, bukan angka (issue #99 menyisipkan satu langkah
   * baru di tengah). Angka yang tersebar di JSX membuat penyisipan berikutnya
   * jadi latihan menggeser indeks — dan satu indeks yang lupa digeser adalah
   * langkah yang hilang tanpa galat.
   *
   * Kunci kamusnya ikut bernama, bukan bernomor (issue #103). `setup.step1`–
   * `step5` sudah bohong sejak langkah modul disisipkan di posisi kedua:
   * "step2" adalah langkah KETIGA di layar. Nomor pada nama kunci hanya benar
   * selama tak ada yang menyisipkan langkah — dan itu sudah terjadi sekali.
   * Jumlah langkah kini dihitung dari `steps.length`, bukan diketik ulang.
   */
  const STEP_KEYS = ["identity", "modules", "settings", "coa", "balances", "review"] as const;
  const steps = [
    t("setup.stepIdentity"),
    t("modules.stepTitle"),
    t("setup.stepCurrency"),
    t("setup.stepCoa"),
    t("setup.stepBalances"),
    t("setup.stepReview"),
  ];

  const [step, setStep] = useState(0);
  const current = STEP_KEYS[step];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1–2: identity + settings
  const [name, setName] = useState(defaults.name);
  const [address, setAddress] = useState(defaults.address);
  // Seller NPWP for e-Faktur (issue #17) — optional at setup, editable later.
  const [npwp, setNpwp] = useState("");
  /*
   * PKP — memungut PPN atau tidak (issue #368).
   *
   * `true` sebagai bawaan, bukan `false`: itu perilaku setiap perusahaan yang
   * sudah ada hari ini, jadi wisaya yang dilewati begitu saja tidak mengubah
   * apa pun. Jawabannya menentukan bawaan PPN di SETIAP formulir dokumen —
   * perusahaan non-PKP tidak lagi mendapat 11% yang salah sejak faktur pertama.
   */
  const [isPkp, setIsPkp] = useState(true);
  const [baseCurrency, setBaseCurrency] = useState(defaults.baseCurrency);
  const [fiscalYearStart, setFiscalYearStart] = useState(`${new Date().getFullYear()}-01-01`);

  // Langkah modul (issue #99). Nilai awalnya SEMUA modul menyala: wizard yang
  // diklik lewat begitu saja meninggalkan aplikasi persis seperti sebelum fitur
  // ini ada — kolomnya tersimpan NULL (lihat `serializeEnabledModules`).
  const [category, setCategory] = useState<BusinessCategory | "">("");
  const [modules, setModules] = useState<ReadonlySet<BusinessModule>>(new Set(BUSINESS_MODULES));

  // Step 4: opening balances
  const [cash, setCash] = useState<CashRow[]>([]);
  const [receivables, setReceivables] = useState<PartnerRow[]>([]);
  const [payables, setPayables] = useState<PartnerRow[]>([]);
  const [inventory, setInventory] = useState<StockRow[]>([]);
  const [fixedAssets, setFixedAssets] = useState<AssetRow[]>([]);

  // ── Draf tahan-muat-ulang (audit 2026-07) ──────────────────────────────────
  // Empat puluh baris saldo awal yang lenyap karena tab ter-refresh adalah
  // cara tercepat kehilangan kepercayaan operator. Draf hidup di
  // sessionStorage (BUKAN localStorage: draf setup adalah satu sesi kerja, dan
  // mesin bersama tidak boleh mewariskan draf orang lain), dipulihkan saat
  // mount, dan dihapus saat POST sukses. Server tetap memvalidasi semuanya —
  // draf hanyalah ketikan, bukan data tepercaya.
  const hydrated = useRef(false);
  const submitted = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SETUP_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        const str = (v: unknown): v is string => typeof v === "string";
        const rows = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
        if (typeof d.step === "number" && d.step >= 0 && d.step < STEP_KEYS.length)
          setStep(d.step);
        if (str(d.name) && d.name) setName(d.name);
        if (str(d.address)) setAddress(d.address);
        if (str(d.npwp)) setNpwp(d.npwp);
        if (typeof d.isPkp === "boolean") setIsPkp(d.isPkp);
        if (str(d.baseCurrency) && d.baseCurrency) setBaseCurrency(d.baseCurrency);
        if (str(d.fiscalYearStart) && d.fiscalYearStart) setFiscalYearStart(d.fiscalYearStart);
        if (str(d.category) && isBusinessCategory(d.category)) setCategory(d.category);
        if (Array.isArray(d.modules)) {
          const known = new Set<string>(BUSINESS_MODULES);
          setModules(new Set(d.modules.filter((m): m is BusinessModule => known.has(String(m)))));
        }
        if (d.cash != null) setCash(rows<CashRow>(d.cash));
        if (d.receivables != null) setReceivables(rows<PartnerRow>(d.receivables));
        if (d.payables != null) setPayables(rows<PartnerRow>(d.payables));
        setInventory(rows<StockRow>(d.inventory));
        setFixedAssets(rows<AssetRow>(d.fixedAssets));
      }
    } catch {
      // Draf rusak → mulai bersih; jangan pernah memblokir wizard-nya sendiri.
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Menyimpan sebelum pulih akan MENIMPA draf dengan nilai awal — tunggu.
    if (!hydrated.current || submitted.current) return;
    try {
      sessionStorage.setItem(
        SETUP_DRAFT_KEY,
        JSON.stringify({
          step,
          name,
          address,
          npwp,
          isPkp,
          baseCurrency,
          fiscalYearStart,
          category,
          modules: [...modules],
          cash,
          receivables,
          payables,
          inventory,
          fixedAssets,
        })
      );
    } catch {
      // Storage penuh/di-nonaktifkan — draf memang best-effort.
    }
  }, [step, name, address, npwp, isPkp, baseCurrency, fiscalYearStart, category, modules, cash, receivables, payables, inventory, fixedAssets]);

  const hasMeaningfulDraft =
    cash.length > 0 ||
    receivables.length > 0 ||
    payables.length > 0 ||
    inventory.length > 0 ||
    fixedAssets.length > 0;

  useEffect(() => {
    if (!hasMeaningfulDraft) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (submitted.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasMeaningfulDraft]);

  const cashById = useMemo(
    () => new Map(cashAccounts.map((a) => [String(a.id), a])),
    [cashAccounts]
  );

  // ── Live totals (IDR base) ──
  /*
   * ── SALDO AWAL MENGIKUTI MODUL (issue #349) ───────────────────────────────
   *
   * Setiap slot saldo awal memposting ke sebuah akun, dan akun itu hanya lahir
   * kalau MODUL pemiliknya menyala: bagan akun disemai `seedCoaForModules`
   * mengikuti modul terpilih, dan penyemai mapping MELEWATI slot yang kode
   * akunnya tidak ada — diam-diam, tanpa galat, tanpa log.
   *
   * Tanpa pagar ini wisaya MENGUNDANG angka yang kemudian ia tolak: perusahaan
   * Jasa tidak punya modul `inventory`, tapi isian "Persediaan" tetap tampil,
   * dan menyimpannya berhenti dengan `MissingMappingError` di tengah langkah
   * terakhir — galat yang benar, di tempat yang salah.
   *
   * ⚠ Dipakai di TIGA tempat: render, hitungan total, dan PAYLOAD. Yang ketiga
   * paling mudah terlewat, dan justru yang menentukan: angka yang terlanjur
   * diketik SEBELUM kategori usahanya diganti masih duduk di state. Kalau hanya
   * rendernya yang dipagari, angka itu tetap terkirim dan galatnya kembali
   * persis seperti semula — kali ini dari isian yang tidak terlihat siapa pun.
   */
  const saldoAktif = useMemo(
    () => ({
      cash: modules.has("cash_bank"),
      receivables: modules.has("sales"),
      inventory: modules.has("inventory"),
      payables: modules.has("purchasing"),
      fixedAssets: modules.has("fixed_assets"),
    }),
    [modules]
  );

  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let unrated = 0; // foreign rows missing a rate

    for (const r of saldoAktif.cash ? cash : []) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const acc = cashById.get(r.accountId);
      const cur = acc?.currency ?? "IDR";
      if (cur === "IDR") assets = round2(assets + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) assets = round2(assets + baseOf(amt, rate));
        else unrated++;
      }
    }
    for (const r of saldoAktif.receivables ? receivables : []) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      if (r.currency === "IDR") assets = round2(assets + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) assets = round2(assets + baseOf(amt, rate));
        else unrated++;
      }
    }
    /* Nilai persediaan awal = Σ (kuantitas × harga pokok). Rumus yang SAMA
       dipakai server (`openingStockTotal`) untuk baris jurnalnya — kalau
       keduanya menyimpang, pratinjau di layar berbohong tentang Modal. */
    const inv = saldoAktif.inventory
      ? inventory.reduce(
          (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unitCost) || 0),
          0
        )
      : 0;
    if (inv > 0) assets = round2(assets + baseOf(inv, 1));

    /* Aset tetap menyumbang NILAI BUKUNYA (perolehan − akumulasi). Jurnalnya
       mencatat kotor — debit perolehan, kredit akumulasi — dan selisih kedua
       baris itu persis nilai bukunya, jadi pratinjau Modal di layar ini tetap
       sama dengan yang dihitung server. Menjumlahkan perolehannya saja akan
       melebihkan aset (dan karenanya Modal) sebesar seluruh akumulasi. */
    if (saldoAktif.fixedAssets) {
      for (const a of fixedAssets) {
        const buku = (Number(a.cost) || 0) - (Number(a.accumulated) || 0);
        if (buku > 0) assets = round2(assets + baseOf(buku, 1));
      }
    }

    for (const r of saldoAktif.payables ? payables : []) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      if (r.currency === "IDR") liabilities = round2(liabilities + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) liabilities = round2(liabilities + baseOf(amt, rate));
        else unrated++;
      }
    }

    const equity = round2(assets - liabilities);
    const hasAny = assets > 0 || liabilities > 0;
    return { assets, liabilities, equity, unrated, hasAny };
  }, [cash, receivables, payables, inventory, fixedAssets, cashById, saldoAktif]);

  function updateCash(key: number, patch: Partial<CashRow>) {
    setCash((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function updatePartner(
    setter: React.Dispatch<React.SetStateAction<PartnerRow[]>>,
    key: number,
    patch: Partial<PartnerRow>
  ) {
    setter((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setError(null);
    /* Tidak ada saldo terisi masih boleh lewat — tapi hanya lewat centangan
       yang mengatakannya (#416). Tanpa centangan, pesannya kini MENUNJUK
       centangan itu alih-alih menyuruh mengisi layar yang mungkin memang tak
       punya isian. */
    if (!totals.hasAny && !noOpening) {
      setError(t("setup.errNoBalance"));
      return;
    }
    if (totals.unrated > 0) {
      setError(t("setup.errUnrated"));
      return;
    }
    setSaving(true);

    const payload = {
      company: {
        name,
        address: address || undefined,
        baseCurrency,
        fiscalYearStart,
        npwp: npwp || undefined,
        isPkp,
        // Modul usaha (issue #99). Kategori hanya dicatat; yang berlaku adalah
        // himpunan modulnya, dan server menormalkan + memvalidasinya lagi
        // (modul inti tak bisa dimatikan, bahkan dari sini).
        businessCategory: category || undefined,
        modules: normalizeEnabledModules(modules),
      },
      /* Dikirim hanya bila memang tak ada saldo terisi: bendera yang ikut
         terkirim bersama saldo yang penuh adalah bendera yang suatu hari akan
         dipercaya server padahal tidak dimaksudkan siapa pun. */
      ...(!totals.hasAny && noOpening ? { noOpeningBalances: true as const } : {}),
      cash: (saldoAktif.cash ? cash : [])
        .filter((r) => r.accountId && (Number(r.amount) || 0) > 0)
        .map((r) => {
          const cur = cashById.get(r.accountId)?.currency ?? "IDR";
          return {
            accountId: Number(r.accountId),
            currency: cur,
            amount: Number(r.amount),
            ...(cur !== "IDR" ? { rate: Number(r.rate) } : {}),
          };
        }),
      receivables: (saldoAktif.receivables ? receivables : [])
        .filter((r) => r.partnerId && (Number(r.amount) || 0) > 0)
        .map((r) => ({
          partnerId: Number(r.partnerId),
          currency: r.currency,
          amount: Number(r.amount),
          ...(r.currency !== "IDR" ? { rate: Number(r.rate) } : {}),
          /* Hanya dikirim bila ADA — baris ketikan tangan tidak boleh mengirim
             string kosong yang lolos `z.string().optional()` lalu menjadi
             `new Date("")` = Invalid Date di route. */
          ...(r.documentNo ? { documentNo: r.documentNo } : {}),
          ...(r.documentDate ? { documentDate: r.documentDate } : {}),
          ...(r.dueDate ? { dueDate: r.dueDate } : {}),
        })),
      payables: (saldoAktif.payables ? payables : [])
        .filter((r) => r.partnerId && (Number(r.amount) || 0) > 0)
        .map((r) => ({
          partnerId: Number(r.partnerId),
          currency: r.currency,
          amount: Number(r.amount),
          ...(r.currency !== "IDR" ? { rate: Number(r.rate) } : {}),
          /* Hanya dikirim bila ADA — baris ketikan tangan tidak boleh mengirim
             string kosong yang lolos `z.string().optional()` lalu menjadi
             `new Date("")` = Invalid Date di route. */
          ...(r.documentNo ? { documentNo: r.documentNo } : {}),
          ...(r.documentDate ? { documentDate: r.documentDate } : {}),
          ...(r.dueDate ? { dueDate: r.dueDate } : {}),
        })),
      fixedAssets: saldoAktif.fixedAssets ? fixedAssets : [],
      inventory: saldoAktif.inventory
        ? inventory
            .filter((r) => r.itemId && Number(r.quantity) > 0 && Number(r.unitCost) > 0)
            .map((r) => ({
              itemId: Number(r.itemId),
              quantity: Number(r.quantity),
              unitCost: Number(r.unitCost),
            }))
        : [],
    };

    try {
      const res = await apiFetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : undefined;
        setError(first ?? data?.error ?? t("setup.errSaveFailed"));
        return;
      }
      toast(t("setup.toastDone"), "success");
      // Setup tersimpan — drafnya selesai bertugas dan tidak boleh muncul
      // lagi di kunjungan berikutnya (halaman ini berubah jadi ringkasan).
      submitted.current = true;
      try {
        sessionStorage.removeItem(SETUP_DRAFT_KEY);
      } catch {
        /* storage tak tersedia — tak apa */
      }
      /*
       * Ke layar "penyiapan selesai", BUKAN ke `/reports`.
       *
       * Tujuan lama menyerahkan pelanggan baru kepada sebuah laporan atas
       * perusahaan yang baru punya satu jurnal — tanpa menyebut apa yang
       * barusan dibuat, dan tanpa satu pun langkah berikutnya. Neracanya tetap
       * satu klik dari layar baru itu, bagi yang memang datang untuk melihatnya.
       */
      router.push("/setup/done");
      router.refresh();
    } catch {
      setError(t("setup.errNetwork"));
    } finally {
      setSaving(false);
    }
  }

  /*
   * ── Validasi per langkah: TOMBOL HIDUP, bukan tombol mati ─────────────────
   *
   * Sampai audit ini tombol "Lanjut" hanya `disabled` selama syarat langkahnya
   * belum terpenuhi. Bentuk itu benar secara mekanis dan diam secara total:
   * pada layar wajib pertama, seorang pengguna awam menghadapi tombol yang
   * tidak bereaksi dan tidak satu pun kalimat yang mengatakan field mana yang
   * kurang. Yang tersisa baginya adalah menebak — atau menyimpulkan
   * aplikasinya rusak.
   *
   * Sekarang tombolnya selalu bisa ditekan, dan penekanan yang belum memenuhi
   * syarat MENJAWAB: pesan mendarat di bawah field yang bersangkutan dan fokus
   * dipindahkan ke sana (Forms · Inline Validation, ui-ux-pro-max).
   */
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  function validateStep(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (current === "identity" && name.trim().length === 0) {
      errors.name = t("validation.companyNameRequired");
    }
    /*
     * Mata uang dasar TIDAK divalidasi di sini: pemilihnya diisi dari
     * `CURRENCIES` tanpa opsi kosong dan berangkat dari "IDR", jadi keadaan
     * "belum dipilih" tidak bisa dicapai lewat layar ini. Memvalidasinya hanya
     * menambah satu pesan yang tak akan pernah dibaca siapa pun — dan satu
     * kunci kamus yang tak dipakai skema mana pun (dijaga
     * `tests/i18n-validation.test.tsx`).
     */
    if (current === "settings" && !fiscalYearStart) {
      errors.fiscalYearStart = t("validation.fiscalYearStartRequired");
    }
    // Langkah modul, COA, dan saldo awal tak pernah menghalangi: melewatinya
    // masing-masing berarti "semua modul aktif", "COA bawaan diterima", dan
    // "saldo awal diisi di langkah tinjauan" — ketiganya keadaan yang sah.
    return errors;
  }

  /**
   * Semai bagan akun untuk modul terpilih — SEBELUM langkah Saldo Awal (#416).
   *
   * Idempoten di server (kode akun yang sudah ada tidak disentuh), jadi
   * bolak-balik antar langkah maupun mengganti pilihan modul lalu maju lagi
   * tidak pernah menggandakan apa pun; paling banyak menambah akun milik modul
   * yang baru dicentang.
   *
   * KEGAGALANNYA TIDAK MENAHAN NAVIGASI. Langkah berikutnya masih bisa dibaca,
   * dan penyemaian di ujung wisaya tetap ada sebagai jaring pengaman — menahan
   * orang di langkah Modul karena satu permintaan latar gagal hanya menukar
   * satu buntu dengan buntu yang lain. Yang kita lakukan adalah MENGATAKANNYA.
   */
  async function seedCoa() {
    coaSeedAttempted.current = true;
    setSeedingCoa(true);
    try {
      const res = await apiFetch("/api/setup/coa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessCategory: category || null,
          modules: normalizeEnabledModules(modules),
        }),
      });
      if (!res.ok) {
        setError(t("setup.errCoaSeed"));
        return;
      }
      const data = (await res.json()) as { coaCount?: number; cashAccounts?: CashAccount[] };
      if (typeof data.coaCount === "number") setCoaCount(data.coaCount);
      if (Array.isArray(data.cashAccounts)) setCashAccounts(data.cashAccounts);
      setError(null);
    } catch {
      setError(t("setup.errCoaSeed"));
    } finally {
      setSeedingCoa(false);
    }
  }

  /*
   * ── JARING TERAKHIR: TIBA DI SALDO AWAL TANPA AKUN (issue #416) ───────────
   *
   * Penyemaian di atas digantung pada tombol "Lanjut" di langkah Modul — dan
   * itu benar untuk orang yang berjalan lurus. Yang TIDAK berjalan lurus adalah
   * draf yang dipulihkan: `sessionStorage` menyimpan nomor langkahnya, jadi tab
   * yang dimuat ulang bisa mendarat langsung di langkah Saldo Awal tanpa pernah
   * melewati tombol itu sekali pun. Bila draf itu lahir sebelum perbaikan ini
   * terpasang, bukunya masih kosong — dan layarnya kembali tanpa isian.
   *
   * Itu bukan lagi kunci (centangan "mulai tanpa saldo awal" ada di langkah
   * berikutnya), tapi ia tetap layar yang tidak bisa dijelaskan kepada orang
   * yang menatapnya. Jadi kita tutup: begitu langkah ini terbuka tanpa satu
   * akun kas pun, akunnya dibuat di sana juga.
   *
   * SEKALI saja — `coaSeedAttempted` adalah ref, bukan state, supaya percobaan
   * yang gagal tidak berubah menjadi lingkaran permintaan yang memukuli server
   * setiap render. Perusahaan yang modul kasnya memang mati tidak ikut disemai
   * dari sini: bagian Kas/Bank-nya sengaja tidak dirender, jadi "tidak ada akun
   * kas" di sana adalah keadaan yang benar, bukan yang perlu diperbaiki.
   */
  useEffect(() => {
    if (current !== "balances") return;
    if (coaSeedAttempted.current || seedingCoa) return;
    if (!saldoAktif.cash || cashAccounts.length > 0) return;
    void seedCoa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, saldoAktif.cash, cashAccounts.length, seedingCoa]);

  async function goNext() {
    const errors = validateStep();
    setStepErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    // Modul sudah dipilih → akunnya boleh lahir. Ditunggu, supaya langkah COA
    // berikutnya menyebut jumlah yang sudah benar alih-alih "0 akun aktif".
    if (current === "modules") await seedCoa();
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  /** Pesan sebuah field lenyap begitu isinya disentuh — bukan menunggu
   *  penekanan "Lanjut" berikutnya untuk membuktikan sudah diperbaiki. */
  function clearStepError(field: string) {
    setStepErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  return (
    <Flex vertical gap={token.marginLG}>
      <style href="sai-spin" precedence="default">
        {SPIN_RULE}
      </style>
      {/*
       * Stepper + hitungan "Langkah X dari Y" (issue #103 · Progress
       * Indicators). Hitungannya DITURUNKAN dari `steps`, tidak pernah diketik:
       * langkah modul yang disisipkan #99 membuat wizard ini enam langkah
       * sementara kamusnya masih bernomor sampai lima, dan angka yang diketik
       * ulang cepat atau lambat akan berbohong lagi.
       *
       * Kalimatnya berdiri sendiri di atas deretan pil, bukan mengandalkan
       * pil-pilnya saja: pada layar sempit deretan itu membungkus jadi dua-tiga
       * baris, dan "seberapa jauh lagi" — satu-satunya pertanyaan pengguna di
       * layar wajib — jadi harus dihitung sendiri dengan mata.
       */}
      {/*
       * Penanda langkah — komponen BERSAMA (`components/ui/wizard-steps.tsx`),
       * bukan lagi deretan pil milik berkas ini.
       *
       * Pil lamanya punya dua cacat yang keduanya hilang bersamanya. Yang
       * pertama aturan: bedanya langkah "sedang dibuka" dari "belum" hanyalah
       * RONA (biru vs abu), dan MASTER.md §Anti-Patterns melarang warna sebagai
       * penanda tunggal — sekarang setiap langkah membawa katanya sendiri
       * ("Selesai / Sedang diisi / Belum"). Yang kedua keseragaman: wisaya
       * Penjualan/Pembelian memakai kosakata penanda yang sama sekali lain,
       * jadi pengguna yang sudah belajar membaca yang satu harus belajar lagi.
       *
       * Hitungan "Langkah X dari Y" ikut pindah ke dalamnya (kunci
       * `wizard.stepOf`, satu kalimat untuk kedua wisaya) — `setup.stepCounter`
       * karena itu tidak lagi dipanggil siapa pun.
       *
       * Melompat MUNDUR kini bisa lewat penanda, sesuatu yang pil lama tidak
       * pernah izinkan. Maju tetap tidak: `canJump` hanya meloloskan indeks di
       * bawah yang sedang dibuka, jadi penjaga per-langkah (`validateStep`)
       * tidak bisa dilewati dari sini.
       */}
      <WizardSteps
        steps={steps.map((label, i) => ({ key: STEP_KEYS[i], title: label }))}
        current={step}
        canJump={(i) => i < step}
        onJump={(i) => {
          setStepErrors({});
          setStep(i);
        }}
        aside={
          /*
           * Penanda draf — mekanismenya sudah ada sejak audit 2026-07, yang
           * belum ada adalah pemberitahuannya.
           *
           * Ketikan wizard disimpan ke `sessionStorage` pada setiap perubahan
           * dan dipulihkan saat halaman dimuat ulang. Selama itu tak pernah
           * dikatakan, jaringnya tidak menolong siapa pun: orang yang tabnya
           * tertutup di tengah empat puluh baris saldo awal tetap mengira
           * pekerjaannya hilang, dan yang ragu-ragu tetap tidak berani
           * meninggalkan layar ini untuk mencari angkanya. Rasa aman itulah
           * gunanya, dan rasa aman harus terbaca.
           */
          step > 0 || hasMeaningfulDraft ? (
            <Flex align="center" gap={token.marginXXS}>
              <SaveOutlined
                aria-hidden="true"
                style={{ fontSize: 14, flexShrink: 0, color: token.colorTextSecondary }}
              />
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("setup.draftSaved")}
              </Text>
            </Flex>
          ) : null
        }
      />

      <Card style={{ padding: token.paddingLG }}>
        {/* Step 0 — identity */}
        {current === "identity" && (
          <Flex vertical gap={token.margin}>
            {/*
             * Panel pembuka — hanya di langkah pertama.
             *
             * Wizard ini enam langkah dan berakhir dengan sebuah JURNAL yang
             * menjadi titik nol seluruh laporan perusahaan. Sampai audit ini,
             * langkah pertamanya langsung meminta nama perusahaan tanpa
             * menyebut apa yang sedang dimulai, berapa lama, atau apa yang
             * terjadi bila salah — padahal yang membukanya adalah orang yang
             * belum pernah melihat aplikasi ini.
             *
             * Tiga kalimat, dan yang ketiga adalah yang paling penting: saldo
             * awal bisa diisi belakangan. Tanpa itu, orang yang belum memegang
             * angka neraca akan berhenti di sini dan menunda seluruh
             * pemasangan, atau — lebih buruk — mengarang angkanya.
             */}
            {/*
             * ⚠ Latarnya `colorFillTertiary`, BUKAN `colorFillQuaternary`.
             *
             * Yang terakhir itu fill translusen 2–4%: digambar di atas kartu
             * putih ia praktis tidak ada di layar, jadi panel ini terbaca
             * sebagai teks yang kebetulan bertepi — persis keluhan yang
             * melahirkan issue #266, dan alasan yang sama yang menaikkan kotak
             * ikon `/platform` dari fill yang sama ke nada opak (#303). Panel
             * ini justru satu-satunya tempat di seluruh wisaya yang menjelaskan
             * APA yang sedang dimulai; ia harus terbaca sebagai bidang.
             */}
            <div
              style={{
                padding: `${token.paddingSM}px ${token.padding}px`,
                borderRadius: token.borderRadiusLG,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillTertiary,
              }}
            >
              <Text strong>{t("setup.introTitle")}</Text>
              <Flex
                component="ul"
                vertical
                gap={token.marginXXS}
                style={{
                  listStyle: "none",
                  margin: `${token.marginXS}px 0 0`,
                  padding: 0,
                }}
              >
                {(["introPoint1", "introPoint2", "introPoint3"] as const).map((key) => (
                  <li key={key} style={{ display: "flex", alignItems: "flex-start", gap: token.marginXS }}>
                    <span
                      aria-hidden="true"
                      style={{
                        marginTop: 8,
                        width: 6,
                        height: 6,
                        flexShrink: 0,
                        borderRadius: "50%",
                        background: token.colorTextSecondary,
                      }}
                    />
                    <Text type="secondary">{t(`setup.${key}`)}</Text>
                  </li>
                ))}
              </Flex>
            </div>

            <StepTitle token={token}>{t("setup.identityTitle")}</StepTitle>
            {/*
             * Isian setara → `fieldGrid`, dan itu penerapan aturan lebar penuh
             * di tempat yang benar (`lib/layout-width.ts`).
             *
             * Ketiganya teks pendek — nama PT, alamat, NPWP. Dibiarkan mengisi
             * lebar kartu yang kini selebar layar, masing-masing jadi kotak
             * ribuan piksel: nomor NPWP 20 karakter mengambang di sepertiga
             * kirinya, dan mata harus menempuh sisanya untuk pulang ke label
             * berikutnya. `fieldGrid` menahan tiap sel di `LEBAR_KOLOM_ISIAN`
             * lalu memakai sisa ruangnya untuk menambah KOLOM — jadi layar
             * lebar memuat lebih banyak, bukan hal yang sama dalam ukuran
             * lebih besar.
             */}
            <div style={fieldGrid()}>
              <Input
                id="name"
                label={t("setup.nameField")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearStepError("name");
                }}
                error={stepErrors.name}
                maxLength={150}
                required
              />
              <Flex vertical gap={token.marginXXS}>
                <Label htmlFor="address">{t("common.address")}</Label>
                <Textarea
                  id="address"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={1000}
                />
              </Flex>
              <Input
                id="npwp"
                label={t("setup.npwpField")}
                value={npwp}
                onChange={(e) => setNpwp(e.target.value)}
                maxLength={30}
                placeholder={t("setup.npwpPlaceholder")}
              />
              {/* PKP (issue #368) — pertanyaan yang menentukan bawaan PPN di
                  seluruh aplikasi, jadi ia diajukan sekali di sini alih-alih
                  ditebak. Jawabannya bisa diubah kapan saja di Pengaturan. */}
              <div style={{ gridColumn: "1 / -1" }}>
                <Checkbox
                  id="isPkp"
                  checked={isPkp}
                  onCheckedChange={(v) => setIsPkp(v === true)}
                >
                  {t("setup.pkpField")}
                </Checkbox>
                <Typography.Text
                  type="secondary"
                  style={{ display: "block", fontSize: "var(--ant-font-size-sm)" }}
                >
                  {t("setup.pkpHint")}
                </Typography.Text>
              </div>
            </div>
          </Flex>
        )}

        {/* Modul usaha (issue #99) — kategori sebagai preset, modul tetap
            bisa diubah satu per satu. Melewatinya = semua modul aktif. */}
        {current === "modules" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("modules.stepHeading")}</StepTitle>
            <Text type="secondary">{t("modules.stepHint")}</Text>
            {/*
             * "Ini bisa diubah lagi" — kalimat terpenting di seluruh langkah ini
             * (issue #103 · UX Onboarding · User Freedom).
             *
             * Wizard ini WAJIB dan tidak bisa dilewati, jadi langkah modul mudah
             * terbaca sebagai pintu satu arah. Pengguna yang mengira begitu akan
             * menyalakan semuanya untuk berjaga-jaga — dan seluruh guna fitur ini
             * (menyusutkan permukaan aplikasi) hilang tepat pada satu-satunya
             * kesempatan ia dipakai.
             *
             * Sengaja kotak bertanda, bukan tambahan kalimat pada `stepHint` yang
             * abu-abu kecil di atasnya: yang perlu diyakinkan justru orang yang
             * sedang ragu-ragu memandangi daftar centang, dan teks samar tidak
             * meyakinkan siapa pun.
             */}
            <Alert
              type="info"
              icon={<UndoOutlined aria-hidden="true" style={{ fontSize: 16 }} />}
              showIcon
              message={t("modules.stepReversible")}
            />
            <ModulePicker
              category={category}
              modules={modules}
              onCategoryChange={(next) => {
                setCategory(next);
                setModules(new Set(modulesForCategory(next)));
              }}
              onToggleModule={(module, next) =>
                setModules((prev) => {
                  const draft = new Set(prev);
                  if (next) draft.add(module);
                  else draft.delete(module);
                  return draft;
                })
              }
              disabled={saving}
            />
          </Flex>
        )}

        {/* Step 1 — base currency + fiscal year */}
        {current === "settings" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("setup.stepCurrency")}</StepTitle>
            {/*
             * Kolom SETARA → `formGrid`, bukan `Row`/`Col xs={24} sm={12}`.
             *
             * Yang lama membeku di dua kolom sejak 576px dan tidak pernah
             * beradaptasi lagi; kisi ini menurunkan jumlah kolomnya dari lebar
             * yang benar-benar tersedia. Alasan lengkapnya di
             * `lib/layout-width.ts`.
             */}
            <div style={formGrid()}>
              <Select
                id="baseCurrency"
                label={t("setup.baseCurrencyField")}
                value={baseCurrency}
                onChange={(e) => {
                  setBaseCurrency(e.target.value);
                  clearStepError("baseCurrency");
                }}
                error={stepErrors.baseCurrency}
                options={currencyOptions}
              />
              <Input
                id="fiscalYearStart"
                type="date"
                label={t("setup.fiscalYearStartField")}
                value={fiscalYearStart}
                onChange={(e) => {
                  setFiscalYearStart(e.target.value);
                  clearStepError("fiscalYearStart");
                }}
                error={stepErrors.fiscalYearStart}
                required
              />
            </div>
            <Alert
              type="info"
              icon={<InfoCircleOutlined aria-hidden="true" style={{ fontSize: 16 }} />}
              showIcon
              message={
                <>
                  {t("setup.ledgerNoteBefore")} <strong>IDR</strong> {t("setup.ledgerNoteAfter")}
                </>
              }
            />
          </Flex>
        )}

        {/* Step 2 — confirm COA */}
        {current === "coa" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("setup.coaTitle")}</StepTitle>
            <Alert
              type="success"
              icon={<CheckCircleOutlined aria-hidden="true" style={{ fontSize: 16 }} />}
              showIcon
              message={
                <>
                  {t("setup.coaNoteBefore")}{" "}
                  <strong style={TABULAR}>{coaCount}</strong> {t("setup.coaNoteAfter")}
                </>
              }
            />
            <Text type="secondary">{t("setup.coaHint")}</Text>
          </Flex>
        )}

        {/* Step 3 — opening balances */}
        {current === "balances" && (
          <Flex vertical gap={token.marginXL}>
            <StepTitle token={token}>{t("setup.stepBalances")}</StepTitle>

            {/* Kas / Bank */}
            {saldoAktif.cash && (
            <Section
              title={t("nav.groups.cash")}
              hint={t("setup.cashSectionHint")}
              token={token}
              onAdd={() =>
                cashAccounts.length > 0 &&
                setCash((r) => [...r, { key: nextId(), accountId: "", amount: "", rate: "" }])
              }
              addLabel={t("setup.cashAddLabel")}
              empty={cashAccounts.length === 0 ? t("setup.cashEmpty") : undefined}
            >
              {cash.map((row) => {
                const acc = cashById.get(row.accountId);
                const foreign = acc && acc.currency !== "IDR";
                return (
                  <Row key={row.key} gutter={[token.marginXS, token.marginXS]} align="bottom">
                    <Col xs={24} sm={10}>
                      <Select
                        id={`cash-acc-${row.key}`}
                        label={t("common.account")}
                        value={row.accountId}
                        onChange={(e) => updateCash(row.key, { accountId: e.target.value })}
                        placeholder={t("setup.accountPick")}
                        options={cashAccounts.map((a) => ({
                          value: String(a.id),
                          label: `${a.code} · ${a.name} (${a.currency})`,
                        }))}
                      />
                    </Col>
                    <Col xs={24} sm={foreign ? 6 : 12}>
                      <Input
                        id={`cash-amt-${row.key}`}
                        type="number"
                        step="0.01"
                        min="0"
                        style={AMOUNT_INPUT}
                        label={
                          acc
                            ? t("setup.balanceWithCurrency", { currency: acc.currency })
                            : t("common.balance")
                        }
                        value={row.amount}
                        onChange={(e) => updateCash(row.key, { amount: e.target.value })}
                      />
                    </Col>
                    {foreign && (
                      <Col xs={24} sm={6}>
                        <Input
                          id={`cash-rate-${row.key}`}
                          type="number"
                          step="0.000001"
                          min="0"
                          style={AMOUNT_INPUT}
                          label={t("setup.rateToIdr")}
                          value={row.rate}
                          onChange={(e) => updateCash(row.key, { rate: e.target.value })}
                        />
                      </Col>
                    )}
                    <Col xs={24} sm={2}>
                      <Flex justify="flex-end">
                        <RemoveButton
                          onClick={() => setCash((r) => r.filter((x) => x.key !== row.key))}
                          label={t("journal.removeRow")}
                        />
                      </Flex>
                    </Col>
                  </Row>
                );
              })}
            </Section>
            )}

            {/* Piutang */}
            {saldoAktif.receivables && (
            <PartnerSection
              title={t("setup.receivablesTitle")}
              hint={t("setup.receivablesHint")}
              rows={receivables}
              setRows={setReceivables}
              parties={customers}
              partyLabel={t("common.customer")}
              addLabel={t("setup.addCustomer")}
              pickLabel={t("setup.pickCustomer")}
              emptyLabel={t("setup.emptyCustomers")}
              currencies={currencyOptions}
              t={t}
              token={token}
              onUpdate={(k, p) => updatePartner(setReceivables, k, p)}
              importKind="receivables"
            />
            )}

            {/* Persediaan — PER BARANG sejak #379 */}
            {saldoAktif.inventory && (
            <StockSection
              rows={inventory}
              setRows={setInventory}
              items={items}
              t={t}
              token={token}
              onUpdate={(k, patch) =>
                setInventory((rows) => rows.map((r) => (r.key === k ? { ...r, ...patch } : r)))
              }
            />
            )}

            {/* Aset tetap — impor saja; lihat catatan di `AssetRow`. */}
            {saldoAktif.fixedAssets && (
              <FixedAssetSection rows={fixedAssets} setRows={setFixedAssets} t={t} token={token} />
            )}

            {/* Utang */}
            {saldoAktif.payables && (
            <PartnerSection
              title={t("setup.payablesTitle")}
              hint={t("setup.payablesHint")}
              rows={payables}
              setRows={setPayables}
              parties={suppliers}
              partyLabel={t("payables.colSupplier")}
              addLabel={t("setup.addSupplier")}
              pickLabel={t("setup.pickSupplier")}
              emptyLabel={t("setup.emptySuppliers")}
              currencies={currencyOptions}
              t={t}
              token={token}
              onUpdate={(k, p) => updatePartner(setPayables, k, p)}
              importKind="payables"
            />

            )}
            <BalancePanel totals={totals} t={t} token={token} />
          </Flex>
        )}

        {/* Step 4 — review */}
        {current === "review" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("setup.reviewTitle")}</StepTitle>
            {/* `<dl>` tetap `<dl>`: `Row`/`Col` AntD hanya menggambar `<div>`,
                dan menyisipkannya di antara daftar dan butirnya akan memutus
                hubungan istilah–definisi yang dibaca pembaca layar. Kisinya
                karena itu membagi lebarnya sendiri, tanpa media query. */}
            <dl
              style={{
                display: "grid",
                gap: token.marginSM,
                margin: 0,
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              }}
            >
              <div>
                <dt>
                  <Text strong type="secondary">
                    {t("setup.companyLabel")}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text>{name}</Text>
                </dd>
              </div>
              <div>
                <dt>
                  <Text strong type="secondary">
                    {t("setup.fiscalYearStartField")}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text style={TABULAR}>{fiscalYearStart}</Text>
                </dd>
              </div>
              {/* issue #99 — apa yang akan tampil di menu setelah wizard selesai. */}
              <div>
                <dt>
                  <Text strong type="secondary">
                    {t("modules.sectionTitle")}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text>
                    {t("modules.activeCount", {
                      count: normalizeEnabledModules(modules).length,
                      total: BUSINESS_MODULES.length,
                    })}
                  </Text>
                </dd>
              </div>
            </dl>
            <BalancePanel totals={totals} t={t} token={token} />
            {/*
             * ── JALAN KELUAR, BUKAN TOMBOL MATI (issue #416) ─────────────────
             *
             * "Minimal satu saldo awal" adalah aturan yang benar untuk
             * perusahaan yang PINDAH dari pembukuan lain — dan aturan yang
             * mustahil bagi perusahaan yang memang mulai dari nol, atau yang
             * mematikan semua modul bersaldo (`cash_bank` BUKAN modul inti,
             * jadi seluruh bagian di langkah sebelumnya bisa sah-sah saja
             * tersembunyi). Sampai issue ini, keduanya berakhir sama: tombol
             * Simpan yang mati tanpa satu kalimat pun.
             *
             * Centangannya hanya muncul saat memang tidak ada saldo terisi —
             * ia jalan keluar, bukan tawaran. Dan ia EKSPLISIT: buku tanpa
             * jurnal pembuka adalah keputusan akuntansi, bukan sesuatu yang
             * boleh bocor diam-diam dari formulir yang lupa diisi.
             */}
            {!totals.hasAny && (
              <div>
                <Checkbox
                  id="noOpening"
                  checked={noOpening}
                  onCheckedChange={(v) => {
                    setNoOpening(v === true);
                    setError(null);
                  }}
                >
                  {t("setup.noOpeningLabel")}
                </Checkbox>
                <Text
                  type="secondary"
                  style={{ display: "block", fontSize: token.fontSizeSM }}
                >
                  {t("setup.noOpeningHint")}
                </Text>
              </div>
            )}
            <Alert
              type="info"
              icon={<InfoCircleOutlined aria-hidden="true" style={{ fontSize: 16 }} />}
              showIcon
              message={
                <>
                  {t("setup.saveNoteBefore")} <strong>{t("setup.saveNoteStrong")}</strong>{" "}
                  {t("setup.saveNoteAfter")}
                </>
              }
            />
          </Flex>
        )}

        {error && (
          /* `role` di pembungkus: `Alert` AntD hanya meneruskan `aria-*`/`data-*`,
             jadi peran yang dioper langsung ke sana hilang tanpa galat. */
          <div role="alert" style={{ marginTop: token.margin }}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}

        {/*
         * Keadaan MENYIMPAN, dikatakan dengan kata — bukan hanya pemutar kecil
         * di dalam tombol (issue #103).
         *
         * Langkah terakhir ini menulis identitas, modul, bagan akun, DAN
         * membukukan jurnal saldo awal. Di sambungan yang lambat itu beberapa
         * detik layar diam, dan yang paling mungkin dilakukan pengguna adalah
         * menekan tombolnya lagi. `role="status"` membuatnya ikut DIBACAKAN —
         * pemutar di dalam tombol `aria-hidden`, jadi tanpa baris ini pengguna
         * pembaca layar tidak mendapat tanda apa pun bahwa sesuatu dimulai.
         *
         * Sengaja TIDAK mengarang tahapan ("menyimpan identitas… menyiapkan
         * akun…"): servernya mengerjakan semuanya dalam satu transaksi dan
         * tidak melaporkan kemajuan, jadi tahapan yang ditampilkan hanyalah
         * tebakan berjadwal. Bandingkan dengan pembuatan perusahaan
         * (`/companies/new`), yang kemajuannya SUNGGUHAN karena servernya
         * memang mengalirkannya.
         */}
        {saving && (
          <Flex
            role="status"
            aria-live="polite"
            align="center"
            gap={token.marginXS}
            style={{
              marginTop: token.margin,
              padding: token.paddingSM,
              borderRadius: token.borderRadius,
              background: token.colorFillQuaternary,
              color: token.colorTextSecondary,
            }}
          >
            <Spinner size={16} />
            {t("setup.savingStatus")}
          </Flex>
        )}
      </Card>

      {/* Nav */}
      <Flex justify="space-between">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0 || saving}
          onClick={() => {
            // Mundur tidak pernah dihalangi, jadi pesan langkah ini ikut
            // ditinggalkan — membawanya mundur berarti memerahi field yang
            // penggunanya justru sedang menjauh darinya.
            setStepErrors({});
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          <ArrowLeftOutlined aria-hidden="true" />
          {t("common.back")}
        </Button>

        {step < steps.length - 1 ? (
          <Button
            type="button"
            variant="primary"
            disabled={saving || seedingCoa}
            onClick={goNext}
          >
            {seedingCoa && <Spinner size={16} />}
            {seedingCoa ? t("setup.coaSeeding") : t("setup.next")}
            <ArrowRightOutlined aria-hidden="true" />
          </Button>
        ) : (
          /*
           * TOMBOL HIDUP, bukan tombol mati (issue #416, doktrin yang sudah
           * dianut `validateStep` di berkas ini). `!totals.hasAny` dulu ikut
           * mematikannya — sehingga pengguna yang layar saldo awalnya memang
           * tak punya isian menghadapi tombol yang tidak bereaksi dan tidak
           * satu pun kalimat yang menyebut sebabnya. Sekarang penekanannya
           * MENJAWAB: entah lewat pesan yang menunjuk centangan jalan keluar,
           * entah dengan menyimpan.
           *
           * `unrated` tetap mematikannya: di sana ada isian yang jelas dan
           * peringatannya sudah tampil tepat di atas tombol.
           */
          <Button
            type="button"
            variant="primary"
            disabled={saving || totals.unrated > 0}
            onClick={handleSubmit}
          >
            {saving && <Spinner size={16} />}
            {saving ? t("setup.finishing") : t("setup.finish")}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

/**
 * Pemutar tunggu. `animate-spin` adalah kelas utilitas, dan aturan
 * `prefers-reduced-motion` yang menyertainya tidak bisa ditulis sebagai gaya
 * sebaris — jadi keduanya hidup sebagai satu aturan CSS (`SPIN_RULE`, dipasang
 * sekali di akar wisaya lewat `<style href precedence>`; React 19 meniadakan
 * gandanya) yang menyasar atribut `data-spin`, bukan sebuah kelas.
 */
function Spinner({ size }: { size: number }) {
  return <LoadingOutlined data-spin aria-hidden="true" style={{ fontSize: size, flexShrink: 0 }} />;
}

function Section({
  title,
  hint,
  children,
  onAdd,
  addLabel,
  empty,
  token,
  extraActions,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  empty?: string;
  token: GlobalToken;
  /** Tombol unduh templat & impor, bila bagian ini punya jalur berkas. */
  extraActions?: React.ReactNode;
}) {
  return (
    <div>
      <Title level={3} style={{ fontSize: token.fontSize, marginBlock: 0 }}>
        {title}
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: token.marginXS, fontSize: token.fontSizeSM }}
      >
        {hint}
      </Text>
      <Flex vertical gap={token.marginSM}>
        {children}
      </Flex>
      {empty ? (
        <Text
          type="secondary"
          style={{ display: "block", marginTop: token.marginXS, fontSize: token.fontSizeSM }}
        >
          {empty}
        </Text>
      ) : (
        <Flex gap={token.marginXS} wrap style={{ marginTop: token.marginSM }}>
          <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
            <PlusOutlined aria-hidden="true" />
            {addLabel}
          </Button>
          {extraActions}
        </Flex>
      )}
    </div>
  );
}

/**
 * Saldo awal PERSEDIAAN, per barang (issue #379).
 *
 * Menggantikan satu isian gelondongan yang menerbitkan jurnal TANPA satu pun
 * gerakan stok — sehingga Neraca menunjukkan persediaan sementara laporan stok
 * kosong, dan tidak ada apa pun di layar yang menyebutkan selisihnya. Per
 * barang, jalur pembukaan bisa menerbitkan kedua sisinya sekaligus.
 *
 * Tanpa pemilih MATA UANG, berbeda dari `PartnerSection`, dan itu disengaja:
 * harga pokok persediaan adalah nilai base. Menawarkan kurs di sini berarti
 * mengundang pertanyaan yang jawabannya tidak pernah dipakai.
 */
function StockSection({
  rows,
  setRows,
  items,
  t,
  token,
  onUpdate,
}: {
  rows: StockRow[];
  setRows: React.Dispatch<React.SetStateAction<StockRow[]>>;
  items: Party[];
  t: TranslateFn;
  token: GlobalToken;
  onUpdate: (key: number, patch: Partial<StockRow>) => void;
}) {
  return (
    <Section
      title={t("accountType.inventory")}
      hint={t("setup.inventoryHint")}
      addLabel={t("setup.addStockRow")}
      token={token}
      empty={items.length === 0 ? t("setup.emptyItems") : undefined}
      onAdd={() =>
        items.length > 0 &&
        setRows((r) => [...r, { key: nextId(), itemId: "", quantity: "", unitCost: "" }])
      }
    >
      {rows.map((row) => {
        /* Nilai baris dihitung dan DIPERLIHATKAN. Kuantitas × harga pokok
           adalah perkalian yang mudah salah ketik satu nol, dan angka yang
           tidak pernah ditampilkan adalah angka yang tidak pernah diperiksa. */
        const nilai = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0);
        return (
          <Row key={row.key} gutter={[token.marginXS, token.marginXS]} align="bottom">
            <Col xs={24} sm={8}>
              <Select
                id={`i-${row.key}`}
                label={t("setup.itemField")}
                value={row.itemId}
                onChange={(e) => onUpdate(row.key, { itemId: e.target.value })}
                placeholder={t("setup.pickItem")}
                options={items.map((i) => ({ value: String(i.id), label: i.name }))}
              />
            </Col>
            <Col xs={24} sm={5}>
              <Input
                id={`q-${row.key}`}
                type="number"
                step="0.001"
                min="0"
                style={AMOUNT_INPUT}
                label={t("setup.quantityField")}
                value={row.quantity}
                onChange={(e) => onUpdate(row.key, { quantity: e.target.value })}
              />
            </Col>
            <Col xs={24} sm={5}>
              <Input
                id={`u-${row.key}`}
                type="number"
                step="0.01"
                min="0"
                style={AMOUNT_INPUT}
                label={t("setup.unitCostField")}
                value={row.unitCost}
                onChange={(e) => onUpdate(row.key, { unitCost: e.target.value })}
              />
            </Col>
            <Col xs={24} sm={4}>
              <Flex vertical justify="flex-end" style={{ height: "100%" }}>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {t("setup.lineValue")}
                </Text>
                <Money value={nilai} currency="IDR" hideCurrency />
              </Flex>
            </Col>
            <Col xs={24} sm={2}>
              <Flex justify="flex-end">
                <RemoveButton
                  onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                  label={t("journal.removeRow")}
                />
              </Flex>
            </Col>
          </Row>
        );
      })}
    </Section>
  );
}

/**
 * Label unggah yang digayai seperti `Button variant="secondary" size="sm"` —
 * ia memang harus label, bukan tombol (lihat catatan di dalam komponennya).
 */
const IMPORT_LABEL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 24,
  padding: "0 8px",
  borderRadius: "var(--ant-border-radius-sm)",
  border: "1px solid var(--ant-color-border)",
  background: "var(--ant-color-bg-container)",
  color: "var(--ant-color-text)",
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1,
  cursor: "pointer",
};

/**
 * Unduh templat + impor berkas piutang/utang terbuka (issue #381 tahap 4).
 *
 * ══ HASILNYA MENGGANTI, BUKAN MENAMBAH ═════════════════════════════════════
 * Keputusan yang paling menentukan di komponen ini. Menggabungkan akan
 * menggandakan diam-diam saat orang mengunggah berkas yang sama dua kali — dan
 * mengunggah ulang sesudah memperbaiki SATU baris adalah persis yang paling
 * sering dilakukan orang, sebab satu baris salah menolak seluruh berkas.
 *
 * ══ TIDAK ADA YANG TERSIMPAN DI SINI ═══════════════════════════════════════
 * Route-nya hanya membaca. Barisnya hidup di state wisaya sampai orangnya
 * menekan simpan, dan saat itulah seluruh penyiapan tersimpan sebagai SATU
 * transaksi — jurnal pembuka, dokumen pembukanya, gerakan stok pembukanya.
 * Impor yang menulis lebih dulu akan memecah transaksi itu menjadi dua.
 */
function OpeningImport({
  kind,
  onRows,
  t,
  token,
}: {
  kind: "receivables" | "payables" | "fixed-assets";
  /**
   * Baris MENTAH dari route; pemanggil yang memetakannya ke bentuknya sendiri.
   *
   * Komponen ini sengaja tidak tahu bentuk barisnya: ketiga jenis berbagi
   * seluruh alur yang sulit (unggah, 422 dengan galat per baris, ganti-bukan-
   * tambah) dan berbeda hanya pada pemetaan terakhirnya. Menaruh percabangan
   * bentuk di sini akan menjadikan satu komponen yang tahu tiga skema.
   */
  onRows: (rows: Record<string, unknown>[]) => void;
  t: TranslateFn;
  token: GlobalToken;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([]);
  const [imported, setImported] = useState<number | null>(null);

  /* Alamat bertenant di JALURNYA, bukan di header: tombol unduh templat adalah
     `<a href download>` biasa, dan sebuah tautan tidak melewati `apiFetch()`
     (#158). Unggahannya memakai alamat yang sama. */
  const pathname = usePathname();
  const scope = pathname ? parseTenantPath(pathname) : null;
  const endpoint = scope
    ? `${tenantApiPath(scope.tenantSlug, scope.companySlug, "/master/opening")}?kind=${kind}`
    : "";

  async function handleFile(file: File | null) {
    if (!file) return;
    setError("");
    setRowErrors([]);
    setImported(null);
    setLoading(true);

    const form = new FormData();
    form.set("file", file);
    const res = await apiFetch(endpoint, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t("setup.importFailed"));
      if (Array.isArray(data.rowErrors)) setRowErrors(data.rowErrors);
      return;
    }

    const raw = (data.rows ?? []) as Record<string, unknown>[];
    onRows(raw);
    setImported(raw.length);
  }

  return (
    <>
      {/* `<Button href download>`, BUKAN `<ButtonLink>` (#289): navigasi
          sisi-klien mencegat `download`, dan yang terjadi malah pindah halaman. */}
      <Button href={endpoint} download variant="secondary" size="sm">
        <DownloadOutlined aria-hidden="true" />
        {t("setup.downloadTemplate")}
      </Button>

      {/*
        * `<label>` sebagai permukaan yang diklik + isian berkas ber-`data-sr-only`.
        *
        * BUKAN `display: none` (dijaga `tests/design-system-primitives.test.ts`):
        * itu mengeluarkan isiannya dari urutan Tab, dan `<label>` bukan elemen
        * fokusable — permukaannya berhenti punya perhentian Tab sama sekali dan
        * unggahannya menjadi mouse-only. `data-sr-only` memotongnya jadi 1×1px
        * tanpa mencabut fokusnya.
        *
        * BUKAN pula `<label><Button/></label>`: itu menaruh elemen interaktif
        * di dalam elemen interaktif. Labelnya sendiri yang digayai seperti
        * tombol sekunder — pola acuan `accounts/import/import-form.tsx`.
        */}
      <label style={IMPORT_LABEL} data-disabled={loading || undefined}>
        <UploadOutlined aria-hidden="true" />
        {loading ? t("setup.importing") : t("setup.importFromFile")}
        <input
          type="file"
          accept=".xlsx"
          disabled={loading}
          data-sr-only
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null);
            // Berkas yang SAMA boleh dipilih lagi sesudah diperbaiki — tanpa ini
            // `onChange` tidak menyala untuk nama berkas yang sama, dan
            // mengunggah ulang sesudah memperbaiki satu baris adalah hal yang
            // paling sering dilakukan orang di layar ini.
            e.target.value = "";
          }}
        />
      </label>

      {(error || imported !== null || rowErrors.length > 0) && (
        <div style={{ flexBasis: "100%", marginTop: token.marginXS }}>
          {error && <Alert type="error" showIcon message={error} />}
          {imported !== null && (
            <Alert
              type="success"
              showIcon
              message={t("setup.importReplaced", { count: imported })}
            />
          )}
          {rowErrors.length > 0 && (
            <ul
              style={{
                margin: `${token.marginXS}px 0 0`,
                paddingInlineStart: token.paddingLG,
                fontSize: token.fontSizeSM,
                color: token.colorTextSecondary,
              }}
            >
              {rowErrors.slice(0, 20).map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  {t("setup.rowLabel", { row: e.row })}: {e.message}
                </li>
              ))}
              {rowErrors.length > 20 && <li>… {rowErrors.length - 20}</li>}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Aset tetap yang dibawa masuk — IMPOR SAJA (issue #381 tahap 4).
 *
 * Tanpa tombol "tambah baris", berbeda dari bagian saldo awal lainnya. Sebuah
 * aset menuntut tujuh angka termasuk akumulasi penyusutan dan bulan
 * terakhirnya; mengetiknya baris demi baris di dalam wisaya adalah permukaan
 * yang salah, dan modul Aset Tetap sudah punya formulir yang benar untuk
 * sesudah penyiapan. Yang dibutuhkan di sini hanya jalan masuk massal.
 *
 * Yang ditampilkan sesudah impor bukan daftar asetnya melainkan RINGKASAN:
 * berapa aset, berapa perolehannya, berapa akumulasinya, berapa nilai bukunya.
 * Empat angka itu yang diperiksa orang sebelum menyimpan — daftar 400 baris di
 * tengah wisaya justru menyembunyikannya.
 */
function FixedAssetSection({
  rows,
  setRows,
  t,
  token,
}: {
  rows: AssetRow[];
  setRows: React.Dispatch<React.SetStateAction<AssetRow[]>>;
  t: TranslateFn;
  token: GlobalToken;
}) {
  const perolehan = rows.reduce((sum, a) => sum + (Number(a.cost) || 0), 0);
  const akumulasi = rows.reduce((sum, a) => sum + (Number(a.accumulated) || 0), 0);

  return (
    <div>
      <Title level={3} style={{ fontSize: token.fontSize, marginBlock: 0 }}>
        {t("setup.fixedAssetsTitle")}
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: token.marginXS, fontSize: token.fontSizeSM }}
      >
        {t("setup.fixedAssetsHint")}
      </Text>

      <Flex gap={token.marginXS} wrap align="center">
        <OpeningImport
          kind="fixed-assets"
          t={t}
          token={token}
          onRows={(raw) => setRows(raw as unknown as AssetRow[])}
        />
      </Flex>

      {rows.length > 0 && (
        <Flex vertical gap={4} style={{ marginTop: token.marginSM }}>
          <Text style={{ fontSize: token.fontSizeSM }}>
            {t("setup.fixedAssetsCount", { count: rows.length })}
          </Text>
          <Flex gap={token.marginLG} wrap>
            <SummaryFigure label={t("setup.fixedAssetsCost")} value={perolehan} token={token} />
            <SummaryFigure
              label={t("setup.fixedAssetsAccumulated")}
              value={akumulasi}
              token={token}
            />
            <SummaryFigure
              label={t("setup.fixedAssetsBookValue")}
              value={perolehan - akumulasi}
              token={token}
            />
          </Flex>
        </Flex>
      )}
    </div>
  );
}

/** Satu angka ringkasan berlabel — dipakai tiga kali di atas. */
function SummaryFigure({
  label,
  value,
  token,
}: {
  label: string;
  value: number;
  token: GlobalToken;
}) {
  return (
    <Flex vertical>
      <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {label}
      </Text>
      <Money value={value} currency="IDR" hideCurrency />
    </Flex>
  );
}

function PartnerSection({
  title,
  hint,
  rows,
  setRows,
  parties,
  partyLabel,
  addLabel,
  pickLabel,
  emptyLabel,
  currencies,
  t,
  token,
  onUpdate,
  importKind,
}: {
  title: string;
  hint: string;
  rows: PartnerRow[];
  setRows: React.Dispatch<React.SetStateAction<PartnerRow[]>>;
  parties: Party[];
  partyLabel: string;
  addLabel: string;
  pickLabel: string;
  emptyLabel: string;
  currencies: { value: string; label: string }[];
  t: TranslateFn;
  token: GlobalToken;
  onUpdate: (key: number, patch: Partial<PartnerRow>) => void;
  /** Jenis berkas saldo awal yang boleh diimpor ke bagian ini (#381 tahap 4). */
  importKind: "receivables" | "payables";
}) {
  return (
    <Section
      title={title}
      hint={hint}
      addLabel={addLabel}
      token={token}
      empty={parties.length === 0 ? emptyLabel : undefined}
      onAdd={() =>
        parties.length > 0 &&
        setRows((r) => [
          ...r,
          { key: nextId(), partnerId: "", currency: "IDR", amount: "", rate: "" },
        ])
      }
      extraActions={
        parties.length > 0 ? (
          <OpeningImport
            kind={importKind}
            t={t}
            token={token}
            onRows={(raw) =>
              setRows(
                raw.map((r) => ({
                  key: nextId(),
                  partnerId: String(r.partnerId),
                  currency: String(r.currency),
                  amount: String(r.amount),
                  rate: r.rate == null ? "" : String(r.rate),
                  documentNo: String(r.documentNo),
                  documentDate: String(r.date),
                  dueDate: r.dueDate == null ? undefined : String(r.dueDate),
                }))
              )
            }
          />
        ) : undefined
      }
    >
      {rows.map((row) => {
        const foreign = row.currency !== "IDR";
        return (
          <Row key={row.key} gutter={[token.marginXS, token.marginXS]} align="bottom">
            <Col xs={24} sm={8}>
              <Select
                id={`p-${row.key}`}
                label={partyLabel}
                value={row.partnerId}
                onChange={(e) => onUpdate(row.key, { partnerId: e.target.value })}
                placeholder={pickLabel}
                options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
              />
            </Col>
            <Col xs={24} sm={4}>
              <Select
                id={`c-${row.key}`}
                label={t("common.currencyField")}
                value={row.currency}
                onChange={(e) => onUpdate(row.key, { currency: e.target.value })}
                options={currencies}
              />
            </Col>
            <Col xs={24} sm={foreign ? 6 : 10}>
              <Input
                id={`a-${row.key}`}
                type="number"
                step="0.01"
                min="0"
                style={AMOUNT_INPUT}
                label={t("common.balance")}
                value={row.amount}
                onChange={(e) => onUpdate(row.key, { amount: e.target.value })}
              />
            </Col>
            {foreign && (
              <Col xs={24} sm={4}>
                <Input
                  id={`r-${row.key}`}
                  type="number"
                  step="0.000001"
                  min="0"
                  style={AMOUNT_INPUT}
                  label={t("setup.rateToIdr")}
                  value={row.rate}
                  onChange={(e) => onUpdate(row.key, { rate: e.target.value })}
                />
              </Col>
            )}
            <Col xs={24} sm={2}>
              <Flex justify="flex-end">
                <RemoveButton
                  onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                  label={t("journal.removeRow")}
                />
              </Flex>
            </Col>
          </Row>
        );
      })}
    </Section>
  );
}

/**
 * Hapus baris.
 *
 * ⚠ Warnanya tetap netral, dan itu BUKAN pilihan gaya. Bentuk lamanya adalah
 * tombol hantu yang memerah saat disentuh — di AntD itu `type="text"` +
 * `danger`, kombinasi yang primitif `Button` belum punya namanya (`ghost` dan
 * `danger` adalah dua varian yang saling meniadakan di petanya). Menambalnya di
 * sini berarti menulis warna hover dengan tangan di satu berkas, jadi yang
 * dilakukan justru sebaliknya: dibiarkan netral, dan kekurangan primitifnya
 * dilaporkan sebagai calon issue (6 pemanggil memakai pola yang sama).
 * Tindakannya tetap terbaca — `aria-label` dan ikon tong sampah.
 */
function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label={label}>
      <DeleteOutlined aria-hidden="true" />
    </Button>
  );
}

function BalancePanel({
  totals,
  t,
  token,
}: {
  totals: { assets: number; liabilities: number; equity: number; unrated: number; hasAny: boolean };
  t: TranslateFn;
  token: GlobalToken;
}) {
  const money = moneyPalette(token);
  const equityLabel = totals.equity >= 0 ? t("setup.equityCredit") : t("setup.equityDebit");
  return (
    <div
      style={{
        padding: token.padding,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
      }}
    >
      <Row gutter={[token.marginSM, token.marginSM]}>
        <Col xs={24} sm={8}>
          <Figure label={t("setup.totalAssets")} value={totals.assets} token={token} />
        </Col>
        <Col xs={24} sm={8}>
          <Figure label={t("setup.totalLiabilities")} value={totals.liabilities} token={token} />
        </Col>
        <Col xs={24} sm={8}>
          <Figure label={equityLabel} value={Math.abs(totals.equity)} token={token} />
        </Col>
      </Row>
      <div
        style={{
          marginTop: token.marginSM,
          paddingTop: token.paddingSM,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {/* Ketiga keadaan membawa IKON + KALIMAT; warnanya penanda kedua. */}
        {totals.unrated > 0 ? (
          <Flex align="center" gap={token.marginXS} style={{ color: money.colorMoneyPending }}>
            <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }} />
            <span>{t("setup.unratedWarning", { count: totals.unrated })}</span>
          </Flex>
        ) : totals.hasAny ? (
          <Flex align="center" gap={token.marginXS} style={{ color: money.colorMoneyPositive }}>
            <CheckCircleOutlined aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }} />
            <span style={TABULAR}>
              {t("setup.balanced", { amount: formatCurrency(totals.assets, "IDR") })}
            </span>
          </Flex>
        ) : (
          <Text type="secondary">{t("setup.noBalancesYet")}</Text>
        )}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  token,
}: {
  label: string;
  value: number;
  token: GlobalToken;
}) {
  return (
    <div>
      <Text type="secondary" style={{ display: "block", fontSize: token.fontSizeSM }}>
        {label}
      </Text>
      <Text strong style={{ display: "block", marginTop: 2, fontSize: token.fontSizeLG, ...TABULAR }}>
        {formatCurrency(value, "IDR")}
      </Text>
    </div>
  );
}
