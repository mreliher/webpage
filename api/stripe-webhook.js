import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

async function markPaymentAndBooking(supabase, paymentId, bookingId, paymentStatus, bookingStatus, reference) {
    if (paymentId) {
        await supabase
            .from("payments")
            .update({
                status: paymentStatus,
                reference
            })
            .eq("id", paymentId);
    }

    if (bookingId && bookingStatus) {
        await supabase
            .from("bookings")
            .update({ status: bookingStatus })
            .eq("id", bookingId);
    }
}

export const config = {
    api: {
        bodyParser: false
    }
};

async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(500).json({ error: "Missing Stripe webhook configuration." });
    }

    const stripe = new Stripe(stripeSecretKey);
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const signature = req.headers["stripe-signature"];

    if (!signature) {
        return res.status(400).json({ error: "Missing Stripe signature." });
    }

    let event;

    try {
        const rawBody = await readRawBody(req);
        event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
    } catch (error) {
        return res.status(400).json({ error: `Webhook signature verification failed. ${error.message}` });
    }

    const session = event.data.object;
    const bookingId = session.metadata?.booking_id || null;
    const paymentId = session.metadata?.payment_id || null;
    const reference = session.id || session.payment_intent || session.metadata?.payment_id || "";

    switch (event.type) {
        case "checkout.session.completed":
            await markPaymentAndBooking(
                supabase,
                paymentId,
                bookingId,
                session.payment_status === "paid" ? "paid" : "processing",
                session.payment_status === "paid" ? "confirmed" : "payment_processing",
                reference
            );
            break;
        case "checkout.session.async_payment_succeeded":
            await markPaymentAndBooking(supabase, paymentId, bookingId, "paid", "confirmed", reference);
            break;
        case "checkout.session.async_payment_failed":
            await markPaymentAndBooking(supabase, paymentId, bookingId, "failed", "pending", reference);
            break;
        case "checkout.session.expired":
            await markPaymentAndBooking(supabase, paymentId, bookingId, "expired", "pending", reference);
            break;
        default:
            break;
    }

    return res.status(200).json({ received: true });
}
