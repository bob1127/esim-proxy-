import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto";
import FormData from "form-data";

const app = express();
app.use(bodyParser.json());

const BASE_URL = "https://microesim.club";
const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";
const ITERATIONS = 1024;
const KEY_LENGTH = 32;

function pbkdf2ToHex(secret, saltHex, iterations, keyLen) {
  const salt = Buffer.from(saltHex, "hex");
  const derivedKey = crypto.pbkdf2Sync(secret, salt, iterations, keyLen, "sha256");
  return derivedKey.toString("hex");
}

function hmacWithHexKey(data, hexKey) {
  return crypto
    .createHmac("sha256", Buffer.from(hexKey, "hex"))
    .update(data)
    .digest("hex");
}

app.post("/esim/qrcode", async (req, res) => {
  const { channel_dataplan_id, number } = req.body;

  if (!channel_dataplan_id || !number) {
    return res.status(400).json({
      error: "缺少必要參數",
      details: { channel_dataplan_id, number },
    });
  }

  const nonce = Math.random().toString(36).substring(2, 18);
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const dataToSign = ACCOUNT + nonce + timestamp;
  const hexKey = pbkdf2ToHex(SECRET, SALT_HEX, ITERATIONS, KEY_LENGTH);
  const signature = hmacWithHexKey(dataToSign, hexKey);

  const headers = {
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  console.log("🔐 DEBUG 簽章資訊", {
    ACCOUNT,
    nonce,
    timestamp,
    dataToSign,
    hexKey,
    signature,
    headers,
  });

  try {
    const form = new FormData();
    form.append("channel_dataplan_id", channel_dataplan_id);
    form.append("number", number);

    const subscribeRes = await axios.post(`${BASE_URL}/allesim/v1/esimSubscribe`, form, {
      headers: {
        ...headers,
        ...form.getHeaders(),
      },
    });

    const topup_id = subscribeRes.data?.result?.topup_id;
    if (!topup_id) throw new Error("未取得 topup_id");

    const detailForm = new FormData();
    detailForm.append("topup_id", topup_id);

    const detailRes = await axios.post(`${BASE_URL}/allesim/v1/topupDetail`, detailForm, {
      headers: {
        ...headers,
        ...detailForm.getHeaders(),
      },
    });

    const result = detailRes.data?.data || detailRes.data?.result;
    if (!result?.qrcode) throw new Error("未收到 QRCode");

    return res.json({
      success: true,
      topup_id,
      qrcode: result.qrcode,
      lpa_str: result.lpa_str,
      ios_install_link: result.ios_esim_install_link,
    });
  } catch (err) {
    console.error("❌ eSIM API Error:", err.response?.data || err.message);
    return res.status(500).json({
      error: "eSIM API 呼叫失敗",
      details: err.response?.data || err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 未捕捉例外:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 未捕捉拒絕:", reason);
});
