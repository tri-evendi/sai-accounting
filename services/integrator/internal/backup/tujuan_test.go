// PENJAGA tujuan & pemangkasan.
//
// Pemangkasan diuji sebagai FUNGSI MURNI, dan itu disengaja: ia satu-satunya
// bagian jalur cadangan yang MENGHAPUS, jadi ia bagian yang kesalahannya
// permanen. Yang paling penting di antara penjaga di bawah: yang terbaru tidak
// pernah dibuang, berapa pun umurnya.
package backup

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNamaDanTanggalPutaran(t *testing.T) {
	saat := time.Date(2026, 10, 20, 11, 45, 30, 0, time.UTC)
	nama := NamaPutaran("sai", saat)
	if nama != "sai-20261020T114530Z" {
		t.Fatalf("nama putaran = %q", nama)
	}
	if got := TanggalPutaran(nama, "sai"); got != "20261020" {
		t.Errorf("tanggal = %q", got)
	}
	// Prefix lain bukan putaran KITA, dan pemangkas kita tidak boleh
	// menyentuhnya.
	if got := TanggalPutaran(nama, "lain"); got != "" {
		t.Errorf("prefix lain malah dikenali: %q", got)
	}
	for _, bukan := range []string{"", "sai", "sai-2026", "catatan.txt", "sai-20261020"} {
		if got := TanggalPutaran(bukan, "sai"); got != "" {
			t.Errorf("%q dikenali sebagai putaran: %q", bukan, got)
		}
	}
}

func TestPemangkasanTIDAKPERNAHMembuangYangTerbaru(t *testing.T) {
	/* Sebuah mesin yang mati sebulan lalu hidup kembali akan menyalakan
	   pemangkas yang menghapus salinan terakhirnya sendiri — kegagalan yang
	   bentuknya persis seperti keberhasilan. */
	putaran := []string{
		"sai-20260101T000000Z",
		"sai-20260102T000000Z",
		"sai-20260103T000000Z",
	}
	// Ambangnya jauh di masa depan: SEMUA sudah kedaluwarsa.
	buang := PilihUntukDibuang(putaran, "sai", time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC))
	if len(buang) != 2 {
		t.Fatalf("dibuang %v, mau dua tertua saja", buang)
	}
	for _, b := range buang {
		if b == "sai-20260103T000000Z" {
			t.Error("yang TERBARU dibuang")
		}
	}
}

func TestPemangkasanMenyisakanYangMasihDalamRetensi(t *testing.T) {
	putaran := []string{
		"sai-20260901T000000Z", // tua
		"sai-20261015T000000Z", // masih dalam retensi
		"sai-20261020T000000Z", // terbaru
	}
	ambang := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC) // retensi 10 hari
	buang := PilihUntukDibuang(putaran, "sai", ambang)
	if len(buang) != 1 || buang[0] != "sai-20260901T000000Z" {
		t.Fatalf("dibuang %v, mau hanya yang September", buang)
	}
}

func TestPemangkasanMengabaikanYangBUKANPutaran(t *testing.T) {
	/* Direktori yang bukan milik kita tidak boleh disentuh pemangkas kita —
	   diabaikan, bukan dibuang. */
	putaran := []string{
		"sai-20260101T000000Z",
		"sai-20260301T000000Z",
		"arsip-manual",
		"README.txt",
		"lain-20260101T000000Z",
	}
	buang := PilihUntukDibuang(putaran, "sai", time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC))
	for _, b := range buang {
		if !strings.HasPrefix(b, "sai-") {
			t.Errorf("membuang yang bukan putaran kita: %q", b)
		}
	}
}

func TestPemangkasanSatuPutaranSajaTidakMembuangApaPun(t *testing.T) {
	// Pemasangan baru, atau pemasangan yang baru dipulihkan.
	buang := PilihUntukDibuang([]string{"sai-20200101T000000Z"}, "sai",
		time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC))
	if len(buang) != 0 {
		t.Errorf("membuang %v padahal hanya itu yang ada", buang)
	}
}

