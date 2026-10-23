// Package bulklane: pelari jalur `bulk` sisi Go — KERANGKA, dengan NOL kind
// hari ini, dan itu keputusan yang ditulis, bukan pekerjaan yang terlupa
// (rancangan 09 §3.2, §9).
//
// ══ KENAPA KOSONG ══════════════════════════════════════════════════════════
// Kontrak menaruh tiga kind di jalur ini, dan tidak satu pun boleh atau bisa
// dikerjakan Go hari ini:
//
//   - `import.process` MENULIS buku (data master, saldo awal). Pintu posting
//     wajib tunggal dan ia TypeScript (I-2, aturan Go nomor 1) — impor tidak
//     akan pernah pindah ke sini.
//   - `mail.batch` (pengingat & pemberitahuan: `remind:customers`,
//     `notify:invoice-due`, `notify:setup`) menulis riwayat kirim
//     (`invoice_sends`) di buku PT dan membaca SMTP per tenant yang tersandi —
//     tulisan di luar
//     daftar-izin pohon Go (`jobs`, `backup_runs`), dan rahasia tenant di
//     proses yang sudah memegang kunci cadangan. Tetap Node.
//   - `report.package` tidak pernah ada di aplikasi ini (09 §9): membangunnya
//     adalah FITUR baru, bukan pemindahan.
//
// ══ KIND PERTAMA YANG AKAN MASUK, DAN SYARATNYA ════════════════════════════
// Ekspor data mandiri tenant (#142, `src/lib/tenant-export.ts`): HANYA
// MEMBACA, berkasnya besar (ZIP seluruh buku setiap PT + dokumen), dan hari
// ini di-stream SINKRON di dalam permintaan `app-customer`. Tiga hal menahannya,
// dan ketiganya keputusan, bukan kode:
//
//  1. Produk: ekspor berubah dari unduhan langsung menjadi "pekerjaan, lalu
//     unduh" — layar & salinan berubah.
//  2. Jejak audit tenant ditulis SEBELUM byte pertama (`tenant_audit_logs`,
//     basis data kendali) — Go tidak boleh menulisnya; penerbit (Node) yang
//     harus menulis jejaknya saat MENERBITKAN.
//  3. CSV-nya harus setara byte demi byte dengan `toCsv` TS — butuh skrip
//     paritas seperti `report-engine` sebelum versi TS dicabut.
//
// ══ YANG SUDAH ADA, DAN BERLAKU BEGITU KIND PERTAMA MASUK ══════════════════
//   - pagar memori per pekerjaan dari kontrak (`memory_fence_mib`, ditegakkan
//     `jobs.Runner`): pekerjaan borongan yang menggembung dibatalkan SEBELUM
//     OOM-killer membunuh seluruh `svc-integrator` beserta dump cadangan yang
//     sedang berjalan;
//   - satu pekerjaan per proses (sama dengan setiap jalur); jalur jamak
//     (`single_instance: false`) — skala = jumlah proses;
//   - sambungan lewat PgBouncer (`CONTROL_DATABASE_URL`), seperti
//     `interactive`: satu tenant per pekerjaan, bukan pencacahan server;
//   - kesehatan & metrik: umur antrean, kedalaman, laju, dan histogram durasi
//     per jalur di `/scheduler` sudah menghitung `bulk` dari kontrak — tidak
//     ada yang perlu ditambahkan di sisi permukaan.
//
// `cmd/integrator` menjalankan jalur ini HANYA bila `Enabled()` — pelari
// tanpa satu kind pun adalah kode mati yang terlihat hidup (09 §9), dan
// `jobs.Runner` memang menolaknya.
package bulklane

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

// handlers: kind `bulk` yang dikerjakan Go. Kind pertama didaftarkan DI SINI
// — dan `tests/kind-punya-pengklaim.test.ts` menolak bila Node juga
// mengklaimnya.
func handlers(_ *pgxpool.Pool) map[contract.JobKind]jobs.Handler {
	return map[contract.JobKind]jobs.Handler{}
}

// Enabled melaporkan apakah jalur ini punya sedikitnya satu kind ber-handler.
func Enabled() bool { return len(handlers(nil)) > 0 }

// Run menguras jalur `bulk` sampai SIGTERM/SIGINT atau sampai `stop` selesai.
func Run(ctx, stop context.Context) error {
	kolam, err := db.Kendali(ctx, 2)
	if err != nil {
		return err
	}
	defer kolam.Close()

	pelari := &jobs.Runner{
		Lane:     contract.LaneBulk,
		Queue:    jobs.New(kolam),
		Handlers: handlers(kolam),
		Stop:     stop,
	}
	return pelari.Run(ctx)
}
