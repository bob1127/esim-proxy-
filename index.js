import express from "express";
import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";
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
  throw new Error("❌ 請設定環境變數 ESIM_ACCOUNT、ESIM_SECRET、ESIM_SALT、ESIM_BASE_URL");
}

const ACCOUNT = process.env.ESIM_ACCOUNT;
const SECRET = process.env.ESIM_SECRET;
const SALT_HEX = process.env.ESIM_SALT;
const BASE_URL = process.env.ESIM_BASE_URL;

// ✅ 時間格式函式：YYYY-MM-DD HH:mm:ss
function formatActivationDate(date = new Date()) {
  const pad = (n) => (n < 10 ? "0" + n : n);
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds())
  );
}

// ✅ 方案對照表（可擴充）
const PLAN_ID_MAP = {
  "MY-1DAY-Daily500MB": "90ab730c-b369-4144-a6f5-be4376494791",
};

// ✅ 建立簽章
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

// ✅ 查詢方案列表
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
    const response = await axios.get(`${BASE_URL}/allesim/v1/esimDataplanList`, {
      headers,
      timeout: 10000,
    });

    const plans = response.data?.result || [];

    const planMap = {};
    plans.forEach((plan) => {
      const key = `${plan.code || "XX"}-${plan.day}DAY-${(plan.data || "NA").replace(/\s+/g, "")}`;
      planMap[key] = plan.channel_dataplan_id;
    });

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

// ✅ 建立訂單並查詢 QRCode
app.post("/esim/qrcode", async (req, res) => {
  console.log("📥 來自前端的資料:", req.body);

  const { planKey, channel_dataplan_id: rawId, planId, number } = req.body;
  const count = parseInt(number) || 1;

  const resolvedPlanId = PLAN_ID_MAP[planKey] || rawId || planId;

  if (!resolvedPlanId || !count) {
    return res.status(400).json({ error: "缺少必要欄位 channel_dataplan_id 或 number" });
  }

  const { timestamp, nonce, signature } = SIGN_HEADERS();

  const form = new FormData();
  form.append("number", count);
  form.append("channel_dataplan_id", resolvedPlanId);

  const activationDate = formatActivationDate(new Date(Date.now() + 5 * 60 * 1000));
  form.append("activation_date", activationDate);
  console.log("📅 activation_date:", activationDate);

  const headers = {
    ...form.getHeaders(),
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  try {
    const response = await axios.post(`${BASE_URL}/allesim/v1/esimSubscribe`, form, {
      headers,
      timeout: 10000,
    });

    const result = response.data;
    console.log("📥 建立訂單結果:", result);

    if (result.code === 1 && result.result?.topup_id) {
      const topup_id = result.result.topup_id;

      const { timestamp, nonce, signature } = SIGN_HEADERS();
      const form2 = new FormData();
      form2.append("topup_id", topup_id);

      const detailRes = await axios.post(`${BASE_URL}/allesim/v1/topupDetail`, form2, {
        headers: {
          ...form2.getHeaders(),
          "MICROESIM-ACCOUNT": ACCOUNT,
          "MICROESIM-NONCE": nonce,
          "MICROESIM-TIMESTAMP": timestamp,
          "MICROESIM-SIGN": signature,
        },
        timeout: 10000,
      });

      const detail = detailRes.data;
      console.log("📥 查詢 QRCode 結果:", detail);

      if (detail.code === 1 && detail.result?.qrcode) {
        return res.status(200).json({
          topup_id,
          qrcode: detail.result.qrcode,
        });
      } else {
        return res.status(200).json({
          topup_id,
          warning: "訂單成功但無 QRCode",
          detail,
        });
      }
    } else {
      return res.status(400).json({ error: result.msg, raw: result });
    }
  } catch (err) {
    console.error("❌ 建立訂單錯誤:", err.message);
    if (err.response) {
      return res.status(err.response.status).json({
        error: "MicroeSIM 錯誤",
        detail: err.response.data,
      });
    }
    return res.status(500).json({ error: "伺服器錯誤", detail: err.message });
  }
});

// ✅ 顯示 JS 格式對照表（for 複製貼上）
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
    const response = await axios.get(`${BASE_URL}/allesim/v1/esimDataplanList`, {
      headers,
      timeout: 10000,
    });

    const plans = response.data?.result || [];

    const planMap = {};
    plans.forEach((plan) => {
      const key = `${plan.code || "XX"}-${plan.day}DAY-${(plan.data || "NA").replace(/\s+/g, "")}`;
      planMap[key] = plan.channel_dataplan_id;
    });

    let output = `// ✅ 自動產生的 PLAN_ID_MAP\nconst PLAN_ID_MAP = {\n`;
    for (const [key, value] of Object.entries(planMap)) {
      output += `  "${key}": "${value}",\n`;
    }
    output += "};\n\nexport default PLAN_ID_MAP;\n";

    res.type("application/javascript").send(output);
  } catch (err) {
    console.error("❌ /esim/test-list 查詢失敗:", err.message);
    res.status(500).send(`// ❌ 錯誤: ${err.message}`);
  }
});

// ✅ 啟動 server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
