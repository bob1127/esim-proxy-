import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";

const ACCOUNT = "test_account_9999";
const SECRET = "7119968f9ff07654ga485487822g";
const SALT_HEX = "c38ab89bd01537b3915848d689090e56";
const LIST_API = "https://microesim.club/allesim/v1/esimDataplanList";
const SUBSCRIBE_API = "https://microesim.club/allesim/v1/esimSubscribe";

// 模擬用戶電話
const TEST_NUMBER = "0900123456";

async function getHexKey() {
  return crypto.pbkdf2Sync(
    SECRET,
    Buffer.from(SALT_HEX, "hex"),
    1024,
    32,
    "sha256"
  ).toString("hex");
}

function getSignature(account, nonce, timestamp, hexKey) {
  const dataToSign = account + nonce + timestamp;
  return crypto
    .createHmac("sha256", Buffer.from(hexKey, "utf8"))
    .update(dataToSign)
    .digest("hex");
}

async function testDataplans() {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(6).toString("hex");
  const hexKey = await getHexKey();
  const signature = getSignature(ACCOUNT, nonce, timestamp, hexKey);

  const headers = {
    "MICROESIM-ACCOUNT": ACCOUNT,
    "MICROESIM-NONCE": nonce,
    "MICROESIM-TIMESTAMP": timestamp,
    "MICROESIM-SIGN": signature,
  };

  try {
    const { data } = await axios.get(LIST_API, { headers });
    const plans = data.result;

    console.log(`🔍 共 ${plans.length} 筆方案，開始測試...\n`);

    for (const plan of plans) {
      const dataplanId = plan.channel_dataplan_id;

      const newNonce = crypto.randomBytes(6).toString("hex");
      const newTimestamp = Date.now().toString();
      const newSignature = getSignature(ACCOUNT, newNonce, newTimestamp, hexKey);

      const form = new FormData();
      form.append("channel_dataplan_id", dataplanId);
      form.append("number", TEST_NUMBER);

      const subscribeHeaders = {
        ...form.getHeaders(),
        "MICROESIM-ACCOUNT": ACCOUNT,
        "MICROESIM-NONCE": newNonce,
        "MICROESIM-TIMESTAMP": newTimestamp,
        "MICROESIM-SIGN": newSignature,
      };

      try {
        const res = await axios.post(SUBSCRIBE_API, form, {
          headers: subscribeHeaders,
        });

        if (res.data.code === 200) {
          console.log(`✅ 成功：${plan.channel_dataplan_name}`);
        } else {
          console.log(`❌ 失敗：${plan.channel_dataplan_name} → ${res.data.msg}`);
        }
      } catch (e) {
        console.log(`❌ 錯誤：${plan.channel_dataplan_name} → ${e.response?.data?.msg || e.message}`);
      }
    }
  } catch (err) {
    console.error("🚨 無法取得方案清單：", err.message);
  }
}

testDataplans();
