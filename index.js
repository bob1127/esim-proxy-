import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto";

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
    .createHmac("sha256", Buffer.from(hexKey, "utf-8"))
    .update(data)
    .digest("hex");
}

app.post("/esim/qrcode", async (req, res) => {
  const nonce = Math.random().toString(36).substring(2, 18);
  const timestamp = Date.now().toString();
  const dataToSign = ACCOUNT + nonce + timestamp;
  const hexKey = pbkdf2ToHex(SECRET, SALT_HEX, ITERATIONS, KEY_LENGTH);
  const signature = hmacWithHexKey(dataToSign, hexKey);

  const headers = {
    "Content-Type": "application/json",
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  const payload = {
     channel_dataplan_id: "20230813A45282eeE1CCee85998876195",
  number: "testuser_001" 
  };

  try {
    const response = await axios.post(
      `${BASE_URL}/allesim/v1/esimSubscribe`,
      payload,
      { headers }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      error: "eSIM API 呼叫失敗",
      details: err.response?.data || err.message,
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Proxy server running");
});
