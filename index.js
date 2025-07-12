import express from "express";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// ✅ 驗證環境變數存在
if (
  !process.env.ESIM_ACCOUNT ||
  !process.env.ESIM_SECRET ||
  !process.env.ESIM_SALT ||
  !process.env.ESIM_BASE_URL
) {
  throw new Error("❌ 環境變數未正確設定，請確認 ESIM_ACCOUNT、ESIM_SECRET、ESIM_SALT、ESIM_BASE_URL");
}

const ACCOUNT = process.env.ESIM_ACCOUNT;
const SECRET = process.env.ESIM_SECRET;
const SALT_HEX = process.env.ESIM_SALT;
const BASE_URL = process.env.ESIM_BASE_URL;

// ✅ 簽章產生函數
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

// ✅ 查詢方案列表並轉為對照表格式
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

    const plans = response.data?.result || [];

    const planMap = {};
    plans.forEach((plan) => {
      const key = `${plan.country || "XX"}-${plan.days}DAY-${(plan.data || "NA").replace(/\s+/g, "")}`;
      planMap[key] = plan.id;
    });

    // ✅ 輸出複製用格式
    console.log("✅ PLAN_ID_MAP 對照表：\nconst PLAN_ID_MAP = {");
    for (const [key, value] of Object.entries(planMap)) {
      console.log(`  "${key}": "${value}",`);
    }
    console.log("};\n");

    res.status(200).json({
      success: true,
      planCount: plans.length,
      planMap,
      raw: plans,
    });
  } catch (err) {
    console.error("❌ 抓取方案失敗:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ✅ 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
