<?php
require_once __DIR__ . '/cors.php';
declare(strict_types=1); header('Content-Type: application/json'); echo json_encode(['ok'=>true,'time'=>date('c')]);
