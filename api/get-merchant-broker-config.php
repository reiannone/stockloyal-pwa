<?php
/**
 * get-merchant-broker-config.php
 * Returns broker configuration for a merchant from merchant_broker_config,
 * including credential status and sweep account info.
 *
 * POST: { merchant_id: "merchant001" }
 * Returns: {
 *   success: true,
 *   configs: [
 *     {
 *       config_id, merchant_id, broker_id, broker_name, broker_type,
 *       is_active, sweep_account_id, sweep_account_status,
 *       has_api_key, has_api_secret, has_plaid_token,
 *       broker_api_key_path, broker_api_secret_path, plaid_access_token_path,
 *       created_at, updated_at
 *     }
 *   ],
 *   available_brokers: [ { broker_id, broker_name, broker_type } ]
 * }
 */

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents('php://input'), true);
$merchantId = $input['merchant_id'] ?? null;

if (!$merchantId) {
    echo json_encode(['success' => false, 'error' => 'merchant_id required']);
    exit;
}

try {
    // Get all broker configs for this merchant (with broker_master info)
    $stmt = $conn->prepare("
        SELECT 
            mbc.id AS config_id,
            mbc.merchant_id,
            mbc.broker_id,
            bm.broker_name,
            bm.broker_type,
            bm.is_active AS broker_active,
            mbc.is_active,
            mbc.sweep_account_id,
            mbc.sweep_account_status,
            mbc.broker_api_key_path,
            mbc.broker_api_secret_path,
            mbc.plaid_access_token_path,
            mbc.created_at,
            mbc.updated_at
        FROM merchant_broker_config mbc
        JOIN broker_master bm ON bm.broker_id = mbc.broker_id
        WHERE mbc.merchant_id = ?
        ORDER BY mbc.broker_id
    ");
    $stmt->execute([$merchantId]);
    $configs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Add credential status flags (without exposing actual values)
    foreach ($configs as &$cfg) {
        $cfg['has_api_key']     = !empty($cfg['broker_api_key_path']);
        $cfg['has_api_secret']  = !empty($cfg['broker_api_secret_path']);
        $cfg['has_plaid_token'] = !empty($cfg['plaid_access_token_path']);
        $cfg['is_active']       = (bool)$cfg['is_active'];
        $cfg['broker_active']   = (bool)$cfg['broker_active'];
    }
    unset($cfg);

    // Get all available brokers (for "add broker" dropdown)
    $allBrokers = $conn->query("
        SELECT broker_id, broker_name, broker_type
        FROM broker_master
        WHERE is_active = 1
        ORDER BY broker_name
    ")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success'           => true,
        'configs'           => $configs,
        'available_brokers' => $allBrokers,
    ]);

} catch (Exception $e) {
    error_log("[get-merchant-broker-config] Error: " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Database error']);
}
