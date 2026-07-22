"use client";

/**
 * Recording a retur penjualan / pembelian (issue #27).
 *
 * The origin document is picked first; everything downstream (currency, prices,
 * how much is still returnable) is read from the server, never typed — the same
 * "server is authoritative on money" stance as the invoice form. Returnable
 * amounts are shown per line so the over-return cap is visible before submit, and
 * the same cap is re-enforced server-side.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Info, Trash2, Plus } from "lucide-react";

interface InvoiceOption {
  id: number;
  invoiceNo: string;
  date: string;
  currency: string;
  customerName: string | null;
}
interface PurchaseOption {
  id: number;
  date: string;
  currency: string;
  amount: number;
  supplierName: string | null;
}
interface ItemOption {
  id: number;
  name: string;
}

interface InvoiceLine {
  invoiceItemId: number;
  itemName: string;
  unit: string | null;
  price: number;
  quantity: number;
  returned: number;
  returnable: number;
}
interface InvoiceDetail {
  invoiceNo: string;
  currency: string;
  rate: number | null;
  taxRate: number | null;
  items: InvoiceLine[];
}
interface PurchaseDetail {
  currency: string;
  rate: number | null;
  amount: number;
  returned: number;
  returnable: number;
  supplier: { name: string } | null;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReturnForm({
  initialType,
  invoices,
  purchases,
  items,
}: {
  initialType: "sales" | "purchase";
  invoices: InvoiceOption[];
  purchases: PurchaseOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [type, setType] = useState<"sales" | "purchase">(initialType);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sales side
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [salesLines, setSalesLines] = useState<Record<number, { qty: string; itemId: string }>>({});

  // Purchase side
  const [purchaseId, setPurchaseId] = useState("");
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetail | null>(null);
  const [purchaseLines, setPurchaseLines] = useState<
    { itemName: string; quantity: string; price: string; itemId: string }[]
  >([{ itemName: "", quantity: "", price: "", itemId: "" }]);

  const loadInvoice = useCallback(async (id: string) => {
    setInvoiceDetail(null);
    setSalesLines({});
    if (!id) return;
    const res = await fetch(`/api/returns/sales?invoiceId=${id}`);
    if (res.ok) setInvoiceDetail(await res.json());
  }, []);

  const loadPurchase = useCallback(async (id: string) => {
    setPurchaseDetail(null);
    if (!id) return;
    const res = await fetch(`/api/returns/purchase?purchaseId=${id}`);
    if (res.ok) setPurchaseDetail(await res.json());
  }, []);

  useEffect(() => {
    if (type === "sales") loadInvoice(invoiceId);
  }, [type, invoiceId, loadInvoice]);
  useEffect(() => {
    if (type === "purchase") loadPurchase(purchaseId);
  }, [type, purchaseId, loadPurchase]);

  // ── Derived totals for the live ledger preview ──
  const currency =
    type === "sales" ? invoiceDetail?.currency ?? "IDR" : purchaseDetail?.currency ?? "IDR";

  const salesSubtotal = invoiceDetail
    ? round2(
        invoiceDetail.items.reduce((s, ln) => {
          const qty = Number(salesLines[ln.invoiceItemId]?.qty) || 0;
          return s + qty * ln.price;
        }, 0)
      )
    : 0;

  const purchaseSubtotal = round2(
    purchaseLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0)
  );

  function setSalesQty(id: number, qty: string) {
    setSalesLines((prev) => ({ ...prev, [id]: { qty, itemId: prev[id]?.itemId ?? "" } }));
  }
  function setSalesItem(id: number, itemId: string) {
    setSalesLines((prev) => ({ ...prev, [id]: { qty: prev[id]?.qty ?? "", itemId } }));
  }

  function updatePurchaseLine(i: number, patch: Partial<(typeof purchaseLines)[number]>) {
    setPurchaseLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let url: string;
    let payload: Record<string, unknown>;

    if (type === "sales") {
      if (!invoiceId) return setError("Pilih faktur asal terlebih dulu.");
      const lineItems = Object.entries(salesLines)
        .map(([id, v]) => ({
          invoiceItemId: Number(id),
          quantity: round3(Number(v.qty) || 0),
          itemId: v.itemId ? Number(v.itemId) : undefined,
        }))
        .filter((l) => l.quantity > 0);
      if (lineItems.length === 0) return setError("Isi jumlah retur pada minimal satu baris.");
      url = "/api/returns/sales";
      payload = { invoiceId: Number(invoiceId), date, reason: reason || undefined, items: lineItems };
    } else {
      if (!purchaseId) return setError("Pilih pembelian asal terlebih dulu.");
      const lineItems = purchaseLines
        .map((l) => ({
          itemName: l.itemName.trim(),
          quantity: round3(Number(l.quantity) || 0),
          price: round2(Number(l.price) || 0),
          itemId: l.itemId ? Number(l.itemId) : undefined,
        }))
        .filter((l) => l.itemName && l.quantity > 0);
      if (lineItems.length === 0) return setError("Isi minimal satu baris barang yang diretur.");
      url = "/api/returns/purchase";
      payload = { purchaseId: Number(purchaseId), date, reason: reason || undefined, items: lineItems };
    }

    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? "Gagal menyimpan retur.");
        return;
      }
      toast("Retur tersimpan dan sudah dijurnal.", "success");
      router.push(`/returns?tab=${type}`);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const itemOptions = [
    { value: "", label: "— Tidak lacak stok —" },
    ...items.map((it) => ({ value: String(it.id), label: it.name })),
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="type"
            label="Jenis retur"
            value={type}
            onChange={(e) => {
              setType(e.target.value as "sales" | "purchase");
              setError(null);
            }}
            options={[
              { value: "sales", label: "Retur Penjualan (barang kembali dari pelanggan)" },
              { value: "purchase", label: "Retur Pembelian (barang dikembalikan ke supplier)" },
            ]}
          />
          <Input
            id="date"
            type="date"
            label="Tanggal"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          {type === "sales" ? (
            <div className="sm:col-span-2">
              <Select
                id="invoiceId"
                label="Faktur asal"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                placeholder="Pilih faktur"
                options={invoices.map((i) => ({
                  value: String(i.id),
                  label: `${i.invoiceNo} · ${i.currency} · ${i.customerName ?? "—"}`,
                }))}
                required
              />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Select
                id="purchaseId"
                label="Pembelian asal"
                value={purchaseId}
                onChange={(e) => setPurchaseId(e.target.value)}
                placeholder="Pilih pembelian"
                options={purchases.map((p) => ({
                  value: String(p.id),
                  label: `TRX-${p.id} · ${p.currency} ${formatCurrency(p.amount, p.currency)} · ${
                    p.supplierName ?? "—"
                  }`,
                }))}
                required
              />
            </div>
          )}
        </div>
      </Card>

      {/* Sales: per-line returnable table */}
      {type === "sales" && invoiceDetail && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Barang</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Harga</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Sisa dpt diretur</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Jumlah retur</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Stok item</th>
                </tr>
              </thead>
              <tbody>
                {invoiceDetail.items.map((ln) => {
                  const v = salesLines[ln.invoiceItemId];
                  const qty = Number(v?.qty) || 0;
                  const over = qty > ln.returnable + 1e-6;
                  return (
                    <tr key={ln.invoiceItemId} className="border-b border-gray-100">
                      <td className="px-4 py-3 text-gray-900">
                        {ln.itemName}
                        {ln.unit && <span className="text-gray-500"> ({ln.unit})</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {formatCurrency(ln.price, invoiceDetail.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {round3(ln.returnable)}
                        <span className="block text-xs text-gray-500">
                          dari {round3(ln.quantity)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Input
                          id={`qty-${ln.invoiceItemId}`}
                          type="number"
                          step="0.001"
                          min="0"
                          max={ln.returnable}
                          className={`w-28 text-right tabular-nums ${over ? "border-red-500" : ""}`}
                          value={v?.qty ?? ""}
                          onChange={(e) => setSalesQty(ln.invoiceItemId, e.target.value)}
                          disabled={ln.returnable <= 0}
                        />
                        {over && (
                          <span className="mt-0.5 block text-xs text-red-600">Melebihi sisa</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          id={`item-${ln.invoiceItemId}`}
                          value={v?.itemId ?? ""}
                          onChange={(e) => setSalesItem(ln.invoiceItemId, e.target.value)}
                          options={itemOptions}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Purchase: free-text lines + remaining value */}
      {type === "purchase" && purchaseDetail && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-gray-600 tabular-nums">
            Sisa nilai yang dapat diretur:{" "}
            <strong className="text-gray-900">
              {formatCurrency(purchaseDetail.returnable, purchaseDetail.currency)}
            </strong>{" "}
            dari {formatCurrency(purchaseDetail.amount, purchaseDetail.currency)}
          </p>
          <div className="space-y-3">
            {purchaseLines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <Input
                    id={`pname-${i}`}
                    label={i === 0 ? "Barang" : undefined}
                    value={l.itemName}
                    onChange={(e) => updatePurchaseLine(i, { itemName: e.target.value })}
                    maxLength={100}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id={`pqty-${i}`}
                    label={i === 0 ? "Qty" : undefined}
                    type="number"
                    step="0.001"
                    min="0"
                    className="text-right tabular-nums"
                    value={l.quantity}
                    onChange={(e) => updatePurchaseLine(i, { quantity: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id={`pprice-${i}`}
                    label={i === 0 ? "Harga" : undefined}
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right tabular-nums"
                    value={l.price}
                    onChange={(e) => updatePurchaseLine(i, { price: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Select
                    id={`pitem-${i}`}
                    label={i === 0 ? "Stok item" : undefined}
                    value={l.itemId}
                    onChange={(e) => updatePurchaseLine(i, { itemId: e.target.value })}
                    options={itemOptions}
                  />
                </div>
                <div className="sm:col-span-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPurchaseLines((prev) =>
                        prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev
                      )
                    }
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50"
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 cursor-pointer"
            onClick={() =>
              setPurchaseLines((prev) => [...prev, { itemName: "", quantity: "", price: "", itemId: "" }])
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Tambah baris
          </Button>
        </Card>
      )}

      <Card className="p-6">
        <Input
          id="reason"
          label="Alasan retur (opsional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />

        {(salesSubtotal > 0 || purchaseSubtotal > 0) && (
          <p className="mt-4 text-sm text-gray-600 tabular-nums">
            Nilai retur (DPP):{" "}
            <strong className="text-gray-900">
              {formatCurrency(type === "sales" ? salesSubtotal : purchaseSubtotal, currency)}
            </strong>
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {type === "sales" ? (
              <>
                Mengurangi <strong>Piutang Usaha</strong> dan <strong>Penjualan</strong>, membalik{" "}
                <strong>PPN Keluaran</strong> secara proporsional, dan mengembalikan stok{" "}
                <strong>masuk</strong>.
              </>
            ) : (
              <>
                Mengurangi <strong>Hutang Usaha</strong> dan <strong>Persediaan</strong>, membalik{" "}
                <strong>PPN Masukan</strong> secara proporsional, dan mengeluarkan stok{" "}
                <strong>keluar</strong>.
              </>
            )}{" "}
            Dinilai dengan kurs dokumen asal.
          </span>
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving && (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          Simpan Retur
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => router.push(`/returns?tab=${type}`)}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
