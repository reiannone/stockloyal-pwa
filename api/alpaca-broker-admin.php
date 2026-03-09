<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

header('Content-Type: application/json');

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = trim((string)($input['action'] ?? 'all'));

// ── Instantiate AlpacaBrokerAPI directly from ENV ────────────────────────────
try {
    $alpaca = new AlpacaBrokerAPI();
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'error' => 'Broker client init failed: ' . $e->getMessage()]);
    exit;
}

// ── Firm account ID from ENV ─────────────────────────────────────────────────
$firmAccountId = $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? '';

// ── Helper: load broker account IDs from wallet table ───────────────────────
function loadBrokerAccounts(PDO $pdo): array {
    $stmt = $pdo->query("
        SELECT w.member_id, bc.alpaca_account_id AS broker_account_id
        FROM wallet w
        JOIN broker_credentials bc ON bc.member_id = w.member_id
        WHERE bc.alpaca_account_id IS NOT NULL
          AND bc.alpaca_account_id != ''
        ORDER BY w.member_id
    ");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// ── Fetch firm account ───────────────────────────────────────────────────────
function fetchFirmAccount(AlpacaBrokerAPI $alpaca, string $firmAccountId): ?array {
    if (empty($firmAccountId)) return null;
    try {
        return $alpaca->getAccount($firmAccountId);
    } catch (Throwable $e) {
        error_log("[alpaca-broker-admin] fetchFirmAccount failed: " . $e->getMessage());
        return null;
    }
}

// ── Fetch member accounts from Alpaca ───────────────────────────────────────
function fetchAccounts(AlpacaBrokerAPI $alpaca, array $walletRows): array {
    $accounts = [];
    foreach (array_slice($walletRows, 0, 100) as $row) {
        $accountId = $row['broker_account_id'] ?? '';
        if (empty($accountId)) continue;
        try {
            $acct = $alpaca->getAccount($accountId);
            $acct['_member_id'] = $row['member_id'];
            $accounts[] = $acct;
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
function fetchTransfers(AlpacaBrokerAPI $alpaca, array $walletRows): array {
    $all = [];
    foreach (array_slice($walletRows, 0, 50) as $row) {
        $accountId = $row['broker_account_id'] ?? '';
        if (empty($accountId)) continue;
        try {
            $transfers = $alpaca->getTransfers($accountId);
            if (!is_array($transfers)) continue;
            foreach ($transfers as $t) {
                $t['_account_id'] = $t['account_id'] ?? $accountId;
                $t['_member_id']  = $row['member_id'];
                $all[] = $t;
            }
        } catch (Throwable $e) {
            error_log("[alpaca-broker-admin] getTransfers({$accountId}) failed: " . $e->getMessage());
        }
    }
    usort($all, fn($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));
    return array_slice($all, 0, 200);
}

// ── Fetch orders per account ─────────────────────────────────────────────────
function fetchOrders(AlpacaBrokerAPI $alpaca, array $walletRows): array {
    $all = [];
    foreach (array_slice($walletRows, 0, 50) as $row) {
        $accountId = $row['broker_account_id'] ?? '';
        if (empty($accountId)) continue;
        try {
            $orders = $alpaca->getOrders($accountId, 'all');
            if (!is_array($orders)) continue;
            foreach ($orders as $o) {
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
            $entries = $alpaca->getJournals(90, $type);
            if (is_array($entries)) {
                $all = array_merge($all, $entries);
            }
        } catch (Throwable $e) {
            error_log("[alpaca-broker-admin] getJournals({$type}) failed: " . $e->getMessage());
        }
    }
    usort($all, fn($a, $b) => strcmp(
        $b['settle_date'] ?? $b['entry_date'] ?? '',
        $a['settle_date'] ?? $a['entry_date'] ?? ''
    ));
    return array_slice($all, 0, 200);
}

// ── Route by action ──────────────────────────────────────────────────────────
try {
    $walletRows = loadBrokerAccounts($conn);

    switch ($action) {

        case 'all': {
            $firmAccount = fetchFirmAccount($alpaca, $firmAccountId);
            $accounts    = fetchAccounts($alpaca, $walletRows);
            $transfers   = fetchTransfers($alpaca, $walletRows);
            $orders      = fetchOrders($alpaca, $walletRows);
            $journals    = fetchJournals($alpaca);

            echo json_encode([
                'success'      => true,
                'firm_account' => $firmAccount,
                'accounts'     => $accounts,
                'transfers'    => $transfers,
                'orders'       => $orders,
                'journals'     => $journals,
            ]);
            break;
        }

        case 'accounts': {
            echo json_encode(['success' => true, 'accounts' => fetchAccounts($alpaca, $walletRows)]);
            break;
        }

        case 'transfers': {
            echo json_encode(['success' => true, 'transfers' => fetchTransfers($alpaca, $walletRows)]);
            break;
        }

        case 'orders': {
            echo json_encode(['success' => true, 'orders' => fetchOrders($alpaca, $walletRows)]);
            break;
        }

        case 'journals': {
            echo json_encode(['success' => true, 'journals' => fetchJournals($alpaca)]);
            break;
        }

        default:
            echo json_encode(['success' => false, 'error' => "Unknown action: $action"]);
    }

} catch (Throwable $e) {
    error_log("[alpaca-broker-admin] Fatal: " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
