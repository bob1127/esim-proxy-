import express from "express";
import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";

const app = express();
app.use(express.json());

const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";

const PLAN_ID_MAP = {
  "KR-3DAY": "2691d925-2faa-4fd4-863c-601d37252549",
  "KR-5DAY": "3f30e801-37b8-4ae4-a7d6-bb99ffbd1af7",
  "KR-10DAY": "005740c7-5388-40f6-b2a3-8c2e36e4aecd",
  "KR-20DAY": "9755f575-6a95-4337-9352-a2d664bf1bbd",
  "KR-30DAY": "adca09ab-55ae-49c6-9f97-a09ee868c067",
};

function SIGN_HEADERS() {
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
}

// ✅ 建立訂單並查詢 QRCode
app.post("/esim/qrcode", async (req, res) => {
  console.log("🪵 Incoming body:", req.body);

  const rawPlanId = req.body.channel_dataplan_id || req.body.planId;
  const number = req.body.number || req.body.quantity;

  const channel_dataplan_id = PLAN_ID_MAP[rawPlanId] || rawPlanId;

  if (!channel_dataplan_id || !number) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { timestamp, nonce, signature } = SIGN_HEADERS();

  const form = new FormData();
  form.append("number", number);
  form.append("channel_dataplan_id", channel_dataplan_id);
  form.append(
    "activation_date",
    new Date(Date.now() + 5 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19)
  );

  const headers = {
    ...form.getHeaders(),
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  try {
    const response = await axios.post(
      "https://microesim.club/allesim/v1/esimSubscribe",
      form,
      { headers, timeout: 10000 }
    );

    const result = response.data;
    console.log("📥 Subscribe result:", result);

    if (result.code === 1 && result.result?.topup_id) {
      const topup_id = result.result.topup_id;

      const { timestamp, nonce, signature } = SIGN_HEADERS();

      const form2 = new FormData();
      form2.append("topup_id", topup_id);

      const detailRes = await axios.post(
        "https://microesim.club/allesim/v1/topupDetail",
        form2,
        {
          headers: {
            ...form2.getHeaders(),
            "MICROESIM-ACCOUNT": ACCOUNT,
            "MICROESIM-NONCE": nonce,
            "MICROESIM-TIMESTAMP": timestamp,
            "MICROESIM-SIGN": signature,
          },
          timeout: 10000,
        }
      );

      const detail = detailRes.data;
      console.log("📥 Detail result:", detail);

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
    console.error("❌ Error:", err.message);
    if (err.response) {
      console.error("❌ MicroeSIM Response:", err.response.data);
      return res.status(err.response.status).json({
        error: "MicroeSIM Error",
        detail: err.response.data,
      });
    }
    return res.status(500).json({ error: "Internal Error", detail: err.message });
  }
});

// ✅ 查詢可用方案
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
      "https://microesim.club/allesim/v1/esimDataplanList",
      { headers, timeout: 10000 }
    );
    res.status(200).json(response.data);
  } catch (err) {
    console.error("❌ List Error:", err.message);
    res.status(500).json({ error: "List Fetch Failed", detail: err.message });
  }
});

// ✅ 解密藍新 AES 加密內容
function aesDecrypt(encryptedText) {
  const HASH_KEY = "OVB4Xd2HgieiLJJcj5RMx9W94sMKgHQx";
  const HASH_IV = "PKetlaZYZcZvlMmC";

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(HASH_KEY, "utf8"),
    Buffer.from(HASH_IV, "utf8")
  );
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ✅ 處理藍新付款通知並自動下訂 eSIM
app.post("/notify", async (req, res) => {
  console.log("📩 /notify Received:", req.body);

  const { Status, TradeInfo } = req.body;
  if (Status !== "SUCCESS" || !TradeInfo) {
    return res.status(400).send("Invalid payload");
  }

  try {
    const decrypted = aesDecrypt(TradeInfo);
    const parsed = new URLSearchParams(decrypted);
    const orderNo = parsed.get("MerchantOrderNo");
    const planId = parsed.get("CustomField1");
    const quantity = Number(parsed.get("CustomField2") || 1);

    console.log("✅ 解密成功：", { orderNo, planId, quantity });

    const esimResponse = await axios.post(
      "https://esim-proxy-production.up.railway.app/esim/qrcode",
      {
        planId,
        quantity,
      }
    );

    const data = esimResponse.data;
    console.log("📨 eSIM Response:", data);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Notify Error:", error);
    return res.status(500).send("Failed to process notify");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
