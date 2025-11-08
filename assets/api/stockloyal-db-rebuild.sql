-- ==============================================
-- StockLoyal Database Schema + Data Load
-- With DROP TABLES for AWS RDS
-- ==============================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

DROP TABLE IF EXISTS `basket`;
DROP TABLE IF EXISTS `broker_credentials`;
DROP TABLE IF EXISTS `merchant`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `wallet`;

-- ------------------------
-- Table: basket
-- ------------------------
CREATE TABLE `basket` (
  `basket_id` int(11) NOT NULL AUTO_INCREMENT,
  `record_id` int(11) NOT NULL,
  `member_id` varchar(50) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `price` decimal(15,4) NOT NULL,
  `allocated_amount` decimal(15,2) NOT NULL,
  `shares` decimal(18,4) NOT NULL,
  `added_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`basket_id`),
  KEY `fk_basket_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------
-- Table: broker_credentials
-- ------------------------
CREATE TABLE `broker_credentials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `member_id` varchar(50) NOT NULL,
  `broker` varchar(100) NOT NULL,
  `username` varchar(255) NOT NULL,
  `encrypted_password` varchar(255) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_member_broker` (`member_id`,`broker`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `broker_credentials` (`id`, `member_id`, `broker`, `username`, `encrypted_password`, `updated_at`) VALUES
(1, 'thursday3', 'Public.com', 'public3', 'lXpAQhYtX0zK0e1rqdp4+w==', '2025-09-18 21:09:04'),
(2, 'thursday5', 'Robinhood', 'robinhood5', 'E2omKLssPMo5uZWv2WzdMw==', '2025-09-22 20:33:53');

-- ------------------------
-- Table: merchant
-- ------------------------
CREATE TABLE `merchant` (
  `record_id` int(11) NOT NULL AUTO_INCREMENT,
  `merchant_id` varchar(30) NOT NULL,
  `merchant_name` varchar(255) NOT NULL,
  `program_name` varchar(255) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `website_url` varchar(255) DEFAULT NULL,
  `conversion_rate` decimal(10,4) DEFAULT 1.0000,
  `active_status` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `promotion_text` longtext NOT NULL,
  `promotion_active` tinyint(4) NOT NULL,
  PRIMARY KEY (`record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `merchant` (`record_id`, `merchant_id`, `merchant_name`, `program_name`, `contact_email`, `contact_phone`, `website_url`, `conversion_rate`, `active_status`, `created_at`, `updated_at`, `promotion_text`, `promotion_active`) VALUES
(3, 'merchant001', 'Sky Blue Airlines', 'My Air Miles', 'reiannone@gmail.com', '1.917.226.1567', 'https://www.sba.com', 0.0125, 1, '2025-09-17 21:17:58', '2025-09-22 19:36:09', '<p><strong>Welcome to StockLoyal!</strong>…</p>', 1);

-- ------------------------
-- Table: orders
-- ------------------------
CREATE TABLE `orders` (
  `order_id` int(11) NOT NULL AUTO_INCREMENT,
  `member_id` varchar(50) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `shares` decimal(18,4) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `status` varchar(10) DEFAULT NULL,
  `placed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `broker` varchar(100) DEFAULT NULL,
  `order_type` varchar(10) NOT NULL,
  PRIMARY KEY (`order_id`),
  KEY `fk_orders_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- (All your INSERT INTO orders … statements go here unchanged)

-- ------------------------
-- Table: wallet
-- ------------------------
CREATE TABLE `wallet` (
  `record_id` int(11) NOT NULL AUTO_INCREMENT,
  `member_id` varchar(50) NOT NULL,
  `member_email` varchar(255) NOT NULL,
  `member_password_hash` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `member_address_line1` varchar(255) DEFAULT NULL,
  `member_address_line2` varchar(255) DEFAULT NULL,
  `member_town_city` varchar(100) DEFAULT NULL,
  `member_state` varchar(100) DEFAULT NULL,
  `member_zip` varchar(20) DEFAULT NULL,
  `member_country` varchar(100) DEFAULT NULL,
  `merchant_id` varchar(30) DEFAULT NULL,
  `merchant_name` varchar(255) DEFAULT NULL,
  `broker` varchar(100) DEFAULT NULL,
  `broker_url` varchar(255) DEFAULT NULL,
  `election_type` varchar(50) DEFAULT NULL,
  `points` int(11) DEFAULT 0,
  `cash_balance` decimal(15,2) DEFAULT 0.00,
  `portfolio_value` decimal(15,2) DEFAULT 0.00,
  `sweep_percentage` decimal(5,2) DEFAULT 0.00,
  `sweep_update_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`record_id`),
  UNIQUE KEY `member_id` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- (All your INSERT INTO wallet … statements go here unchanged)

-- ------------------------
-- Foreign Keys
-- ------------------------
ALTER TABLE `basket`
  ADD CONSTRAINT `fk_basket_member` FOREIGN KEY (`member_id`) REFERENCES `wallet` (`member_id`);

ALTER TABLE `broker_credentials`
  ADD CONSTRAINT `fk_credentials_member` FOREIGN KEY (`member_id`) REFERENCES `wallet` (`member_id`);

ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_member` FOREIGN KEY (`member_id`) REFERENCES `wallet` (`member_id`);

COMMIT;
