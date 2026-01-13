<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
  http_response_code(204); 
  exit; 
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents("php://input"), true);
$memberId = isset($input['member_id']) ? trim($input['member_id']) : '';
$memberTier = isset($input['member_tier']) ? trim($input['member_tier']) : '';

if (!$memberId || !$memberTier) {
  http_response_code(400);
  echo json_encode([
    "success" => false,
    "error" => "member_id and member_tier are required"
  ]);
  exit;
}

try {
  // Update member tier
  $stmt = $conn->prepare("
    UPDATE wallet 
    SET member_tier = :member_tier,
        updated_at = NOW()
    WHERE member_id = :member_id
  ");
  
  $stmt->execute([
    ':member_tier' => $memberTier,
    ':member_id' => $memberId
  ]);
  
  if ($stmt->rowCount() === 0) {
    echo json_encode([
      "success" => false,
      "error" => "Member not found or tier unchanged"
    ]);
    exit;
  }
  
  // Fetch updated wallet to return tier info
  $fetchStmt = $conn->prepare("
    SELECT member_tier, points, merchant_id
    FROM wallet 
    WHERE member_id = :member_id
  ");
  $fetchStmt->execute([':member_id' => $memberId]);
  $wallet = $fetchStmt->fetch(PDO::FETCH_ASSOC);
  
  echo json_encode([
    "success" => true,
    "message" => "Member tier updated successfully",
    "member_id" => $memberId,
    "member_tier" => $wallet['member_tier'],
    "points" => (int)$wallet['points']
  ]);
  
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Database error: " . $e->getMessage()
  ]);
}
