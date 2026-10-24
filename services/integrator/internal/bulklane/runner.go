// Package bulklane: pelari jalur `bulk` sisi Go (rancangan 09 §3.2, §9).
//
// ══ KIND PERTAMANYA: EKSPOR DATA MANDIRI TENANT (#142) ═════════════════════
// Keputusan pemilik 23 Okt 2026. `tenant.data_export` HANYA MEMBACA, berkasnya
// besar (ZIP seluruh buku setiap PT + dokumen), dan sampai keputusan itu
// di-stream SINKRON di dalam permintaan `app-customer`. Tiga syarat yang
// dulu menahannya, dan bagaimana masing-masing dipenuhi:
//
//  1. Produk — ekspor menjadi "pekerjaan, lalu unduh": DIPUTUSKAN ya. Layar
//     menerbitkan, menunggu kemajuan, lalu menampilkan tautan unduh
//     (`privacy-section.tsx`).
//  2. Jejak audit tenant (`tenant_audit_logs`, basis data kendali) ditulis
//     PENERBIT Node saat menerbitkan (`src/lib/tenant-export-job.ts`) — pohon
//     Go hanya menulis `jobs` dan `backup_runs` (`tests/services-go.test.ts`).
//  3. CSV setara byte demi byte dengan `toCsv` TS — `bun run
//     parity:tenant-export`. Sampai paritas produksi lulus, `runner:` kind ini
//     di `contract/kinds.yaml` tetap `node`, rute sinkron TS yang melayani, dan
//     pekerjaan yang tetap tiba di sini DIGAGALKAN dengan pesan yang terbaca —
//     tepat satu pelaksana, tidak pernah dua.
//
// ══ KIND LAIN DI JALUR INI, DAN KENAPA TETAP DI LUAR GO ════════════════════
//   - `import.process` MENULIS buku (data master, saldo awal). Pintu posting
//     wajib tunggal dan ia TypeScript (I-2, aturan Go nomor 1).
//   - `mail.batch` menulis riwayat kirim (`invoice_sends`) di buku PT dan
//     membaca SMTP per tenant yang tersandi — tulisan di luar daftar-izin
//     pohon Go, dan rahasia tenant di proses yang sudah memegang kunci cadangan.
//
// ══ KIND KEDUA: PAKET LAPORAN (`report.package`, 24 Okt 2026) ══════════════
// Fitur baru (09 §5), bukan pemindahan — lihat `package.go`: lembar sebar
// dihitung `interactivelane.LembarLaporan` (penghasil `report.export_go`),
// PDF-nya datang dari pekerjaan anak Node `report.package_pdf`, dan berkas
// akhirnya satu ZIP di volume `hasil`. HANYA MEMBACA buku dan `jobs`.
//
// ══ YANG BERLAKU UNTUK SETIAP KIND DI SINI ═════════════════════════════════
//   - pagar memori per pekerjaan dari kontrak (`memory_fence_mib`, ditegakkan
//     `jobs.Runner`): pekerjaan borongan yang menggembung dibatalkan SEBELUM
//     OOM-killer membunuh seluruh `svc-integrator` beserta dump cadangan yang
//     sedang berjalan. Ekspor tenant karena itu MENGALIR — baris dari kursor,
//     dokumen lewat `io.Copy`, ZIP langsung ke berkas (`internal/tenantexport`);
//   - satu pekerjaan per proses (sama dengan setiap jalur); jalur jamak
//     (`single_instance: false`) — skala = jumlah proses;
//   - sambungan lewat PgBouncer (`CONTROL_DATABASE_URL`), seperti
//     `interactive`;
//   - kesehatan & metrik per jalur di `/scheduler` sudah menghitung `bulk`
//     dari kontrak.
package bulklane

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/document"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/tenantexport"
)

// Kinds: kind `bulk` yang dikerjakan Go — HARUS sama dengan kunci peta
// `Handlers` di `Run` (dijaga `runner_test.go`). Peta itu ditulis di tempat
// supaya `tests/kind-punya-pengklaim.test.ts` bisa membacanya dari teks.
var Kinds = []contract.JobKind{contract.KindTenantDataExport, contract.KindReportPackage}

