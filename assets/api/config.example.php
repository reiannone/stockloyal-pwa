<?php
require_once __DIR__ . '/cors.php';
declare(strict_types=1);
// config.example.php
// ------------------
// Copy this file to config.php and fill in your actual values
// DO NOT commit your real config.php to GitHub

// Database connection
$db_host = "localhost";       // e.g. "127.0.0.1" or AWS RDS endpoint
$db_name = "stockloyal";      // database name
$db_user = "root";            // database username
$db_pass = "your_password";   // database password

// PDO connection (example)
try {
    $conn = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Database connection failed: " . $e->getMessage());
}
