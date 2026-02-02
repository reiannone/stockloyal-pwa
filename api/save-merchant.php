<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/save-merchant.php

require_once "config.php";
header("Content-Type: application/json");

$input = json_decode(file_get_contents("php://input"), true);

$merchant_id      = $input["merchant_id"]      ?? "";
$merchant_name    = $input["merchant_name"]    ?? "";
$program_name     = $input["program_name"]     ?? "";
$contact_email    = $input["contact_email"]    ?? "";
$contact_phone    = $input["contact_phone"]    ?? "";
$website_url      = $input["website_url"]      ?? "";
$webhook_url      = $input["webhook_url"]      ?? null;
$api_key          = $input["api_key"]          ?? null;
$conversion_rate  = $input["conversion_rate"]  ?? 1.0;
$active_status    = $input["active_status"]    ?? 1;
$promotion_text   = $input["promotion_text"]   ?? "";
$promotion_active = $input["promotion_active"] ?? 0;
$sweep_day        = $input["sweep_day"]        ?? null;

// Handle "custom" value - should already be converted to number on frontend
if ($sweep_day === "" || $sweep_day === "custom") {
    $sweep_day = null;
}

// ✅ Extract tier fields
$tier1_name            = $input["tier1_name"]            ?? null;
$tier1_min_points      = $input["tier1_min_points"]      ?? null;
$tier1_conversion_rate = $input["tier1_conversion_rate"] ?? null;
$tier2_name            = $input["tier2_name"]            ?? null;
$tier2_min_points      = $input["tier2_min_points"]      ?? null;
$tier2_conversion_rate = $input["tier2_conversion_rate"] ?? null;
$tier3_name            = $input["tier3_name"]            ?? null;
$tier3_min_points      = $input["tier3_min_points"]      ?? null;
$tier3_conversion_rate = $input["tier3_conversion_rate"] ?? null;
$tier4_name            = $input["tier4_name"]            ?? null;
$tier4_min_points      = $input["tier4_min_points"]      ?? null;
$tier4_conversion_rate = $input["tier4_conversion_rate"] ?? null;
$tier5_name            = $input["tier5_name"]            ?? null;
$tier5_min_points      = $input["tier5_min_points"]      ?? null;
$tier5_conversion_rate = $input["tier5_conversion_rate"] ?? null;
$tier6_name            = $input["tier6_name"]            ?? null;
$tier6_min_points      = $input["tier6_min_points"]      ?? null;
$tier6_conversion_rate = $input["tier6_conversion_rate"] ?? null;

