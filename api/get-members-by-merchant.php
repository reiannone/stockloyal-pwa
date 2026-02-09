<?php
/**
 * get-members-by-merchant.php
 * 
 * Returns all members (wallets) for a specific merchant
 * Used by DemoLaunch to populate member dropdown
 */
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    
    $merchantId = isset($input['merchant_id']) ? trim((string)$input['merchant_id']) : '';
    
    if ($merchantId === '') {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'merchant_id is required'
        ]);
        exit;
    }
    
    // Get all wallets for this merchant
    $sql = "
        SELECT 
            w.member_id,
            w.merchant_id,
            w.points,
            w.cash_balance,
            w.member_tier,
            w.broker,
            w.updated_at,
            w.created_at
        FROM wallet w
        WHERE w.merchant_id = :merchant_id
        ORDER BY w.member_id ASC
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([':merchant_id' => $merchantId]);
    $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format numeric values
    $formattedMembers = array_map(function($m) {
        return [
            'member_id' => $m['member_id'],
            'merchant_id' => $m['merchant_id'],
            'points' => (int)($m['points'] ?? 0),
            'cash_balance' => (float)($m['cash_balance'] ?? 0),
            'member_tier' => $m['member_tier'] ?: null,
            'broker' => $m['broker'] ?: null,
            'updated_at' => $m['updated_at'],
            'created_at' => $m['created_at'],
        ];
    }, $members);
    
    echo json_encode([
        'success' => true,
        'merchant_id' => $merchantId,
        'members' => $formattedMembers,
        'count' => count($formattedMembers)
    ]);

} catch (Exception $e) {
    error_log("[get-members-by-merchant] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
