<?php

namespace App\Http\Controllers;

use App\Services\FileService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FileController extends Controller
{
    protected FileService $fileService;

    public function __construct(FileService $fileService)
    {
        $this->fileService = $fileService;
    }

    /**
     * Upload a file. Returns the file hash and metadata.
     * POST /api/files  (multipart/form-data)
     * Auth: optional — guest uploads use 'guest' as owner_uid.
     */
    public function upload(Request $request)
    {
        $request->validate([
            'file' => [
                'required',
                'file',
                'max:1048576',  // 1 GB in kilobytes
                function ($attribute, $value, $fail) {
                    // Old blacklist — let disguised executables (e.g.
                    // abc.exe renamed to abc.md on disk) through because
                    // it only inspected the declared extension.
                    // $blocked = ['php', 'phtml', 'phar', 'exe', 'bat', 'cmd', 'sh', 'html', 'htm', 'xhtml', 'cgi', 'pl'];
                    // if (in_array($ext, $blocked)) { $fail(...); }

                    // Keep in sync with frontend file-service.js ALLOWED_EXTENSIONS.
                    $allowed = [
                        'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml',
                        'pdf', 'docx', 'xlsx', 'pptx',
                        'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'ico',
                        'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac',
                        'mp4', 'webm', 'mov', 'mkv', 'm4v',
                        'zip', 'tar', '7z', 'rar',
                    ];
                    $ext = strtolower($value->getClientOriginalExtension());
                    if (!in_array($ext, $allowed)) {
                        $fail("File type .{$ext} is not allowed.");
                    }
                },
            ],
        ]);

        $user = Auth::user();
        $userId = $user ? $user->id : null;

        $uploadedFile = $request->file('file');

        $file = $this->fileService->upload($uploadedFile, $userId);

        return response()->json([
            'hash' => $file->hash,
            'name' => $file->original_name,
            'mime' => $file->mime_type,
            'size' => $file->size,
        ]);
    }

    /**
     * Download / stream a file by hash.
     * GET /api/files/{hash}         → Content-Disposition: attachment (forces Save As)
     * GET /api/files/{hash}?inline=1 → Content-Disposition: inline (browser preview
     *                                   in a new tab; used by the chip icon anchor)
     * Auth: none — the SHA-256 hash itself is the access token.
     */
    public function download(string $hash, Request $request)
    {
        $file = $this->fileService->getByHash($hash);
        if (!$file) {
            return response()->json(['message' => 'FILE NOT FOUND'], 404);
        }

        $fullPath = $this->fileService->getFullPath($file);
        if (!$fullPath) {
            return response()->json(['message' => 'FILE MISSING FROM DISK'], 404);
        }

        if ($request->boolean('inline')) {
            $safeName = str_replace('"', '\\"', $file->original_name);
            return response()->file($fullPath, [
                'Content-Type' => $file->mime_type,
                'Content-Disposition' => 'inline; filename="' . $safeName . '"',
            ]);
        }

        return response()->download(
            $fullPath,
            $file->original_name,
            ['Content-Type' => $file->mime_type]
        );
    }

    /**
     * Check if a file exists by hash.
     * GET /api/files/{hash}/exists
     */
    public function exists(string $hash)
    {
        $file = $this->fileService->getByHash($hash);
        return response()->json(['exists' => (bool)$file]);
    }

    /**
     * Get file metadata by hash (without downloading the content).
     * GET /api/files/{hash}/meta
     * Auth: none.
     */
    public function meta(string $hash)
    {
        $file = $this->fileService->getByHash($hash);
        if (!$file) {
            return response()->json(['message' => 'FILE NOT FOUND'], 404);
        }

        return response()->json([
            'hash' => $file->hash,
            'name' => $file->original_name,
            'mime' => $file->mime_type,
            'size' => $file->size,
            'status' => $file->status,
        ]);
    }
}
