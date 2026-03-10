<?php
/**
 * pipeline-cycles.php
 *
 * CRUD + stage-advance for pipeline_cycles.
 *
 * Actions (POST JSON body: action=...)
 * ──────────────────────────────────────────────────────────
 *  list          – active + recent cycles
 *  open          – open a new cycle for a merchant-broker pair
 *  close         – mark cycle completed / cancelled / failed
 *  advance_stage – update a single stage status + timestamps
 *  attach_batch  – attach a batch_id to an open cycle
 *  update_counts – resync denormalised counters from orders table
 *  get_cycle     – single cycle by id
 *
 * Schema notes (actual DB):
 *   merchant.record_id       INT  ← FK target (pipeline_cycles.merchant_record_id)
 *   merchant.merchant_id     VARCHAR(30)  ← human identifier (used in orders table)
 *   broker_master.broker_id  VARCHAR(64)  ← PK + FK target
 */

// ── Output buffer: absorb any stray output before headers are sent ────────────
ob_start();

// ── Global exception handler — turns any uncaught Throwable into JSON 500 ────
set_exception_handler(function (Throwable $e) {
    ob_clean();
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
        'file'    => basename($e->getFile()),
        'line'    => $e->getLine(),
    ]);
    exit;
});

// Convert PHP warnings/notices to exceptions so nothing slips through as HTML
set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline) {
    if (!(error_reporting() & $errno)) return false;
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';          // provides $conn
require_once __DIR__ . '/pipeline-guard.php';  // checkPipelineBlocked(), buildBlockMessage(), checkCycleOpen()

// Discard anything cors.php / config.php may have echo'd
ob_clean();

// Ensure PDO throws exceptions on DB errors
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

header('Content-Type: application/json');

// Admin identity — no auth-check.php in this codebase; use a safe fallback
$adminUser = $_SERVER['PHP_AUTH_USER'] ?? $_POST['admin_user'] ?? 'admin';

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $body['action'] ?? $_GET['action'] ?? '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function ok(array $payload = []): void {
    echo json_encode(['success' => true] + $payload);
    exit;
}
function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}
function req(array $body, array $fields): void {
    foreach ($fields as $f) {
        if (!isset($body[$f]) || $body[$f] === '') fail("Missing required field: {$f}");
    }
}

// ── Valid enums ───────────────────────────────────────────────────────────────
const STAGE_STATUSES  = ['pending','in_progress','completed','skipped','failed','blocked'];
const STAGE_KEYS      = [
    'baskets','orders','payment','funding','journal',
    'placement','submission','execution','settlement',
];
const FUNDING_METHODS = ['plaid','csv','manual','wire'];

