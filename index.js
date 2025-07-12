// ✅ 建立 eSIM 訂單並查詢 QRCode
app.post("/esim/qrcode", async (req, res) => {
  console.log("📥 來自前端的資料:", req.body);

  const { planKey, channel_dataplan_id: rawId, planId, number } = req.body;
  const count = parseInt(number) || 1;

  // ✅ 三種來源都考慮，優先順序為 planKey > rawId > planId
  const resolvedPlanId = PLAN_ID_MAP[planKey] || rawId || planId;

  console.log("📦 對應出的 channel_dataplan_id:", resolvedPlanId);

  if (!resolvedPlanId || !count) {
    return res.status(400).json({ error: "缺少必要欄位 channel_dataplan_id 或 number" });
  }

  const { timestamp, nonce, signature } = SIGN_HEADERS();

  const form = new FormData();
  form.append("number", count);
  form.append("channel_dataplan_id", resolvedPlanId);
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
      `${BASE_URL}/allesim/v1/esimSubscribe`,
      form,
      { headers, timeout: 10000 }
    );

    const result = response.data;
    console.log("📥 建立訂單結果:", result);

    if (result.code === 1 && result.result?.topup_id) {
      const topup_id = result.result.topup_id;

      const { timestamp, nonce, signature } = SIGN_HEADERS();
      const form2 = new FormData();
      form2.append("topup_id", topup_id);

      const detailRes = await axios.post(
        `${BASE_URL}/allesim/v1/topupDetail`,
        form2,
        {
          headers: {
            ...form2.getHeaders(),
            "MICROESIM-ACCOUNT": ACCOUNT,
            "MICROESIM-NONCE": nonce,
            "MICROESIM-TIMESTAMP": timestamp,
            "MICROESIM-SIGN": signature,
          },
          timeout: 10000,
        }
      );

      const detail = detailRes.data;
      console.log("📥 查詢 QRCode 結果:", detail);

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
    console.error("❌ 建立訂單錯誤:", err.message);
    if (err.response) {
      return res.status(err.response.status).json({
        error: "MicroeSIM 錯誤",
        detail: err.response.data,
      });
    }
    return res.status(500).json({ error: "伺服器錯誤", detail: err.message });
  }
});
