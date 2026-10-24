//go:build tools

// Package sqlctool memaku versi `sqlc` yang membangkitkan
// `internal/queuedb` dari `contract/jobs.sql` (09 §3.5).
//
// ══ MODUL TERPISAH, DAN ITU DISENGAJA ═════════════════════════════════════
// `sqlc` menarik ratusan modul (pengurai PostgreSQL ber-cgo, wasm, CLI).
// Memasukkannya ke `go.mod` integrator akan membayar balik justru alasan Go
// dipilih — image kecil, dependensi sedikit (lihat kepala `go.mod` di sana).
// Modul ini tidak pernah dibangun ke image mana pun: ia hanya perkakas yang
// dijalankan `bun run contract:gen` lewat `go run`, versinya dipatok di
// `go.mod` + `go.sum` di sebelah berkas ini.
//
// ══ GERBANGNYA TIDAK MEMBUTUHKAN PERKAKAS INI ═════════════════════════════
// `contract:gen --cek` (dipanggil `bun run verify`) TIDAK menjalankan `sqlc`:
// ia membandingkan sidik SHA-256 masukan (`contract/jobs.sql`, skema yang
// dirakit dari migration kendali, `sqlc.yaml`, versi ini) dan keluaran yang
// tercatat di `internal/queuedb/sqlc.sum`. Gerbangnya tanpa jaringan dan
// tanpa toolchain Go; yang butuh keduanya hanya PEMBANGKITAN ulang.
package sqlctool

import (
	_ "github.com/sqlc-dev/sqlc/cmd/sqlc"
)
