<?php

namespace App\Services;

use App\Models\File;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FileService
{
    /**
     * Upload a file: hash it, deduplicate, store on disk.
     *
     * @return File The file record (existing or newly created)
     */
    public function upload(UploadedFile $file, ?int $userId): File
    {
        // 1. Compute SHA-256 hash from file content
        $hash = hash_file('sha256', $file->getRealPath());

        // 2. Deduplication: if same hash already exists, return existing record
        $existing = File::where('hash', $hash)->first();
        if ($existing) {
            return $existing;
        }

        // 3. Determine storage path: files/{first 2 chars}/{next 2 chars}/{full hash}.{ext}
        $ext = $file->getClientOriginalExtension() ?: 'bin';
        $diskPath = sprintf(
            'files/%s/%s/%s.%s',
            substr($hash, 0, 2),
            substr($hash, 2, 2),
            $hash,
            $ext
        );

        // 4. Store to local disk (storage/app/private/files/...)
        Storage::disk('local')->putFileAs(
            dirname($diskPath),
            $file,
            basename($diskPath)
        );

        // 5. Create DB record
        return File::create([
            'hash' => $hash,
            'user_id' => $userId,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType() ?: 'application/octet-stream',
            'size' => $file->getSize(),
            'disk_path' => $diskPath,
            'status' => 'staged',
        ]);
    }

    /**
     * Get file by hash.
     */
    public function getByHash(string $hash): ?File
    {
        return File::where('hash', $hash)->first();
    }

    /**
     * Get the full filesystem path for download/streaming.
     */
    public function getFullPath(File $file): ?string
    {
        $disk = Storage::disk('local');
        if (!$disk->exists($file->disk_path)) {
            return null;
        }
        return $disk->path($file->disk_path);
    }

    /**
     * Normalize a file_hash from client payload for DB storage.
     *
     * Client sends file_hash as: PHP array, JSON string, or plain hash string.
     * Returns [dbValue, individualHashes] where dbValue is ready for DB insert
     * and individualHashes is a flat array of hash strings for markCommittedBatch.
     *
     * @return array{0: string|null, 1: string[]}
     */
    public static function normalizeFileHash(mixed $fileHash): array
    {
        if (!$fileHash) {
            return [null, []];
        }

        if (is_array($fileHash)) {
            return [json_encode($fileHash), $fileHash];
        }

        if (is_string($fileHash) && str_starts_with($fileHash, '[')) {
            $decoded = json_decode($fileHash, true);
            if (is_array($decoded)) {
                return [$fileHash, $decoded];
            }
        }

        return [$fileHash, [$fileHash]];
    }

    /**
     * Build a fast lookup set of hashes whose file row exists and is not orphaned.
     * Pass this to filterAvailableHashes() in a loop to avoid N+1 queries.
     *
     * @param string[] $hashes  Flat list of hashes (may contain duplicates)
     * @return array<string, true>  Set keyed by hash
     */
    public static function buildAvailableHashSet(array $hashes): array
    {
        if (empty($hashes)) return [];

        $rows = File::whereIn('hash', array_unique($hashes))
            ->where('status', '!=', 'orphaned')
            ->pluck('hash')
            ->all();

        return array_flip($rows);
    }

    /**
     * Filter a file_hash field value against an availability set, preserving the
     * stored shape:
     *   - single hash, available     → return as-is
     *   - single hash, unavailable   → null
     *   - array, all available       → return as-is
     *   - array, partial available   → JSON-encoded array of remaining
     *   - array, none available      → null
     *
     * @param mixed $fileHash  Raw value from DB (string|null, plain hash or JSON)
     * @param array<string, true> $availableSet  From buildAvailableHashSet()
     */
    public static function filterAvailableHashes(mixed $fileHash, array $availableSet): mixed
    {
        if (!$fileHash) return null;

        [, $hashes] = self::normalizeFileHash($fileHash);

        $kept = array_values(array_filter($hashes, fn($h) => isset($availableSet[$h])));

        if (empty($kept)) return null;
        if (count($kept) === count($hashes)) return $fileHash;
        if (count($kept) === 1) return $kept[0];
        return json_encode($kept);
    }

    /**
     * Mark file as committed (referenced by a record).
     */
    public function markCommitted(string $hash): void
    {
        File::where('hash', $hash)
            ->where('status', '!=', 'committed')
            ->update(['status' => 'committed']);
    }

    /**
     * Mark multiple files as committed in a single query.
     */
    public function markCommittedBatch(array $hashes): void
    {
        if (empty($hashes)) return;

        File::whereIn('hash', array_unique($hashes))
            ->where('status', '!=', 'committed')
            ->update(['status' => 'committed']);
    }

    /**
     * Mark committed files as orphaned if they are no longer referenced
     * by any board table (blackboards, walkie_typie_boards, broadcast_boards).
     */
    public function markOrphaned(): int
    {
        // Collect all file_hash values referenced by any board table (3 queries total).
        // file_hash stores either a plain hash string or a JSON array of hashes.
        $referencedRaw = DB::table('blackboards')->whereNotNull('file_hash')->pluck('file_hash')
            ->merge(DB::table('walkie_typie_boards')->whereNotNull('file_hash')->pluck('file_hash'))
            ->merge(DB::table('broadcast_boards')->whereNotNull('file_hash')->pluck('file_hash'));

        // Extract individual hashes (reuse normalizeFileHash for both plain and JSON-array values)
        $referencedHashes = [];
        foreach ($referencedRaw as $raw) {
            [, $hashes] = self::normalizeFileHash($raw);
            foreach ($hashes as $h) $referencedHashes[$h] = true;
        }

        // Find committed files not in the referenced set
        $committedFiles = File::where('status', 'committed')->get();
        $marked = 0;

        foreach ($committedFiles as $file) {
            if (!isset($referencedHashes[$file->hash])) {
                $file->update(['status' => 'orphaned']);
                $marked++;
            }
        }

        // Mark stale staged files (uploaded but never committed) as orphaned
        $staleStaged = File::where('status', 'staged')
            ->where('created_at', '<', now()->subHours(24))
            ->update(['status' => 'orphaned']);
        $marked += $staleStaged;

        return $marked;
    }

    /**
     * Cleanup orphaned files older than the given hours.
     */
    public function cleanupOrphaned(int $hoursOld = 24): int
    {
        $cutoff = now()->subHours($hoursOld);

        $orphaned = File::where('status', 'orphaned')
            ->where('updated_at', '<', $cutoff)
            ->get();

        $deleted = 0;
        foreach ($orphaned as $file) {
            Storage::disk('local')->delete($file->disk_path);
            $file->delete();
            $deleted++;
        }

        return $deleted;
    }
}
