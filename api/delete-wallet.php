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

// Get optional cascade_delete flag
$cascade_delete = $input['cascade_delete'] ?? false;

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
        $deletedCount = 0;

        // If cascade delete is requested, delete all related member data
        if ($cascade_delete) {
            // Delete from orders table
            try {
                $stmt = $conn->prepare("DELETE FROM orders WHERE member_id = :member_id");
                $stmt->execute([':member_id' => $memberId]);
                $deletedCount += $stmt->rowCount();
            } catch (PDOException $e) {
                // Table might not exist, log and continue
                error_log("Could not delete from orders: " . $e->getMessage());
            }

            // Delete from transactions_ledger table
            try {
                $stmt = $conn->prepare("DELETE FROM transactions_ledger WHERE member_id = :member_id");
                $stmt->execute([':member_id' => $memberId]);
                $deletedCount += $stmt->rowCount();
            } catch (PDOException $e) {
                error_log("Could not delete from transactions_ledger: " . $e->getMessage());
            }

            // Delete from portfolio holdings (if table exists)
            try {
                $stmt = $conn->prepare("DELETE FROM portfolio_holdings WHERE member_id = :member_id");
                $stmt->execute([':member_id' => $memberId]);
                $deletedCount += $stmt->rowCount();
            } catch (PDOException $e) {
                error_log("Could not delete from portfolio_holdings: " . $e->getMessage());
            }

            // Delete from social posts (if table exists)
            try {
                $stmt = $conn->prepare("DELETE FROM social_posts WHERE member_id = :member_id");
                $stmt->execute([':member_id' => $memberId]);
                $deletedCount += $stmt->rowCount();
            } catch (PDOException $e) {
                error_log("Could not delete from social_posts: " . $e->getMessage());
            }

            // Delete from baskets (if table exists)
            try {
                $stmt = $conn->prepare("DELETE FROM baskets WHERE member_id = :member_id");
                $stmt->execute([':member_id' => $memberId]);
                $deletedCount += $stmt->rowCount();
            } catch (PDOException $e) {
                error_log("Could not delete from baskets: " . $e->getMessage());
            }
        }

        // ✅ Delete broker credentials for this member (always)
        $deleteCreds = $conn->prepare("DELETE FROM broker_credentials WHERE member_id = :member_id");
        $deleteCreds->execute([':member_id' => $memberId]);
        $credsDeleted = $deleteCreds->rowCount();
        $deletedCount += $credsDeleted;

        // ✅ Delete the wallet record (always last)
        $deleteWallet = $conn->prepare("DELETE FROM wallet WHERE record_id = :record_id");
        $deleteWallet->execute([':record_id' => $recordId]);
        $walletDeleted = $deleteWallet->rowCount();
        $deletedCount += $walletDeleted;

        // ✅ Commit transaction
        $conn->commit();

        if ($walletDeleted > 0) {
            echo json_encode([
                "success" => true, 
                "deleted_id" => $recordId,
                "member_id" => $memberId,
                "deleted_count" => $deletedCount,
                "cascade_delete" => $cascade_delete
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
