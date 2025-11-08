<?php
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/save-election.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

// ✅ Expect JSON
$input     = json_decode(file_get_contents("php://input"), true);
$memberId  = $input['member_id'] ?? null;
$election  = $input['election'] ?? null;
$sweepPct  = $input['sweep_percentage'] ?? null;

// ✅ Normalize sweepPct to integer if present
if ($sweepPct !== null) {
    $sweepPct = (int) $sweepPct;
}

if (!$memberId || !$election) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing required fields"
    ]);
    exit;
}

try {
    // Build SQL with sweep fields
    $sql = "UPDATE wallet 
            SET election_type = :election,
                updated_at = NOW()";

    if ($election === "monthly") {
        $sql .= ",
                sweep_percentage = :sweepPct,
                sweep_update_date = NOW()";
    } else {
        $sql .= ",
                sweep_percentage = NULL,
                sweep_update_date = NULL";
    }

    $sql .= " WHERE member_id = :member_id";

    $stmt = $conn->prepare($sql);
    $stmt->bindParam(":election", $election);
    $stmt->bindParam(":member_id", $memberId);

    if ($election === "monthly") {
        $stmt->bindParam(":sweepPct", $sweepPct, PDO::PARAM_INT);
    }

    $stmt->execute();

    echo json_encode([
        "success"          => true,
        "member_id"        => $memberId,
        "election"         => $election,
        "sweep_percentage" => $election === "monthly" ? $sweepPct : null
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
