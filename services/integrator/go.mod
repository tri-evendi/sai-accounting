// INTEGRATOR — jalur pekerjaan yang NOL ATURAN AKUNTANSI (rancangan §3.3).
//
// ══ APA YANG BOLEH ADA DI POHON INI, DAN APA YANG TIDAK ════════════════════
// Kode di sini membaca buku besar, menulis tabel `jobs`, dan menghasilkan
// berkas. Ia TIDAK PERNAH `INSERT`/`UPDATE` tabel buku: pintu posting wajib
// tunggal (invarian I-2) dan pintu itu TypeScript, sebab `app-customer`
// memposting secara sinkron saat pengguna menekan tombol dan ia tidak akan
// pindah. Dijaga `tests/services-go.test.ts` — penjaga TypeScript, karena
// `bun run verify` adalah gerbang yang tidak pernah dilewati orang.
//
// ══ `services/` SENGAJA DI LUAR WORKSPACE BUN ══════════════════════════════
// Glob workspace-nya `packages/*` + `apps/*`, terukur. Jangan menaruh
// `package.json` di dalam pohon ini — itu menariknya ke graf paket yang
// penjaganya tidak memahaminya.
//
// ══ DEPENDENSI DIJAGA SEDIKIT, DAN ITU DISENGAJA ═══════════════════════════
// Alasan Go dipilih (§3.3) adalah memori diam puluhan MB dan image kecil.
// Setiap modul yang masuk ke sini membayar balik sebagian dari itu, jadi yang
// boleh masuk hanya yang tidak ada padanannya di pustaka baku: driver
// PostgreSQL. Enkripsi, SHA-256, dan HTTP sudah ada di pustaka baku, dan
// itulah yang menghapus `openssl` dari image.
module github.com/tri-evendi/sai-accounting/services/integrator

// Dipatok pada versi yang sama dengan tahap `go-build` di Dockerfile. Versi
// yang berbeda antara mesin pengembang dan image berarti perilaku yang berbeda
// pada hal yang paling sulit dilihat: urutan map, GC, dan `time` monotonik.
go 1.23

require github.com/jackc/pgx/v5 v5.7.2

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.31.0 // indirect
	golang.org/x/sync v0.10.0 // indirect
	golang.org/x/text v0.21.0 // indirect
)
