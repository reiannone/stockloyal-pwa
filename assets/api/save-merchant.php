<?php
require_once __DIR__ . '/cors.php';
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
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
$conversion_rate  = $input["conversion_rate"]  ?? 1.0;
$active_status    = $input["active_status"]    ?? 1;
$promotion_text   = $input["promotion_text"]   ?? "";
$promotion_active = $input["promotion_active"] ?? 0;

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
        // ---------------- UPDATE existing row ----------------
        $stmt = $conn->prepare("
            UPDATE merchant SET 
                merchant_name   = :merchant_name,
                program_name    = :program_name,
                contact_email   = :contact_email,
                contact_phone   = :contact_phone,
                website_url     = :website_url,
                conversion_rate = :conversion_rate,
                active_status   = :active_status,
                promotion_text  = :promotion_text,
                promotion_active= :promotion_active
            WHERE merchant_id = :merchant_id
        ");
    } else {
        // ---------------- INSERT new row ----------------
        $stmt = $conn->prepare("
            INSERT INTO merchant (
                merchant_id, merchant_name, program_name, 
                contact_email, contact_phone, website_url,
                conversion_rate, active_status, promotion_text, promotion_active
            ) VALUES (
                :merchant_id, :merchant_name, :program_name,
                :contact_email, :contact_phone, :website_url,
                :conversion_rate, :active_status, :promotion_text, :promotion_active
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
        "conversion_rate"  => $conversion_rate,
        "active_status"    => $active_status,
        "promotion_text"   => $promotion_text,
        "promotion_active" => $promotion_active,
    ]);

    echo json_encode(["success" => true, "merchant_id" => $merchant_id]);

} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
