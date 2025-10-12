<?php
// api/delete-merchant.php

require_once "config.php";
header("Content-Type: application/json");

$input = json_decode(file_get_contents("php://input"), true);
$record_id = $input["record_id"] ?? null;

try {
    $stmt = $conn->prepare("DELETE FROM merchant WHERE record_id=?");
    $stmt->execute([$record_id]);
    echo json_encode(["success" => true]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
