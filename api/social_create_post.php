<?php
// api/social_create_post.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$inputRaw = file_get_contents("php://input");
$input    = json_decode($inputRaw, true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

$memberId      = trim($input['member_id'] ?? '');
$pointsUsed    = (int)($input['points_used'] ?? 0);
$cashValue     = (float)($input['cash_value'] ?? 0.0);
$strategyTag   = trim($input['strategy_tag'] ?? '');
$text          = trim($input['text'] ?? '');
$primaryTicker = trim($input['primary_ticker'] ?? '');
$tickers       = $input['tickers'] ?? [];

if ($memberId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'member_id is required']);
    exit;
}

try {
    $sql = "INSERT INTO social_posts
        (member_id, points_used, cash_value, strategy_tag, text, primary_ticker, tickers_json)
        VALUES (:member_id, :points_used, :cash_value, :strategy_tag, :text, :primary_ticker, :tickers_json)";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':member_id'      => $memberId,
        ':points_used'    => max(0, $pointsUsed),
        ':cash_value'     => max(0, $cashValue),
        ':strategy_tag'   => $strategyTag !== '' ? $strategyTag : null,
        ':text'           => $text !== '' ? $text : null,
        ':primary_ticker' => $primaryTicker !== '' ? $primaryTicker : null,
        ':tickers_json'   => !empty($tickers) ? json_encode(array_values($tickers)) : null,
    ]);

    $postId = (int)$conn->lastInsertId();

    echo json_encode([
        'success' => true,
        'post_id' => $postId,
    ]);
} catch (Throwable $e) {
    error_log('social_create_post error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to create post']);
}
