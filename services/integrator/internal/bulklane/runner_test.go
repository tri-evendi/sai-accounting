package bulklane

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// `Kinds` (dibaca `cmd/integrator` lewat `Enabled`) dan peta `Handlers` di
// `Run` (dibaca `tests/kind-punya-pengklaim.test.ts` dari teks) adalah dua
// tulisan atas satu daftar — tes ini yang membuat keduanya tidak bisa menyimpang.
func TestKindsSamaDenganPetaHandlers(t *testing.T) {
	src, err := os.ReadFile("runner.go")
	if err != nil {
		t.Fatal(err)
	}
	isi := string(src)
	i := strings.Index(isi, "Handlers: map[")
	if i < 0 {
		t.Fatal("peta `Handlers: map[` tidak ditemukan di Run")
	}
	blok := isi[i : i+strings.Index(isi[i:], "\n\t\t},")]
	var diPeta []string
	for _, m := range regexp.MustCompile(`contract\.(Kind[A-Za-z0-9]+):`).FindAllStringSubmatch(blok, -1) {
		diPeta = append(diPeta, m[1])
	}
	pemisah := regexp.MustCompile(`[._-]`)
	var diDaftar []string
	for _, k := range Kinds {
		nama := "Kind"
		for _, p := range pemisah.Split(string(k), -1) {
			nama += strings.ToUpper(p[:1]) + p[1:]
		}
		diDaftar = append(diDaftar, nama)
	}
	sort.Strings(diPeta)
	sort.Strings(diDaftar)
	if strings.Join(diPeta, ",") != strings.Join(diDaftar, ",") {
		t.Fatalf("Kinds %v ≠ peta Handlers %v", diDaftar, diPeta)
	}
	if !Enabled() {
		t.Fatal("jalur bulk punya kind tapi Enabled() false")
	}
}
