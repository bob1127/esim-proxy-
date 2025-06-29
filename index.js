import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json()); // ✅ 解析 JSON body

const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";
const API_URL = "https://microesim.club/allesim/v1/esimSubscribe";

app.post("/esim/qrcode", async (req, res) => {
  console.log("🪵 Incoming body:", req.body); // ✅ Debug Log

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

    const bodyPayload = JSON.stringify({ channel_dataplan_id, number });

    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(bodyPayload).toString(), // ✅ 手動加上
      "MICROESIM-ACCOUNT": ACCOUNT,
      "MICROESIM-NONCE": nonce,
      "MICROESIM-TIMESTAMP": timestamp,
      "MICROESIM-SIGN": signature,
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers,
      body: bodyPayload,
    });

    const result = await response.json();

    if (response.ok && result.code === 200) {
      return res.status(200).json({ qrcode: result.data.qrcode });
    } else {
      return res.status(400).json({
        error: result.msg || "Subscribe failed",
        raw: result,
      });
    }
  } catch (err) {
    console.error("❌ Internal Error:", err);
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
