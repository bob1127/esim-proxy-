import express from "express";
import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";

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

// eSIM
const ESIM_PROXY_URL = "https://esim-proxy-production.up.railway.app/esim/qrcode";

// 藍新解密
function aesDecrypt(encryptedText: string, key: string, iv: string) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Notify 處理邏輯
router.post("/notify", async (req, res) => {
  try {
    const { TradeInfo } = req.body;
    if (!TradeInfo) return res.status(400).send("Missing TradeInfo");

    const decrypted = aesDecrypt(TradeInfo, HASH_KEY, HASH_IV);
    const parsed = new URLSearchParams(decrypted);
    const data: Record<string, string> = {};
    parsed.forEach((value, key) => (data[key] = value));

    const orderNo = data.MerchantOrderNo;
    if (!orderNo) return res.status(400).send("Missing MerchantOrderNo");

    // 查詢 WooCommerce 訂單
    const orderRes = await axios.get(WC_API_URL, {
      auth: { username: WC_KEY, password: WC_SECRET },
      params: { search: orderNo, per_page: 5 },
    });

    const order = orderRes.data.find((o: any) =>
      o.meta_data?.some(
        (meta: any) => meta.key === "newebpay_order_no" && meta.value === orderNo
      )
    );
    if (!order) return res.status(404).send("Order not found");

    const getMeta = (key: string) =>
      order.meta_data?.find((m: any) => m.key === key)?.value;

    const planId = getMeta("esim_plan_id");
    const quantity = getMeta("esim_number") || 1;

    if (!planId) return res.status(400).send("Missing esim_plan_id");

    // 呼叫 /esim/qrcode 建立訂單並取得 QRCode
    const esimRes = await axios.post(ESIM_PROXY_URL, {
      planId,
      quantity,
    });

    const { qrcode } = esimRes.data;

    // 寫入訂單 meta 與備註
    await axios.put(
      `${WC_API_URL}/${order.id}`,
      {
        meta_data: [
          { key: "esim_qrcode", value: qrcode },
        ],
        customer_note: `🎉 感謝訂購！以下為 QRCode：\n${qrcode}`,
      },
      {
        auth: { username: WC_KEY, password: WC_SECRET },
      }
    );

    return res.status(200).send("✅ Notify 處理完成");
  } catch (err) {
    console.error("❌ Notify 處理失敗", err);
    return res.status(500).send("Notify 處理錯誤");
  }
});

export default router;
