import express from "express";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

const ACCOUNT = process.env.ESIM_ACCOUNT!;
const SECRET = process.env.ESIM_SECRET!;
const SALT_HEX = process.env.ESIM_SALT!;
const BASE_URL = process.env.ESIM_BASE_URL!;

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

    const planMap: Record<string, string> = {};
    plans.forEach((plan: any) => {
      const cleanKey = `${plan.country || "XX"}-${plan.days}DAY-${(plan.data || "NA").replace(/\s+/g, "")}`;
      planMap[cleanKey] = plan.id;
    });

    // ✅ 輸出對照表於後台 log（複製用）
    console.log("✅ 方案對照表：");
    console.log("const PLAN_ID_MAP = {");
    for (const [key, value] of Object.entries(planMap)) {
      console.log(`  "${key}": "${value}",`);
    }
    console.log("};");

    res.status(200).json({
      success: true,
      planCount: plans.length,
      planMap,
      raw: plans,
    });
  } catch (err: any) {
    console.error("❌ Failed to fetch plan list:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
