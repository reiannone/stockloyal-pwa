<?php
// api/toggle_sell_status.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once __DIR__ . '/config.php';

// ✅ Expect JSON
$input = json_decode(file_get_contents("php://input"), true) ?? [];
$toSell    = $input["to_sell"]    ?? [];   // settled → sell
$toSettled = $input["to_settled"] ?? [];   // sell → settled

// ✅ Sanitize: keep only positive integer IDs
$toSell    = array_values(array_filter(array_map("intval", (array)$toSell),    fn($id) => $id > 0));
$toSettled = array_values(array_filter(array_map("intval", (array)$toSettled), fn($id) => $id > 0));

if (empty($toSell) && empty($toSettled)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "No order IDs provided."
    ]);
    exit;
}

try {
    $markedSell    = 0;
    $markedSettled = 0;

    // ── settled → sell ──
    if (!empty($toSell)) {
        $placeholders = implode(",", array_fill(0, count($toSell), "?"));
        $stmt = $conn->prepare("
            UPDATE orders
            SET status = 'sell'
            WHERE order_id IN ($placeholders)
              AND status = 'settled'
        ");
        $stmt->execute($toSell);
        $markedSell = $stmt->rowCount();
    }

    // ── sell → settled ──
    if (!empty($toSettled)) {
        $placeholders = implode(",", array_fill(0, count($toSettled), "?"));
        $stmt = $conn->prepare("
            UPDATE orders
            SET status = 'settled'
            WHERE order_id IN ($placeholders)
              AND status = 'sell'
        ");
        $stmt->execute($toSettled);
        $markedSettled = $stmt->rowCount();
    }

    echo json_encode([
        "success"        => true,
        "marked_sell"    => $markedSell,
        "marked_settled" => $markedSettled,
    ]);
} catch (Exception $e) {
    error_log("toggle_sell_status.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
