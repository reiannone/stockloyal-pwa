<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

// Error handler to catch any issues
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => "PHP Error: $errstr",
        'file' => basename($errfile),
        'line' => $errline
    ]);
    exit;
});

try {
    require_once 'config.php';
    
    $input = json_decode(file_get_contents('php://input'), true);
    $table = $input['table'] ?? 'wallet';
    $checkType = $input['check_type'] ?? 'full_profile';
    
    // Get total record count
    $stmt = $conn->query("SELECT COUNT(*) as total FROM $table");
    $totalRecords = (int) $stmt->fetchColumn();
    
    if ($totalRecords === 0) {
        echo json_encode([
            'success' => true,
            'profile' => [
                'total_records' => 0,
                'complete_records' => 0,
                'incomplete_records' => 0,
                'completeness_score' => 0,
                'field_analysis' => [],
                'critical_issues' => [],
                'affected_members' => [],
                'issues_by_category' => [],
                'recommendations' => ['No records found in the wallet table'],
                'scan_timestamp' => date('Y-m-d H:i:s')
            ]
        ]);
        exit;
    }
    
    // Get table columns
    $stmt = $conn->query("DESCRIBE $table");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Define critical fields
    $criticalFields = ['member_id', 'member_email', 'merchant_id', 'merchant_name'];
    
    // Initialize arrays
    $fieldAnalysis = [];
    $criticalIssues = [];
    $affectedMembers = [];
    $issuesByCategory = [];
    $inconsistentConversion = 0;
    $duplicates = [];
    
    // Analyze each field
    foreach ($columns as $column) {
        $fieldName = $column['Field'];
        $fieldType = strtoupper($column['Type']);
        
        // Skip auto-increment primary keys
        if (in_array($fieldName, ['record_id', 'id'])) {
            continue;
        }
        
        // Determine if field is a timestamp/datetime type
        $isTimestampField = (
            strpos($fieldType, 'TIMESTAMP') !== false || 
            strpos($fieldType, 'DATETIME') !== false
        );
        
        try {
            if ($isTimestampField) {
                $stmt = $conn->prepare("
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE 
                            WHEN $fieldName IS NULL 
                            OR CAST($fieldName AS CHAR) = '' 
                            OR CAST($fieldName AS CHAR) = '0000-00-00 00:00:00'
                            OR CAST($fieldName AS CHAR) = '0000-00-00'
                            THEN 1 
                            ELSE 0 
                        END) as missing_count,
                        SUM(CASE 
                            WHEN $fieldName IS NOT NULL 
                            AND CAST($fieldName AS CHAR) != '' 
                            AND CAST($fieldName AS CHAR) != '0000-00-00 00:00:00'
                            AND CAST($fieldName AS CHAR) != '0000-00-00'
                            THEN 1 
                            ELSE 0 
                        END) as populated_count
                    FROM $table
                ");
            } else {
                $stmt = $conn->prepare("
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN $fieldName IS NULL OR $fieldName = '' THEN 1 ELSE 0 END) as missing_count,
                        SUM(CASE WHEN $fieldName IS NOT NULL AND $fieldName != '' THEN 1 ELSE 0 END) as populated_count
                    FROM $table
                ");
            }
            
            $stmt->execute();
            $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Failed to analyze field $fieldName: " . $e->getMessage());
            continue;
        }
        
        $missingCount = (int) $stats['missing_count'];
        $populatedCount = (int) $stats['populated_count'];
        $completenessPercent = $totalRecords > 0 
            ? ($populatedCount / $totalRecords) * 100 
            : 0;
        
        $fieldAnalysis[] = [
            'field_name' => $fieldName,
            'populated_count' => $populatedCount,
            'missing_count' => $missingCount,
            'completeness_percent' => round($completenessPercent, 2)
        ];
        
        // Check for critical issues
        if (in_array($fieldName, $criticalFields) && $missingCount > 0) {
            try {
                if ($isTimestampField) {
                    $affectedStmt = $conn->prepare("
                        SELECT member_id 
                        FROM $table 
                        WHERE (
                            $fieldName IS NULL 
                            OR CAST($fieldName AS CHAR) = ''
                            OR CAST($fieldName AS CHAR) = '0000-00-00 00:00:00'
                            OR CAST($fieldName AS CHAR) = '0000-00-00'
                        )
                        LIMIT 100
                    ");
                } else {
                    $affectedStmt = $conn->prepare("
                        SELECT member_id 
                        FROM $table 
                        WHERE $fieldName IS NULL OR $fieldName = ''
                        LIMIT 100
                    ");
                }
                
                $affectedStmt->execute();
                $affectedIds = $affectedStmt->fetchAll(PDO::FETCH_COLUMN);
            } catch (PDOException $e) {
                error_log("Failed to get affected members for $fieldName: " . $e->getMessage());
                $affectedIds = [];
            }
            
            $issueKey = "missing_" . $fieldName;
            $affectedMembers[$issueKey] = [
                'field' => $fieldName,
                'issue_type' => 'missing_critical_data',
                'member_ids' => array_filter($affectedIds),
                'total_count' => $missingCount,
                'showing_count' => count(array_filter($affectedIds))
            ];
            
            $criticalIssues[] = [
                'field' => $fieldName,
                'description' => 'Critical field has missing values',
                'count' => $missingCount,
                'severity' => 'high',
                'issue_key' => $issueKey
            ];
            
            $issuesByCategory['Missing Critical Data'][] = 
                "$fieldName: $missingCount records missing (critical field)";
        }
    }
    
    // Calculate completeness score
    $totalFields = count($fieldAnalysis);
    $avgCompleteness = $totalFields > 0 
        ? array_sum(array_column($fieldAnalysis, 'completeness_percent')) / $totalFields 
        : 0;
    
    // Count complete records (simple version - just check critical fields)
    $criticalConditions = [];
    foreach ($criticalFields as $field) {
        $fieldExists = false;
        foreach ($columns as $col) {
            if ($col['Field'] === $field) {
                $fieldExists = true;
                $criticalConditions[] = "($field IS NOT NULL AND $field != '')";
                break;
            }
        }
    }
    
    if (count($criticalConditions) > 0) {
        $criticalFieldsCondition = implode(' AND ', $criticalConditions);
        try {
            $stmt = $conn->query("
                SELECT 
                    SUM(CASE WHEN $criticalFieldsCondition THEN 1 ELSE 0 END) as complete_count
                FROM $table
            ");
            $completeRecords = (int) $stmt->fetchColumn();
        } catch (PDOException $e) {
            error_log("Failed to count complete records: " . $e->getMessage());
            $completeRecords = $totalRecords;
        }
    } else {
        $completeRecords = $totalRecords;
    }
    
    $incompleteRecords = $totalRecords - $completeRecords;
    
    // ===============================================================================
    // DATA CONSISTENCY CHECKS
    // ===============================================================================
    
    // Check if points match cash_balance based on conversion_rate
    try {
        $stmt = $conn->query("
            SELECT COUNT(*) as inconsistent_count
            FROM $table w
            LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
            WHERE w.points IS NOT NULL 
            AND w.cash_balance IS NOT NULL
            AND m.conversion_rate IS NOT NULL
            AND ABS(w.cash_balance - (w.points * m.conversion_rate)) > 0.01
        ");
        $inconsistentConversion = (int) $stmt->fetchColumn();
        
        if ($inconsistentConversion > 0) {
            $stmt = $conn->query("
                SELECT w.member_id, w.points, w.cash_balance, m.conversion_rate,
                       (w.points * m.conversion_rate) as expected_cash
                FROM $table w
                LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
                WHERE w.points IS NOT NULL 
                AND w.cash_balance IS NOT NULL
                AND m.conversion_rate IS NOT NULL
                AND ABS(w.cash_balance - (w.points * m.conversion_rate)) > 0.01
                LIMIT 100
            ");
            $conversionIssues = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $issueKey = "conversion_mismatch";
            $affectedMembers[$issueKey] = [
                'field' => 'cash_balance / points',
                'issue_type' => 'data_consistency',
                'member_ids' => array_column($conversionIssues, 'member_id'),
                'details' => $conversionIssues,
                'total_count' => $inconsistentConversion,
                'showing_count' => count($conversionIssues)
            ];
            
            $criticalIssues[] = [
                'field' => 'cash_balance / points',
                'description' => 'Cash balance does not match points * conversion_rate',
                'count' => $inconsistentConversion,
                'severity' => 'medium',
                'issue_key' => $issueKey
            ];
            
            $issuesByCategory['Data Consistency'][] = 
                "Points/Cash mismatch: $inconsistentConversion records have inconsistent conversion calculations";
        }
    } catch (PDOException $e) {
        error_log("Conversion check failed: " . $e->getMessage());
    }
    
    // Check for duplicate member_id entries
    try {
        $stmt = $conn->query("
            SELECT member_id, COUNT(*) as dup_count
            FROM $table
            WHERE member_id IS NOT NULL
            GROUP BY member_id
            HAVING COUNT(*) > 1
        ");
        $duplicates = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($duplicates) > 0) {
            $totalDuplicates = array_sum(array_column($duplicates, 'dup_count'));
            
            $issueKey = "duplicate_members";
            $affectedMembers[$issueKey] = [
                'field' => 'member_id',
                'issue_type' => 'duplicate_records',
                'member_ids' => array_column($duplicates, 'member_id'),
                'details' => $duplicates,
                'total_count' => $totalDuplicates,
                'showing_count' => count($duplicates)
            ];
            
            $criticalIssues[] = [
                'field' => 'member_id',
                'description' => 'Duplicate member_id entries found',
                'count' => $totalDuplicates,
                'severity' => 'high',
                'issue_key' => $issueKey
            ];
            
            $issuesByCategory['Data Consistency'][] = 
                "Duplicate members: " . count($duplicates) . " member IDs appear multiple times";
        }
    } catch (PDOException $e) {
        error_log("Duplicate check failed: " . $e->getMessage());
    }
    
    // Check for negative points or cash balance
    try {
        $stmt = $conn->query("
            SELECT COUNT(*) as negative_count
            FROM $table
            WHERE points < 0 OR cash_balance < 0
        ");
        $negativeValues = (int) $stmt->fetchColumn();
        
        if ($negativeValues > 0) {
            $stmt = $conn->query("
                SELECT member_id, points, cash_balance
                FROM $table
                WHERE points < 0 OR cash_balance < 0
                LIMIT 100
            ");
            $negativeRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $issueKey = "negative_balances";
            $affectedMembers[$issueKey] = [
                'field' => 'points / cash_balance',
                'issue_type' => 'invalid_value',
                'member_ids' => array_column($negativeRecords, 'member_id'),
                'details' => $negativeRecords,
                'total_count' => $negativeValues,
                'showing_count' => count($negativeRecords)
            ];
            
            $criticalIssues[] = [
                'field' => 'points / cash_balance',
                'description' => 'Negative points or cash balance detected',
                'count' => $negativeValues,
                'severity' => 'high',
                'issue_key' => $issueKey
            ];
            
            $issuesByCategory['Data Validity'][] = 
                "Negative values: $negativeValues records have negative points or cash balance";
        }
    } catch (PDOException $e) {
        error_log("Negative balance check failed: " . $e->getMessage());
    }
    
    // Check for orphaned merchant references
    try {
        $stmt = $conn->query("
            SELECT COUNT(*) as orphaned_count
            FROM $table w
            LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
            WHERE w.merchant_id IS NOT NULL
            AND m.merchant_id IS NULL
        ");
        $orphanedMerchants = (int) $stmt->fetchColumn();
        
        if ($orphanedMerchants > 0) {
            $stmt = $conn->query("
                SELECT w.member_id, w.merchant_id
                FROM $table w
                LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
                WHERE w.merchant_id IS NOT NULL
                AND m.merchant_id IS NULL
                LIMIT 100
            ");
            $orphanedRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $issueKey = "orphaned_merchant_refs";
            $affectedMembers[$issueKey] = [
                'field' => 'merchant_id',
                'issue_type' => 'referential_integrity',
                'member_ids' => array_column($orphanedRecords, 'member_id'),
                'details' => $orphanedRecords,
                'total_count' => $orphanedMerchants,
                'showing_count' => count($orphanedRecords)
            ];
            
            $criticalIssues[] = [
                'field' => 'merchant_id',
                'description' => 'References to non-existent merchants',
                'count' => $orphanedMerchants,
                'severity' => 'high',
                'issue_key' => $issueKey
            ];
            
            $issuesByCategory['Referential Integrity'][] = 
                "Orphaned merchants: $orphanedMerchants records reference merchants that don't exist";
        }
    } catch (PDOException $e) {
        error_log("Orphaned merchant check failed: " . $e->getMessage());
    }
    
    // Generate recommendations
    $recommendations = [];
    
    if (count($criticalIssues) > 0) {
        $recommendations[] = "Address critical data issues first - " . count($criticalIssues) . " high-priority issues found";
    }
    
    if ($incompleteRecords > 0) {
        $recommendations[] = "Review and complete $incompleteRecords incomplete records";
    }
    
    if ($inconsistentConversion > 0) {
        $recommendations[] = "Recalculate cash_balance for $inconsistentConversion records with conversion mismatches";
    }
    
    if (count($duplicates) > 0) {
        $recommendations[] = "Investigate and resolve " . count($duplicates) . " duplicate member_id entries";
    }
    
    if ($avgCompleteness < 80) {
        $recommendations[] = "Overall data completeness is " . round($avgCompleteness, 1) . "% - aim for 90%+";
    } else if ($avgCompleteness >= 95) {
        $recommendations[] = "Excellent data quality! Maintain current data entry standards";
    }
    
    if (count($recommendations) === 0) {
        $recommendations[] = "Data quality looks good!";
    }
    
    // Clean up empty categories
    $issuesByCategory = array_filter($issuesByCategory, function($issues) {
        return count($issues) > 0;
    });
    
    echo json_encode([
        'success' => true,
        'profile' => [
            'total_records' => $totalRecords,
            'complete_records' => $completeRecords,
            'incomplete_records' => $incompleteRecords,
            'completeness_score' => round($avgCompleteness, 2),
            'field_analysis' => $fieldAnalysis,
            'critical_issues' => $criticalIssues,
            'affected_members' => $affectedMembers,
            'issues_by_category' => $issuesByCategory,
            'recommendations' => $recommendations,
            'scan_timestamp' => date('Y-m-d H:i:s')
        ]
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage(),
        'error_type' => 'PDOException',
        'line' => $e->getLine()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage(),
        'error_type' => 'Exception',
        'line' => $e->getLine()
    ]);
}
