<?php
declare(strict_types=1);

/**
 * prepare_orders.php — Thin endpoint for PrepareOrdersProcess
 *
 * Actions: preview | prepare | stats | drilldown | approve | discard | batches
 */

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/prepare_orders_process.php';

$input  = json_decode(file_get_contents("php://input"), true) ?: [];
$action = $input['action'] ?? '';

$process = new PrepareOrdersProcess($conn);

switch ($action) {

    case 'preview':
        $merchantId = $input['merchant_id'] ?? null;
        echo json_encode($process->previewCounts($merchantId));
        break;

    case 'prepare':
        $memberId   = $input['member_id']   ?? null;
        $merchantId = $input['merchant_id'] ?? null;
        echo json_encode($process->prepare($memberId, $merchantId));
        break;

    case 'stats':
        $batchId = $input['batch_id'] ?? '';
        echo json_encode($process->stats($batchId));
        break;

    case 'drilldown':
        $batchId    = $input['batch_id']    ?? '';
        $page       = (int) ($input['page']       ?? 1);
        $perPage    = (int) ($input['per_page']    ?? 50);
        $merchantId = $input['merchant_id'] ?? null;
        $broker     = $input['broker']      ?? null;
        echo json_encode($process->drilldown($batchId, $page, $perPage, $merchantId, $broker));
        break;

    case 'approve':
        $batchId = $input['batch_id'] ?? '';
        echo json_encode($process->approve($batchId));
        break;

    case 'discard':
        $batchId = $input['batch_id'] ?? '';
        echo json_encode($process->discard($batchId));
        break;

    case 'batches':
        $limit = (int) ($input['limit'] ?? 50);
        echo json_encode($process->batches($limit));
        break;

    default:
        echo json_encode([
            'success' => false,
            'error'   => 'Invalid action. Use: preview, prepare, stats, drilldown, approve, discard, batches',
        ]);
        break;
}
