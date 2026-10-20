package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ══ SDK DIPAKAI, BUKAN SigV4 BUATAN SENDIRI ════════════════════════════════
//
// Keputusan ini sudah tertulis sekali di Dockerfile, untuk `awscli`, dan
// alasannya berlaku kata per kata di sini:
//
//	Menandatangani permintaan S3 sendiri hanya butuh ~60 baris, dan itulah
//	jebakannya: ia akan terlihat benar di uji dan gagal pada penyedia pertama
//	yang menormalkan header sedikit berbeda — pada hari kita mencoba
//	MEMULIHKAN.
//
// Yang DIBELI dengan memakai SDK alih-alih memanggil `awscli`: `awscli` keluar
// dari image (ia menarik Python ke dalam image yang seharusnya berisi satu
// biner statis — §3.3), dan kegagalan unggah menjadi galat bertipe alih-alih
// kode keluar yang harus diurai dari teks.
//
// Yang TIDAK diuji di repo ini: tanda tangannya. Itu milik SDK, dan tes yang
// memverifikasinya hanya akan menguji ulang pustaka orang lain. Yang DIUJI
// pemakaiannya — tata letak kunci, paginasi daftar, dan penghapusan borongan —
// terhadap server HTTP uji. Itu batas yang benar.

// S3 menyimpan ke bucket S3 atau penyedia S3-compatible mana pun.
type S3 struct {
	klien  *s3.Client
	bucket string
	prefix string
}

// OpsiS3 adalah konfigurasi dari lingkungan.
type OpsiS3 struct {
	Bucket string
	Prefix string
	// Endpoint kosong = AWS S3 sungguhan; terisi = penyedia S3-compatible
	// (B2, Wasabi, IDCloudHost). Diteruskan HANYA bila diisi, persis seperti
	// `--endpoint-url` di `scripts/backup.sh`.
	Endpoint string
	// PathStyle wajib untuk sebagian penyedia S3-compatible dan untuk server
	// uji: bucket sebagai bagian JALUR, bukan sebagai subdomain.
	PathStyle bool
}

// NewS3 membuka klien S3 dari lingkungan.
//
// Kredensialnya dibaca rantai bawaan SDK (env, berkas kredensial, peran
// instans). TIDAK ada pembacaan `AWS_SECRET_ACCESS_KEY` di berkas ini: kunci
// yang dibaca sendiri adalah kunci yang bisa tercetak ke log oleh kode kita
// sendiri, dan rantai SDK sudah menangani keempat sumbernya.
func NewS3(ctx context.Context, o OpsiS3) (*S3, error) {
	if o.Bucket == "" {
		return nil, errors.New("BACKUP_S3_BUCKET kosong")
	}
	cfg, err := awscfg.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("muat konfigurasi AWS: %w", err)
	}
	klien := s3.NewFromConfig(cfg, func(opt *s3.Options) {
		if o.Endpoint != "" {
			opt.BaseEndpoint = aws.String(o.Endpoint)
		}
		if o.PathStyle {
			opt.UsePathStyle = true
		}
	})
	return &S3{klien: klien, bucket: o.Bucket, prefix: strings.Trim(o.Prefix, "/")}, nil
}

// NewS3Dengan membuat tujuan dari klien yang sudah ada — dipakai tes.
func NewS3Dengan(klien *s3.Client, bucket, prefix string) *S3 {
	return &S3{klien: klien, bucket: bucket, prefix: strings.Trim(prefix, "/")}
}

// Nama memulangkan tujuan dalam bentuk yang bisa dicetak ke log.
func (t *S3) Nama() string {
	if t.prefix == "" {
		return "s3://" + t.bucket
	}
	return "s3://" + t.bucket + "/" + t.prefix
}

// LuarMesin selalu true.
func (t *S3) LuarMesin() bool { return true }

func (t *S3) kunci(relatif string) string {
	if t.prefix == "" {
		return relatif
	}
	return t.prefix + "/" + relatif
}

// Simpan mengunggah satu objek.
func (t *S3) Simpan(ctx context.Context, kunci string, r io.Reader) error {
	// `PutObject` menuntut pembaca yang bisa di-seek untuk menghitung tanda
	// tangan payload, jadi pemanggil menyerahkan `*os.File` — bukan pipa dari
	// `pg_dump`. Itu sebabnya objeknya ditulis ke cakram sementara lebih dulu;
	// alternatifnya unggahan multipart, yang menambah jalur kegagalan sendiri
	// untuk manfaat yang belum ada pengukurannya.
	_, err := t.klien.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(t.bucket),
		Key:    aws.String(t.kunci(kunci)),
		Body:   r,
	})
	if err != nil {
		return fmt.Errorf("unggah %s: %w", kunci, err)
	}
	return nil
}

