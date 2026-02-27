<?php
/**
 * api/market-status.php
 *
 * GET  /api/market-status.php         → Returns current market status + messaging
 * POST /api/market-status.php         → Creates a scheduled order (replaces direct order creation)
 *
 * Frontend usage:
 *   1. Call GET on page load to show market status banner
 *   2. Call POST when member confirms a redemption
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../MarketCalendar.php';
require_once __DIR__ . '/../OrderScheduler.php';
require_once __DIR__ . '/../config/database.php'; // Your DB connection

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        handleGetMarketStatus();
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        handleCreateScheduledOrder();
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    error_log("market-status API error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}

// ─── GET: Market Status ────────────────────────────────────────

function handleGetMarketStatus(): void
{
    $calendar = new MarketCalendar();
    $status = $calendar->getMarketStatus();

    echo json_encode([
        'success' => true,
        'data'    => $status,
    ]);
}

// ─── POST: Create Scheduled Order ──────────────────────────────

function handleCreateScheduledOrder(): void
{
    // Auth check (replace with your auth middleware)
    $memberId = authenticateMember();
    if (!$memberId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    $required = ['symbol', 'amount'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            http_response_code(400);
            echo json_encode(['error' => "Missing required field: {$field}"]);
            return;
        }
    }

    $amount = floatval($input['amount']);
    if ($amount < 1.00) {
        http_response_code(400);
        echo json_encode(['error' => 'Minimum investment amount is $1.00']);
        return;
    }

    // Create the scheduled order
    $db = getDbConnection(); // Your DB connection function
    $scheduler = new OrderScheduler($db);

    $result = $scheduler->createScheduledOrder([
        'member_id'   => $memberId,
        'symbol'      => strtoupper(trim($input['symbol'])),
        'amount'      => $amount,
        'merchant_id' => $input['merchant_id'] ?? null,
        'source'      => $input['source'] ?? 'points_redemption',
    ]);

    echo json_encode([
        'success' => true,
        'data'    => $result,
    ]);
}

// ─── Auth stub ─────────────────────────────────────────────────

function authenticateMember(): ?int
{
    // TODO: Replace with your actual auth logic
    // e.g., JWT token validation, session check, etc.
    $token = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    // ... validate token, return member_id or null
    return null;
}
