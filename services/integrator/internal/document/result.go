package document

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ PENYIMPANAN HASIL — PADANAN `@sai/platform/job-result-store` ═══════════
//
// Bentuknya WAJIB sama dengan sisi TS, sebab pembacanya TS: rute unduhan
// `app-customer` menyusun jalur dari `result_ref` lewat `resolveResultPath`.
//
//	<akar>/<kind-titik-jadi-strip>-<jobId>/<berkas>   →  result_ref = "<putaran>/<berkas>"
//
// Tiga sifat yang disalin, dan kenapa:
//
//   - Ditulis ke `<berkas>.partial` lalu di-rename — penulisan yang terputus
//     tidak boleh meninggalkan berkas setengah yang NAMANYA tampak sah.
//   - Direktori 0700, berkas 0600 — tidak terbaca siapa pun kecuali pemiliknya.
//   - Pemiliknya `contract.ResultOwnerUID/GID` (pengguna `node` di
//     `app-customer`) bila pelari ini root. Tanpa itu `stat` dari rute unduhan
//     ditolak dan SETIAP hasil dijawab 404 — alasannya di `contract/kinds.yaml`.

// ResultsRootDefault: `data/hasil` relatif ke direktori kerja — sama dengan
// `path.join(process.cwd(), "data", "hasil")` di TS; kedua image ber-WORKDIR
// `/app`, dan volume `hasil` dipasang di `/app/data/hasil`.
const ResultsRootDefault = "data/hasil"

// resultSegment: SAMA dengan `SEGMEN` di `packages/core/src/job-result.ts`
// (dijaga `tests/report-engine.test.ts`). Rute unduhan menolak `result_ref`
// di luar pola ini dengan 404 — jadi penulis yang melanggarnya menghasilkan
// pekerjaan `done` yang berkasnya tak pernah bisa diunduh.
var resultSegment = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// ResultDir: nama direktori putaran satu pekerjaan.
func ResultDir(kind contract.JobKind, jobID int64) (string, error) {
	if jobID <= 0 {
		return "", fmt.Errorf("jobId tidak sah: %d", jobID)
	}
	return strings.ReplaceAll(string(kind), ".", "-") + "-" + strconv.FormatInt(jobID, 10), nil
}

// WriteResult menulis satu berkas hasil di bawah root dan memulangkan
// `result_ref`-nya.
func WriteResult(root string, kind contract.JobKind, jobID int64, filename string, data []byte) (string, error) {
	return WriteResultStream(root, kind, jobID, filename, func(w io.Writer) error {
		_, err := w.Write(data)
		return err
	})
}

// WriteResultStream: WriteResult untuk berkas yang TIDAK PERNAH utuh di
// memori — ekspor data mandiri tenant (jalur `bulk`) bisa bergiga. `tulis`
// menerima penulis berkas sementara; galat darinya (termasuk pembatalan)
// MEMBUANG berkas sementara itu, jadi tidak ada `.partial` yatim yang tertinggal
// dan tidak ada nama sah yang menunjuk berkas setengah jadi.
func WriteResultStream(root string, kind contract.JobKind, jobID int64, filename string, tulis func(io.Writer) error) (string, error) {
	dir, err := ResultDir(kind, jobID)
	if err != nil {
		return "", err
	}
	for _, seg := range []string{dir, filename} {
		if seg == "." || seg == ".." || !resultSegment.MatchString(seg) {
			return "", fmt.Errorf("segmen hasil tidak sah: %q", seg)
		}
	}
	ref := dir + "/" + filename
	if len(ref) > 320 {
		return "", errors.New("result_ref melebihi 320 karakter")
	}

	absDir := filepath.Join(root, dir)
	if err := os.MkdirAll(absDir, 0o700); err != nil {
		return "", fmt.Errorf("buat %s: %w", absDir, err)
	}
	final := filepath.Join(absDir, filename)
	sementara := final + ".partial"
	f, err := os.OpenFile(sementara, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return "", fmt.Errorf("tulis %s: %w", sementara, err)
	}
	if err := tulis(f); err != nil {
		_ = f.Close()
		_ = os.Remove(sementara)
		return "", err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(sementara)
		return "", fmt.Errorf("tutup %s: %w", sementara, err)
	}
	// Diserahkan SEBELUM rename: berkas yang namanya sudah sah tidak pernah
	// terlihat dengan pemilik yang salah.
	if os.Geteuid() == 0 {
		for _, p := range []string{absDir, sementara} {
			if err := os.Chown(p, contract.ResultOwnerUID, contract.ResultOwnerGID); err != nil {
				return "", fmt.Errorf("serahkan %s ke pembacanya: %w", p, err)
			}
		}
	}
	if err := os.Rename(sementara, final); err != nil {
		return "", fmt.Errorf("rename %s: %w", final, err)
	}
	return ref, nil
}
