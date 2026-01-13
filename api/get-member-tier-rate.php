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
$merchantId = isset($input['merchant_id']) ? trim($input['merchant_id']) : '';
$memberTier = isset($input['member_tier']) ? trim($input['member_tier']) : '';

if (!$merchantId) {
  http_response_code(400);
  echo json_encode([
    "success" => false,
    "error" => "merchant_id is required"
  ]);
  exit;
}

try {
  // Fetch merchant with all tiers
  $stmt = $conn->prepare("
    SELECT 
      merchant_id,
      merchant_name,
      conversion_rate as base_conversion_rate,
      tier1_name, tier1_min_points, tier1_conversion_rate,
      tier2_name, tier2_min_points, tier2_conversion_rate,
      tier3_name, tier3_min_points, tier3_conversion_rate,
      tier4_name, tier4_min_points, tier4_conversion_rate,
      tier5_name, tier5_min_points, tier5_conversion_rate,
      tier6_name, tier6_min_points, tier6_conversion_rate
    FROM merchant 
    WHERE merchant_id = :merchant_id
    LIMIT 1
  ");
  
  $stmt->execute([':merchant_id' => $merchantId]);
  $merchant = $stmt->fetch(PDO::FETCH_ASSOC);
  
  if (!$merchant) {
    http_response_code(404);
    echo json_encode([
      "success" => false,
      "error" => "Merchant not found"
    ]);
    exit;
  }
  
  // Build tiers array
  $tiers = [];
  for ($i = 1; $i <= 6; $i++) {
    $tierName = $merchant["tier{$i}_name"];
    if ($tierName) {
      $tiers[] = [
        'name' => $tierName,
        'min_points' => (int)$merchant["tier{$i}_min_points"],
        'conversion_rate' => (float)$merchant["tier{$i}_conversion_rate"]
      ];
    }
  }
  
  // Find the tier's conversion rate
  $tierConversionRate = null;
  $foundTier = null;
  
  if ($memberTier) {
    foreach ($tiers as $tier) {
      if (strcasecmp($tier['name'], $memberTier) === 0) {
        $tierConversionRate = $tier['conversion_rate'];
        $foundTier = $tier;
        break;
      }
    }
  }
  
  // If no tier match, use base conversion rate
  if ($tierConversionRate === null) {
    $tierConversionRate = (float)$merchant['base_conversion_rate'];
  }
  
  echo json_encode([
    "success" => true,
    "merchant_id" => $merchantId,
    "merchant_name" => $merchant['merchant_name'],
    "member_tier" => $memberTier ?: null,
    "conversion_rate" => $tierConversionRate,
    "base_conversion_rate" => (float)$merchant['base_conversion_rate'],
    "tier_info" => $foundTier,
    "available_tiers" => $tiers
  ]);
  
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Database error: " . $e->getMessage()
  ]);
}
