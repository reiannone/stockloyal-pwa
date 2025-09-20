-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 20, 2025 at 05:17 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `stockloyal`
--

-- --------------------------------------------------------

--
-- Table structure for table `basket`
--

CREATE TABLE `basket` (
  `basket_id` int(11) NOT NULL,
  `record_id` int(11) NOT NULL,
  `member_id` varchar(50) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `price` decimal(15,4) NOT NULL,
  `allocated_amount` decimal(15,2) NOT NULL,
  `shares` decimal(18,4) NOT NULL,
  `added_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `broker_credentials`
--

CREATE TABLE `broker_credentials` (
  `id` int(11) NOT NULL,
  `member_id` varchar(50) NOT NULL,
  `broker` varchar(100) NOT NULL,
  `username` varchar(255) NOT NULL,
  `encrypted_password` varchar(255) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `broker_credentials`
--

INSERT INTO `broker_credentials` (`id`, `member_id`, `broker`, `username`, `encrypted_password`, `updated_at`) VALUES
(1, 'thursday3', 'Public.com', 'public3', 'lXpAQhYtX0zK0e1rqdp4+w==', '2025-09-18 21:09:04');

-- --------------------------------------------------------

--
-- Table structure for table `merchant`
--

CREATE TABLE `merchant` (
  `record_id` int(11) NOT NULL,
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
  `promotion_active` tinyint(4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `merchant`
--

INSERT INTO `merchant` (`record_id`, `merchant_id`, `merchant_name`, `program_name`, `contact_email`, `contact_phone`, `website_url`, `conversion_rate`, `active_status`, `created_at`, `updated_at`, `promotion_text`, `promotion_active`) VALUES
(3, 'merchant001', 'Sky Blue Airlines', 'My Air Miles', 'reiannone@gmail.com', '1.917.226.1566', 'https://www.sba.com', 0.0500, 1, '2025-09-17 21:17:58', '2025-09-19 19:01:22', '<p><strong>Welcome to StockLoyal!</strong>&nbsp;&mdash; the leading platform that transforms your everyday loyalty points into actual equity ownership in the brands you love. Instead of leaving points unused or expiring, put them to work building your personal investment portfolio.</p>\r\n\r\n<ul>\r\n	<li>Seamless Conversion: Instantly turn points from leading merchants and loyalty programs into fractional shares of stock.</li>\r\n	<li>Real-Time Tracking: Watch your stock rewards grow inside your StockLoyal wallet with up-to-the-minute portfolio updates.</li>\r\n	<li>Transparent &amp; Fair: No hidden fees, no fine print &mdash; just straightforward value for every point you earn.</li>\r\n	<li>Exclusive Bonuses: Earn extra stock rewards when you refer friends, participate in merchant promotions, or reach milestones.&nbsp;</li>\r\n	<li>Financial Empowerment: Start investing with the rewards you already have &mdash; no minimums, no extra cash required.</li>\r\n</ul>\r\n', 1);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `order_id` int(11) NOT NULL,
  `member_id` varchar(50) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `shares` decimal(18,4) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `status` enum('pending','executed','failed','cancelled') DEFAULT 'pending',
  `placed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `broker` varchar(100) DEFAULT NULL,
  `order_type` enum('buy','sell','sweep') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`order_id`, `member_id`, `symbol`, `shares`, `amount`, `status`, `placed_at`, `broker`, `order_type`) VALUES
(1, 'thursday3', 'OPEN', 31.4386, 0.00, '', '2025-09-18 21:03:01', 'Charles Schwab', ''),
(2, 'thursday3', 'SNAP', 37.0261, 0.00, '', '2025-09-18 21:03:01', 'Charles Schwab', ''),
(3, 'thursday3', 'FORM', 6.9367, 0.00, '', '2025-09-19 02:26:14', 'Public.com', ''),
(4, 'thursday3', 'BEAM', 9.9602, 0.00, '', '2025-09-19 02:26:14', 'Public.com', ''),
(5, 'thursday3', 'PONY', 45.5308, 0.00, '', '2025-09-19 19:46:13', 'Public.com', ''),
(6, 'thursday3', 'SNAP', 87.5845, 0.00, '', '2025-09-19 19:52:18', 'Public.com', ''),
(7, 'thursday3', 'SNAP', 87.5845, 0.00, '', '2025-09-19 20:07:27', 'Public.com', ''),
(8, 'thursday3', 'NVDA', 2.0173, 0.00, '', '2025-09-19 20:15:13', 'Public.com', ''),
(9, 'thursday3', 'OKLO', 3.9518, 0.00, '', '2025-09-19 20:59:05', 'Public.com', ''),
(10, 'thursday3', 'F', 47.7969, 0.00, '', '2025-09-19 21:09:07', 'Public.com', ''),
(11, 'thursday3', 'SOFI', 64.3850, 0.00, '', '2025-09-19 21:49:28', 'Public.com', ''),
(12, 'thursday3', 'F', 81.7556, 0.00, '', '2025-09-19 22:53:53', 'Public.com', ''),
(13, 'thursday3', 'MSTR', 2.7556, 0.00, '', '2025-09-19 22:53:53', 'Public.com', ''),
(14, 'thursday3', 'SYM', 11.9413, 0.00, '', '2025-09-20 00:41:11', 'Public.com', ''),
(15, 'thursday3', 'WRD', 59.0850, 0.00, '', '2025-09-20 00:41:11', 'Public.com', '');

