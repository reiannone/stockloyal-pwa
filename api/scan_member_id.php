<?php
/**
 * scan_member_id.php — Detect member_id input without strtolower()
 *
 * Usage:  php scan_member_id.php [directory]
 * Default: scans current directory
 *
 * Run from: C:\xampp\htdocs\stockloyal-pwa\api
 *   php scan_member_id.php .
 */

$dir = $argv[1] ?? '.';
$dir = rtrim($dir, '/\\');

if (!is_dir($dir)) {
    echo "❌ Directory not found: {$dir}\n";
    exit(1);
}

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
);

$findings = [];
$fileCount = 0;

foreach ($files as $file) {
    if ($file->getExtension() !== 'php') continue;
    $fileCount++;

    $path  = $file->getPathname();
    $lines = file($path);

    foreach ($lines as $lineNum => $line) {
        $ln = $lineNum + 1;

        // Skip comments
        $trimmed = ltrim($line);
        if (str_starts_with($trimmed, '//') || str_starts_with($trimmed, '*') || str_starts_with($trimmed, '/*')) {
            continue;
        }

        // Pattern 1: Direct assignment from input/payload without strtolower
        //   $memberId = $payload['member_id'] ...
        //   $member_id = $input['member_id'] ...
        //   $memberId = $_POST['member_id'] ...
        //   $memberId = $_GET['member_id'] ...
        if (preg_match('/\$(member_id|memberId)\s*=\s*.*(\$payload|\$input|\$_POST|\$_GET|\$_REQUEST|\$data)\[.?member_id.?\]/', $line)) {
            // Check if strtolower is already applied
            if (stripos($line, 'strtolower') === false) {
                $findings[] = [
                    'file'    => $path,
                    'line'    => $ln,
                    'type'    => '⚠️  INPUT WITHOUT STRTOLOWER',
                    'code'    => trim($line),
                ];
            } else {
                $findings[] = [
                    'file'    => $path,
                    'line'    => $ln,
                    'type'    => '✅ ALREADY LOWERED',
                    'code'    => trim($line),
                ];
            }
        }

        // Pattern 2: INSERT containing member_id from variable (potential write)
        if (preg_match('/INSERT\s+INTO/i', $line) || preg_match('/INSERT\s+INTO/i', $lines[$lineNum - 1] ?? '')) {
            if (preg_match('/member_id/', $line) && preg_match('/\$/', $line)) {
                // This is in an INSERT context with a variable — flag for review
                if (stripos($line, 'strtolower') === false && !preg_match('/SELECT|FROM|JOIN|WHERE/i', $line)) {
                    $findings[] = [
                        'file'    => $path,
                        'line'    => $ln,
                        'type'    => '🔍 INSERT WITH MEMBER_ID (review)',
                        'code'    => trim($line),
                    ];
                }
            }
        }

        // Pattern 3: member_id in query params array without strtolower
        //   'member_id' => $memberId  or  'member_id' => $member_id
        if (preg_match("/'member_id'\s*=>\s*\\\$(memberId|member_id)/", $line)) {
            // Only flag if this isn't inside a SELECT/WHERE context
            if (!preg_match('/SELECT|WHERE|AND|JOIN/i', $line)) {
                $findings[] = [
                    'file'    => $path,
                    'line'    => $ln,
                    'type'    => '🔍 ARRAY KEY (review source)',
                    'code'    => trim($line),
                ];
            }
        }
    }
}

// ── Output ──
echo str_repeat('=', 80) . "\n";
echo "  MEMBER_ID CASE SENSITIVITY SCAN\n";
echo "  Directory: {$dir}\n";
echo "  Files scanned: {$fileCount}\n";
echo str_repeat('=', 80) . "\n\n";

if (empty($findings)) {
    echo "✅ No issues found!\n";
    exit(0);
}

// Group by file
$byFile = [];
foreach ($findings as $f) {
    $byFile[$f['file']][] = $f;
}

$needsFix = 0;
$alreadyOk = 0;
$review = 0;

foreach ($byFile as $file => $items) {
    echo "📄 {$file}\n";
    foreach ($items as $item) {
        echo "   Line {$item['line']}: {$item['type']}\n";
        echo "     {$item['code']}\n\n";

        if (str_contains($item['type'], '⚠️'))  $needsFix++;
        if (str_contains($item['type'], '✅'))  $alreadyOk++;
        if (str_contains($item['type'], '🔍'))  $review++;
    }
    echo str_repeat('-', 80) . "\n";
}

echo "\n";
echo str_repeat('=', 80) . "\n";
echo "  SUMMARY\n";
echo "  ⚠️  Needs strtolower():  {$needsFix}\n";
echo "  ✅ Already lowered:      {$alreadyOk}\n";
echo "  🔍 Manual review:        {$review}\n";
echo str_repeat('=', 80) . "\n";

if ($needsFix > 0) {
    echo "\nFIX: Change assignments like:\n";
    echo "  \$memberId = \$input['member_id'] ?? null;\n";
    echo "TO:\n";
    echo "  \$memberId = isset(\$input['member_id']) ? strtolower(trim((string)\$input['member_id'])) : null;\n";
}
