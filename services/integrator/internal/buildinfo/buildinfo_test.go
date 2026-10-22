package buildinfo

import (
	"regexp"
	"strings"
	"testing"
)

// polaStempel SAMA dengan `POLA_STEMPEL` di `@sai/core/build-info` — pengurai
// konsol. Keluaran Go harus lolos pola itu; kesamaan teks keduanya dijaga
// `tests/build-stamp.test.ts`.
var polaStempel = regexp.MustCompile(`^(.*) ([a-z][a-z0-9-]*) v([0-9A-Za-z.-]+)\+([0-9A-Za-z]+)$`)

func envDari(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func tanpaVCS() string { return "" }

func TestResolveBawaan(t *testing.T) {
	i := resolve("", "", "", envDari(nil), tanpaVCS)
	if i.Version != "0.0.0" || i.Sha != "dev" || i.ShortSha != "dev" || i.BuiltAt != "" {
		t.Fatalf("bawaan salah: %+v", i)
	}
	if got := i.Banner("svc-integrator"); got != "svc-integrator v0.0.0 (dev, built unknown)" {
		t.Fatalf("banner bawaan: %q", got)
	}
}

func TestResolveLdflagsMengalahkanEnv(t *testing.T) {
	env := envDari(map[string]string{"APP_VERSION": "9.9.9", "GIT_SHA": "ffffffffff", "BUILD_TIME": "2020-01-01T00:00:00Z"})
	i := resolve("v0.12.1", "abc1234def5678", "2026-10-22T03:04:05Z", env, tanpaVCS)
	if i.Version != "0.12.1" || i.ShortSha != "abc1234" || i.BuiltAt != "2026-10-22T03:04:05Z" {
		t.Fatalf("ldflags tidak diutamakan: %+v", i)
	}
}

func TestResolveEnvSebagaiCadangan(t *testing.T) {
	env := envDari(map[string]string{"APP_VERSION": "0.12.1", "GIT_SHA": "0123456789abcdef", "BUILD_TIME": "bukan-waktu"})
	i := resolve("", "", "", env, tanpaVCS)
	if i.Version != "0.12.1" || i.ShortSha != "0123456" {
		t.Fatalf("env tidak dibaca: %+v", i)
	}
	if i.BuiltAt != "" {
		t.Fatalf("waktu tak terurai harus kosong, dapat %q", i.BuiltAt)
	}
}

func TestResolveVCSUntukBuildLokal(t *testing.T) {
	i := resolve("", "", "", envDari(nil), func() string { return "deadbeefcafe" })
	if i.ShortSha != "deadbee" {
		t.Fatalf("vcs.revision tidak dipakai: %+v", i)
	}
}

func TestStampIdentityBentukDanBatas(t *testing.T) {
	i := Info{Version: "0.12.1", ShortSha: "abc1234"}
	id := StampIdentity("tenant@3f2a9c1b0d4e:7", Service, i)
	if id != "tenant@3f2a9c1b0d4e:7 svc-integrator v0.12.1+abc1234" {
		t.Fatalf("identitas: %q", id)
	}
	m := polaStempel.FindStringSubmatch(id)
	if m == nil || m[1] != "tenant@3f2a9c1b0d4e:7" || m[2] != Service || m[3] != "0.12.1" || m[4] != "abc1234" {
		t.Fatalf("identitas tidak terurai pola bersama: %q → %v", id, m)
	}

	panjang := StampIdentity("interactive@"+strings.Repeat("h", 200)+":123", Service, i)
	if len(panjang) != IdentityMax {
		t.Fatalf("panjang %d, batas %d", len(panjang), IdentityMax)
	}
	if !strings.HasSuffix(panjang, " svc-integrator v0.12.1+abc1234") {
		t.Fatalf("stempel terpangkas: %q", panjang)
	}
}
