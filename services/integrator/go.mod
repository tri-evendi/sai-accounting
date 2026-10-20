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

require (
	github.com/aws/aws-sdk-go-v2 v1.32.6
	github.com/aws/aws-sdk-go-v2/config v1.28.6
	github.com/aws/aws-sdk-go-v2/service/s3 v1.71.0
	github.com/jackc/pgx/v5 v5.7.2
	golang.org/x/crypto v0.31.0
)

require (
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.6.7 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.17.47 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.16.21 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.3.25 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.6.25 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.1 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.3.25 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.12.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.4.6 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.12.6 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.18.6 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.24.7 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.28.6 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.33.2 // indirect
	github.com/aws/smithy-go v1.22.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.10.0 // indirect
	golang.org/x/text v0.21.0 // indirect
)
