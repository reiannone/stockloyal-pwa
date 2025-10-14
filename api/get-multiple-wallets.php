<?php
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get-multiple-wallets.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
require_once 'config.php';

try {
    $stmt = $conn->prepare("
        SELECT
            w.*,
            m.merchant_name,
            m.conversion_rate AS merchant_conversion_rate
        FROM wallet w
        LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
        ORDER BY w.updated_at DESC, w.record_id DESC
        LIMIT 1000
    ");
    $stmt->execute();
    $wallets = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($wallets as &$w) {
        foreach (['points','cash_balance','portfolio_value','sweep_percentage','merchant_conversion_rate'] as $col) {
            if (array_key_exists($col, $w) && $w[$col] !== null) {
                if ($col === 'points' || $col === 'sweep_percentage') $w[$col] = (int)$w[$col];
                else $w[$col] = (float)$w[$col];
            }
        }
        if (!array_key_exists('member_timezone', $w)) $w['member_timezone'] = null; // ensure key exists
    }

    echo json_encode(['success'=>true,'wallets'=>$wallets]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success'=>false,'error'=>'Server error: '.$e->getMessage()]);
}
