<?php
/**
 * toggle-merchant-broker-config.php
 * Toggles the is_active flag on a merchant_broker_config row.
 *
 * POST: { config_id: 1, is_active: true }
 * Returns: { success: true, config_id: 1, is_active: true }
 */

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents('php://input'), true);
$configId = $input['config_id'] ?? null;
$isActive = $input['is_active'] ?? null;

if (!$configId || $isActive === null) {
    echo json_encode(['success' => false, 'error' => 'config_id and is_active required']);
    exit;
}

try {
    $stmt = $conn->prepare("
        UPDATE merchant_broker_config
        SET is_active = ?,
            updated_at = NOW()
        WHERE id = ?
    ");
    $stmt->execute([(int)(bool)$isActive, $configId]);

    if ($stmt->rowCount() === 0) {
        echo json_encode(['success' => false, 'error' => 'Config not found']);
        exit;
    }

    echo json_encode([
        'success'   => true,
        'config_id' => (int)$configId,
        'is_active' => (bool)$isActive,
    ]);

} catch (Exception $e) {
    error_log('[toggle-merchant-broker-config] Error: ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Database error']);
}
