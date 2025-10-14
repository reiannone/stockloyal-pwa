<?php
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get-merchants.php

header("Content-Type: application/json; charset=utf-8");
// (optional) allow local dev from Vite
header("Access-Control-Allow-Origin: *");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");

require_once __DIR__ . "/config.php"; // must define $conn as a PDO

try {
    // Force schema.table in case the connection default DB isn't stockloyal
    $sql = "
        SELECT
            record_id,
            merchant_id,
            merchant_name,
            program_name,
            contact_email,
            contact_phone,
            website_url,
            conversion_rate,
            active_status,
            created_at,
            updated_at,
            promotion_text,
            promotion_active
        FROM `stockloyal`.`merchant`
        ORDER BY created_at DESC
    ";

    $stmt = $conn->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Normalize types for the frontend
    foreach ($rows as &$r) {
        if (isset($r['record_id']))        $r['record_id']        = (int) $r['record_id'];
        if (isset($r['conversion_rate']))  $r['conversion_rate']  = is_null($r['conversion_rate']) ? null : (float) $r['conversion_rate'];
        if (isset($r['active_status']))    $r['active_status']    = (int) $r['active_status'];
        if (isset($r['promotion_active'])) $r['promotion_active'] = (int) $r['promotion_active'];
        // leave created_at / updated_at as strings (ISO-ish)
    }
    unset($r);

    echo json_encode([
        "success"   => true,
        "merchants" => $rows,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => $e->getMessage(),
    ]);
}
