<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

// Build WHERE conditions
$where = [];
$params = [];

if (!empty($input['merchant_id'])) {
    $where[] = "merchant_id = :merchant_id";
    $params[':merchant_id'] = $input['merchant_id'];
}

if (!empty($input['member_id'])) {
    $where[] = "member_id = :member_id";
    $params[':member_id'] = $input['member_id'];
}

if (!empty($input['event_type'])) {
    $where[] = "event_type = :event_type";
    $params[':event_type'] = $input['event_type'];
}

if (!empty($input['status'])) {
    $where[] = "status = :status";
    $params[':status'] = $input['status'];
}

if (!empty($input['basket_id'])) {
    $where[] = "basket_id = :basket_id";
    $params[':basket_id'] = $input['basket_id'];
}

// Date range filter
if (!empty($input['start_date']) && !empty($input['end_date'])) {
    $where[] = "created_at >= :start_date AND created_at < :end_date";
    $params[':start_date'] = $input['start_date'];
    $params[':end_date'] = $input['end_date'];
}

// Build WHERE clause
$whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

// Sorting and limit
$sortBy = $input['sort_by'] ?? 'created_at';
$sortDir = strtoupper($input['sort_dir'] ?? 'DESC');
$limit = min((int)($input['limit'] ?? 200), 500);

// Validate sort direction
if (!in_array($sortDir, ['ASC', 'DESC'])) {
    $sortDir = 'DESC';
}

try {
    $sql = "
        SELECT 
            id,
            merchant_id,
            member_id,
            event_type,
            points_amount,
            cash_amount,
            basket_id,
            payload,
            status,
            response_code,
            response_body,
            error_message,
            created_at,
            sent_at
        FROM merchant_notifications
        $whereClause
        ORDER BY $sortBy $sortDir
        LIMIT :limit
    ";

    $stmt = $conn->prepare($sql);
    
    // Bind parameters
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    
    $stmt->execute();
    $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success" => true,
        "notifications" => $notifications,
        "count" => count($notifications)
    ]);

} catch (PDOException $e) {
    error_log("get-merchant-notifications.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
