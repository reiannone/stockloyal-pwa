DELIMITER $$

CREATE PROCEDURE rebuild_stockloyal()
BEGIN
  -- Drop if exists
  DROP DATABASE IF EXISTS stockloyal;

 -- Drop existing tables in correct order (FK-safe)
DROP TABLE IF EXISTS basket;
DROP TABLE IF EXISTS broker_credentials;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS merchant;
DROP TABLE IF EXISTS wallet;

-- =========================================================
-- WALLET (anchor table for members, PK = member_id)
-- =========================================================
CREATE TABLE wallet (
    member_id VARCHAR(50) PRIMARY KEY,
    record_id INT AUTO_INCREMENT UNIQUE, -- optional surrogate key, but not FK anchor
    member_email VARCHAR(255) NOT NULL,
    member_password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    member_address_line1 VARCHAR(255),
    member_address_line2 VARCHAR(255),
    member_town_city VARCHAR(100),
    member_state VARCHAR(100),
    member_zip VARCHAR(20),
    member_country VARCHAR(100),
    merchant_id VARCHAR(30),
    merchant_name VARCHAR(255),
    broker VARCHAR(100),
    broker_url VARCHAR(255),
    election_type VARCHAR(50),
    points BIGINT DEFAULT 0,
    cash_balance DECIMAL(15,2) DEFAULT 0.00,
    portfolio_value DECIMAL(15,2) DEFAULT 0.00,
    sweep_percentage DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- ORDERS (linked to wallet by member_id)
-- =========================================================
CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    shares DECIMAL(18,4) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(10) NOT NULL,
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    broker VARCHAR(100),
    order_type VARCHAR(10) NOT NULL,
    CONSTRAINT fk_orders_wallet FOREIGN KEY (member_id)
      REFERENCES wallet(member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- BROKER CREDENTIALS (linked to wallet by member_id)
-- =========================================================
CREATE TABLE broker_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(50) NOT NULL,
    broker VARCHAR(100) NOT NULL,
    username VARCHAR(255) NOT NULL,
    encrypted_password VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wallet_broker (member_id, broker),
    CONSTRAINT fk_credentials_wallet FOREIGN KEY (member_id)
      REFERENCES wallet(member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- BASKET (linked to wallet by member_id)
-- =========================================================
CREATE TABLE basket (
    basket_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(15,4) NOT NULL,          -- price at selection
    allocated_amount DECIMAL(15,2) NOT NULL,
    shares DECIMAL(18,4) NOT NULL,         -- fractional shares
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_basket_wallet FOREIGN KEY (member_id)
      REFERENCES wallet(member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- MERCHANT (independent reference table)
-- =========================================================
CREATE TABLE merchant (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id VARCHAR(30) NOT NULL,
    merchant_name VARCHAR(255) NOT NULL,
    program_name VARCHAR(255),                    -- loyalty program name
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    website_url VARCHAR(255),
    conversion_rate DECIMAL(10,4) DEFAULT 1.0000, -- points-to-USD ratio
    active_status TINYINT(1) DEFAULT 1,           -- 1 = active, 0 = inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    promotion_text LONGTEXT NULL,
    promotion_active TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


END$$

DELIMITER ;
