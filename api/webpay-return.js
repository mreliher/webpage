import { createClient } from "@supabase/supabase-js";

function buildHtml(message) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webpay retorno</title>
  <style>
    body { font-family: Arial, sans-serif; background:#f4f7fb; color:#173b6b; margin:0; padding:2rem; }
    .card { max-width:720px; margin:4rem auto; background:#fff; border:1px solid #d8e2f0; border-radius:16px; padding:1.5rem; box-shadow:0 18px 40px rgba(17,39,67,.12); }
    a { color:#1e7fd1; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <div class="card">${message}</div>
</body>
</html>`;
}

export default async function handler(req, res) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const tbkApiKeyId = process.env.TBK_API_KEY_ID;
    const tbkApiKeySecret = process.env.TBK_API_KEY_SECRET;
    const tbkBaseUrl = process.env.TBK_BASE_URL || "https://webpay3gint.transbank.cl";
    const siteUrl = process.env.SITE_URL;

    if (!supabaseUrl || !supabaseServiceRoleKey || !tbkApiKeyId || !tbkApiKeySecret || !siteUrl) {
        return res.status(500).send(buildHtml("<h1>Configuracion incompleta</h1><p>Faltan variables de Webpay o Supabase.</p>"));
    }

    const tokenWs = req.method === "POST" ? req.body?.token_ws : req.query?.token_ws;
    if (!tokenWs) {
        return res.status(400).send(buildHtml(`<h1>Retorno invalido</h1><p>No llego token_ws desde Webpay.</p><p><a href="${siteUrl}">Volver al sitio</a></p>`));
    }

    const commitResponse = await fetch(`${tbkBaseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions/${tokenWs}`, {
        method: "PUT",
        headers: {
            "content-type": "application/json",
            "Tbk-Api-Key-Id": tbkApiKeyId,
            "Tbk-Api-Key-Secret": tbkApiKeySecret
        }
    });

    const payload = await commitResponse.json();
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: payment } = await supabase
        .from("payments")
        .select("id, booking_id")
        .eq("reference", tokenWs)
        .single();

    const paymentId = payment?.id || null;
    const bookingId = payment?.booking_id || null;
    const success = commitResponse.ok && payload.status === "AUTHORIZED" && payload.response_code === 0;

    if (paymentId) {
        await supabase
            .from("payments")
            .update({
                status: success ? "paid" : "failed",
                reference: tokenWs
            })
            .eq("id", paymentId);
    }

    if (bookingId) {
        await supabase
            .from("bookings")
            .update({
                status: success ? "confirmed" : "pending"
            })
            .eq("id", bookingId);
    }

    if (success) {
        return res.status(200).send(buildHtml(`<h1>Pago confirmado</h1><p>Webpay autorizo correctamente la transaccion.</p><p><a href="${siteUrl}?webpay=success&booking_id=${bookingId || ""}">Volver a Aeroparaguana</a></p>`));
    }

    return res.status(200).send(buildHtml(`<h1>Pago no confirmado</h1><p>Webpay no autorizo la transaccion.</p><pre>${JSON.stringify(payload, null, 2)}</pre><p><a href="${siteUrl}?webpay=cancel&booking_id=${bookingId || ""}">Volver a Aeroparaguana</a></p>`));
}
