// Package buildinfo menyebut build mana yang sedang dijalankan biner ini.
//
// Padanan `@sai/core/build-info` (TypeScript), dan bentuk keluarannya SAMA
// PERSIS — baris log start dan stempel identitas pekerja dibaca konsol
// operator dari kedua bahasa dengan satu pengurai. Kesamaan tata letaknya
// dijaga `tests/build-stamp.test.ts`.
//
// ══ SUMBER, BERURUTAN ════════════════════════════════════════════════════
//  1. `-ldflags -X` saat `go build` (tahap `go-build` di Dockerfile) — nilai
//     yang tertanam di biner, ikut ke mana pun biner itu disalin;
//  2. variabel lingkungan `APP_VERSION` / `GIT_SHA` / `BUILD_TIME` (ENV di
//     tahap `integrator`) — cadangan bila biner dibangun tanpa ldflags;
//  3. `debug.ReadBuildInfo` (`vcs.revision`) untuk sha `go build` lokal;
//  4. `0.0.0` / `dev` / tidak diketahui.
package buildinfo

import (
	"fmt"
	"os"
	"runtime/debug"
	"strings"
	"time"
)

// Diisi `-ldflags "-X …/buildinfo.Version=… -X …/buildinfo.Sha=… -X …/buildinfo.BuiltAt=…"`.
// Kosong = tidak ditanam.
var (
	Version = ""
	Sha     = ""
	BuiltAt = ""
)

// Service adalah layanan compose yang menjalankan biner ini — ikut tertulis
// di stempel identitas (`jobs.claimed_by`) supaya konsol membedakannya dari
// pelari Node (`svc-worker`) yang melayani jalur `interactive` yang sama.
const Service = "svc-integrator"

const (
	devSha         = "dev"
	unknownVersion = "0.0.0"
	shortShaLen    = 7
	// IdentityMax = batas `jobs.claimed_by` (VARCHAR(100)). Identitas yang
	// melampauinya ditolak basis data saat klaim.
	IdentityMax = 100
)

// Info adalah stempel satu build.
type Info struct {
	Version  string
	Sha      string
	ShortSha string
	BuiltAt  string // "" = tidak diketahui
}

func pertama(nilai ...string) string {
	for _, v := range nilai {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}

func vcsRevision() string {
	bi, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	for _, s := range bi.Settings {
		if s.Key == "vcs.revision" {
			return s.Value
		}
	}
	return ""
}

// Get membaca stempel proses ini.
func Get() Info {
	return resolve(Version, Sha, BuiltAt, os.Getenv, vcsRevision)
}

func resolve(ver, sha, built string, getenv func(string) string, vcs func() string) Info {
	v := strings.TrimPrefix(pertama(ver, getenv("APP_VERSION")), "v")
	if v == "" {
		v = unknownVersion
	}
	s := pertama(sha, getenv("GIT_SHA"))
	if s == "" {
		s = pertama(vcs())
	}
	if s == "" {
		s = devSha
	}
	pendek := s
	if s != devSha && len(s) > shortShaLen {
		pendek = s[:shortShaLen]
	}
	b := pertama(built, getenv("BUILD_TIME"))
	if b != "" {
		if _, err := time.Parse(time.RFC3339, b); err != nil {
			b = ""
		}
	}
	return Info{Version: v, Sha: s, ShortSha: pendek, BuiltAt: b}
}

// Label: `v0.12.1+abc1234`.
func (i Info) Label() string {
	return fmt.Sprintf("v%s+%s", i.Version, i.ShortSha)
}

// Banner: `svc-integrator v0.12.1 (abc1234, built 2026-10-22T…Z)` — bentuk
// `buildBanner` di TypeScript.
func (i Info) Banner(service string) string {
	built := i.BuiltAt
	if built == "" {
		built = "unknown"
	}
	return fmt.Sprintf("%s v%s (%s, built %s)", service, i.Version, i.ShortSha, built)
}

// StampIdentity: `<kepala> <layanan> v<versi>+<sha>`, maksimal IdentityMax.
// Yang dipangkas bila terlalu panjang adalah KEPALA — stempel satu-satunya
// bagian yang dibaca mesin. Padanan `stampIdentity` di TypeScript.
func StampIdentity(head, service string, i Info) string {
	ekor := " " + service + " " + i.Label()
	ruang := IdentityMax - len(ekor)
	if ruang < 0 {
		ruang = 0
	}
	if len(head) > ruang {
		head = head[:ruang]
	}
	hasil := head + ekor
	if len(hasil) > IdentityMax {
		hasil = hasil[:IdentityMax]
	}
	return hasil
}
