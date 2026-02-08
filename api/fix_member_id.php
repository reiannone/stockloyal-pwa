<?php
/**
 * fix_member_id.php — Auto-fix member_id input to always strtolower()
 *
 * Usage:
 *   php fix_member_id.php .              (dry run — shows changes only)
 *   php fix_member_id.php . --apply      (apply changes with backup)
 *
 * Run from: C:\xampp\htdocs\stockloyal-pwa\api
 *   C:\xampp\php\php.exe fix_member_id.php .
 *   C:\xampp\php\php.exe fix_member_id.php . --apply
 */

$dir   = $argv[1] ?? '.';
$apply = in_array('--apply', $argv);
$dir   = rtrim($dir, '/\\');

if (!is_dir($dir)) {
    echo "Directory not found: {$dir}\n";
    exit(1);
}

// Backup directory
$backupDir = $dir . DIRECTORY_SEPARATOR . '_backup_member_id_fix_' . date('Ymd_His');

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
);

$totalFixed = 0;
$filesChanged = 0;
$changedFiles = [];

foreach ($files as $file) {
    if ($file->getExtension() !== 'php') continue;

    // Skip this script and the scan script
    $basename = $file->getBasename();
    if ($basename === 'fix_member_id.php' || $basename === 'scan_member_id.php') continue;

    // Skip backup directories
    if (str_contains($file->getPathname(), '_backup_member_id_fix_')) continue;

    $path     = $file->getPathname();
    $original = file_get_contents($path);
    $modified = $original;
    $fileFixCount = 0;

    // ──────────────────────────────────────────────────────
    // Pattern 1:  $memberId = $payload['member_id'] ?? null;
    // →           $memberId = isset($payload['member_id']) ? strtolower(trim((string)$payload['member_id'])) : null;
    // ──────────────────────────────────────────────────────
    $modified = preg_replace_callback(
        '/(\$(member_id|memberId)\s*=\s*)(\$(?:payload|input|data|body|json|request|webhook_data|webhookData)\[[\'\"]member_id[\'\"]\])\s*\?\?\s*null\s*;/',
        function ($m) use (&$fileFixCount) {
            // Skip if already has strtolower
            if (stripos($m[0], 'strtolower') !== false) return $m[0];
            $fileFixCount++;
            $var = $m[1]; // e.g. "$memberId = "
            $src = $m[3]; // e.g. "$payload['member_id']"
            // Extract the source variable name for isset()
            return "{$var}isset({$src}) ? strtolower(trim((string){$src})) : null;";
        },
        $modified
    );

    // ──────────────────────────────────────────────────────
    // Pattern 2:  $memberId = $payload['member_id'] ?? '';
    // →           $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
    // ──────────────────────────────────────────────────────
    $modified = preg_replace_callback(
        '/(\$(member_id|memberId)\s*=\s*)(\$(?:payload|input|data|body|json|request|webhook_data|webhookData)\[[\'\"]member_id[\'\"]\])\s*\?\?\s*\'\'\s*;/',
        function ($m) use (&$fileFixCount) {
            if (stripos($m[0], 'strtolower') !== false) return $m[0];
            $fileFixCount++;
            $var = $m[1];
            $src = $m[3];
            return "{$var}strtolower(trim((string)({$src} ?? '')));";
        },
        $modified
    );

    // ──────────────────────────────────────────────────────
    // Pattern 3:  $memberId = trim($input['member_id']);
    //             $memberId = trim((string)($input['member_id'] ?? ''));
    //             (without strtolower)
    // ──────────────────────────────────────────────────────
    $modified = preg_replace_callback(
        '/(\$(member_id|memberId)\s*=\s*)trim\s*\(\s*(?:\(string\)\s*)?\(?\s*(\$(?:payload|input|data|body|json|request)\[[\'\"]member_id[\'\"]\])\s*(?:\?\?\s*[\'\"][\'\"]\s*)?\)?\s*\)\s*;/',
        function ($m) use (&$fileFixCount) {
            if (stripos($m[0], 'strtolower') !== false) return $m[0];
            $fileFixCount++;
            $var = $m[1];
            $src = $m[3];
            return "{$var}strtolower(trim((string)({$src} ?? '')));";
        },
        $modified
    );

    // ──────────────────────────────────────────────────────
    // Pattern 4:  $memberId = $input['member_id'];  (bare, no null coalesce)
    // →           $memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
    // ──────────────────────────────────────────────────────
    $modified = preg_replace_callback(
        '/(\$(member_id|memberId)\s*=\s*)(\$(?:payload|input|data|body|json|request|webhook_data|webhookData)\[[\'\"]member_id[\'\"]\])\s*;/',
        function ($m) use (&$fileFixCount) {
            if (stripos($m[0], 'strtolower') !== false) return $m[0];
            $fileFixCount++;
            $var = $m[1];
            $src = $m[3];
            return "{$var}isset({$src}) ? strtolower(trim((string){$src})) : null;";
        },
        $modified
    );

    // ──────────────────────────────────────────────────────
    // Pattern 5:  isset($input['member_id']) ? trim($input['member_id']) : null
    //             (has trim but no strtolower)
    // ──────────────────────────────────────────────────────
    $modified = preg_replace_callback(
        '/(\$(member_id|memberId)\s*=\s*)isset\s*\(\s*(\$(?:payload|input|data|body|json|request)\[[\'\"]member_id[\'\"]\])\s*\)\s*\?\s*trim\s*\(\s*\3\s*\)\s*:\s*null\s*;/',
        function ($m) use (&$fileFixCount) {
            if (stripos($m[0], 'strtolower') !== false) return $m[0];
            $fileFixCount++;
            $var = $m[1];
            $src = $m[3];
            return "{$var}isset({$src}) ? strtolower(trim((string){$src})) : null;";
        },
        $modified
    );

    // Did anything change?
    if ($modified !== $original) {
        $filesChanged++;
        $totalFixed += $fileFixCount;
        $changedFiles[] = ['path' => $path, 'fixes' => $fileFixCount];

        if ($apply) {
            // Create backup
            if (!is_dir($backupDir)) {
                mkdir($backupDir, 0755, true);
            }
            $relPath = str_replace($dir . DIRECTORY_SEPARATOR, '', $path);
            $backupFile = $backupDir . DIRECTORY_SEPARATOR . $relPath;
            $backupFileDir = dirname($backupFile);
            if (!is_dir($backupFileDir)) {
                mkdir($backupFileDir, 0755, true);
            }
            copy($path, $backupFile);

            // Write fixed version
            file_put_contents($path, $modified);
            echo "✅ FIXED: {$path} ({$fileFixCount} changes)\n";
        } else {
            echo "📝 WOULD FIX: {$path} ({$fileFixCount} changes)\n";

            // Show diff preview
            $origLines = explode("\n", $original);
            $modLines  = explode("\n", $modified);
            for ($i = 0; $i < count($origLines); $i++) {
                if (isset($modLines[$i]) && $origLines[$i] !== $modLines[$i]) {
                    $ln = $i + 1;
                    echo "   Line {$ln}:\n";
                    echo "   - " . trim($origLines[$i]) . "\n";
                    echo "   + " . trim($modLines[$i]) . "\n\n";
                }
            }
        }
    }
}

// ── Summary ──
echo "\n" . str_repeat('=', 80) . "\n";
echo "  SUMMARY\n";
echo "  Files to change:  {$filesChanged}\n";
echo "  Total fixes:      {$totalFixed}\n";

if ($apply) {
    echo "  Status:           ✅ APPLIED\n";
    echo "  Backups:          {$backupDir}\n";
    echo "\n  To revert:  Copy files back from the backup directory.\n";
} else {
    echo "  Status:           DRY RUN (no changes made)\n";
    echo "\n  To apply:   C:\\xampp\\php\\php.exe fix_member_id.php . --apply\n";
}
echo str_repeat('=', 80) . "\n";
