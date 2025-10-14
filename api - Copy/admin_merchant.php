<?php
// api/admin_merchants.php
require_once 'config.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Handle OPTIONS (CORS preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        // Fetch all merchants
        $stmt = $conn->query("SELECT * FROM merchant ORDER BY created_at DESC");
        echo json_encode(["success" => true, "merchants" => $stmt->fetchAll()]);
    } elseif ($method === 'POST') {
        $input = json_decode(file_get_contents("php://input"), true);

        $record_id = $input['record_id'] ?? null;
        $merchant_id = $input['merchant_id'] ?? '';
        $merchant_name = $input['merchant_name'] ?? '';
        $program_name = $input['program_name'] ?? '';
        $contact_email = $input['contact_email'] ?? '';
        $contact_phone = $input['contact_phone'] ?? '';
        $website_url = $input['website_url'] ?? '';
        $conversion_rate = $input['conversion_rate'] ?? 1.0;
        $active_status = $input['active_status'] ?? 0;
        $promotion_text = $input['promotion_text'] ?? '';
        $promotion_active = $input['promotion_active'] ?? 0;

        if ($record_id) {
            // UPDATE
            $stmt = $conn->prepare("
                UPDATE merchant SET 
                  merchant_id=?, merchant_name=?, program_name=?, contact_email=?, 
                  contact_phone=?, website_url=?, conversion_rate=?, active_status=?, 
                  promotion_text=?, promotion_active=?
                WHERE record_id=?
            ");
            $stmt->execute([
                $merchant_id, $merchant_name, $program_name, $contact_email,
                $contact_phone, $website_url, $conversion_rate, $active_status,
                $promotion_text, $promotion_active, $record_id
            ]);
        } else {
            // INSERT
            $stmt = $conn->prepare("
                INSERT INTO merchant 
                  (merchant_id, merchant_name, program_name, contact_email, contact_phone,
                   website_url, conversion_rate, active_status, promotion_text, promotion_active)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            ");
            $stmt->execute([
                $merchant_id, $merchant_name, $program_name, $contact_email, 
                $contact_phone, $website_url, $conversion_rate, $active_status, 
                $promotion_text, $promotion_active
            ]);
        }
        echo json_encode(["success" => true]);
    } elseif ($method === 'DELETE') {
        $id = intval($_GET['id'] ?? 0);
        if ($id) {
            $stmt = $conn->prepare("DELETE FROM merchant WHERE record_id=?");
            $stmt->execute([$id]);
        }
        echo json_encode(["success" => true]);
    } else {
        http_response_code(405);
        echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $ex) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $ex->getMessage()]);
}
