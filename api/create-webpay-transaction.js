import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.SITE_URL;
    const tbkApiKeyId = process.env.TBK_API_KEY_ID;
    const tbkApiKeySecret = process.env.TBK_API_KEY_SECRET;
    const tbkBaseUrl = process.env.TBK_BASE_URL || "https://webpay3gint.transbank.cl";

    if (!supabaseUrl || !supabaseServiceRoleKey || !siteUrl || !tbkApiKeyId || !tbkApiKeySecret) {
        return res.status(500).json({ error: "Missing Webpay or Supabase server configuration." });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
        return res.status(401).json({ error: "Missing auth token." });
    }

    const { bookingId, gatewayId } = req.body || {};
    if (!bookingId || !gatewayId) {
        return res.status(400).json({ error: "bookingId and gatewayId are required." });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
        return res.status(401).json({ error: "Invalid session." });
    }

    const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, pnr, user_id, currency, total_amount, status, flights:flight_id(origin, destination)")
        .eq("id", bookingId)
        .eq("user_id", userData.user.id)
        .single();

    if (bookingError || !booking) {
        return res.status(404).json({ error: "Booking not found." });
    }

    if (booking.currency !== "CLP") {
        return res.status(400).json({ error: "Webpay is enabled only for CLP bookings." });
    }

    const route = booking.flights?.origin && booking.flights?.destination
        ? `${booking.flights.origin}-${booking.flights.destination}`
        : `BOOKING-${booking.id}`;
    const buyOrder = `WB${booking.id.replace(/-/g, "").slice(0, 24).toUpperCase()}`;
    const sessionId = booking.id;
    const amount = Math.round(Number(booking.total_amount));
    const returnUrl = `${siteUrl}/api/webpay-return`;

    const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
            booking_id: booking.id,
            provider: gatewayId,
            amount: Number(booking.total_amount),
            currency: booking.currency,
            status: "checkout_created",
            reference: buyOrder
        })
        .select("id")
        .single();

    if (paymentError || !payment) {
        return res.status(500).json({ error: paymentError?.message || "Could not create payment record." });
    }

    const webpayResponse = await fetch(`${tbkBaseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "Tbk-Api-Key-Id": tbkApiKeyId,
            "Tbk-Api-Key-Secret": tbkApiKeySecret
        },
        body: JSON.stringify({
            buy_order: buyOrder,
            session_id: sessionId,
            amount,
            return_url: returnUrl
        })
    });

    const payload = await webpayResponse.json();
    if (!webpayResponse.ok) {
        return res.status(500).json({ error: payload.error_message || payload.message || "No se pudo crear la transaccion en Webpay." });
    }

    await supabase
        .from("payments")
        .update({
            reference: payload.token,
            status: "checkout_opened"
        })
        .eq("id", payment.id);

    return res.status(200).json({
        token: payload.token,
        url: payload.url,
        buyOrder,
        paymentId: payment.id,
        route
    });
}
