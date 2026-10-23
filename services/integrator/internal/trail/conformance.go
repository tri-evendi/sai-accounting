package trail

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ══ `conformance_runs` — PENGECUALIAN KEDUA, DENGAN ALASAN YANG SAMA ═══════
//
// Sejak sakelar `runner: go` di `contract/kinds.yaml`, sapuan kesesuaian data
// bisa dilaksanakan jalur `tenant` Go. Jejaknya — satu baris per putaran —
// yang menjawab `/api/health` → `conformance` dan halaman konsol
// `/conformance`. Dua jalan untuk menuliskannya, dan yang dipilih adalah yang
// sama dengan `backup_runs`:
//
//   - Go MENITIPKAN temuannya ke Node (hasil pekerjaan, lalu handler Node yang
//     menulis barisnya) DITOLAK. Itu persis yang dilarang I-3 — layanan tidak
//     saling memanggil — dan bentuk gagalnya sudah dikenal: jejak yang hanya
//     ada bila layanan KEDUA hidup. `svc-worker` yang mati membuat sapuan Go
//     yang berhasil terbaca "tidak pernah jalan", dan denyut berbunyi `late`
//     untuk pemeriksa yang bekerja sempurna; lebih buruk lagi, butuh `kind`
//     kedua beserta pengklaimnya hanya untuk memindahkan SATU baris.
//   - Go menulis barisnya sendiri: dipilih. Tabelnya bukan tabel buku (nol
//     angka akuntansi; isinya label temuan, bukan nilai uang), hidup di basis
//     data KENDALI yang sama dengan `backup_runs`, dan menghapus seluruh
//     isinya tidak mengubah satu laporan pun. Invarian I-2 tidak tersentuh.
//
// Keputusannya tercatat di daftar-izin `tests/services-go.test.ts`, tempat
// aturan itu dijaga — bukan hanya di sini.
//
// Konvensi jamnya sama dengan `backup_runs` (lihat `RekamCadangan`): instan
// dikirim sebagai teks UTC `::timestamp`, `created_at`/`updated_at` =
// `now() AT TIME ZONE 'UTC'`, sebab pembacanya Prisma.

// PutaranKesesuaian adalah satu baris `conformance_runs`.
type PutaranKesesuaian struct {
	MulaiPada   time.Time
	SelesaiPada time.Time
	// Status: `ok` | `findings` | `error` — kosakata yang dibaca
	// `conformanceHealth` dan konsol, sama dengan yang ditulis Node.
	Status           string
	CompaniesChecked int
	CompaniesFailed  int
	FindingCount     int
	// Details: JSON `{findings, failures, perCompany, build, runner, service}`.
	Details string
}

// RekamKesesuaian menulis satu baris `conformance_runs`.
//
// Galatnya dipulangkan dan pemanggil WAJIB menelannya — alasan yang sama
// dengan sisi Node (`rekam()` di `check-data-conformance.ts`): jejak yang
// gagal ditulis tidak boleh membatalkan pemeriksaan yang sudah selesai.
// Kendali yang tak terjangkau berarti `/api/health` menjawab `unknown`/`late`
// — jawaban jujur — bukan berarti sapuannya gagal.
func RekamKesesuaian(ctx context.Context, kendali *pgxpool.Pool, p PutaranKesesuaian) error {
	_, err := kendali.Exec(ctx, `
		INSERT INTO conformance_runs (started_at, finished_at, status, companies_checked,
		                              companies_failed, finding_count, details,
		                              created_at, updated_at)
		VALUES ($1::timestamp, $2::timestamp, $3, $4, $5, $6, $7,
		        now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
		TeksUTC(p.MulaiPada), TeksUTC(p.SelesaiPada), p.Status, p.CompaniesChecked,
		p.CompaniesFailed, p.FindingCount, p.Details)
	if err != nil {
		return fmt.Errorf("rekam putaran kesesuaian: %w", err)
	}
	return nil
}
