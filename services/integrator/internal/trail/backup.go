// Package trail menulis JEJAK PUTARAN ke basis data kendali.
//
// ══ SATU-SATUNYA TULISAN GO DI LUAR TABEL `jobs`, DAN KENAPA ═══════════════
//
// Aturan pohon Go: ia membaca buku, menulis tabel `jobs`, dan menghasilkan
// berkas. `backup_runs` dan — sejak 23 Okt 2026 — `conformance_runs`
// (`conformance.go`) adalah pengecualian yang DISEBUT, bukan pelonggaran yang
// kebetulan lolos — dan keduanya dijaga daftar-izin eksplisit di
// `tests/services-go.test.ts`. Paket ini satu-satunya tempat tulisan itu.
//
// Sebabnya I-3: layanan tidak saling memanggil. `scripts/backup.sh` menitipkan
// barisnya ke Node lewat `bun run record:backup`, dan jalur Go tidak punya
// jalan itu — tidak ada Node di image-nya, dan memanggil layanan lain justru
// yang dilarang. Yang tersisa dua pilihan: Go menulis barisnya sendiri, atau
// jejaknya hilang.
//
// Jejaknya tidak boleh hilang, sebab ia yang menjawab `/api/health` → `backup`.
// Tanpanya produksi bisa berjalan puluhan hari tanpa satu salinan sementara
// container terlihat "Up" — dan itu BUKAN hipotesis: produksi repo ini pernah
// berjalan 26 hari begitu, dan tidak ada yang berbunyi ke luar sekali pun.
//
// `backup_runs` juga bukan tabel buku: tidak ada satu angka akuntansi di
// dalamnya, dan menghapus seluruh isinya tidak mengubah satu laporan pun.
// Invarian I-2 tidak tersentuh.
package trail

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/controlsql"
)

// PutaranCadangan adalah satu baris `backup_runs`.
type PutaranCadangan struct {
	MulaiPada   time.Time
	SelesaiPada time.Time
	// Status: `ok` (ada salinan di LUAR mesin), `local` (hanya di cakram ini),
	// atau `error`. `local` sengaja BUKAN varian dari `ok`: `backupHealth`
	// mencari keberhasilan dengan `status = 'ok'`, jadi nilai terpisah inilah
	// yang mencegah salinan lokal mengisi `lastSuccessAt` dan membuat permukaan
	// kesehatan berkata terlindungi.
	Status string
	// Sebab kegagalan apa adanya. TIDAK memuat kredensial: yang ditulis jalur
	// ini kalimat sebab, bukan nilainya.
	Galat *string
	// Artifact: nama PUTARAN, bukan nama satu berkas — sejak tahap 1b satu
	// putaran memuat satu objek per basis data.
	Artifact *string
	// SizeBytes: jumlah byte SELURUH objek putaran ini. Cadangan yang
	// "berhasil" tapi 0 byte adalah kegagalan yang paling meyakinkan
	// bentuknya, dan satu-satunya angka yang bisa membantahnya adalah
	// ukurannya sendiri.
	SizeBytes *int64
}

// RekamCadangan menulis satu baris `backup_runs`.
//
// ══ TIDAK PERNAH MENGGAGALKAN CADANGANNYA ══════════════════════════════════
// Galatnya dipulangkan, dan pemanggilnya WAJIB menelannya. Sebuah cadangan
// yang BERHASIL dikirim lalu dilaporkan gagal semata-mata karena satu tulisan
// riwayat tidak bisa ditulis adalah kebalikan dari gunanya jejak ini: ia
// mengubah pencatatan menjadi sumber kegagalan baru.
//
// Yang hilang saat kendali tak terjangkau hanyalah SATU baris riwayat, dan
// denyutnya sudah menangani ketiadaan itu — `backupHealth` memulangkan
// `unknown`, bukan `ok`.
//
// ══ `started_at`/`finished_at` = UTC, DIKIRIM SEBAGAI TEKS ═════════════════
// Berbeda dari `jobs` (yang jamnya `now()` sesi, lihat `jobs/queue.go`),
// kedua kolom ini INSTAN yang dihitung di luar basis data, dan pembacanya
// Prisma (`backupRun.findFirst` di `/api/health`, `watch:health`, konsol) —
// yang membaca TIMESTAMP tanpa zona sebagai UTC. `record-backup-run.ts` juga
// menulisnya lewat Prisma, jadi UTC. Maka nilainya dikirim sebagai teks UTC
// yang di-cast `::text::timestamp`, bentuk yang sama dengan `asOf` di `ledgerread`:
// `time.Time` yang diikat langsung bergantung pada mode koneksi pgx (mode
// bawaan membuang zonanya → jam dinding proses; mode `exec` mengirim
// `timestamptz` → dikonversi zona SESI, tujuh jam bergeser di server WIB).
// `created_at`/`updated_at` ikut UTC (`now() AT TIME ZONE 'UTC'`), sebab
// Prisma mengisi keduanya dengan UTC pada baris yang ia tulis; `now()` polos
// akan menyimpan jam dinding zona sesi di tabel yang sama.
func RekamCadangan(ctx context.Context, kendali *pgxpool.Pool, p PutaranCadangan) error {
	// SQL-nya `contract/trail.sql` → InsertBackupRun (bangkitan `sqlc`):
	// instan dikirim sebagai teks UTC dan di-cast `::text::timestamp`.
	err := controlsql.New(kendali).InsertBackupRun(ctx, controlsql.InsertBackupRunParams{
		StartedAtUtc:  TeksUTC(p.MulaiPada),
		FinishedAtUtc: TeksUTC(p.SelesaiPada),
		Status:        p.Status,
		Error:         p.Galat,
		Artifact:      p.Artifact,
		SizeBytes:     p.SizeBytes,
	})
	if err != nil {
		return fmt.Errorf("rekam putaran cadangan: %w", err)
	}
	return nil
}

// tataLetakUTC: presisi mikrodetik tanpa zona — cukup untuk TIMESTAMP(3).
const tataLetakUTC = "2006-01-02 15:04:05.999999"

// TeksUTC menulis instan sebagai jam dinding UTC tanpa zona — bentuk yang
// disimpan Prisma untuk kolom TIMESTAMP tanpa zona. Murni, jadi bisa diuji
// tanpa basis data dan tanpa bergantung pada TZ proses.
func TeksUTC(t time.Time) string {
	return t.UTC().Format(tataLetakUTC)
}
