<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

header('Content-Type: application/json');

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = trim((string)($input['action'] ?? 'all'));

// ── Instantiate from ENV ─────────────────────────────────────────────────────
try {
    $alpaca = new AlpacaBrokerAPI();
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'error' => 'Broker client init failed: ' . $e->getMessage()]);
    exit;
}

$firmAccountId = $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? '';

// ── Helper: unwrap the ['success','http_code','data'] envelope ───────────────
// Every AlpacaBrokerAPI method returns this wrapper. We only want ['data'].
function unwrap(array $response): ?array {
    if (($response['success'] ?? false) && isset($response['data'])) {
        return is_array($response['data']) ? $response['data'] : null;
    }
    return null;
}

// ── Load broker account IDs from wallet + broker_credentials ─────────────────
function loadBrokerAccounts(PDO $pdo): array {
    $stmt = $pdo->query("
        SELECT w.member_id, bc.broker_account_id
        FROM wallet w
        JOIN broker_credentials bc ON bc.member_id = w.member_id
        WHERE bc.broker_account_id IS NOT NULL
          AND bc.broker_account_id != ''
        GROUP BY bc.broker_account_id
        ORDER BY w.member_id
    ");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// ── Fetch firm account ───────────────────────────────────────────────────────
function fetchFirmAccount(AlpacaBrokerAPI $alpaca, string $firmAccountId): ?array {
    if (empty($firmAccountId)) return null;
    try {
        $res  = $alpaca->getAccount($firmAccountId);
        $data = unwrap($res);
        return $data; // already a flat account object
    } catch (Throwable $e) {
        error_log("[alpaca-broker-admin] fetchFirmAccount failed: " . $e->getMessage());
        return null;
    }
}

// ── Fetch member accounts ────────────────────────────────────────────────────
function fetchAccounts(AlpacaBrokerAPI $alpaca, array $walletRows): array {
    $accounts = [];
    foreach (array_slice($walletRows, 0, 100) as $row) {
        $accountId = $row['broker_account_id'] ?? '';
        if (empty($accountId)) continue;
        try {
            $res  = $alpaca->getAccount($accountId);
            $data = unwrap($res);
            if ($data !== null) {
                $data['_member_id'] = $row['member_id'];
                $accounts[] = $data;
            } else {
                // Surface error stubs so admin can see broken accounts
                $accounts[] = [
                    'id'         => $accountId,
                    '_member_id' => $row['member_id'],
                    'status'     => 'error',
                    '_error'     => $res['error'] ?? 'Unknown error',
                ];
            }
        } catch (Throwable $e) {
            error_log("[alpaca-broker-admin] getAccount({$accountId}) failed: " . $e->getMessage());
            $accounts[] = [
                'id'         => $accountId,
                '_member_id' => $row['member_id'],
                'status'     => 'error',
                '_error'     => $e->getMessage(),
            ];
        }
    }
    return $accounts;
}

// ── Fetch transfers per account ──────────────────────────────────────────────
function fetchTransfers(AlpacaBrokerAPI $alpaca, array $walletRows, string $firmAccountId): array {
    $all = [];

    // Build deduped target list: member accounts + firm account
    $targets = [];
    foreach ($walletRows as $row) {
        $id = $row['broker_account_id'] ?? '';
        if ($id) $targets[$id] = $row['member_id'];
    }
    if (!empty($firmAccountId)) {
        $targets[$firmAccountId] = $targets[$firmAccountId] ?? 'firm';
    }

    foreach (array_slice(array_keys($targets), 0, 60) as $accountId) {
        try {
            $res  = $alpaca->getTransfers($accountId);
            $data = unwrap($res);
            if (!is_array($data)) continue;
            $list = isset($data[0]) || empty($data) ? $data : [$data];
            foreach ($list as $t) {
                $t['_account_id'] = $t['account_id'] ?? $accountId;
                $t['_member_id']  = $targets[$accountId];
                $all[] = $t;
            }
        } catch (Throwable $e) {
            error_log("[alpaca-broker-admin] getTransfers({$accountId}) failed: " . $e->getMessage());
        }
    }

    // Dedupe by transfer id
    $seen = []; $deduped = [];
    foreach ($all as $t) {
        $tid = $t['id'] ?? null;
        if ($tid && isset($seen[$tid])) continue;
        if ($tid) $seen[$tid] = true;
        $deduped[] = $t;
    }

    usort($deduped, fn($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));
    return array_slice($deduped, 0, 200);
}

// ── Fetch orders per account ─────────────────────────────────────────────────
function fetchOrders(AlpacaBrokerAPI $alpaca, array $walletRows): array {
    $all = [];
    foreach (array_slice($walletRows, 0, 50) as $row) {
        $accountId = $row['broker_account_id'] ?? '';
        if (empty($accountId)) continue;
        try {
            $res  = $alpaca->getOrders($accountId, 'all');
            $data = unwrap($res);
            if (!is_array($data)) continue;
            $list = isset($data[0]) || empty($data) ? $data : [$data];
            foreach ($list as $o) {
                $o['_account_id'] = $o['account_id'] ?? $accountId;
                $o['_member_id']  = $row['member_id'];
                $all[] = $o;
            }
        } catch (Throwable $e) {
            error_log("[alpaca-broker-admin] getOrders({$accountId}) failed: " . $e->getMessage());
        }
    }
    usort($all, fn($a, $b) => strcmp(
        $b['submitted_at'] ?? $b['created_at'] ?? '',
        $a['submitted_at'] ?? $a['created_at'] ?? ''
    ));
    return array_slice($all, 0, 200);
}

// ── Fetch journals (JNLC + JNLS, last 90 days) ──────────────────────────────
function fetchJournals(AlpacaBrokerAPI $alpaca): array {
    $all = [];
    foreach (['JNLC', 'JNLS'] as $type) {
        try {
            $res  = $alpaca->getJournals(90, $type);
            $data = unwrap($res);
            if (!is_array($data)) continue;
            $list = isset($data[0]) || empty($data) ? $data : [$data];
            $all  = array_merge($all, $list);
        } catch (Throwable $e) {
            error_log("[alpaca-broker-admin] getJournals({$type}) failed: " . $e->getMessage());
        }
    }
    // Dedupe by journal id
    $seen = [];
    $deduped = [];
    foreach ($all as $j) {
        $jid = $j['id'] ?? null;
        if ($jid && isset($seen[$jid])) continue;
        if ($jid) $seen[$jid] = true;
        $deduped[] = $j;
    }
    usort($deduped, fn($a, $b) => strcmp(
        $b['settle_date'] ?? $b['entry_date'] ?? '',
        $a['settle_date'] ?? $a['entry_date'] ?? ''
    ));
    return array_slice($deduped, 0, 200);
}

// ── Fetch live trading snapshot for a single account ─────────────────────────
function fetchTradingAccount(AlpacaBrokerAPI $alpaca, string $accountId): array {
    try {
        $res = $alpaca->getTradingAccount($accountId);
        if (!($res['success'] ?? false)) {
            $msg = $res['error'] ?? ('HTTP ' . ($res['http_code'] ?? '?'));
            error_log("[alpaca-broker-admin] fetchTradingAccount({$accountId}) failed: {$msg}");
            return ['success' => false, 'error' => $msg];
        }
        $data = $res['data'] ?? null;
        if (!is_array($data)) {
            return ['success' => false, 'error' => 'Empty trading account response'];
        }
        // Returns: cash, long_market_value, short_market_value,
        //          equity, last_equity, buying_power, portfolio_value
        return ['success' => true, 'trading' => $data];
    } catch (Throwable $e) {
        error_log("[alpaca-broker-admin] fetchTradingAccount exception: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// ── Route ────────────────────────────────────────────────────────────────────
try {
    $walletRows = loadBrokerAccounts($conn);

    switch ($action) {
        case 'all':
            echo json_encode([
                'success'      => true,
                'firm_account' => fetchFirmAccount($alpaca, $firmAccountId),
                'accounts'     => fetchAccounts($alpaca, $walletRows),
                'transfers'    => fetchTransfers($alpaca, $walletRows, $firmAccountId),
                'orders'       => fetchOrders($alpaca, $walletRows),
                'journals'     => fetchJournals($alpaca),
            ]);
            break;

        case 'accounts':
            echo json_encode(['success' => true, 'accounts' => fetchAccounts($alpaca, $walletRows)]);
            break;

        case 'transfers':
            echo json_encode(['success' => true, 'transfers' => fetchTransfers($alpaca, $walletRows, $firmAccountId)]);
            break;

        case 'orders':
            echo json_encode(['success' => true, 'orders' => fetchOrders($alpaca, $walletRows)]);
            break;

        case 'journals':
            echo json_encode(['success' => true, 'journals' => fetchJournals($alpaca)]);
            break;

        case 'account_trading':
            $accountId = trim((string)($input['account_id'] ?? ''));
            if (empty($accountId)) {
                echo json_encode(['success' => false, 'error' => 'account_id required']);
                exit;
            }
            echo json_encode(fetchTradingAccount($alpaca, $accountId));
            break;

                default:
            echo json_encode(['success' => false, 'error' => "Unknown action: $action"]);
    }

} catch (Throwable $e) {
    error_log("[alpaca-broker-admin] Fatal: " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