// =============================================================================
//  list
// =============================================================================
if ($action === 'list') {
    $limit      = min((int)($body['limit'] ?? 50), 200);
    $activeOnly = !empty($body['active_only']);

    $where = $activeOnly ? "WHERE pc.status IN ('open','locked')" : "";

    $stmt = $conn->prepare("
        SELECT
            pc.*,
            m.merchant_name,
            m.merchant_id   AS merchant_code,
            b.broker_name   AS broker_display_name,
            TIMESTAMPDIFF(MINUTE, pc.created_at, NOW()) AS age_minutes
        FROM pipeline_cycles pc
        LEFT JOIN merchant      m ON m.record_id = pc.merchant_record_id
        LEFT JOIN broker_master b ON b.broker_id  = pc.broker_id
        {$where}
        ORDER BY
            FIELD(pc.status,'open','locked','failed','completed','cancelled'),
            pc.created_at DESC
        LIMIT {$limit}
    ");
    $stmt->execute([]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $stages = [];
        foreach (STAGE_KEYS as $sk) {
            $stages[$sk] = $row["stage_{$sk}"] ?? 'pending';
        }
        $row['stages'] = $stages;

        $row['current_stage'] = 'settlement';
        foreach (STAGE_KEYS as $sk) {
            if (in_array($stages[$sk], ['pending','in_progress','blocked','failed'])) {
                $row['current_stage'] = $sk;
                break;
            }
        }

        $done = count(array_filter($stages, fn($s) => in_array($s, ['completed','skipped'])));
        $row['progress_pct'] = round($done / count(STAGE_KEYS) * 100);
    }
    unset($row);

    ok(['cycles' => $rows, 'count' => count($rows)]);
}

// =============================================================================
//  open
// =============================================================================
if ($action === 'open') {
    req($body, ['merchant_record_id', 'broker_id']);

    $merchantRecordId = (int)$body['merchant_record_id'];
    $brokerId         = trim($body['broker_id']);
    $label            = trim($body['label'] ?? '');
    $fundingMethod    = $body['funding_method'] ?? null;

    if ($fundingMethod && !in_array($fundingMethod, FUNDING_METHODS)) {
        fail("Invalid funding_method. Must be one of: " . implode(', ', FUNDING_METHODS));
    }

    // 1. Verify merchant exists — resolve display fields
    $mStmt = $conn->prepare(
        "SELECT record_id, merchant_id, merchant_name FROM merchant WHERE record_id = ? LIMIT 1"
    );
    $mStmt->execute([$merchantRecordId]);
    $merchant = $mStmt->fetch(PDO::FETCH_ASSOC);
    if (!$merchant) fail("Merchant record_id {$merchantRecordId} not found.");

    // 2. Verify broker exists
    $bStmt = $conn->prepare(
        "SELECT broker_id, broker_name FROM broker_master WHERE broker_id = ? LIMIT 1"
    );
    $bStmt->execute([$brokerId]);
    $broker = $bStmt->fetch(PDO::FETCH_ASSOC);
    if (!$broker) fail("Broker '{$brokerId}' not found in broker_master.");

    // 3. Guard: check for an already-open cycle for this pair
    $cycleCheck = checkCycleOpen($conn, $merchantRecordId, $brokerId);
    if ($cycleCheck['open']) {
        fail(
            "An open pipeline cycle (#{$cycleCheck['cycle_id']}) already exists for "
            . "{$merchant['merchant_id']} ↔ {$brokerId}. Close it first."
        );
    }

    // 4. Guard: check for in-flight orders that would block a new cycle
    $guard = checkPipelineBlocked($conn, $merchant['merchant_id']);
    if ($guard['blocked']) {
        echo json_encode([
            'success' => false,
            'blocked' => true,
            'error'   => buildBlockMessage($guard),
            'details' => $guard['merchants'],
        ]);
        exit;
    }

    // 5. All clear — insert new cycle
    $stmt = $conn->prepare("
        INSERT INTO pipeline_cycles
            (merchant_record_id, broker_id, merchant_id_str, broker_name,
             cycle_label, funding_method, opened_by, status, active_lock)
        VALUES
            (:merchant_record_id, :broker_id, :merchant_id_str, :broker_name,
             :label, :funding_method, :opened_by, 'open', '1')
    ");
    $stmt->execute([
        ':merchant_record_id' => $merchantRecordId,
        ':broker_id'          => $brokerId,
        ':merchant_id_str'    => $merchant['merchant_id'],
        ':broker_name'        => $broker['broker_name'],
        ':label'              => $label ?: null,
        ':funding_method'     => $fundingMethod,
        ':opened_by'          => $adminUser,
    ]);

    $cycleId = (int)$conn->lastInsertId();
    ok([
        'cycle_id' => $cycleId,
        'message'  => "Pipeline cycle #{$cycleId} opened for {$merchant['merchant_id']} ↔ {$brokerId}.",
    ]);
}

// =============================================================================
//  close
// =============================================================================
if ($action === 'close') {
    req($body, ['cycle_id', 'new_status']);

    $cycleId   = (int)$body['cycle_id'];
    $newStatus = $body['new_status'];
    $notes     = trim($body['notes'] ?? '');

    if (!in_array($newStatus, ['completed','cancelled','failed'])) {
        fail("new_status must be: completed, cancelled, or failed.");
    }

    $stmt = $conn->prepare("
        UPDATE pipeline_cycles
        SET  status      = :status,
             active_lock = NULL,
             notes       = COALESCE(NULLIF(:notes,''), notes),
             closed_by   = :closed_by,
             updated_at  = NOW()
        WHERE id     = :id
          AND status IN ('open','locked')
    ");
    $stmt->execute([
        ':status'    => $newStatus,
        ':notes'     => $notes,
        ':closed_by' => $adminUser,
        ':id'        => $cycleId,
    ]);

    if ($stmt->rowCount() === 0) fail("Cycle not found or already closed.");
    ok(['message' => "Cycle #{$cycleId} marked as {$newStatus}."]);
}

// =============================================================================
//  advance_stage
// =============================================================================
if ($action === 'advance_stage') {
    req($body, ['cycle_id', 'stage', 'stage_status']);

    $cycleId     = (int)$body['cycle_id'];
    $stage       = $body['stage'];
    $stageStatus = $body['stage_status'];

    if (!in_array($stage,       STAGE_KEYS))     fail("Invalid stage.");
    if (!in_array($stageStatus, STAGE_STATUSES)) fail("Invalid stage_status.");

    $tsUpdates = '';
    if ($stageStatus === 'in_progress') {
        $tsUpdates = ", {$stage}_started_at = COALESCE({$stage}_started_at, NOW())";
    } elseif (in_array($stageStatus, ['completed','skipped','failed'])) {
        $tsUpdates = ", {$stage}_completed_at = NOW()";
        if ($stageStatus !== 'skipped') {
            $tsUpdates .= ", {$stage}_started_at = COALESCE({$stage}_started_at, NOW())";
        }
    }

    $errorCols  = '';
    $errorParam = [];
    if ($stageStatus === 'failed' && !empty($body['error_message'])) {
        $errorCols  = ", last_error = :error_msg, last_error_at = NOW()";
        $errorParam = [':error_msg' => $body['error_message']];
    }

    // Auto-lock cycle when orders stage goes in_progress
    $lockUpdate = '';
    if ($stage === 'orders' && $stageStatus === 'in_progress') {
        $lockUpdate = ", status = IF(status = 'open', 'locked', status), active_lock = NULL";
    }

    $params = [':stage_status' => $stageStatus, ':id' => $cycleId] + $errorParam;

    $stmt = $conn->prepare("
        UPDATE pipeline_cycles
        SET stage_{$stage} = :stage_status
            {$tsUpdates}
            {$errorCols}
            {$lockUpdate},
            updated_at = NOW()
        WHERE id = :id
    ");
    $stmt->execute($params);

    if ($stmt->rowCount() === 0) fail("Cycle not found.");
    ok(['message' => "Stage '{$stage}' → '{$stageStatus}'."]);
}

// =============================================================================
//  attach_batch
// =============================================================================
if ($action === 'attach_batch') {
    req($body, ['cycle_id', 'batch_id']);

    $stmt = $conn->prepare("
        UPDATE pipeline_cycles
        SET batch_id = :batch_id, updated_at = NOW()
        WHERE id = :id AND batch_id IS NULL
    ");
    $stmt->execute([':batch_id' => $body['batch_id'], ':id' => (int)$body['cycle_id']]);

    if ($stmt->rowCount() === 0) fail("Cycle not found or batch already attached.");
    ok(['message' => "Batch {$body['batch_id']} attached."]);
}

// =============================================================================
//  update_counts — resync from orders table
// =============================================================================
if ($action === 'update_counts') {
    req($body, ['cycle_id']);

    $cycleId = (int)$body['cycle_id'];

    $cycleStmt = $conn->prepare("SELECT batch_id, merchant_id_str FROM pipeline_cycles WHERE id = ?");
    $cycleStmt->execute([$cycleId]);
    $cycleRow = $cycleStmt->fetch(PDO::FETCH_ASSOC);

    if (!$cycleRow || !$cycleRow['batch_id']) {
        fail("Cycle not found or no batch attached — cannot aggregate counts.");
    }

    $counts = $conn->prepare("
        SELECT
            COUNT(*)                                                        AS orders_total,
            SUM(status = 'approved')                                        AS orders_approved,
            SUM(status = 'funded')                                          AS orders_funded,
            SUM(status = 'placed')                                          AS orders_placed,
            SUM(status = 'submitted')                                       AS orders_submitted,
            SUM(status = 'settled')                                         AS orders_settled,
            SUM(status = 'failed')                                          AS orders_failed,
            SUM(status = 'cancelled')                                       AS orders_cancelled,
            COALESCE(SUM(investment_amount), 0)                             AS amount_total,
            COALESCE(SUM(CASE WHEN status IN ('funded','placed','submitted','settled')
                              THEN investment_amount END), 0)               AS amount_funded,
            COALESCE(SUM(CASE WHEN status = 'settled'
                              THEN investment_amount END), 0)               AS amount_settled
        FROM orders
        WHERE batch_id = ?
    ");
    $counts->execute([$cycleRow['batch_id']]);
    $c = $counts->fetch(PDO::FETCH_ASSOC);

    $upd = $conn->prepare("
        UPDATE pipeline_cycles SET
            orders_total     = :orders_total,
            orders_approved  = :orders_approved,
            orders_funded    = :orders_funded,
            orders_placed    = :orders_placed,
            orders_submitted = :orders_submitted,
            orders_settled   = :orders_settled,
            orders_failed    = :orders_failed,
            orders_cancelled = :orders_cancelled,
            amount_total     = :amount_total,
            amount_funded    = :amount_funded,
            amount_settled   = :amount_settled,
            updated_at       = NOW()
        WHERE id = :id
    ");
    $upd->execute([
        ':orders_total'     => (int)$c['orders_total'],
        ':orders_approved'  => (int)$c['orders_approved'],
        ':orders_funded'    => (int)$c['orders_funded'],
        ':orders_placed'    => (int)$c['orders_placed'],
        ':orders_submitted' => (int)$c['orders_submitted'],
        ':orders_settled'   => (int)$c['orders_settled'],
        ':orders_failed'    => (int)$c['orders_failed'],
        ':orders_cancelled' => (int)$c['orders_cancelled'],
        ':amount_total'     => (float)$c['amount_total'],
        ':amount_funded'    => (float)$c['amount_funded'],
        ':amount_settled'   => (float)$c['amount_settled'],
        ':id'               => $cycleId,
    ]);

    ok(['counts' => $c]);
}

// =============================================================================
//  get_cycle
// =============================================================================
if ($action === 'get_cycle') {
    req($body, ['cycle_id']);

    $stmt = $conn->prepare("
        SELECT pc.*,
               m.merchant_name,
               m.merchant_id  AS merchant_code,
               b.broker_name  AS broker_display_name
        FROM   pipeline_cycles pc
        LEFT JOIN merchant      m ON m.record_id = pc.merchant_record_id
        LEFT JOIN broker_master b ON b.broker_id  = pc.broker_id
        WHERE  pc.id = ?
    ");
    $stmt->execute([(int)$body['cycle_id']]);
    $cycle = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cycle) fail("Cycle not found.", 404);
    ok(['cycle' => $cycle]);
}

// =============================================================================
//  fallthrough
// =============================================================================
fail("Unknown action: '{$action}'.");
