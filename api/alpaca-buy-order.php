<?php
declare(strict_types=1);

/**
 * alpaca-buy-order.php
 *
 * Places a buy order via Alpaca Broker API for a member's account.
 *
 * Input: {
 *   member_id,          // required
 *   symbol,             // required — e.g. "AAPL"
 *   order_type,         // "market" (default) | "limit"
 *   time_in_force,      // "day" (default) | "gtc" | "ioc"
 *   qty,                // shares to buy (required if no notional)
 *   notional,           // dollar amount to buy (required if no qty)
 *   limit_price         // required if order_type = "limit"
 * }
 *
 * Output: { success, order: { ... } }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];

$memberId    = trim((string)($input['member_id'] ?? ''));
$symbol      = strtoupper(trim((string)($input['symbol'] ?? '')));
$orderType   = strtolower(trim((string)($input['order_type'] ?? 'market')));
$timeInForce = strtolower(trim((string)($input['time_in_force'] ?? 'day')));
$qty         = isset($input['qty']) ? (string)$input['qty'] : '';
$notional    = isset($input['notional']) ? (string)$input['notional'] : '';
$limitPrice  = isset($input['limit_price']) ? (string)$input['limit_price'] : '';

// ── Validation ──
if (empty($memberId)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "member_id is required."]);
    exit;
}
if (empty($symbol)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "symbol is required."]);
    exit;
}
if (!in_array($orderType, ['market', 'limit'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid order_type. Use 'market' or 'limit'."]);
    exit;
}
if (!in_array($timeInForce, ['day', 'gtc', 'ioc'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid time_in_force. Use 'day', 'gtc', or 'ioc'."]);
    exit;
}
if (empty($qty) && empty($notional)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Either qty (shares) or notional (dollar amount) is required."]);
    exit;
}
if (!empty($qty) && (float)$qty <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "qty must be greater than zero."]);
    exit;
}
if (!empty($notional) && (float)$notional <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "notional must be greater than zero."]);
    exit;
}
if ($orderType === 'limit' && (empty($limitPrice) || (float)$limitPrice <= 0)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "limit_price is required for limit orders."]);
    exit;
}
// Notional orders must be market + day
if (!empty($notional) && ($orderType !== 'market' || $timeInForce !== 'day')) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Notional (dollar) orders must be market orders with time_in_force = day."]);
    exit;
}

try {
    // ── 1. Look up Alpaca account ID ──
    $stmt = $conn->prepare("
        SELECT broker_account_id
        FROM broker_credentials
        WHERE member_id = ? AND broker = 'Alpaca' AND broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([$memberId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row || empty($row['broker_account_id'])) {
        http_response_code(404);
        echo json_encode(["success" => false, "error" => "No Alpaca brokerage account found."]);
        exit;
    }

    $accountId = $row['broker_account_id'];
    $alpaca = new AlpacaBrokerAPI();

    // ── 2. Build order payload ──
    $orderPayload = [
        'symbol'        => $symbol,
        'side'          => 'buy',
        'type'          => $orderType,
        'time_in_force' => $timeInForce,
    ];

    // Quantity: shares or dollar amount
    if (!empty($notional)) {
        $orderPayload['notional'] = number_format((float)$notional, 2, '.', '');
    } else {
        $orderPayload['qty'] = $qty;
    }

    // Limit price
    if ($orderType === 'limit') {
        $orderPayload['limit_price'] = number_format((float)$limitPrice, 2, '.', '');
    }

    // ── 3. Submit order to Alpaca ──
    $result = $alpaca->createOrder($accountId, $orderPayload);

    if (!$result['success']) {
        $errorMsg = $result['error'] ?? 'Order submission failed';
        // Check for specific Alpaca errors
        if (isset($result['data']['message'])) {
            $errorMsg = $result['data']['message'];
        }
        http_response_code($result['http_code'] ?? 400);
        echo json_encode([
            "success" => false,
            "error"   => "Alpaca: {$errorMsg}",
        ]);
        exit;
    }

    $order = $result['data'];

    // ── 4. Return success ──
    echo json_encode([
        "success" => true,
        "order"   => [
            "id"              => $order['id'] ?? '',
            "client_order_id" => $order['client_order_id'] ?? '',
            "symbol"          => $order['symbol'] ?? $symbol,
            "side"            => $order['side'] ?? 'buy',
            "type"            => $order['type'] ?? $orderType,
            "time_in_force"   => $order['time_in_force'] ?? $timeInForce,
            "status"          => $order['status'] ?? 'pending_new',
            "qty"             => $order['qty'] ?? $qty,
            "notional"        => $order['notional'] ?? $notional,
            "filled_qty"      => $order['filled_qty'] ?? '0',
            "filled_avg_price" => $order['filled_avg_price'] ?? null,
            "limit_price"     => $order['limit_price'] ?? null,
            "submitted_at"    => $order['submitted_at'] ?? null,
            "created_at"      => $order['created_at'] ?? null,
        ],
    ]);

} catch (Exception $e) {
    error_log("[alpaca-buy-order] Exception: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
