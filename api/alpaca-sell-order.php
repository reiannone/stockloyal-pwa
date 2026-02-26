<?php
/**
 * alpaca-sell-order.php
 * ─────────────────────────────────────────────────────────────────
 * Submit a sell order to Alpaca for a member's position.
 *
 * POST {
 *   member_id,
 *   symbol,
 *   qty,              // number of shares (fractional OK)
 *   sell_all,         // optional: true to close entire position
 *   order_type,       // "market" (default) | "limit"
 *   limit_price,      // required if order_type = "limit"
 *   time_in_force     // "day" (default) | "gtc" | "ioc"
 * }
 *
 * Returns: order confirmation from Alpaca
 * ─────────────────────────────────────────────────────────────────
 */
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$memberId    = strtolower(trim((string)($input['member_id'] ?? '')));
$symbol      = strtoupper(trim((string)($input['symbol'] ?? '')));
$qty         = (float)($input['qty'] ?? 0);
$sellAll     = (bool)($input['sell_all'] ?? false);
$orderType   = strtolower(trim((string)($input['order_type'] ?? 'market')));
$limitPrice  = isset($input['limit_price']) ? (float)$input['limit_price'] : null;
$timeInForce = strtolower(trim((string)($input['time_in_force'] ?? 'day')));

// ── Validation ──
if (!$memberId) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Missing member_id"]);
    exit;
}
if (!$symbol) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Missing symbol"]);
    exit;
}
if (!$sellAll && $qty <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Quantity must be greater than 0"]);
    exit;
}
if (!in_array($orderType, ['market', 'limit'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid order_type. Use 'market' or 'limit'."]);
    exit;
}
if ($orderType === 'limit' && (!$limitPrice || $limitPrice <= 0)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Limit price required for limit orders"]);
    exit;
}
if (!in_array($timeInForce, ['day', 'gtc', 'ioc'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid time_in_force. Use 'day', 'gtc', or 'ioc'."]);
    exit;
}

try {
    // ── 1. Look up Alpaca account ──
    $stmt = $conn->prepare("
        SELECT broker_account_id
        FROM broker_credentials
        WHERE member_id = :mid AND LOWER(broker) = 'alpaca'
          AND broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([':mid' => $memberId]);
    $cred = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cred || empty($cred['broker_account_id'])) {
        echo json_encode(["success" => false, "error" => "No Alpaca account linked."]);
        exit;
    }

    $accountId = $cred['broker_account_id'];
    $alpaca    = new AlpacaBrokerAPI();

    // ── 2. If sell_all, use close position endpoint (handles fractional cleanly) ──
    if ($sellAll) {
        $closeResult = $alpaca->closePosition($accountId, $symbol);
        if (!$closeResult['success']) {
            echo json_encode([
                "success" => false,
                "error"   => "Failed to close position: " . ($closeResult['error'] ?? 'Unknown'),
            ]);
            exit;
        }

        $order = $closeResult['data'];
        logSellOrder($conn, $memberId, $symbol, $order, 'sell_all');

        echo json_encode([
            "success"  => true,
            "action"   => "sell_all",
            "order"    => formatOrderResponse($order),
        ]);
        exit;
    }

    // ── 3. Verify member holds enough shares ──
    $posResult = $alpaca->getPositions($accountId);
    if (!$posResult['success']) {
        echo json_encode(["success" => false, "error" => "Failed to verify positions."]);
        exit;
    }

    $position = null;
    foreach (($posResult['data'] ?? []) as $pos) {
        if (strtoupper($pos['symbol'] ?? '') === $symbol) {
            $position = $pos;
            break;
        }
    }

    if (!$position) {
        echo json_encode(["success" => false, "error" => "You don't hold any shares of $symbol."]);
        exit;
    }

    $heldQty = (float)($position['qty'] ?? 0);
    if ($qty > $heldQty) {
        echo json_encode([
            "success" => false,
            "error"   => "You hold " . number_format($heldQty, 6) . " shares of $symbol. Cannot sell $qty.",
        ]);
        exit;
    }

    // ── 4. Build and submit sell order ──
    $orderData = [
        'symbol'        => $symbol,
        'qty'           => (string)$qty,
        'side'          => 'sell',
        'type'          => $orderType,
        'time_in_force' => $timeInForce,
    ];

    if ($orderType === 'limit') {
        $orderData['limit_price'] = (string)number_format($limitPrice, 2, '.', '');
    }

    $orderResult = $alpaca->createOrder($accountId, $orderData);

    if (!$orderResult['success']) {
        echo json_encode([
            "success" => false,
            "error"   => "Sell order rejected: " . ($orderResult['error'] ?? 'Unknown'),
        ]);
        exit;
    }

    $order = $orderResult['data'];
    logSellOrder($conn, $memberId, $symbol, $order, 'sell_partial');

    echo json_encode([
        "success"  => true,
        "action"   => "sell",
        "order"    => formatOrderResponse($order),
    ]);

} catch (Exception $e) {
    error_log("[alpaca-sell-order] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error: " . $e->getMessage()]);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatOrderResponse(array $order): array {
    return [
        'order_id'       => $order['id'] ?? '',
        'client_order_id'=> $order['client_order_id'] ?? '',
        'symbol'         => $order['symbol'] ?? '',
        'qty'            => $order['qty'] ?? $order['notional'] ?? '',
        'filled_qty'     => $order['filled_qty'] ?? '0',
        'side'           => $order['side'] ?? 'sell',
        'type'           => $order['type'] ?? '',
        'time_in_force'  => $order['time_in_force'] ?? '',
        'status'         => $order['status'] ?? '',
        'limit_price'    => $order['limit_price'] ?? null,
        'filled_avg_price'=> $order['filled_avg_price'] ?? null,
        'submitted_at'   => $order['submitted_at'] ?? '',
        'created_at'     => $order['created_at'] ?? '',
    ];
}

function logSellOrder(PDO $conn, string $memberId, string $symbol, array $order, string $action): void {
    try {
        $stmt = $conn->prepare("
            INSERT INTO transaction_ledger
                (member_id, transaction_type, description, amount, symbol, reference_id, status, created_at)
            VALUES
                (:mid, 'SELL', :desc, :amount, :symbol, :ref, :status, NOW())
        ");

        $filledAmt = (float)($order['filled_avg_price'] ?? 0) * (float)($order['filled_qty'] ?? 0);

        $stmt->execute([
            ':mid'    => $memberId,
            ':desc'   => strtoupper($action) . " $symbol — Order " . ($order['id'] ?? ''),
            ':amount' => $filledAmt,
            ':symbol' => $symbol,
            ':ref'    => $order['id'] ?? '',
            ':status' => $order['status'] ?? 'submitted',
        ]);
    } catch (Exception $e) {
        error_log("[alpaca-sell-order] Ledger log failed: " . $e->getMessage());
    }
}
