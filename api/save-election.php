<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

// added above lines to support api.stockloyal.com for backend API access
// api/save-election.php

header("Content-Type: application/json");

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "error"   => "Method not allowed",
    ]);
    exit;
}

require_once 'config.php'; // provides $conn (PDO)

// ✅ Expect JSON
$input     = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId  = $input['member_id'] ?? null;
$election  = $input['election'] ?? null;
$rawSweep  = $input['sweep_percentage'] ?? null;

if (!$memberId || !$election) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing required fields",
    ]);
    exit;
}

// 🔢 Normalize sweep percentage based on election type
$sweepPct = null;

if ($election === "one-time") {
    // 🔥 BUSINESS RULE: one-time election always saved as 100%
    $sweepPct = 100;
} elseif ($election === "monthly") {
    if ($rawSweep === null || $rawSweep === '' || (int)$rawSweep <= 0) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "sweep_percentage is required and must be > 0 for monthly",
        ]);
        exit;
    }
    $sweepPct = (int)$rawSweep;
} else {
    // Future election types – you can adjust this as needed
    $sweepPct = null;
}

try {
    // ✅ Always update sweep_percentage and dates for known types
    $sql = "UPDATE wallet 
            SET election_type = :election,
                sweep_percentage = :sweepPct,
                sweep_update_date = NOW(),
                updated_at = NOW()
            WHERE member_id = :member_id";

    $stmt = $conn->prepare($sql);
    $stmt->bindParam(":election", $election);
    $stmt->bindParam(":member_id", $memberId);

    if ($sweepPct === null) {
        $stmt->bindValue(":sweepPct", null, PDO::PARAM_NULL);
    } else {
        $stmt->bindValue(":sweepPct", $sweepPct, PDO::PARAM_INT);
    }

    $stmt->execute();

    echo json_encode([
        "success"          => true,
        "member_id"        => $memberId,
        "election"         => $election,
        "sweep_percentage" => $sweepPct,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage(),
    ]);
}
