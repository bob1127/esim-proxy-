import fetch from 'node-fetch';
import crypto from 'crypto';

const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";
const API_URL = "https://microesim.club/allesim/v1/esimDataplanList";

const timestamp = Date.now().toString(); // 13 位 timestamp
const nonce = crypto.randomBytes(12).toString("hex"); // 6~32 字符

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

const headers = {
  "Content-Type": "application/json",
  "MICROESIM-ACCOUNT": ACCOUNT,
  "MICROESIM-NONCE": nonce,
  "MICROESIM-TIMESTAMP": timestamp,
  "MICROESIM-SIGN": signature,
};

console.log("🔐 DEBUG HEADER INFO:", headers);

fetch(API_URL, {
  method: "GET",
  headers,
})
  .then(async (res) => {
    const data = await res.text();
    console.log("✅ Status:", res.status);
    console.log("✅ Response:", data);
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
  });
