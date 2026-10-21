// PENJAGA interop enkripsi — dan ia menjalankan `openssl` SUNGGUHAN.
//
// ══ KENAPA PENJAGA INI MEMANGGIL BINER LUAR ════════════════════════════════
// Yang diklaim modul `sandi.go` adalah klaim tentang PIHAK LAIN: "berkas ini
// bisa dibuka `openssl enc -d`". Tes yang memverifikasinya dengan mendekripsi
// memakai kode kita sendiri tidak membuktikan klaim itu sama sekali — ia hanya
// membuktikan bahwa enkriptor dan dekriptor kita sepakat, yang justru akan
// tetap benar ketika keduanya salah bersama-sama.
//
// Dan klaim itulah yang menanggung seluruh keputusan formatnya: pada hari
// pemulihan, perkakas yang dibutuhkan harus perkakas yang ADA.
//
// Bila `openssl` tidak ada di mesin ini, tes DILEWATI dengan alasan yang
// tercetak — bukan dianggap lulus diam-diam. CI punya `openssl` (image
// `base` memasangnya untuk Prisma), jadi gerbangnya tetap berjalan di tempat
// yang menentukan.
package backup

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const sandiUji = "kunci-uji-yang-panjang-dan-ber-@-serta-%"

// bukaDenganOpenSSL mendekripsi berkas memakai biner openssl.
func bukaDenganOpenSSL(t *testing.T, berkas string) []byte {
	t.Helper()
	openssl, err := exec.LookPath("openssl")
	if err != nil {
		t.Skip("openssl tidak ada di mesin ini — interop tidak diperiksa di sini, " +
			"dan itu DILEWATI, bukan dianggap lulus")
	}
	cmd := exec.Command(openssl, "enc", "-d", "-aes-256-cbc", "-pbkdf2",
		"-iter", fmt.Sprint(iterasiPBKDF2), "-salt", "-in", berkas, "-pass", "env:SANDI_UJI")
	cmd.Env = append(os.Environ(), "SANDI_UJI="+sandiUji)
	var keluar, galat bytes.Buffer
	cmd.Stdout = &keluar
	cmd.Stderr = &galat
	if err := cmd.Run(); err != nil {
		t.Fatalf("openssl enc -d gagal: %v\n%s", err, galat.String())
	}
	return keluar.Bytes()
}

func sandikanKeBerkas(t *testing.T, isi []byte) (jalur, sidik string, ditulis int64) {
	t.Helper()
	jalur = filepath.Join(t.TempDir(), "uji.enc")
	f, err := os.Create(jalur)
	if err != nil {
		t.Fatalf("buat berkas: %v", err)
	}
	defer func() { _ = f.Close() }()
	sidik, ditulis, err = Sandikan(f, bytes.NewReader(isi), sandiUji)
	if err != nil {
		t.Fatalf("Sandikan: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("tutup: %v", err)
	}
	return jalur, sidik, ditulis
}

func TestOpenSSLMembukaApaYangKitaTulis(t *testing.T) {
	kasus := map[string][]byte{
		"kosong":                         {},
		"satu byte":                      []byte("x"),
		"tepat satu blok (16)":           []byte("0123456789abcdef"),
		"tepat dua blok (32)":            []byte("0123456789abcdef0123456789abcdef"),
		"satu blok kurang satu":          []byte("0123456789abcde"),
		"lebih besar dari satu potongan": bytes.Repeat([]byte("dump SQL baris;\n"), 20000),
	}
	for nama, isi := range kasus {
		t.Run(nama, func(t *testing.T) {
			jalur, _, _ := sandikanKeBerkas(t, isi)
			got := bukaDenganOpenSSL(t, jalur)
			if !bytes.Equal(got, isi) {
				t.Errorf("isi tidak sama setelah bolak-balik: %d byte vs %d byte",
					len(got), len(isi))
			}
		})
	}
}

func TestKepalaBerkasAdalahKepalaOpenSSL(t *testing.T) {
	// `Salted__` + delapan byte garam. Kepala yang berbeda membuat `openssl
	// enc -d` menolak sebelum menyentuh satu blok pun.
	jalur, _, _ := sandikanKeBerkas(t, []byte("apa saja"))
	b, err := os.ReadFile(jalur) //nolint:gosec // jalur dari t.TempDir()
	if err != nil {
		t.Fatalf("baca: %v", err)
	}
	if len(b) < 16 {
		t.Fatalf("berkas hanya %d byte", len(b))
	}
	if string(b[:8]) != magicOpenSSL {
		t.Errorf("kepala = %q, mau %q", b[:8], magicOpenSSL)
	}
}

func TestGaramBERBEDASetiapPutaran(t *testing.T) {
	// Garam yang tetap membuat dua cadangan dengan isi yang sama menghasilkan
	// ciphertext yang sama — yang berarti isi yang tidak berubah bisa dibaca
	// dari luar hanya dengan membandingkan dua objek.
	_, a, _ := sandikanKeBerkas(t, []byte("isi yang sama"))
	_, b, _ := sandikanKeBerkas(t, []byte("isi yang sama"))
	if a == b {
		t.Error("dua putaran menghasilkan ciphertext identik — garamnya tidak acak")
	}
}

func TestSidikJariAtasCiphertextYangSUNGGUHTersimpan(t *testing.T) {
	/* AES-CBC tidak membawa pemeriksaan keutuhan sendiri, jadi sidik jari inilah
	   satu-satunya yang bisa membantah artefak yang rusak di tengah jalan. Kalau
	   ia dihitung atas sesuatu yang bukan isi berkasnya, ia membantah yang
	   salah. */
	jalur, sidik, ditulis := sandikanKeBerkas(t, bytes.Repeat([]byte("x"), 5000))
	b, err := os.ReadFile(jalur) //nolint:gosec // jalur dari t.TempDir()
	if err != nil {
		t.Fatalf("baca: %v", err)
	}
	if int64(len(b)) != ditulis {
		t.Errorf("ditulis = %d, berkasnya %d byte", ditulis, len(b))
	}
	mau := fmt.Sprintf("%x", sha256.Sum256(b))
	if sidik != mau {
		t.Errorf("sidik = %s, isi berkas %s", sidik, mau)
	}
}

func TestMenolakSandiKosong(t *testing.T) {
	/* Cadangan tanpa sandi adalah seluruh pembukuan setiap customer dalam satu
	   berkas yang bisa dibaca siapa pun yang memegangnya. */
	_, _, err := Sandikan(&bytes.Buffer{}, bytes.NewReader([]byte("x")), "")
	if err == nil {
		t.Fatal("sandi kosong diterima")
	}
	if !strings.Contains(err.Error(), "BACKUP_ENCRYPTION_KEY") {
		t.Errorf("pesan galat tidak menyebut variabelnya: %v", err)
	}
}
