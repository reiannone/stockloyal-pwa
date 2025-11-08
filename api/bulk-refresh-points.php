<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/bulk-refresh-points.php  (FORCE OVERLAY + RATE/CASH UPDATE w/ wallet.conversion_rate detection)

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header("Access-Control-Allow-Methods: POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type");
  exit;
}

require_once __DIR__ . '/config.php'; // must provide $conn as PDO

$input          = json_decode(file_get_contents("php://input"), true);
$merchant_id    = trim($input['merchant_id'] ?? '');
$target_points  = array_key_exists('points', $input) ? (float)$input['points'] : null; // optional
$new_rate       = array_key_exists('conversion_rate', $input) ? (float)$input['conversion_rate'] : null; // optional
$recalc_cash    = !empty($input['recalc_cash']); // bool
$requested_by   = trim($input['requested_by'] ?? 'BulkRefresh');

if ($merchant_id === '') {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "merchant_id required"]);
  exit;
}

try {
  $conn->beginTransaction();

  // Detect whether wallet.conversion_rate exists (so we don't try to write it if missing)
  $colStmt = $conn->prepare("
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wallet'
      AND COLUMN_NAME = 'conversion_rate'
  ");
  $colStmt->execute();
  $hasWalletRate = (int)$colStmt->fetchColumn() > 0;

  // Lock relevant wallet rows for this merchant
  $sel = $conn->prepare("
    SELECT member_id, points, cash_balance
    FROM wallet
    WHERE merchant_id = :merchant_id
    FOR UPDATE
  ");
  $sel->execute([':merchant_id' => $merchant_id]);
  $rows = $sel->fetchAll(PDO::FETCH_ASSOC);

  if (!$rows) {
    $conn->commit();
    echo json_encode([
      "success" => true,
      "updated" => 0,
      "skipped" => 0,
      "points_overlay_applied" => 0,
      "note" => "No wallets for merchant"
    ]);
    return;
  }

  $updated = 0;
  $skipped = 0;
  $overlayCount = 0;
  $ts = time();

  // 1) FORCE OVERLAY POINTS (if provided)
  if ($target_points !== null) {
    if ($target_points < 0) {
      throw new InvalidArgumentException("points must be >= 0 when provided");
    }

    // Update all points for merchant
    $updPts = $conn->prepare("
      UPDATE wallet
      SET points = :points
      WHERE merchant_id = :merchant_id
    ");
    $updPts->execute([':points' => $target_points, ':merchant_id' => $merchant_id]);

    // Log adjust_points per member (delta)
    $ins = $conn->prepare("
      INSERT INTO transactions_ledger
        (member_id, merchant_id, tx_type, direction, channel, status,
         amount_points, client_tx_id, note)
      VALUES
        (:member_id, :merchant_id, 'adjust_points', :direction, 'Internal', 'confirmed',
         :amount_points, :client_tx_id, :note)
    ");

    foreach ($rows as $r) {
      $memberId = $r['member_id'];
      $old      = (float)$r['points'];
      $delta    = $target_points - $old;

      if ($delta == 0.0) { $skipped++; continue; }

      $direction  = $delta > 0 ? 'inbound' : 'outbound';
      $amt        = abs($delta);
      $clientTxId = "overlay_{$merchant_id}_{$memberId}_{$target_points}_{$ts}";

      $ins->execute([
        ':member_id'     => $memberId,
        ':merchant_id'   => $merchant_id,
        ':direction'     => $direction,
        ':amount_points' => $amt,
        ':client_tx_id'  => $clientTxId,
        ':note'          => "FORCE OVERLAY to {$target_points} pts (by {$requested_by})",
      ]);

      $overlayCount++;
    }

    // Refresh in-memory row points to target (for any subsequent cash calc reasoning)
    foreach ($rows as &$r) { $r['points'] = $target_points; }
    unset($r);
  }

  // 2) RECALCULATE CASH BALANCE (and optionally update wallet.conversion_rate if it exists and you want that)
  //    Option B spec: do not require wallet.conversion_rate to exist. Use provided $new_rate
  //    or JOIN merchants to fetch the latest rate when recalc_cash=true.

  if ($recalc_cash || $new_rate !== null) {
    // If you want to also store rate on wallet when the column exists,
    // uncomment this block:
    /*
    if ($new_rate !== null && $hasWalletRate) {
      $updRate = $conn->prepare("
        UPDATE wallet
        SET conversion_rate = :rate
        WHERE merchant_id = :merchant_id
      ");
      $updRate->execute([':rate' => $new_rate, ':merchant_id' => $merchant_id]);
    }
    */

    // Recalculate cash:
    // Priority:
    //  - If $new_rate provided: use it (constant for all rows).
    //  - Else if recalc_cash only: use merchants.conversion_rate via JOIN.
    if ($recalc_cash) {
      if ($new_rate !== null) {
        // Use provided rate constant
        $updCash = $conn->prepare("
          UPDATE wallet
          SET cash_balance = ROUND(points * :rate, 2)
          WHERE merchant_id = :merchant_id
        ");
        $updCash->execute([':rate' => $new_rate, ':merchant_id' => $merchant_id]);
      } else {
        // Use merchants.conversion_rate via JOIN
        $updCash = $conn->prepare("
          UPDATE wallet w
          JOIN merchants m ON m.merchant_id = w.merchant_id
          SET w.cash_balance = ROUND(w.points * m.conversion_rate, 2)
          WHERE w.merchant_id = :merchant_id
        ");
        $updCash->execute([':merchant_id' => $merchant_id]);
      }
    }
  }

  // Count updated rows (treat rows as updated when any overlay or cash recalc was done)
  if ($target_points !== null || $recalc_cash || $new_rate !== null) {
    $updated = count($rows) - $skipped;
  }

  $conn->commit();
  echo json_encode([
    "success" => true,
    "updated" => $updated,
    "skipped" => $skipped,
    "points_overlay_applied" => $overlayCount,
    "target_points" => $target_points,
    "new_rate_used" => ($new_rate !== null ? $new_rate : null),
    "used_wallet_rate_column" => $hasWalletRate,
  ]);
} catch (Throwable $e) {
  if ($conn->inTransaction()) {
    $conn->rollBack();
  }
  http_response_code(500);
  echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