// Enabled melaporkan apakah jalur ini punya sedikitnya satu kind ber-handler.
// `cmd/integrator` tidak menjalankan jalur tanpa kind: pelari kosong adalah
// kode mati yang terlihat hidup (09 §9).
func Enabled() bool { return len(Kinds) > 0 }

// Run menguras jalur `bulk` sampai SIGTERM/SIGINT atau sampai `stop` selesai.
func Run(ctx, stop context.Context) error {
	kolam, err := db.Kendali(ctx, 2)
	if err != nil {
		return err
	}
	defer kolam.Close()

	antrean := jobs.New(kolam)
	pelari := &jobs.Runner{
		Lane:  contract.LaneBulk,
		Queue: antrean,
		Handlers: map[contract.JobKind]jobs.Handler{
			contract.KindTenantDataExport: handlerEkspor(kolam, document.ResultsRootDefault, tenantexport.DocumentsRootDefault, pelaksanaGo),
			contract.KindReportPackage:    handlerPaket(kolam, antrean, document.ResultsRootDefault),
		},
		Stop: stop,
	}
	return pelari.Run(ctx)
}

// pelaksanaGo: apakah kontrak menyatakan Go pelaksana ekspor tenant hari ini.
func pelaksanaGo() bool {
	return contract.KindRunners[contract.KindTenantDataExport] == contract.RunnerGo
}

// selangKemajuan: kemajuan ditulis paling sering sekali per selang ini —
// setiap tulisan satu UPDATE `jobs`, dan buku besar berisi puluhan tabel.
const selangKemajuan = 2 * time.Second

func handlerEkspor(kolam *pgxpool.Pool, hasilRoot, dokumenRoot string, pelaksanaGo func() bool) jobs.Handler {
	return func(c jobs.Ctx) (*string, error) {
		if !pelaksanaGo() {
			// Terbit sebelum jalan mundur ke Node. Mengerjakannya berarti dua
			// pelaksana untuk satu sakelar; menyelesaikannya tanpa berkas
			// berarti tombol unduh yang tak pernah muncul. Gagal yang terbaca.
			return nil, fmt.Errorf("pelaksana %s di contract/kinds.yaml adalah %s, bukan Go — "+
				"pekerjaan ini tidak dikerjakan; minta ekspor lagi dari Pengaturan Tenant",
				contract.KindTenantDataExport, contract.KindRunners[contract.KindTenantDataExport])
		}

		tenant, companies, err := tenantexport.LoadTenant(c.Ctx, kolam, c.Job.TenantID)
		if err != nil {
			return nil, err
		}
		now := time.Now()
		filename, err := tenantexport.FileName(tenant.Slug, now)
		if err != nil {
			return nil, err
		}

		terakhir, kapan := -1, time.Time{}
		lapor := func(persen int) {
			if persen == terakhir || time.Since(kapan) < selangKemajuan {
				return
			}
			terakhir, kapan = persen, time.Now()
			_ = c.Progress(persen)
		}

		var sum tenantexport.Summary
		ref, err := document.WriteResultStream(hasilRoot, c.Job.Kind, c.Job.ID, filename, func(w io.Writer) error {
			bw := bufio.NewWriterSize(w, 256<<10)
			s, err := tenantexport.Write(c.Ctx, bw, *tenant, companies, tenantexport.Options{
				DocumentsRoot: dokumenRoot,
				GeneratedAt:   now,
				Progress:      lapor,
			})
			sum = s
			if err != nil {
				return err
			}
			return bw.Flush()
		})
		if err != nil {
			return nil, err
		}
		log.Printf("[bulk] #%d ekspor tenant %s: %d PT · %d tabel · %d baris · %d dokumen (%d tak ditemukan)",
			c.Job.ID, tenant.Slug, sum.Companies, sum.Tables, sum.Rows, sum.Documents, sum.Missing)
		_ = c.Progress(100)
		return &ref, nil
	}
}
