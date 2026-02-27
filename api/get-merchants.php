<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get-merchants.php

header("Content-Type: application/json; charset=utf-8");
// (optional) allow local dev from Vite
// header("Access-Control-Allow-Origin: *");
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
            logo_url,
            contact_email,
            contact_phone,
            website_url,
            webhook_url,
            api_key,
            conversion_rate,
            active_status,
            created_at,
            updated_at,
            promotion_text,
            promotion_active,
            sweep_day,
            sweep_modified_at,
            tier1_name,
            tier1_min_points,
            tier1_conversion_rate,
            tier2_name,
            tier2_min_points,
            tier2_conversion_rate,
            tier3_name,
            tier3_min_points,
            tier3_conversion_rate,
            tier4_name,
            tier4_min_points,
            tier4_conversion_rate,
            tier5_name,
            tier5_min_points,
            tier5_conversion_rate,
            tier6_name,
            tier6_min_points,
            tier6_conversion_rate,
            funding_method,
            plaid_onboarded_at
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
        if (isset($r['sweep_day']))        $r['sweep_day']        = is_null($r['sweep_day']) ? null : (string) $r['sweep_day'];
        
        // Normalize tier fields
        for ($i = 1; $i <= 6; $i++) {
            if (isset($r["tier{$i}_min_points"])) {
                $r["tier{$i}_min_points"] = is_null($r["tier{$i}_min_points"]) ? null : (int) $r["tier{$i}_min_points"];
            }
            if (isset($r["tier{$i}_conversion_rate"])) {
                $r["tier{$i}_conversion_rate"] = is_null($r["tier{$i}_conversion_rate"]) ? null : (float) $r["tier{$i}_conversion_rate"];
            }
        }
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