try {
    if (!$merchant_id) {
        echo json_encode(["success" => false, "error" => "Missing merchant_id"]);
        exit;
    }

    // 🔎 Check if a row with this merchant_id already exists
    $check = $conn->prepare("SELECT 1 FROM merchant WHERE merchant_id = :merchant_id LIMIT 1");
    $check->execute(["merchant_id" => $merchant_id]);
    $exists = $check->fetchColumn();

    if ($exists) {
        // Check if sweep_day changed to update sweep_modified_at
        $checkSweep = $conn->prepare("SELECT sweep_day FROM merchant WHERE merchant_id = :merchant_id LIMIT 1");
        $checkSweep->execute(["merchant_id" => $merchant_id]);
        $oldSweepDay = $checkSweep->fetchColumn();
        $sweepChanged = ($oldSweepDay !== $sweep_day);
        
        // ---------------- UPDATE existing row ----------------
        $stmt = $conn->prepare("
            UPDATE merchant SET 
                merchant_name   = :merchant_name,
                program_name    = :program_name,
                contact_email   = :contact_email,
                contact_phone   = :contact_phone,
                website_url     = :website_url,
                webhook_url     = :webhook_url,
                api_key         = :api_key,
                conversion_rate = :conversion_rate,
                active_status   = :active_status,
                promotion_text  = :promotion_text,
                promotion_active= :promotion_active,
                sweep_day       = :sweep_day,
                sweep_modified_at = " . ($sweepChanged ? "NOW()" : "sweep_modified_at") . ",
                tier1_name            = :tier1_name,
                tier1_min_points      = :tier1_min_points,
                tier1_conversion_rate = :tier1_conversion_rate,
                tier2_name            = :tier2_name,
                tier2_min_points      = :tier2_min_points,
                tier2_conversion_rate = :tier2_conversion_rate,
                tier3_name            = :tier3_name,
                tier3_min_points      = :tier3_min_points,
                tier3_conversion_rate = :tier3_conversion_rate,
                tier4_name            = :tier4_name,
                tier4_min_points      = :tier4_min_points,
                tier4_conversion_rate = :tier4_conversion_rate,
                tier5_name            = :tier5_name,
                tier5_min_points      = :tier5_min_points,
                tier5_conversion_rate = :tier5_conversion_rate,
                tier6_name            = :tier6_name,
                tier6_min_points      = :tier6_min_points,
                tier6_conversion_rate = :tier6_conversion_rate
            WHERE merchant_id = :merchant_id
        ");
    } else {
        // ---------------- INSERT new row ----------------
        $stmt = $conn->prepare("
            INSERT INTO merchant (
                merchant_id, merchant_name, program_name, 
                contact_email, contact_phone, website_url,
                webhook_url, api_key,
                conversion_rate, active_status, promotion_text, promotion_active,
                sweep_day, sweep_modified_at,
                tier1_name, tier1_min_points, tier1_conversion_rate,
                tier2_name, tier2_min_points, tier2_conversion_rate,
                tier3_name, tier3_min_points, tier3_conversion_rate,
                tier4_name, tier4_min_points, tier4_conversion_rate,
                tier5_name, tier5_min_points, tier5_conversion_rate,
                tier6_name, tier6_min_points, tier6_conversion_rate
            ) VALUES (
                :merchant_id, :merchant_name, :program_name,
                :contact_email, :contact_phone, :website_url,
                :webhook_url, :api_key,
                :conversion_rate, :active_status, :promotion_text, :promotion_active,
                :sweep_day, " . ($sweep_day ? "NOW()" : "NULL") . ",
                :tier1_name, :tier1_min_points, :tier1_conversion_rate,
                :tier2_name, :tier2_min_points, :tier2_conversion_rate,
                :tier3_name, :tier3_min_points, :tier3_conversion_rate,
                :tier4_name, :tier4_min_points, :tier4_conversion_rate,
                :tier5_name, :tier5_min_points, :tier5_conversion_rate,
                :tier6_name, :tier6_min_points, :tier6_conversion_rate
            )
        ");
    }

    $stmt->execute([
        "merchant_id"      => $merchant_id,
        "merchant_name"    => $merchant_name,
        "program_name"     => $program_name,
        "contact_email"    => $contact_email,
        "contact_phone"    => $contact_phone,
        "website_url"      => $website_url,
        "webhook_url"      => $webhook_url,
        "api_key"          => $api_key,
        "conversion_rate"  => $conversion_rate,
        "active_status"    => $active_status,
        "promotion_text"   => $promotion_text,
        "promotion_active" => $promotion_active,
        "sweep_day"        => $sweep_day,
        "tier1_name"            => $tier1_name,
        "tier1_min_points"      => $tier1_min_points,
        "tier1_conversion_rate" => $tier1_conversion_rate,
        "tier2_name"            => $tier2_name,
        "tier2_min_points"      => $tier2_min_points,
        "tier2_conversion_rate" => $tier2_conversion_rate,
        "tier3_name"            => $tier3_name,
        "tier3_min_points"      => $tier3_min_points,
        "tier3_conversion_rate" => $tier3_conversion_rate,
        "tier4_name"            => $tier4_name,
        "tier4_min_points"      => $tier4_min_points,
        "tier4_conversion_rate" => $tier4_conversion_rate,
        "tier5_name"            => $tier5_name,
        "tier5_min_points"      => $tier5_min_points,
        "tier5_conversion_rate" => $tier5_conversion_rate,
        "tier6_name"            => $tier6_name,
        "tier6_min_points"      => $tier6_min_points,
        "tier6_conversion_rate" => $tier6_conversion_rate,
    ]);

    echo json_encode(["success" => true, "merchant_id" => $merchant_id]);

} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
