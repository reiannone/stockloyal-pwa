<?php 
// admin_merchants.php
// Simple standalone CRUD page for merchants + Demo launcher

// ---------- CONFIG ----------
$host = "localhost";
$user = "root";
$pass = "";
$db   = "stockloyal";   // <-- change to your DB name

$conn = new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// ---------- DELETE ----------
if (isset($_GET['delete'])) {
    $del_id = intval($_GET['delete']);
    $stmt = $conn->prepare("DELETE FROM merchant WHERE record_id=?");
    $stmt->bind_param("i", $del_id);
    $stmt->execute();
    $stmt->close();
    header("Location: admin_merchants.php");
    exit;
}

// ---------- CREATE / UPDATE ----------
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $record_id        = $_POST['record_id'] ?? '';
    $merchant_id      = $_POST['merchant_id'] ?? '';
    $merchant_name    = $_POST['merchant_name'] ?? '';
    $program_name     = $_POST['program_name'] ?? '';
    $contact_email    = $_POST['contact_email'] ?? '';
    $contact_phone    = $_POST['contact_phone'] ?? '';
    $website_url      = $_POST['website_url'] ?? '';
    $conversion_rate  = $_POST['conversion_rate'] ?? 1.0000;
    $active_status    = isset($_POST['active_status']) ? 1 : 0;
    $promotion_text   = $_POST['promotion_text'] ?? '';
    $promotion_active = isset($_POST['promotion_active']) ? 1 : 0;

    if ($record_id) {
        // UPDATE
        $stmt = $conn->prepare("UPDATE merchant 
            SET merchant_id=?, merchant_name=?, program_name=?, contact_email=?, contact_phone=?, website_url=?, conversion_rate=?, active_status=?, promotion_text=?, promotion_active=? 
            WHERE record_id=?");
        $stmt->bind_param(
            "ssssssdisii",
            $merchant_id,
            $merchant_name,
            $program_name,
            $contact_email,
            $contact_phone,
            $website_url,
            $conversion_rate,
            $active_status,
            $promotion_text,
            $promotion_active,
            $record_id
        );
        $stmt->execute();
        $stmt->close();
    } else {
        // INSERT
        $stmt = $conn->prepare("INSERT INTO merchant 
            (merchant_id, merchant_name, program_name, contact_email, contact_phone, website_url, conversion_rate, active_status, promotion_text, promotion_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param(
            "ssssssdisi",
            $merchant_id,
            $merchant_name,
            $program_name,
            $contact_email,
            $contact_phone,
            $website_url,
            $conversion_rate,
            $active_status,
            $promotion_text,
            $promotion_active
        );
        $stmt->execute();
        $stmt->close();
    }

    // Redirect with active merchant_id
    header("Location: admin_merchants.php?merchant_id=" . urlencode($merchant_id));
    exit;
}

// ---------- FETCH ALL ----------
$result = $conn->query("SELECT * FROM merchant ORDER BY created_at DESC");

// ---------- FETCH ACTIVE MERCHANT ----------
$activeMerchant = null;
if (isset($_GET['merchant_id'])) {
    $mId = $conn->real_escape_string($_GET['merchant_id']);
    $res = $conn->query("SELECT * FROM merchant WHERE merchant_id='$mId' LIMIT 1");
    if ($res && $res->num_rows > 0) {
        $activeMerchant = $res->fetch_assoc();
    }
}
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Merchant Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; table-layout: fixed; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: top; }
    th { background: #f4f4f4; }
    td.promotion-cell {
      max-width: 250px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
    }

    .form-wrapper { display: flex; gap: 20px; align-items: flex-start; }
    .form-container { border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; width: 600px; }
    .form-row { display: flex; align-items: flex-start; margin-bottom: 10px; }
    .form-row label { width: 180px; text-align: right; margin-right: 10px; font-weight: bold; }
    .form-row input[type=text],
    .form-row input[type=email],
    .form-row input[type=number],
    .form-row input[type=url],
    .form-row textarea {
        width: 350px; padding: 6px; text-align: left;
    }
    textarea { height: 120px; resize: vertical; }
    input[type=submit] {
        background: #2563eb; color: white; padding: 10px 20px; border: none; cursor: pointer;
    }
    input[type=submit]:hover { background: #1e40af; }
    .edit-btn { background: #f59e0b; color: white; padding: 5px 10px; text-decoration: none; margin-right: 5px; }
    .delete-btn { background: #dc2626; color: white; padding: 5px 10px; text-decoration: none; }

    /* On/Off Switch */
    .switch { position: relative; display: inline-block; width: 46px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #ccc; transition: .4s; border-radius: 24px;
    }
    .slider:before {
      position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
      background-color: white; transition: .4s; border-radius: 50%;
    }
    input:checked + .slider { background-color: #2563eb; }
    input:checked + .slider:before { transform: translateX(22px); }

    /* Demo box */
    .demo-box {
      border: 1px solid #ccc;
      padding: 15px;
      width: 300px;
      background: #f9fafb;
    }
    .demo-box h3 { margin-top: 0; }
    .demo-box input[type=text],
    .demo-box input[type=number] {
      width: 200px;
      padding: 6px;
      margin-top: 5px;
    }
    .demo-box button {
      background: #059669;
      color: white;
      border: none;
      padding: 8px 16px;
      cursor: pointer;
      margin-top: 10px;
    }
    .demo-box button:hover { background: #047857; }
  </style>

  <!-- Load CKEditor -->
  <script src="https://cdn.ckeditor.com/4.22.1/standard/ckeditor.js"></script>
</head>
<body>
  <h1>Merchant Admin</h1>

  <div class="form-wrapper">
    <!-- Merchant Form -->
    <div class="form-container">
      <form method="post">
        <input type="hidden" name="record_id" id="record_id" value="<?= htmlspecialchars($activeMerchant['record_id'] ?? '') ?>">

        <div class="form-row">
          <label for="merchant_id">Merchant ID:</label>
          <input type="text" name="merchant_id" id="merchant_id" value="<?= htmlspecialchars($activeMerchant['merchant_id'] ?? '') ?>" required>
        </div>

        <div class="form-row">
          <label for="merchant_name">Merchant Name:</label>
          <input type="text" name="merchant_name" id="merchant_name" value="<?= htmlspecialchars($activeMerchant['merchant_name'] ?? '') ?>" required>
        </div>

        <div class="form-row">
          <label for="program_name">Program Name:</label>
          <input type="text" name="program_name" id="program_name" value="<?= htmlspecialchars($activeMerchant['program_name'] ?? '') ?>">
        </div>

        <div class="form-row">
          <label for="contact_email">Contact Email:</label>
          <input type="email" name="contact_email" id="contact_email" value="<?= htmlspecialchars($activeMerchant['contact_email'] ?? '') ?>">
        </div>

        <div class="form-row">
          <label for="contact_phone">Contact Phone:</label>
          <input type="text" name="contact_phone" id="contact_phone" value="<?= htmlspecialchars($activeMerchant['contact_phone'] ?? '') ?>">
        </div>

        <div class="form-row">
          <label for="website_url">Website URL:</label>
          <input type="url" name="website_url" id="website_url" value="<?= htmlspecialchars($activeMerchant['website_url'] ?? '') ?>">
        </div>

        <div class="form-row">
          <label for="conversion_rate">Conversion Rate:</label>
          <input type="number" step="0.0001" name="conversion_rate" id="conversion_rate" value="<?= htmlspecialchars($activeMerchant['conversion_rate'] ?? '0.01') ?>">
        </div>

        <div class="form-row">
          <label for="promotion_text">Promotion Text:</label>
          <textarea name="promotion_text" id="promotion_text"><?= htmlspecialchars($activeMerchant['promotion_text'] ?? '') ?></textarea>
        </div>

        <div class="form-row">
          <label for="promotion_active">Promotion Active:</label>
          <label class="switch">
            <input type="checkbox" name="promotion_active" id="promotion_active" <?= !empty($activeMerchant['promotion_active']) ? 'checked' : '' ?>>
            <span class="slider"></span>
          </label>
        </div>

        <div class="form-row">
          <label for="active_status">Merchant Active Status:</label>
          <label class="switch">
            <input type="checkbox" name="active_status" id="active_status" <?= !empty($activeMerchant['active_status']) ? 'checked' : '' ?>>
            <span class="slider"></span>
          </label>
        </div>

        <div class="form-row">
          <label></label>
          <input type="submit" value="Save Merchant">
        </div>
      </form>
    </div>

    <!-- Demo Launcher -->
    <div class="demo-box">
      <h3>Launch Demo</h3>
      <p>Simulate a member coming from a merchant site:</p>
      <label for="demo_member_id">Member ID:</label><br>
      <input type="text" id="demo_member_id" placeholder="Enter Member ID"><br>

      <label for="demo_points">Reward Points:</label><br>
      <input type="number" id="demo_points" placeholder="Points Earned" value="100"><br>

      <input type="hidden" id="demo_merchant_id" value="<?= htmlspecialchars($activeMerchant['merchant_id'] ?? '') ?>">

      <button onclick="launchDemo()">Launch StockLoyal PWA</button>
    </div>
  </div>

  <h2>Merchant Records</h2>
  <table>
    <tr>
      <th>ID</th>
      <th>Merchant ID</th>
      <th>Name</th>
      <th>Program</th>
      <th>Email</th>
      <th>Phone</th>
      <th>Website</th>
      <th>Rate</th>
      <th>Promotion</th>
      <th>Promo Active</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
    <?php while($row = $result->fetch_assoc()): ?>
    <tr>
      <td><?= htmlspecialchars($row['record_id']) ?></td>
      <td><?= htmlspecialchars($row['merchant_id']) ?></td>
      <td><?= htmlspecialchars($row['merchant_name']) ?></td>
      <td><?= htmlspecialchars($row['program_name']) ?></td>
      <td><?= htmlspecialchars($row['contact_email']) ?></td>
      <td><?= htmlspecialchars($row['contact_phone']) ?></td>
      <td><a href="<?= htmlspecialchars($row['website_url']) ?>" target="_blank">Link</a></td>
      <td><?= htmlspecialchars($row['conversion_rate']) ?></td>
      <td class="promotion-cell" title="<?= htmlspecialchars(strip_tags($row['promotion_text'])) ?>">
        <?= htmlspecialchars(strip_tags($row['promotion_text'])) ?>
      </td>
      <td><?= $row['promotion_active'] ? "Active" : "Inactive" ?></td>
      <td><?= $row['active_status'] ? "Active" : "Inactive" ?></td>
      <td>
        <a href="admin_merchants.php?merchant_id=<?= urlencode($row['merchant_id']) ?>" class="edit-btn">Edit</a>
        <a href="javascript:void(0)" class="delete-btn" onclick='confirmDelete(<?= $row['record_id'] ?>)'>Delete</a>
      </td>
    </tr>
    <?php endwhile; ?>
  </table>

  <script>
    // Activate CKEditor for WYSIWYG input
    CKEDITOR.replace('promotion_text');

    function launchDemo() {
      const memberId = document.getElementById("demo_member_id").value.trim();
      const merchantId = document.getElementById("demo_merchant_id").value.trim();
      const points = document.getElementById("demo_points").value.trim() || 0;

      if (!memberId) {
        alert("Please enter a member_id");
        return;
      }

      const url =
        "http://localhost:5173/?member_id=" +
        encodeURIComponent(memberId) +
        "&merchant_id=" +
        encodeURIComponent(merchantId) +
        "&points=" +
        encodeURIComponent(points) +
        "&action=earn";

      window.open(url, "_blank");
    }
  </script>
</body>
</html>