func TestPemangkasanTujuanKosong(t *testing.T) {
	if buang := PilihUntukDibuang(nil, "sai", time.Now()); len(buang) != 0 {
		t.Errorf("tujuan kosong menghasilkan %v", buang)
	}
}

func TestCakramMenulisLewatBerkasSementara(t *testing.T) {
	/* Penulisan yang terputus di tengah meninggalkan berkas setengah yang
	   NAMANYA TAMPAK SAH — dan nama yang tampak sah itulah yang akan dipercaya
	   pada hari pemulihan. */
	akar := t.TempDir()
	c := NewCakram(akar)
	if err := c.Simpan(context.Background(), "sai-20261020T000000Z/isi.bin",
		bytes.NewReader([]byte("muatan"))); err != nil {
		t.Fatalf("Simpan: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(akar, "sai-20261020T000000Z", "isi.bin")) //nolint:gosec // t.TempDir()
	if err != nil {
		t.Fatalf("baca: %v", err)
	}
	if string(b) != "muatan" {
		t.Errorf("isi = %q", b)
	}
	// Tidak ada `.partial` yang tertinggal.
	entri, _ := os.ReadDir(filepath.Join(akar, "sai-20261020T000000Z"))
	for _, e := range entri {
		if strings.HasSuffix(e.Name(), ".partial") {
			t.Errorf("berkas sementara tertinggal: %s", e.Name())
		}
	}
}

func TestCakramDaftarPutaranTujuanBelumAda(t *testing.T) {
	/* Volume yang baru dibuat datang kosong, dan satu direktori yang hilang
	   bukan kegagalan — ia hanya berarti belum ada putaran. */
	c := NewCakram(filepath.Join(t.TempDir(), "belum-ada"))
	nama, err := c.DaftarPutaran(context.Background())
	if err != nil {
		t.Fatalf("DaftarPutaran: %v", err)
	}
	if len(nama) != 0 {
		t.Errorf("memulangkan %v", nama)
	}
}

func TestCakramMenolakMembuangYangBukanPutaran(t *testing.T) {
	/* Pemangkas yang bisa diminta menghapus jalur arbitrer adalah satu salah
	   panggil dari menghapus hal lain. */
	akar := t.TempDir()
	penting := filepath.Join(akar, "data-penting")
	if err := os.MkdirAll(penting, 0o700); err != nil {
		t.Fatalf("siapkan: %v", err)
	}
	c := NewCakram(akar)
	for _, jahat := range []string{"data-penting", "..", "../..", ".", ""} {
		if err := c.BuangPutaran(context.Background(), jahat); err == nil {
			t.Errorf("menerima permintaan membuang %q", jahat)
		}
	}
	if _, err := os.Stat(penting); err != nil {
		t.Errorf("direktori yang bukan putaran ikut terhapus: %v", err)
	}
}

func TestCakramMembuangPutaranBesertaIsinya(t *testing.T) {
	akar := t.TempDir()
	c := NewCakram(akar)
	putaran := "sai-20260101T000000Z"
	for _, n := range []string{"a.enc", "b.enc", NamaManifest} {
		if err := c.Simpan(context.Background(), putaran+"/"+n, strings.NewReader("x")); err != nil {
			t.Fatalf("Simpan %s: %v", n, err)
		}
	}
	if err := c.BuangPutaran(context.Background(), putaran); err != nil {
		t.Fatalf("BuangPutaran: %v", err)
	}
	if _, err := os.Stat(filepath.Join(akar, putaran)); !os.IsNotExist(err) {
		t.Errorf("putaran masih ada: %v", err)
	}
}

func TestCakramBukanLuarMesin(t *testing.T) {
	if NewCakram("/apa/saja").LuarMesin() {
		t.Error("cakram melaporkan dirinya di luar mesin — `local` akan tercatat `ok`")
	}
}
