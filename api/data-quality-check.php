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
    
    // ✨ Define critical fields based on table
    if ($table === 'orders') {
        $criticalFields = ['order_id', 'member_id', 'merchant_id', 'basket_id', 'symbol', 'shares', 'amount', 'status', 'broker'];
        $optionalFields = ['points_used', 'executed_price', 'executed_shares', 'executed_amount', 'paid_batch_id'];
    } elseif ($table === 'transactions_ledger') {
        $criticalFields = ['tx_id', 'member_id', 'tx_type', 'direction', 'channel', 'status'];
        $optionalFields = ['merchant_id', 'broker', 'order_id', 'client_tx_id', 'external_ref', 'note'];
    } else { // wallet table (default)
        $criticalFields = ['member_id', 'member_email', 'merchant_id', 'merchant_name'];
        $optionalFields = ['member_password_hash', 'middle_name', 'member_avatar', 'member_address_line2', 'portfolio_value', 'last_login'];
    }
    
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
            // ✨ Select the appropriate ID field based on table
            $idField = $table === 'orders' ? 'order_id' : 
                      ($table === 'transactions_ledger' ? 'tx_id' : 'member_id');
            
            try {
                if ($isTimestampField) {
                    $affectedStmt = $conn->prepare("
                        SELECT $idField 
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
                        SELECT $idField 
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
                'record_ids' => array_filter($affectedIds),  // ✨ Changed from member_ids to record_ids
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

        // Check optional fields with low completeness
        if (in_array($fieldName, $optionalFields) && $completenessPercent < 50 && $missingCount > 0) {
            $issuesByCategory['Incomplete Optional Data'][] = 
                "$fieldName: Only " . round($completenessPercent, 1) . "% complete ($missingCount missing)";
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
    // DATA CONSISTENCY CHECKS - TABLE-SPECIFIC
    // ===============================================================================
    
    if ($table === 'wallet') {
        // ✅ PHP-based tier-aware conversion check (WALLET ONLY)
        try {
        // First, get all merchants with their tier info
        $stmt = $conn->query("SELECT * FROM merchant");
        $merchantsById = [];
        while ($merchant = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $merchantsById[$merchant['merchant_id']] = $merchant;
        }
        
        // Helper function to get tier-specific rate
        $getTierRate = function($merchant, $memberTier) {
            if (!$merchant || !$memberTier || trim($memberTier) === '') {
                return null;
            }
            
            $tierLower = strtolower(trim($memberTier));
            
            // Check each tier
            for ($i = 1; $i <= 6; $i++) {
                $tierNameKey = "tier{$i}_name";
                $tierRateKey = "tier{$i}_conversion_rate";
                
                if (isset($merchant[$tierNameKey]) && 
                    strtolower(trim($merchant[$tierNameKey])) === $tierLower &&
                    isset($merchant[$tierRateKey])) {
                    return (float) $merchant[$tierRateKey];
                }
            }
            
            return null;
        };
        
        // Get all wallet records with points and cash_balance
        $stmt = $conn->query("
            SELECT member_id, merchant_id, member_tier, points, cash_balance
            FROM $table
            WHERE points IS NOT NULL 
            AND cash_balance IS NOT NULL
        ");
        $wallets = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $conversionIssues = [];
        $inconsistentConversion = 0;
        
        foreach ($wallets as $wallet) {
            $merchantId = $wallet['merchant_id'];
            
            if (!isset($merchantsById[$merchantId])) {
                continue; // Skip if merchant doesn't exist
            }
            
            $merchant = $merchantsById[$merchantId];
            $baseRate = (float) ($merchant['conversion_rate'] ?? 0);
            
            if ($baseRate === 0.0) {
                continue; // Skip if no base rate
            }
            
            // Determine effective rate (tier-specific or base)
            $tierRate = $getTierRate($merchant, $wallet['member_tier']);
            $effectiveRate = $tierRate ?? $baseRate;
            
            $points = (float) $wallet['points'];
            $cashBalance = (float) $wallet['cash_balance'];
            $expectedCash = $points * $effectiveRate;
            
            // Check if mismatch (tolerance of $0.01)
            if (abs($cashBalance - $expectedCash) > 0.01) {
                $inconsistentConversion++;
                
                // Store details for first 100
                if (count($conversionIssues) < 100) {
                    $conversionIssues[] = [
                        'member_id' => $wallet['member_id'],
                        'member_tier' => $wallet['member_tier'] ?: null,
                        'points' => $points,
                        'cash_balance' => $cashBalance,
                        'base_rate' => $baseRate,
                        'effective_rate' => $effectiveRate,
                        'expected_cash' => $expectedCash
                    ];
                }
            }
        }
        
        if ($inconsistentConversion > 0) {
            $issueKey = "conversion_mismatch";
            $affectedMembers[$issueKey] = [
                'field' => 'cash_balance / points',
                'issue_type' => 'data_consistency',
                'record_ids' => array_column($conversionIssues, 'member_id'),
                'details' => $conversionIssues,
                'total_count' => $inconsistentConversion,
                'showing_count' => count($conversionIssues)
            ];
            
            $criticalIssues[] = [
                'field' => 'cash_balance / points',
                'description' => 'Cash balance does not match points * conversion_rate (tier-aware)',
                'count' => $inconsistentConversion,
                'severity' => 'medium',
                'issue_key' => $issueKey
            ];
            
            $issuesByCategory['Data Consistency'][] = 
                "Points/Cash mismatch: $inconsistentConversion records have inconsistent conversion (tier-aware check)";
        }
    } catch (Exception $e) {
        error_log("Tier-aware conversion check failed: " . $e->getMessage());
        // Continue with other checks even if this fails
    }
    } // End wallet-specific checks
    
    if ($table === 'orders') {
        // ✅ ORDERS-SPECIFIC CHECKS
        
        // Check for orders missing execution data when status is 'executed'
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as missing_exec_count
                FROM $table
                WHERE status = 'executed'
                AND (executed_price IS NULL OR executed_shares IS NULL OR executed_at IS NULL)
            ");
            $missingExecution = (int) $stmt->fetchColumn();
            
            if ($missingExecution > 0) {
                $stmt = $conn->query("
                    SELECT order_id, member_id, symbol, status, executed_price, executed_shares, executed_at
                    FROM $table
                    WHERE status = 'executed'
                    AND (executed_price IS NULL OR executed_shares IS NULL OR executed_at IS NULL)
                    LIMIT 100
                ");
                $missingExecOrders = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $issueKey = "missing_execution_data";
                $affectedMembers[$issueKey] = [
                    'field' => 'executed_price / executed_shares / executed_at',
                    'issue_type' => 'data_consistency',
                    'record_ids' => array_column($missingExecOrders, 'order_id'),
                    'details' => $missingExecOrders,
                    'total_count' => $missingExecution,
                    'showing_count' => count($missingExecOrders)
                ];
                
                $criticalIssues[] = [
                    'field' => 'executed_* fields',
                    'description' => 'Orders marked as executed but missing execution data',
                    'count' => $missingExecution,
                    'severity' => 'high',
                    'issue_key' => $issueKey
                ];
                
                $issuesByCategory['Data Consistency'][] = 
                    "Missing execution data: $missingExecution executed orders lack price/shares/timestamp";
            }
        } catch (PDOException $e) {
            error_log("Execution data check failed: " . $e->getMessage());
        }
        
        // Check for unpaid executed orders
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as unpaid_count
                FROM $table
                WHERE status = 'executed'
                AND paid_flag = 0
            ");
            $unpaidOrders = (int) $stmt->fetchColumn();
            
            if ($unpaidOrders > 0) {
                $issuesByCategory['Payment Status'][] = 
                    "Unpaid orders: $unpaidOrders executed orders not yet paid (paid_flag=0)";
            }
        } catch (PDOException $e) {
            error_log("Unpaid orders check failed: " . $e->getMessage());
        }
        
        // Check for amount/shares consistency
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as inconsistent_count
                FROM $table
                WHERE executed_shares IS NOT NULL
                AND executed_price IS NOT NULL
                AND executed_amount IS NOT NULL
                AND ABS(executed_amount - (executed_shares * executed_price)) > 0.01
            ");
            $inconsistentAmounts = (int) $stmt->fetchColumn();
            
            if ($inconsistentAmounts > 0) {
                $issuesByCategory['Data Consistency'][] = 
                    "Amount mismatch: $inconsistentAmounts orders where executed_amount ≠ shares × price";
            }
        } catch (PDOException $e) {
            error_log("Amount consistency check failed: " . $e->getMessage());
        }
        
        // Check for orphaned member_id references (orders pointing to non-existent wallet members)
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as orphaned_count
                FROM $table o
                LEFT JOIN wallet w ON o.member_id = w.member_id
                WHERE o.member_id IS NOT NULL
                AND w.member_id IS NULL
            ");
            $orphanedMembers = (int) $stmt->fetchColumn();
            
            if ($orphanedMembers > 0) {
                $stmt = $conn->query("
                    SELECT o.order_id, o.member_id, o.symbol, o.amount, o.status
                    FROM $table o
                    LEFT JOIN wallet w ON o.member_id = w.member_id
                    WHERE o.member_id IS NOT NULL
                    AND w.member_id IS NULL
                    LIMIT 100
                ");
                $orphanedMemberOrders = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $issueKey = "orphaned_member_refs";
                $affectedMembers[$issueKey] = [
                    'field' => 'member_id',
                    'issue_type' => 'referential_integrity',
                    'record_ids' => array_column($orphanedMemberOrders, 'member_id'),
                    'details' => $orphanedMemberOrders,
                    'total_count' => $orphanedMembers,
                    'showing_count' => count($orphanedMemberOrders)
                ];
                
                $criticalIssues[] = [
                    'field' => 'member_id',
                    'description' => 'Orders reference non-existent wallet members',
                    'count' => $orphanedMembers,
                    'severity' => 'high',
                    'issue_key' => $issueKey
                ];
                
                $issuesByCategory['Referential Integrity'][] = 
                    "Orphaned members: $orphanedMembers orders reference missing wallet member_ids";
            }
        } catch (PDOException $e) {
            error_log("Orphaned member check failed: " . $e->getMessage());
        }
        
        // Check for orphaned merchant_id references
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as orphaned_count
                FROM $table o
                LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
                WHERE o.merchant_id IS NOT NULL
                AND m.merchant_id IS NULL
            ");
            $orphanedMerchants = (int) $stmt->fetchColumn();
            
            if ($orphanedMerchants > 0) {
                $issuesByCategory['Referential Integrity'][] = 
                    "Orphaned merchants: $orphanedMerchants orders reference missing merchant_ids";
            }
        } catch (PDOException $e) {
            error_log("Orders orphaned merchant check failed: " . $e->getMessage());
        }
    } // End orders-specific checks
    
    if ($table === 'transactions_ledger') {
        // ✅ TRANSACTIONS LEDGER-SPECIFIC CHECKS
        
        // Check for transactions missing both points and cash amounts
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as missing_amount_count
                FROM $table
                WHERE (amount_points IS NULL OR amount_points = 0)
                AND (amount_cash IS NULL OR amount_cash = 0)
            ");
            $missingAmounts = (int) $stmt->fetchColumn();
            
            if ($missingAmounts > 0) {
                $stmt = $conn->query("
                    SELECT tx_id, member_id, tx_type, direction, amount_points, amount_cash, status
                    FROM $table
                    WHERE (amount_points IS NULL OR amount_points = 0)
                    AND (amount_cash IS NULL OR amount_cash = 0)
                    LIMIT 100
                ");
                $missingAmountTxs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $issueKey = "missing_amounts";
                $affectedMembers[$issueKey] = [
                    'field' => 'amount_points / amount_cash',
                    'issue_type' => 'data_consistency',
                    'record_ids' => array_column($missingAmountTxs, 'tx_id'),
                    'details' => $missingAmountTxs,
                    'total_count' => $missingAmounts,
                    'showing_count' => count($missingAmountTxs)
                ];
                
                $criticalIssues[] = [
                    'field' => 'amount_points / amount_cash',
                    'description' => 'Transactions missing both points and cash amounts',
                    'count' => $missingAmounts,
                    'severity' => 'high',
                    'issue_key' => $issueKey
                ];
                
                $issuesByCategory['Data Consistency'][] = 
                    "Missing amounts: $missingAmounts transactions have no points or cash value";
            }
        } catch (PDOException $e) {
            error_log("Transaction amount check failed: " . $e->getMessage());
        }
        
        // Check for failed transactions that should be reversed
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as unreversed_count
                FROM $table
                WHERE status = 'failed'
                AND direction = 'outbound'
            ");
            $unreversedFailed = (int) $stmt->fetchColumn();
            
            if ($unreversedFailed > 0) {
                $issuesByCategory['Transaction Status'][] = 
                    "Failed outbound: $unreversedFailed failed outbound transactions (may need reversal)";
            }
        } catch (PDOException $e) {
            error_log("Failed transaction check failed: " . $e->getMessage());
        }
        
        // Check for orphaned order references
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as orphaned_count
                FROM $table t
                LEFT JOIN orders o ON t.order_id = o.order_id
                WHERE t.order_id IS NOT NULL
                AND o.order_id IS NULL
            ");
            $orphanedOrders = (int) $stmt->fetchColumn();
            
            if ($orphanedOrders > 0) {
                $stmt = $conn->query("
                    SELECT t.tx_id, t.member_id, t.order_id, t.tx_type
                    FROM $table t
                    LEFT JOIN orders o ON t.order_id = o.order_id
                    WHERE t.order_id IS NOT NULL
                    AND o.order_id IS NULL
                    LIMIT 100
                ");
                $orphanedOrderTxs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $issueKey = "orphaned_order_refs";
                $affectedMembers[$issueKey] = [
                    'field' => 'order_id',
                    'issue_type' => 'data_consistency',
                    'record_ids' => array_column($orphanedOrderTxs, 'tx_id'),
                    'details' => $orphanedOrderTxs,
                    'total_count' => $orphanedOrders,
                    'showing_count' => count($orphanedOrderTxs)
                ];
                
                $criticalIssues[] = [
                    'field' => 'order_id',
                    'description' => 'Transactions reference non-existent orders',
                    'count' => $orphanedOrders,
                    'severity' => 'medium',
                    'issue_key' => $issueKey
                ];
                
                $issuesByCategory['Referential Integrity'][] = 
                    "Orphaned orders: $orphanedOrders transactions reference missing order_ids";
            }
        } catch (PDOException $e) {
            error_log("Orphaned order check failed: " . $e->getMessage());
        }
        
        // Check for orphaned member_id references (transactions pointing to non-existent wallet members)
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as orphaned_count
                FROM $table t
                LEFT JOIN wallet w ON t.member_id = w.member_id
                WHERE t.member_id IS NOT NULL
                AND w.member_id IS NULL
            ");
            $orphanedMembers = (int) $stmt->fetchColumn();
            
            if ($orphanedMembers > 0) {
                $stmt = $conn->query("
                    SELECT t.tx_id, t.member_id, t.tx_type, t.amount_points, t.amount_cash
                    FROM $table t
                    LEFT JOIN wallet w ON t.member_id = w.member_id
                    WHERE t.member_id IS NOT NULL
                    AND w.member_id IS NULL
                    LIMIT 100
                ");
                $orphanedMemberTxs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $issueKey = "orphaned_member_refs";
                $affectedMembers[$issueKey] = [
                    'field' => 'member_id',
                    'issue_type' => 'referential_integrity',
                    'record_ids' => array_column($orphanedMemberTxs, 'member_id'),
                    'details' => $orphanedMemberTxs,
                    'total_count' => $orphanedMembers,
                    'showing_count' => count($orphanedMemberTxs)
                ];
                
                $criticalIssues[] = [
                    'field' => 'member_id',
                    'description' => 'Transactions reference non-existent wallet members',
                    'count' => $orphanedMembers,
                    'severity' => 'high',
                    'issue_key' => $issueKey
                ];
                
                $issuesByCategory['Referential Integrity'][] = 
                    "Orphaned members: $orphanedMembers transactions reference missing wallet member_ids";
            }
        } catch (PDOException $e) {
            error_log("Orphaned member check failed: " . $e->getMessage());
        }
        
        // Check for orphaned merchant_id references
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as orphaned_count
                FROM $table t
                LEFT JOIN merchant m ON t.merchant_id = m.merchant_id
                WHERE t.merchant_id IS NOT NULL
                AND m.merchant_id IS NULL
            ");
            $orphanedMerchants = (int) $stmt->fetchColumn();
            
            if ($orphanedMerchants > 0) {
                $issuesByCategory['Referential Integrity'][] = 
                    "Orphaned merchants: $orphanedMerchants transactions reference missing merchant_ids";
            }
        } catch (PDOException $e) {
            error_log("Transactions orphaned merchant check failed: " . $e->getMessage());
        }
        
        // Check for direction/type consistency
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as inconsistent_count
                FROM $table
                WHERE (
                    (tx_type IN ('points_received', 'cash_in') AND direction != 'inbound')
                    OR (tx_type IN ('redeem_points', 'cash_out', 'cash_fee') AND direction != 'outbound')
                )
            ");
            $inconsistentDirection = (int) $stmt->fetchColumn();
            
            if ($inconsistentDirection > 0) {
                $issuesByCategory['Data Consistency'][] = 
                    "Direction mismatch: $inconsistentDirection transactions have inconsistent tx_type/direction";
            }
        } catch (PDOException $e) {
            error_log("Direction consistency check failed: " . $e->getMessage());
        }
        
        // Check for duplicate client_tx_id (should be unique)
        try {
            $stmt = $conn->query("
                SELECT client_tx_id, COUNT(*) as dup_count
                FROM $table
                WHERE client_tx_id IS NOT NULL AND client_tx_id != ''
                GROUP BY client_tx_id
                HAVING COUNT(*) > 1
            ");
            $duplicateClientTxs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            if (count($duplicateClientTxs) > 0) {
                $totalDups = array_sum(array_column($duplicateClientTxs, 'dup_count'));
                
                $issuesByCategory['Data Consistency'][] = 
                    "Duplicate client_tx_id: " . count($duplicateClientTxs) . " client transaction IDs appear multiple times";
            }
        } catch (PDOException $e) {
            error_log("Duplicate client_tx_id check failed: " . $e->getMessage());
        }
        
        // Check for negative amounts (data validity)
        try {
            $stmt = $conn->query("
                SELECT COUNT(*) as negative_count
                FROM $table
                WHERE (amount_points IS NOT NULL AND amount_points < 0)
                OR (amount_cash IS NOT NULL AND amount_cash < 0)
            ");
            $negativeAmounts = (int) $stmt->fetchColumn();
            
            if ($negativeAmounts > 0) {
                $issuesByCategory['Data Validity'][] = 
                    "Negative amounts: $negativeAmounts transactions have negative point or cash values";
            }
        } catch (PDOException $e) {
            error_log("Negative amount check failed: " . $e->getMessage());
        }
    } // End transactions_ledger-specific checks
    
    // Check for duplicate member_id entries (for wallet) or order_id (for orders)
    if ($table === 'wallet') {
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
                'record_ids' => array_column($duplicates, 'member_id'),
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
    } // End wallet duplicate check
    
    // Check for negative points or cash balance (WALLET ONLY)
    if ($table === 'wallet') {
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
                'record_ids' => array_column($negativeRecords, 'member_id'),
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
    } // End wallet negative balance check
    
    // Check for orphaned merchant references (BOTH TABLES)
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
                'record_ids' => array_column($orphanedRecords, 'member_id'),
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
