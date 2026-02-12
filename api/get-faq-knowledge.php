<?php
// api/get-faq-knowledge.php
// ═══════════════════════════════════════════════════════════════════════════════
// Returns active FAQs formatted for the Voice Assistant knowledge base.
// Called by VoiceAssistant.jsx on panel open to augment the static knowledge.
// ═══════════════════════════════════════════════════════════════════════════════
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

require_once 'config.php';

try {
    $stmt = $conn->prepare("
        SELECT 
            faq_id,
            question,
            REGEXP_REPLACE(answer_html, '<[^>]+>', '') AS answer_text,
            IFNULL(category, 'General')                AS category,
            IFNULL(tags_csv, '')                        AS tags
        FROM faq
        WHERE is_active = 1
        ORDER BY category, sort_order
    ");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── Build two formats ──

    // 1. Structured array (for JSON consumers)
    $faqs = $rows;

    // 2. Plain text block (for system prompt injection)
    $textBlock = "";
    $currentCat = "";
    foreach ($rows as $row) {
        if ($row['category'] !== $currentCat) {
            $currentCat = $row['category'];
            $textBlock .= "\n=== " . strtoupper($currentCat) . " ===\n";
        }
        $textBlock .= "Q: " . $row['question'] . "\n";
        $textBlock .= "A: " . $row['answer_text'] . "\n";
        if (!empty($row['tags'])) {
            $textBlock .= "Tags: " . $row['tags'] . "\n";
        }
        $textBlock .= "\n";
    }

    echo json_encode([
        "success"    => true,
        "count"      => count($faqs),
        "faqs"       => $faqs,
        "text_block" => trim($textBlock),
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Failed to load FAQs: " . $e->getMessage(),
    ]);
}
