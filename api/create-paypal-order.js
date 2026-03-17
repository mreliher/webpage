import { createClient } from "@supabase/supabase-js";

async function getPayPalAccessToken(clientId, clientSecret, baseUrl) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            authorization: `Basic ${credentials}`,
            "content-type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error_description || payload.error || "No se pudo autenticar con PayPal.");
    }

    return payload.access_token;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.SITE_URL;
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const paypalBaseUrl = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

    if (!supabaseUrl || !supabaseServiceRoleKey || !siteUrl || !paypalClientId || !paypalClientSecret) {
        return res.status(500).json({ error: "Missing PayPal or Supabase server configuration." });
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

    if (booking.currency !== "USD") {
        return res.status(400).json({ error: "PayPal is enabled only for USD bookings." });
    }

    const amountUsd = Number(booking.total_amount).toFixed(2);
    const route = booking.flights?.origin && booking.flights?.destination
        ? `${booking.flights.origin}-${booking.flights.destination}`
        : `BOOKING-${booking.id}`;
    const paymentReference = `PAYPAL-${booking.id.slice(0, 8).toUpperCase()}`;

    const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
            booking_id: booking.id,
            provider: gatewayId,
            amount: Number(booking.total_amount),
            currency: booking.currency,
            status: "checkout_created",
            reference: paymentReference
        })
        .select("id")
        .single();

    if (paymentError || !payment) {
        return res.status(500).json({ error: paymentError?.message || "Could not create payment record." });
    }

    try {
        const accessToken = await getPayPalAccessToken(paypalClientId, paypalClientSecret, paypalBaseUrl);

        const orderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${accessToken}`,
                "content-type": "application/json",
                "paypal-request-id": `${booking.id}-${Date.now()}`
            },
            body: JSON.stringify({
                intent: "CAPTURE",
                purchase_units: [
                    {
                        reference_id: booking.id,
                        description: `Reserva ${route} - PNR ${booking.pnr || ""}`.trim(),
                        amount: {
                            currency_code: "USD",
                            value: amountUsd
                        }
                    }
                ],
                application_context: {
                    return_url: `${siteUrl}/?paypal=success&booking_id=${booking.id}`,
                    cancel_url: `${siteUrl}/?paypal=cancel&booking_id=${booking.id}`,
                    brand_name: "Aeroparaguana",
                    user_action: "PAY_NOW"
                }
            })
        });

        const orderPayload = await orderResponse.json();
        if (!orderResponse.ok) {
            return res.status(500).json({ error: orderPayload.message || "No se pudo crear la orden de PayPal." });
        }

        const approvalUrl = (orderPayload.links || []).find((link) => link.rel === "approve")?.href;
        if (!approvalUrl) {
            return res.status(500).json({ error: "PayPal no devolvio una URL de aprobacion." });
        }

        await supabase
            .from("payments")
            .update({
                reference: orderPayload.id,
                status: "checkout_opened"
            })
            .eq("id", payment.id);

        return res.status(200).json({
            orderId: orderPayload.id,
            approvalUrl,
            paymentId: payment.id
        });
    } catch (error) {
        return res.status(500).json({ error: error.message || "No se pudo iniciar PayPal." });
    }
}
