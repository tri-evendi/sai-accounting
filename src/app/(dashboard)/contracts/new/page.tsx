import { requirePageSession } from "@/lib/page-auth";
import { listClosedPeriods } from "@/lib/period";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { LearnMore } from "@/components/ui/learn-more";
import { NewContractForm } from "./contract-form";

export const dynamic = "force-dynamic";

/**
 * Buat Kontrak — server shell (issue #4/#6).
 *
 * Dipecah mengikuti pola `/invoices/new` dan `/delivery-orders/new`: halaman ini
 * membaca bulan-bulan yang sudah ditutup di server, formulir kliennya yang
 * memakai daftar itu untuk menolak tanggal di periode terkunci SEBELUM dikirim.
 * Penjaganya tetap `assertPeriodOpen` di dalam transaksi penulisan — daftar ini
 * hanya memindahkan kabar buruknya lebih awal.
 */
export default async function NewContractPage() {
  await requirePageSession(["bos", "core"]);

  const closedPeriods = await listClosedPeriods();

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "Kontrak", href: "/contracts" }, { label: "Buat Kontrak" }]} />
      <h1 className="text-2xl font-bold text-foreground">
        <TermTooltip term="kontrak">Buat Kontrak</TermTooltip>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Isi dulu yang pokok: nomor, tanggal, pembeli, dan barangnya. Termin, kemasan, dan
        pengapalan ada di &ldquo;Detail lengkap&rdquo; dan boleh dilewati.
      </p>
      <LearnMore term="kontrak" className="mt-1 mb-6" label="Pelajari ini: apa itu kontrak" />
      <NewContractForm closedPeriods={closedPeriods} />
    </div>
  );
}