-- --------------------------------------------------------

--
-- Table structure for table `wallet`
--

CREATE TABLE `wallet` (
  `record_id` int(11) NOT NULL,
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
  `points` bigint(20) DEFAULT 0,
  `cash_balance` decimal(15,2) DEFAULT 0.00,
  `portfolio_value` decimal(15,2) DEFAULT 0.00,
  `sweep_percentage` decimal(5,2) DEFAULT 0.00,
  `sweep_update_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `wallet`
--

INSERT INTO `wallet` (`record_id`, `member_id`, `member_email`, `member_password_hash`, `first_name`, `middle_name`, `last_name`, `member_address_line1`, `member_address_line2`, `member_town_city`, `member_state`, `member_zip`, `member_country`, `merchant_id`, `merchant_name`, `broker`, `broker_url`, `election_type`, `points`, `cash_balance`, `portfolio_value`, `sweep_percentage`, `sweep_update_date`, `created_at`, `updated_at`, `last_login`) VALUES
(1, 'wednesday3', 'w3@g.co', '$2y$10$dmIsT1oc3Og8qEKWQh656uWHQ6soqnOMWTpiJPt/NjG7iG1SyJhA6', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0.00, 0.00, 0.00, '2025-09-18 21:07:44', '2025-09-17 20:43:24', '2025-09-17 20:43:24', NULL),
(2, 'thursday1', 'w1@g.co', '$2y$10$nBSRXNkTm4yVopCg9tMPm.42IXXqvkkKOQ1DpZ/ZK1/bYB715/E8.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0.00, 0.00, 0.00, '2025-09-18 21:07:44', '2025-09-18 14:47:49', '2025-09-18 14:47:49', NULL),
(3, 'thursday3', 'w4@g.co', '$2y$10$O/myj18LtK/9MFVYQi19Eu/96DNSbjpynoKCCl1TaeNZiO7lPHmli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Public.com', 'https://public.com/', 'monthly', 54500, 2725.00, 6608.55, 100.00, '2025-09-20 01:18:31', '2025-09-18 18:59:36', '2025-09-20 01:18:31', '2025-09-20 01:18:31');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `basket`
--
ALTER TABLE `basket`
  ADD PRIMARY KEY (`basket_id`),
  ADD KEY `fk_basket_member` (`member_id`);

--
-- Indexes for table `broker_credentials`
--
ALTER TABLE `broker_credentials`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_member_broker` (`member_id`,`broker`);

--
-- Indexes for table `merchant`
--
ALTER TABLE `merchant`
  ADD PRIMARY KEY (`record_id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`order_id`),
  ADD KEY `fk_orders_member` (`member_id`);

--
-- Indexes for table `wallet`
--
ALTER TABLE `wallet`
  ADD PRIMARY KEY (`record_id`),
  ADD UNIQUE KEY `member_id` (`member_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `basket`
--
ALTER TABLE `basket`
  MODIFY `basket_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `broker_credentials`
--
ALTER TABLE `broker_credentials`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `merchant`
--
ALTER TABLE `merchant`
  MODIFY `record_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `order_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `wallet`
--
ALTER TABLE `wallet`
  MODIFY `record_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `basket`
--
ALTER TABLE `basket`
  ADD CONSTRAINT `fk_basket_member` FOREIGN KEY (`member_id`) REFERENCES `wallet` (`member_id`);

--
-- Constraints for table `broker_credentials`
--
ALTER TABLE `broker_credentials`
  ADD CONSTRAINT `fk_credentials_member` FOREIGN KEY (`member_id`) REFERENCES `wallet` (`member_id`);

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_member` FOREIGN KEY (`member_id`) REFERENCES `wallet` (`member_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