// DaftarPutaran memulangkan nama "direktori" tingkat pertama di bawah prefix.
//
// S3 tidak punya direktori; yang dipakai `Delimiter: "/"`, yang membuat server
// memulangkan prefix bersama alih-alih setiap objek. Tanpa itu, pemasangan
// dengan 17 PT × 30 hari × 3 objek harus memulangkan ribuan kunci hanya untuk
// menjawab "putaran apa saja yang ada".
func (t *S3) DaftarPutaran(ctx context.Context) ([]string, error) {
	prefix := ""
	if t.prefix != "" {
		prefix = t.prefix + "/"
	}
	var nama []string
	// Paginasi WAJIB dilalui sampai habis: `ListObjectsV2` memulangkan paling
	// banyak 1000 entri, dan daftar yang terpotong membuat pemangkas melewatkan
	// putaran lama tanpa bunyi — tumbuh selamanya sambil terlihat bekerja.
	p := s3.NewListObjectsV2Paginator(t.klien, &s3.ListObjectsV2Input{
		Bucket:    aws.String(t.bucket),
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
	})
	for p.HasMorePages() {
		hal, err := p.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("daftar %s: %w", t.Nama(), err)
		}
		for _, cp := range hal.CommonPrefixes {
			if cp.Prefix == nil {
				continue
			}
			n := strings.TrimSuffix(strings.TrimPrefix(*cp.Prefix, prefix), "/")
			if n != "" {
				nama = append(nama, n)
			}
		}
	}
	return nama, nil
}

// BuangPutaran menghapus seluruh objek di bawah satu putaran.
func (t *S3) BuangPutaran(ctx context.Context, putaran string) error {
	if prefixDari(putaran) == "" {
		return fmt.Errorf("menolak membuang %q — bukan nama putaran", putaran)
	}
	prefix := t.kunci(putaran) + "/"
	p := s3.NewListObjectsV2Paginator(t.klien, &s3.ListObjectsV2Input{
		Bucket: aws.String(t.bucket),
		Prefix: aws.String(prefix),
	})
	for p.HasMorePages() {
		hal, err := p.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("daftar isi %s: %w", putaran, err)
		}
		var kunci []types.ObjectIdentifier
		for _, o := range hal.Contents {
			if o.Key != nil {
				kunci = append(kunci, types.ObjectIdentifier{Key: o.Key})
			}
		}
		if len(kunci) == 0 {
			continue
		}
		keluar, err := t.klien.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(t.bucket),
			Delete: &types.Delete{Objects: kunci},
		})
		if err != nil {
			return fmt.Errorf("buang isi %s: %w", putaran, err)
		}
		// Kegagalan PER OBJEK tidak muncul sebagai galat pemanggilan: S3
		// memulangkan 200 dengan daftar `Errors` di dalamnya. Mengabaikannya
		// berarti pemangkas melaporkan sukses atas objek yang masih ada.
		if len(keluar.Errors) > 0 {
			var sebab []string
			for _, e := range keluar.Errors {
				sebab = append(sebab, aws.ToString(e.Key)+": "+aws.ToString(e.Message))
			}
			return fmt.Errorf("buang isi %s: %s", putaran, strings.Join(sebab, "; "))
		}
	}
	return nil
}

// TujuanDariLingkungan memilih S3 bila bucket disetel, kalau tidak cakram.
//
// ══ TANPA S3 IA TETAP MENCADANGKAN ═════════════════════════════════════════
// Sampai 12 Okt 2026 ketiadaan bucket membuat `scripts/backup.sh` berhenti
// SEBELUM dump pertama. Niatnya benar — "cadangan yang tinggal di mesin yang
// sama bukan cadangan" — tapi akibatnya terukur dan buruk: produksi berjalan 54
// putaran dengan NOL artefak. Penolakan itu melindungi dari SATU bentuk
// kegagalan (kehilangan mesin) dengan membiarkan kita tanpa pertahanan apa pun
// terhadap semua bentuk lainnya: `DROP TABLE` yang keliru, migrasi yang
// merusak, kerusakan logis, berkas terhapus.
//
// Jadi tanpa S3 ia TETAP mencadangkan, tersandi, ke cakram — dan putarannya
// dicatat `local`, BUKAN `ok`. Jaringnya dipasang tanpa satu pun klaim yang
// tidak benar.
func TujuanDariLingkungan(ctx context.Context) (Tujuan, error) {
	if bucket := os.Getenv("BACKUP_S3_BUCKET"); bucket != "" {
		prefix := os.Getenv("BACKUP_S3_PREFIX")
		if prefix == "" {
			prefix = "cadangan"
		}
		return NewS3(ctx, OpsiS3{
			Bucket:    bucket,
			Prefix:    prefix,
			Endpoint:  os.Getenv("BACKUP_S3_ENDPOINT"),
			PathStyle: os.Getenv("BACKUP_S3_PATH_STYLE") == "true",
		})
	}
	akar := os.Getenv("BACKUP_LOCAL_DIR")
	if akar == "" {
		akar = "/app/data/cadangan"
	}
	return NewCakram(akar), nil
}
