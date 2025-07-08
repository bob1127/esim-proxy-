import dotenv from "dotenv";
dotenv.config(); // ✅ 在任何使用 process.env 之前執行

import express from "express";
import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";

const app = express();
app.use(express.json());

// ✅ 使用 .env 管理帳號與設定
const ACCOUNT = process.env.ESIM_ACCOUNT;
const SECRET = process.env.ESIM_SECRET;
const SALT_HEX = process.env.ESIM_SALT;
const BASE_URL = process.env.ESIM_BASE_URL;

const PLAN_ID_MAP = {
  "KR-3DAY": "2691d925-2faa-4fd4-863c-601d37252549",
  "KR-5DAY": "3f30e801-37b8-4ae4-a7d6-bb99ffbd1af7",
  "KR-10DAY": "005740c7-5388-40f6-b2a3-8c2e36e4aecd",
  "KR-20DAY": "9755f575-6a95-4337-9352-a2d664bf1bbd",
  "KR-30DAY": "adca09ab-55ae-49c6-9f97-a09ee868c067",
};

const SIGN_HEADERS = () => {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(6).toString("hex");
  const hexKey = crypto.pbkdf2Sync(
    SECRET,
    Buffer.from(SALT_HEX, "hex"),
    1024,
    32,
    "sha256"
  ).toString("hex");
  const dataToSign = ACCOUNT + nonce + timestamp;
  const signature = crypto
    .createHmac("sha256", Buffer.from(hexKey, "utf8"))
    .update(dataToSign)
    .digest("hex");
  return { timestamp, nonce, signature };
};

// ✅ 測試模式：模擬建立訂單並回傳假 QRCode
app.post("/esim/qrcode", async (req, res) => {
  console.log("🧪 測試模式：模擬建立訂單");
  const rawPlanId = req.body.channel_dataplan_id || req.body.planId;
  const number = req.body.number || req.body.quantity;

  const channel_dataplan_id = PLAN_ID_MAP[rawPlanId] || rawPlanId;

  if (!channel_dataplan_id || !number) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // ✅ 模擬回傳假訂單
  return res.status(200).json({
    topup_id: `TEST-${Date.now()}`,
    qrcode: "https://via.placeholder.com/300x300.png?text=Fake+eSIM+QRCode",
    note: "此為模擬測試，未連線正式 API，也未建立訂單",
  });
});

// ✅ 查詢可用方案（仍用正式 API）
app.get("/esim/list", async (req, res) => {
  const { timestamp, nonce, signature } = SIGN_HEADERS();

  const headers = {
    "Content-Type": "application/json",
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  try {
    const response = await axios.get(
      `${BASE_URL}/allesim/v1/esimDataplanList`,
      { headers, timeout: 10000 }
    );
    res.status(200).json(response.data);
  } catch (err) {
    console.error("❌ List Error:", err.message);
    res.status(500).json({ error: "List Fetch Failed", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
// ✅ 額外測試：列出所有方案（格式化輸出）
app.get("/esim/test-list", async (req, res) => {
  const { timestamp, nonce, signature } = SIGN_HEADERS();

  const headers = {
    "Content-Type": "application/json",
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  try {
    const response = await axios.get(
      `${BASE_URL}/allesim/v1/esimDataplanList`,
      { headers, timeout: 10000 }
    );

    console.log("📦 API 回傳內容", JSON.stringify(response.data, null, 2));

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Test List Error:", err.message);
    res.status(500).json({ error: "Test List Failed", detail: err.message });
  }
});
