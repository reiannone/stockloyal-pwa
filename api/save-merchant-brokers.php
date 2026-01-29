<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// save-merchant-brokers.php
// Saves the list of broker IDs assigned to a specific merchant
// Replaces all existing assignments with the new list

header("Content-Type: application/json");

require_once "config.php"; // provides $conn as PDO instance

$input = json_decode(file_get_contents("php://input"), true);
$merchant_id = $input['merchant_id'] ?? null;
$broker_ids = $input['broker_ids'] ?? [];

if (!$merchant_id) {
    echo json_encode(["success" => false, "error" => "merchant_id is required"]);
    exit;
}

// Ensure broker_ids is an array
if (!is_array($broker_ids)) {
    $broker_ids = [];
}

try {
    // Start transaction
    $conn->beginTransaction();

    // Delete all existing assignments for this merchant
    $deleteStmt = $conn->prepare("DELETE FROM merchant_brokers WHERE merchant_id = ?");
    $deleteStmt->execute([$merchant_id]);
    $deleted = $deleteStmt->rowCount();

    // Insert new assignments
    $inserted = 0;
    if (!empty($broker_ids)) {
        $insertStmt = $conn->prepare("
            INSERT INTO merchant_brokers (merchant_id, broker_id, created_at) 
            VALUES (?, ?, NOW())
        ");
        
        foreach ($broker_ids as $broker_id) {
            if (!empty($broker_id)) {
                $insertStmt->execute([$merchant_id, $broker_id]);
                $inserted++;
            }
        }
    }

    // Commit transaction
    $conn->commit();

    echo json_encode([
        "success" => true,
        "merchant_id" => $merchant_id,
        "deleted" => $deleted,
        "inserted" => $inserted,
        "broker_ids" => $broker_ids
    ]);

} catch (PDOException $e) {
    // Rollback on error
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }

    // Check if table doesn't exist - create it
    if (strpos($e->getMessage(), "doesn't exist") !== false) {
        try {
            // Create the table
            $conn->exec("
                CREATE TABLE merchant_brokers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    merchant_id VARCHAR(50) NOT NULL,
                    broker_id VARCHAR(50) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_merchant_broker (merchant_id, broker_id),
                    INDEX idx_merchant (merchant_id),
                    INDEX idx_broker (broker_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");

            // Now insert the assignments
            $inserted = 0;
            if (!empty($broker_ids)) {
                $insertStmt = $conn->prepare("
                    INSERT INTO merchant_brokers (merchant_id, broker_id, created_at) 
                    VALUES (?, ?, NOW())
                ");
                
                foreach ($broker_ids as $broker_id) {
                    if (!empty($broker_id)) {
                        $insertStmt->execute([$merchant_id, $broker_id]);
                        $inserted++;
                    }
                }
            }

            echo json_encode([
                "success" => true,
                "merchant_id" => $merchant_id,
                "deleted" => 0,
                "inserted" => $inserted,
                "broker_ids" => $broker_ids,
                "note" => "Created merchant_brokers table"
            ]);

        } catch (PDOException $e2) {
            http_response_code(500);
            echo json_encode(["success" => false, "error" => $e2->getMessage()]);
        }
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
}
