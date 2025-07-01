import express from "express";
import crypto from "crypto";
import axios from "axios";

const router = express.Router();
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

// 金鑰（藍新）
const HASH_KEY = "OVB4Xd2HgieiLJJcj5RMx9W94sMKgHQx";
const HASH_IV = "PKetlaZYZcZvlMmC";

// WooCommerce
const WC_API_URL = "https://dyx.wxv.mybluehost.me/website_a8bfc44c/wp-json/wc/v3/orders";
const WC_KEY = "ck_0ed8acaab9f0bc4cd27c71c2e7ae9ccc3ca45b04";
const WC_SECRET = "cs_50ad8ba137c027d45615b0f6dc2d2d7ffcf97947";

// eSIM Proxy
const ESIM_PROXY_URL = "https://esim-proxy-production.up.railway.app/esim/qrcode";

// AES 解密函式
function aesDecrypt(encryptedText, key, iv) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// 處理藍新 Notify
router.post("/notify", async (req, res) => {
  try {
    const { TradeInfo } = req.body;
    if (!TradeInfo) return res.status(400).send("❌ 缺少 TradeInfo");

    const decrypted = aesDecrypt(TradeInfo, HASH_KEY, HASH_IV);
    console.log("🔥 Raw decrypted:", decrypted);

    let data;
    try {
      data = JSON.parse(decrypted);
    } catch (e) {
      return res.status(400).send("❌ 解密內容不是有效的 JSON");
    }

    const result = data.Result || {};
    const orderNo = result.MerchantOrderNo;
    if (!orderNo) return res.status(400).send("❌ 缺少 MerchantOrderNo");

    console.log("📦 訂單編號:", orderNo);

    // 查 WooCommerce 訂單
    const orderRes = await axios.get(WC_API_URL, {
      auth: { username: WC_KEY, password: WC_SECRET },
      params: { search: orderNo, per_page: 5 },
    });

    const orders = orderRes.data;
    const order = orders.find(o =>
      o.meta_data?.some(meta => meta.key === "newebpay_order_no" && meta.value === orderNo)
    );

    if (!order) return res.status(404).send("❌ 查無訂單");

    const getMeta = key => {
      const found = order.meta_data?.find(m => m.key === key);
      return found ? found.value : null;
    };

    const planId = getMeta("esim_plan_id");
    const quantity = getMeta("esim_number") || 1;

    if (!planId) return res.status(400).send("❌ 無 planId");

    console.log("📩 Incoming body:", { planId, quantity });

    // 呼叫 eSIM proxy 建立訂單
    const esimRes = await axios.post(ESIM_PROXY_URL, {
      planId,
      quantity,
    });

    const { qrcode } = esimRes.data;

    // 寫入 WooCommerce 訂單備註與 QRCode
    await axios.put(
      `${WC_API_URL}/${order.id}`,
      {
        meta_data: [{ key: "esim_qrcode", value: qrcode }],
        customer_note: `🎉 感謝訂購！以下為 QRCode：\n${qrcode}`,
      },
      {
        auth: { username: WC_KEY, password: WC_SECRET },
      }
    );

    console.log(`✅ 訂單 ${order.id} 已更新並寫入 eSIM QRCode`);
    return res.status(200).send("✅ Notify 處理完成");
  } catch (err) {
    console.error("❌ Notify 處理失敗", err);
    return res.status(500).send("Notify 處理錯誤");
  }
});

export default router;
