<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/delete-wallet.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // ✅ contains $conn (PDO)

$input = json_decode(file_get_contents("php://input"), true);
if (!$input || empty($input['record_id'])) {
    echo json_encode(["success" => false, "error" => "Missing record_id"]);
    exit;
}

try {
    // Ensure record_id is an integer
    $recordId = (int)$input['record_id'];

    // ✅ First, get the member_id from the wallet record before deleting
    $getWallet = $conn->prepare("SELECT member_id FROM wallet WHERE record_id = :record_id");
    $getWallet->execute([':record_id' => $recordId]);
    $walletRow = $getWallet->fetch(PDO::FETCH_ASSOC);

    if (!$walletRow) {
        echo json_encode(["success" => false, "error" => "Wallet not found"]);
        exit;
    }

    $memberId = $walletRow['member_id'];

    // ✅ Begin transaction to ensure atomic deletion
    $conn->beginTransaction();

    try {
        // ✅ Delete broker credentials for this member
        $deleteCreds = $conn->prepare("DELETE FROM broker_credentials WHERE member_id = :member_id");
        $deleteCreds->execute([':member_id' => $memberId]);
        $credsDeleted = $deleteCreds->rowCount();

        // ✅ Delete the wallet record
        $deleteWallet = $conn->prepare("DELETE FROM wallet WHERE record_id = :record_id");
        $deleteWallet->execute([':record_id' => $recordId]);
        $walletDeleted = $deleteWallet->rowCount();

        // ✅ Commit transaction
        $conn->commit();

        if ($walletDeleted > 0) {
            echo json_encode([
                "success" => true, 
                "deleted_id" => $recordId,
                "member_id" => $memberId,
                "broker_credentials_deleted" => $credsDeleted
            ]);
        } else {
            echo json_encode(["success" => false, "error" => "Wallet not found or already deleted"]);
        }

    } catch (Exception $e) {
        // ✅ Rollback on error
        $conn->rollBack();
        throw $e;
    }

} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
