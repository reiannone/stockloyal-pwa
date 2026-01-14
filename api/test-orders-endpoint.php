<?php
// test-orders-endpoint.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$diagnostics = [];

// 1. Check PHP version
$diagnostics['php_version'] = phpversion();

// 2. Check if db.php exists
$diagnostics['db_file_exists'] = file_exists('db.php');
$diagnostics['db_file_path'] = __DIR__ . '/db.php';

// 3. Try to connect to database
try {
    if (file_exists('db.php')) {
        require_once 'db.php';
        
        $diagnostics['getDbConnection_exists'] = function_exists('getDbConnection');
        
        if (function_exists('getDbConnection')) {
            $conn = getDbConnection();
            $diagnostics['db_connection'] = 'Success';
            $diagnostics['db_connected'] = $conn ? true : false;
            
            if ($conn) {
                // Try a simple query
                $result = $conn->query("SELECT COUNT(*) as count FROM orders");
                if ($result) {
                    $row = $result->fetch_assoc();
                    $diagnostics['orders_count'] = $row['count'];
                    $diagnostics['orders_table_accessible'] = true;
                } else {
                    $diagnostics['orders_table_accessible'] = false;
                    $diagnostics['orders_error'] = $conn->error;
                }
                
                // Check table structure
                $result = $conn->query("DESCRIBE orders");
                if ($result) {
                    $fields = [];
                    while ($row = $result->fetch_assoc()) {
                        $fields[] = $row['Field'];
                    }
                    $diagnostics['orders_fields'] = $fields;
                } else {
                    $diagnostics['describe_error'] = $conn->error;
                }
                
                $conn->close();
            }
        } else {
            $diagnostics['db_connection'] = 'getDbConnection function not found';
        }
    } else {
        $diagnostics['db_connection'] = 'db.php file not found';
    }
} catch (Exception $e) {
    $diagnostics['db_connection'] = 'Error: ' . $e->getMessage();
    $diagnostics['db_error_trace'] = $e->getTraceAsString();
}

// 4. Check POST data
$rawInput = file_get_contents('php://input');
$diagnostics['raw_input'] = $rawInput;
$diagnostics['input_length'] = strlen($rawInput);

if ($rawInput) {
    $parsed = json_decode($rawInput, true);
    $diagnostics['json_valid'] = (json_last_error() === JSON_ERROR_NONE);
    $diagnostics['json_error'] = json_last_error_msg();
    $diagnostics['parsed_input'] = $parsed;
}

// 5. Server info
$diagnostics['server_software'] = $_SERVER['SERVER_SOFTWARE'] ?? 'unknown';
$diagnostics['request_method'] = $_SERVER['REQUEST_METHOD'] ?? 'unknown';
$diagnostics['content_type'] = $_SERVER['CONTENT_TYPE'] ?? 'unknown';

// 6. File permissions
$diagnostics['current_dir'] = __DIR__;
$diagnostics['current_file'] = __FILE__;
$diagnostics['is_writable'] = is_writable(__DIR__);

echo json_encode([
    'success' => true,
    'diagnostics' => $diagnostics
], JSON_PRETTY_PRINT);
?>
