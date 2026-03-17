import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function json(response, status = 200) {
    return new Response(JSON.stringify(response), {
        status,
        headers: { "content-type": "application/json" }
    });
}

async function readRawBody(request) {
    return Buffer.from(await request.arrayBuffer());
}

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

export default async function handler(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
        return json({ error: "Missing Stripe webhook configuration." }, 500);
    }

    const stripe = new Stripe(stripeSecretKey);
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return json({ error: "Missing Stripe signature." }, 400);
    }

    let event;

    try {
        const rawBody = await readRawBody(request);
        event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
    } catch (error) {
        return json({ error: `Webhook signature verification failed. ${error.message}` }, 400);
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

    return json({ received: true });
}
