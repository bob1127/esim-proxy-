import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto";

const app = express();
app.use(bodyParser.json());

const BASE_URL = "https://microesim.club";
const account = "test_account_9999";
const secret = "7119968f9ff07654ga485487822g";
const salt = "c38ab89bd01537b3915848d689090e56";

function generateSign(payload) {
  const base = JSON.stringify(payload) + salt;
  return crypto.createHash("md5").update(base).digest("hex");
}

app.post("/esim/qrcode", async (req, res) => {
  const payload = {
    channel_dataplan_id: "20230813A45282eeE1CCee85998876195",
    account,
    timestamp: Date.now(),
  };

  payload.sign = generateSign(payload);

  try {
    const response = await axios.post(`${BASE_URL}/api/v1/user/order`, payload);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: "eSIM API 呼叫失敗", details: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Proxy server running");
});
