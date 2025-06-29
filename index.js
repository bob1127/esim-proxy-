import express from "express";
import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";

const app = express();
app.use(express.json());

const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";
const API_URL = "https://microesim.club/allesim/v1/esimSubscribe";

app.post("/esim/qrcode", async (req, res) => {
  console.log("🪵 Incoming body:", req.body);

  try {
    const { channel_dataplan_id, number } = req.body;

    if (!channel_dataplan_id || !number) {
      return res.status(400).json({ error: "Missing required fields" });
    }

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

    // ✅ 使用 form-data 格式
    const form = new FormData();
    form.append("number", number);
    form.append("channel_dataplan_id", channel_dataplan_id);
    // 如需延後開通，可加上：
    // form.append("activation_date", "2025-07-01 00:00:00");

    const headers = {
      ...form.getHeaders(),
      "MICROESIM-ACCOUNT": ACCOUNT,
      "MICROESIM-NONCE": nonce,
      "MICROESIM-TIMESTAMP": timestamp,
      "MICROESIM-SIGN": signature,
    };

    const response = await axios.post(API_URL, form, { headers });

    const result = response.data;

    if (result.code === 200) {
      return res.status(200).json({ qrcode: result.data.qrcode });
    } else {
      return res.status(400).json({
        error: result.msg || "Subscribe failed",
        raw: result,
      });
    }
  } catch (err) {
    console.error("❌ Internal Error:", err);

    if (err.response) {
      console.error("❌ MicroeSIM Response:", err.response.data);
      return res.status(err.response.status).json({
        error: "MicroeSIM Error",
        detail: err.response.data,
      });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      detail: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
