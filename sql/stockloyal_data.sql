-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: stockloyal
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `basket`
--

LOCK TABLES `basket` WRITE;
/*!40000 ALTER TABLE `basket` DISABLE KEYS */;
/*!40000 ALTER TABLE `basket` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `broker_credentials`
--

LOCK TABLES `broker_credentials` WRITE;
/*!40000 ALTER TABLE `broker_credentials` DISABLE KEYS */;
INSERT INTO `broker_credentials` VALUES (1,'thursday3','Public.com','public3','lXpAQhYtX0zK0e1rqdp4+w==','2025-09-18 21:09:04');
/*!40000 ALTER TABLE `broker_credentials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `merchant`
--

LOCK TABLES `merchant` WRITE;
/*!40000 ALTER TABLE `merchant` DISABLE KEYS */;
INSERT INTO `merchant` VALUES (3,'merchant001','Sky Blue Airlines','My Air Miles','reiannone@gmail.com','1.917.226.1566','https://www.sba.com',0.0500,1,'2025-09-17 21:17:58','2025-09-19 19:01:22','<p><strong>Welcome to StockLoyal!</strong>&nbsp;&mdash; the leading platform that transforms your everyday loyalty points into actual equity ownership in the brands you love. Instead of leaving points unused or expiring, put them to work building your personal investment portfolio.</p>\r\n\r\n<ul>\r\n	<li>Seamless Conversion: Instantly turn points from leading merchants and loyalty programs into fractional shares of stock.</li>\r\n	<li>Real-Time Tracking: Watch your stock rewards grow inside your StockLoyal wallet with up-to-the-minute portfolio updates.</li>\r\n	<li>Transparent &amp; Fair: No hidden fees, no fine print &mdash; just straightforward value for every point you earn.</li>\r\n	<li>Exclusive Bonuses: Earn extra stock rewards when you refer friends, participate in merchant promotions, or reach milestones.&nbsp;</li>\r\n	<li>Financial Empowerment: Start investing with the rewards you already have &mdash; no minimums, no extra cash required.</li>\r\n</ul>\r\n',1);
/*!40000 ALTER TABLE `merchant` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,'thursday3','OPEN',31.4386,0.00,'','2025-09-18 21:03:01','Charles Schwab',''),(2,'thursday3','SNAP',37.0261,0.00,'','2025-09-18 21:03:01','Charles Schwab',''),(3,'thursday3','FORM',6.9367,0.00,'','2025-09-19 02:26:14','Public.com',''),(4,'thursday3','BEAM',9.9602,0.00,'','2025-09-19 02:26:14','Public.com',''),(5,'thursday3','PONY',45.5308,0.00,'','2025-09-19 19:46:13','Public.com',''),(6,'thursday3','SNAP',87.5845,0.00,'','2025-09-19 19:52:18','Public.com',''),(7,'thursday3','SNAP',87.5845,0.00,'','2025-09-19 20:07:27','Public.com',''),(8,'thursday3','NVDA',2.0173,0.00,'','2025-09-19 20:15:13','Public.com',''),(9,'thursday3','OKLO',3.9518,0.00,'','2025-09-19 20:59:05','Public.com',''),(10,'thursday3','F',47.7969,0.00,'','2025-09-19 21:09:07','Public.com',''),(11,'thursday3','SOFI',64.3850,0.00,'','2025-09-19 21:49:28','Public.com',''),(12,'thursday3','F',81.7556,0.00,'','2025-09-19 22:53:53','Public.com',''),(13,'thursday3','MSTR',2.7556,0.00,'','2025-09-19 22:53:53','Public.com',''),(14,'thursday3','SYM',11.9413,0.00,'','2025-09-20 00:41:11','Public.com',''),(15,'thursday3','WRD',59.0850,0.00,'','2025-09-20 00:41:11','Public.com','');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `wallet`
--

LOCK TABLES `wallet` WRITE;
/*!40000 ALTER TABLE `wallet` DISABLE KEYS */;
INSERT INTO `wallet` VALUES (1,'wednesday3','w3@g.co','$2y$10$dmIsT1oc3Og8qEKWQh656uWHQ6soqnOMWTpiJPt/NjG7iG1SyJhA6',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0.00,0.00,0.00,'2025-09-18 21:07:44','2025-09-17 20:43:24','2025-09-17 20:43:24',NULL),(2,'thursday1','w1@g.co','$2y$10$nBSRXNkTm4yVopCg9tMPm.42IXXqvkkKOQ1DpZ/ZK1/bYB715/E8.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0.00,0.00,0.00,'2025-09-18 21:07:44','2025-09-18 14:47:49','2025-09-18 14:47:49',NULL),(3,'thursday3','w4@g.co','$2y$10$O/myj18LtK/9MFVYQi19Eu/96DNSbjpynoKCCl1TaeNZiO7lPHmli',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Public.com','https://public.com/','monthly',54500,2725.00,6608.55,100.00,'2025-09-20 01:18:31','2025-09-18 18:59:36','2025-09-20 01:18:31','2025-09-20 01:18:31');
/*!40000 ALTER TABLE `wallet` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-21 13:54:44
