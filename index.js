import express from "express";
import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";

const app = express();
app.use(express.json());

const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";

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

// ✅ 建立訂單並查詢 QRCode
app.post("/esim/qrcode", async (req, res) => {
  console.log("🪵 Incoming body:", req.body);
  const { channel_dataplan_id, number } = req.body;

  if (!channel_dataplan_id || !number) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { timestamp, nonce, signature } = SIGN_HEADERS();

  const form = new FormData();
  form.append("number", number);
  form.append("channel_dataplan_id", channel_dataplan_id);
  form.append(
    "activation_date",
    new Date(Date.now() + 5 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19)
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

      // 再產一組新的簽章
      const { timestamp, nonce, signature } = SIGN_HEADERS();

      const detailRes = await axios.post(
        "https://microesim.club/allesim/v1/topupDetail",
        { topup_id },
        {
          headers: {
            "Content-Type": "application/json",
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
