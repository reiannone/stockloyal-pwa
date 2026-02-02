<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get_merchant.php
// Fetch full merchant record by merchant_id (PDO version)

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

require_once "config.php"; // must define $conn as a PDO instance

try {
    // Read incoming JSON
    $input = json_decode(file_get_contents("php://input"), true);
    $merchantId = $input['merchant_id'] ?? '';

    if (!$merchantId) {
        echo json_encode([
            "success" => false,
            "error"   => "No merchant_id provided"
        ]);
        exit;
    }

    // Prepare query (PDO style)
    $stmt = $conn->prepare("SELECT * FROM merchant WHERE merchant_id = ? LIMIT 1");
    $stmt->execute([$merchantId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        // 🔒 Normalize to integers (1/0 instead of true/false)
        foreach (['promotion_active', 'active_status'] as $col) {
            if (isset($row[$col])) {
                $row[$col] = (int)$row[$col];
            }
        }

        // ✅ Normalize conversion_rate to float
        if (isset($row["conversion_rate"])) {
            $row["conversion_rate"] = is_null($row["conversion_rate"]) ? null : (float)$row["conversion_rate"];
        }

        // ✅ Normalize tier fields to proper types
        for ($i = 1; $i <= 6; $i++) {
            if (isset($row["tier{$i}_min_points"])) {
                $row["tier{$i}_min_points"] = is_null($row["tier{$i}_min_points"]) ? null : (int)$row["tier{$i}_min_points"];
            }
            if (isset($row["tier{$i}_conversion_rate"])) {
                $row["tier{$i}_conversion_rate"] = is_null($row["tier{$i}_conversion_rate"]) ? null : (float)$row["tier{$i}_conversion_rate"];
            }
        }

        // ✅ Normalize sweep_day - keep as string to support "T+1" and numeric day values
        // sweep_day is VARCHAR(10): NULL, "T+1", "1"-"31", "-1"
        if (isset($row["sweep_day"])) {
            // Keep as string, just trim whitespace if present
            $row["sweep_day"] = is_null($row["sweep_day"]) ? null : trim((string)$row["sweep_day"]);
            // Convert empty string to null
            if ($row["sweep_day"] === "") {
                $row["sweep_day"] = null;
            }
        }

        echo json_encode([
            "success"  => true,
            "merchant" => $row
        ], JSON_NUMERIC_CHECK); // ✅ ensures numeric values stay numbers
    } else {
        echo json_encode([
            "success" => false,
            "error"   => "Merchant not found"
        ]);
    }
} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage()
    ]);
}
