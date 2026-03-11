<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

class DatabaseBackup extends Command
{
    protected $signature = 'app:backup {--restore= : Restore from a backup file} {--force : Skip confirmation for restore}';

    protected $description = 'Backup PostgreSQL database via pg_dump, or restore from a backup file';

    public function handle(): int
    {
        $restoreFile = $this->option('restore');

        return $restoreFile ? $this->restore($restoreFile) : $this->backup();
    }

    private function backup(): int
    {
        $dir = storage_path('backups');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $filename = 'backup_' . date('Y-m-d_His') . '.sql';
        $filepath = $dir . '/' . $filename;

        $host = config('database.connections.pgsql.host');
        $port = config('database.connections.pgsql.port');
        $database = config('database.connections.pgsql.database');
        $username = config('database.connections.pgsql.username');

        $result = Process::env([
            'PGPASSWORD' => config('database.connections.pgsql.password'),
        ])->run("pg_dump -h {$host} -p {$port} -U {$username} {$database}");

        if (!$result->successful()) {
            $this->error('Backup failed: ' . $result->errorOutput());
            return self::FAILURE;
        }

        file_put_contents($filepath, $result->output());
        $size = $this->formatBytes(filesize($filepath));

        $this->info("Backup saved: {$filename} ({$size})");

        $this->pruneOldBackups($dir, 7);

        return self::SUCCESS;
    }

    private function restore(string $file): int
    {
        $dir = storage_path('backups');
        $filepath = $dir . '/' . $file;

        if (!file_exists($filepath)) {
            $this->error("File not found: {$filepath}");
            return self::FAILURE;
        }

        $size = $this->formatBytes(filesize($filepath));
        if (!$this->option('force') && !$this->confirm("Restore from {$file} ({$size})? This will OVERWRITE all current data.")) {
            $this->info('Cancelled.');
            return self::SUCCESS;
        }

        $host = config('database.connections.pgsql.host');
        $port = config('database.connections.pgsql.port');
        $database = config('database.connections.pgsql.database');
        $username = config('database.connections.pgsql.username');

        $result = Process::env([
            'PGPASSWORD' => config('database.connections.pgsql.password'),
        ])->run("psql -h {$host} -p {$port} -U {$username} {$database} < {$filepath}");

        if (!$result->successful()) {
            $this->error('Restore failed: ' . $result->errorOutput());
            return self::FAILURE;
        }

        $this->info('Restore complete.');
        return self::SUCCESS;
    }

    private function pruneOldBackups(string $dir, int $keep): void
    {
        $files = glob($dir . '/backup_*.sql');
        rsort($files); // newest first

        $toDelete = array_slice($files, $keep);
        foreach ($toDelete as $file) {
            unlink($file);
            $this->line('Pruned: ' . basename($file));
        }
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes < 1024) return $bytes . ' B';
        if ($bytes < 1048576) return round($bytes / 1024, 1) . ' KB';
        return round($bytes / 1048576, 1) . ' MB';
    }
}
