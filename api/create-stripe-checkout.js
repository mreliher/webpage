import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripePaymentMethods(gatewayId) {
    if (gatewayId === "stripe_ach") {
        return ["us_bank_account"];
    }

    return ["card"];
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.SITE_URL;

    if (!stripeSecretKey || !supabaseUrl || !supabaseServiceRoleKey || !siteUrl) {
        return res.status(500).json({ error: "Missing Stripe or Supabase server configuration." });
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
        return res.status(400).json({ error: "Stripe is enabled only for USD bookings." });
    }

    const stripe = new Stripe(stripeSecretKey);
    const route = booking.flights?.origin && booking.flights?.destination
        ? `${booking.flights.origin}-${booking.flights.destination}`
        : `BOOKING-${booking.id}`;

    const amountUsd = Number(booking.total_amount);
    const paymentReference = `STRIPE-${booking.id.slice(0, 8).toUpperCase()}`;

    const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
            booking_id: booking.id,
            provider: gatewayId,
            amount: amountUsd,
            currency: booking.currency,
            status: "checkout_created",
            reference: paymentReference
        })
        .select("id")
        .single();

    if (paymentError || !payment) {
        return res.status(500).json({ error: paymentError?.message || "Could not create payment record." });
    }

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: getStripePaymentMethods(gatewayId),
        customer_email: userData.user.email || undefined,
        success_url: `${siteUrl}/?checkout=success&booking_id=${booking.id}`,
        cancel_url: `${siteUrl}/?checkout=cancel&booking_id=${booking.id}`,
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: "usd",
                    unit_amount: Math.round(amountUsd * 100),
                    product_data: {
                        name: `Reserva ${route}`,
                        description: `PNR ${booking.pnr || "PENDIENTE"} - Aeroturpial`
                    }
                }
            }
        ],
        metadata: {
            booking_id: booking.id,
            payment_id: payment.id,
            gateway_id: gatewayId,
            pnr: booking.pnr || ""
        },
        payment_intent_data: {
            metadata: {
                booking_id: booking.id,
                payment_id: payment.id,
                gateway_id: gatewayId,
                pnr: booking.pnr || ""
            }
        }
    });

    await supabase
        .from("payments")
        .update({
            reference: session.id,
            status: "checkout_opened"
        })
        .eq("id", payment.id);

    return res.status(200).json({
        url: session.url,
        sessionId: session.id,
        paymentId: payment.id
    });
}
