const SERVICES = [
    {
        id: "fbo-vip",
        name: "FBO y sala VIP",
        description: "Atencion en rampa, lounge y coordinacion de pasajeros.",
        baseUSD: 320
    },
    {
        id: "permits",
        name: "Permisos y sobrevuelo",
        description: "Gestion documental y soporte operativo de autorizaciones.",
        baseUSD: 210
    },
    {
        id: "fuel-assist",
        name: "Coordinacion de combustible",
        description: "Apoyo logistico para proveedor y tiempos de despacho.",
        baseUSD: 180
    },
    {
        id: "crew-support",
        name: "Soporte a tripulacion",
        description: "Hoteleria, traslado y catering para crew.",
        baseUSD: 140
    }
];

const EXCHANGE_RATES = {
    USD: 1,
    VES: 81.5,
    CLP: 980
};

const appConfig = window.APP_CONFIG || {
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: ""
};

const hasSupabaseConfig = Boolean(
    window.supabase &&
    appConfig.SUPABASE_URL &&
    appConfig.SUPABASE_ANON_KEY
);

const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(appConfig.SUPABASE_URL, appConfig.SUPABASE_ANON_KEY)
    : null;

const AIRPORTS = [
    { code: "LSP", city: "Las Piedras" },
    { code: "CCS", city: "Caracas" },
    { code: "CUR", city: "Curazao" }
];

const ROUTE_PRICES_USD = {
    "LSP-CCS": 95,
    "CCS-LSP": 95,
    "LSP-CUR": 145,
    "CUR-LSP": 145
};

const PAYMENT_GATEWAYS = {
    USD: [
        {
            id: "stripe_card",
            provider: "stripe",
            label: "Stripe Checkout",
            description: "Tarjetas internacionales y checkout web en dolares."
        },
        {
            id: "stripe_ach",
            provider: "stripe_ach",
            label: "ACH Estados Unidos",
            description: "Debito bancario para cuentas estadounidenses."
        }
    ],
    CLP: [
        {
            id: "webpay_plus",
            provider: "webpay_plus",
            label: "Webpay Plus",
            description: "Pasarela recomendada para Chile con Transbank."
        }
    ],
    VES: [
        {
            id: "mercantil",
            provider: "mercantil",
            label: "Mercantil",
            description: "Boton de pago local para recaudo en Venezuela."
        },
        {
            id: "banesco",
            provider: "banesco",
            label: "BanescoPagos",
            description: "Alternativa local para cobro en bolivares."
        }
    ]
};

const state = {
    editMode: false,
    flights: [],
    session: null,
    myBookings: [],
    checkoutBookingId: null,
    selectedGatewayId: null
};

const servicesGrid = document.getElementById("services-grid");
const serviceSelect = document.getElementById("service-select");
const paymentForm = document.getElementById("payment-form");
const paymentSummary = document.getElementById("payment-summary");
const authButton = document.getElementById("auth-btn");
const registerButton = document.getElementById("register-btn");
const authStatus = document.getElementById("auth-status");
const authModal = document.getElementById("auth-modal");
const closeAuthButton = document.getElementById("close-auth");
const authForm = document.getElementById("auth-form");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authMessage = document.getElementById("auth-message");
const signUpButton = document.getElementById("signup-btn");
const signInButton = document.getElementById("signin-btn");

const bookingForm = document.getElementById("booking-form");
const bookingSummary = document.getElementById("booking-summary");
const myBookingsList = document.getElementById("my-bookings-list");
const originSelect = document.getElementById("booking-origin");
const destinationSelect = document.getElementById("booking-destination");
const departInput = document.getElementById("booking-depart");
const returnInput = document.getElementById("booking-return");
const passengerSelect = document.getElementById("booking-passengers");
const bookingCurrency = document.getElementById("booking-currency");
const checkoutModal = document.getElementById("checkout-modal");
const checkoutBookingInfo = document.getElementById("checkout-booking-info");
const checkoutGatewayList = document.getElementById("checkout-gateway-list");
const checkoutMessage = document.getElementById("checkout-message");
const checkoutConfirmButton = document.getElementById("checkout-confirm");
const closeCheckoutButton = document.getElementById("close-checkout");
let authMode = "signin";
const OPERATING_AIRLINE = "Aeroturpial";

function formatCurrency(amount, currency) {
    const locales = {
        USD: "en-US",
        VES: "es-VE",
        CLP: "es-CL"
    };

    return new Intl.NumberFormat(locales[currency], {
        style: "currency",
        currency
    }).format(amount);
}

function buildPnrFromBooking(booking) {
    if (booking.pnr) {
        return String(booking.pnr).toUpperCase().slice(0, 6);
    }

    const source = String(booking.id || booking.flight_id || "AER000")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();

    return (source + "AER123").slice(0, 6);
}

function generatePnr() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let index = 0; index < 6; index += 1) {
        const randomPosition = Math.floor(Math.random() * alphabet.length);
        result += alphabet[randomPosition];
    }
    return result;
}

function generatePaymentReference() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "PAY-";
    for (let index = 0; index < 8; index += 1) {
        const randomPosition = Math.floor(Math.random() * alphabet.length);
        result += alphabet[randomPosition];
    }
    return result;
}

function getGatewayOptions(currency) {
    return PAYMENT_GATEWAYS[currency] || [];
}

function renderServices() {
    servicesGrid.innerHTML = SERVICES.map((service) => `
        <article class="service-card">
            <h3>${service.name}</h3>
            <p>${service.description}</p>
            <div class="service-price">Desde ${formatCurrency(service.baseUSD, "USD")}</div>
        </article>
    `).join("");
}

function renderServiceSelect() {
    serviceSelect.innerHTML = SERVICES.map((service) => `
        <option value="${service.id}">${service.name}</option>
    `).join("");
}

function renderAirportOptions() {
    const sourceAirports = state.flights.length > 0
        ? Array.from(
            new Map(
                state.flights.flatMap((flight) => [
                    [flight.origin, flight.origin],
                    [flight.destination, flight.destination]
                ])
            ).keys()
        ).map((code) => AIRPORTS.find((airport) => airport.code === code) || { code, city: code })
        : AIRPORTS;

    const options = sourceAirports.map((airport) => `
        <option value="${airport.code}">${airport.city} (${airport.code})</option>
    `).join("");

    originSelect.innerHTML = `<option value="">Selecciona origen</option>${options}`;
    destinationSelect.innerHTML = `<option value="">Selecciona destino</option>${options}`;
}

function routeKey(origin, destination) {
    return `${origin}-${destination}`;
}

function getRoutePriceUSD(origin, destination) {
    const dbFlight = state.flights.find((flight) => flight.origin === origin && flight.destination === destination);
    if (dbFlight) {
        return Number(dbFlight.price_usd);
    }

    return ROUTE_PRICES_USD[routeKey(origin, destination)];
}

function validateRoute(origin, destination) {
    return Boolean(getRoutePriceUSD(origin, destination));
}

function openAuthModal() {
    authModal.classList.remove("hidden");
    authModal.setAttribute("aria-hidden", "false");
    setAuthMessage(authMode === "signup" ? "Completa tus datos para crear tu cuenta." : "Inicia sesion para continuar.");
}

function closeAuthModal() {
    authModal.classList.add("hidden");
    authModal.setAttribute("aria-hidden", "true");
}

function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.style.color = isError ? "#c5334d" : "#315578";
}

function setUserUI(session) {
    state.session = session || null;

    if (state.session?.user?.email) {
        authStatus.textContent = state.session.user.email;
        authButton.textContent = "Cerrar sesion";
        registerButton.style.display = "none";
        return;
    }

    authStatus.textContent = "Sin sesion";
    authButton.textContent = "Iniciar sesion";
    registerButton.style.display = "inline-flex";
}

function renderMyBookings(bookings) {
    if (!state.session?.user?.id) {
        myBookingsList.innerHTML = '<div class="empty-bookings">Inicia sesion para ver tus reservas.</div>';
        return;
    }

    if (!bookings || bookings.length === 0) {
        myBookingsList.innerHTML = '<div class="empty-bookings">Todavia no tienes reservas guardadas.</div>';
        return;
    }

    myBookingsList.innerHTML = bookings.map((booking) => {
        const flight = booking.flights || {};
        const pnr = buildPnrFromBooking(booking);
        const route = flight.origin && flight.destination
            ? `${flight.origin} -> ${flight.destination}`
            : `Vuelo ${booking.flight_id}`;
        const departure = flight.departure_at
            ? String(flight.departure_at).slice(0, 16).replace("T", " ")
            : "Sin fecha";

        return `
            <article class="booking-item-card">
                <h3>${route}</h3>
                <div class="booking-meta">
                    PNR: ${pnr}<br>
                    Aerolinea operadora: ${OPERATING_AIRLINE}<br>
                    Fecha salida: ${departure}<br>
                    Pasajeros: ${booking.passengers}<br>
                    Total: ${formatCurrency(Number(booking.total_amount), booking.currency)}
                </div>
                <div class="booking-card-actions">
                    ${booking.status === "pending" ? `<button class="booking-pay-btn" type="button" data-booking-id="${booking.id}">Pagar ahora</button>` : ""}
                </div>
                <span class="booking-status">${booking.status}</span>
            </article>
        `;
    }).join("");
}
function findMatchingFlight(origin, destination, departDate) {
    return state.flights.find((flight) => {
        const departureDate = String(flight.departure_at || "").slice(0, 10);
        return flight.origin === origin && flight.destination === destination && departureDate === departDate;
    });
}

async function loadFlightsFromSupabase() {
    if (!supabaseClient) {
        bookingSummary.innerHTML = "Modo demo activo. Agrega tu Project URL y Publishable key en config.js para leer vuelos reales desde Supabase.";
        return;
    }

    bookingSummary.innerHTML = "Consultando vuelos disponibles...";

    const { data, error } = await supabaseClient
        .from("flights")
        .select("id, origin, destination, departure_at, arrival_at, seats_total, seats_available, price_usd, status")
        .eq("status", "scheduled")
        .order("departure_at", { ascending: true });

    if (error) {
        bookingSummary.innerHTML = `<strong>Error:</strong> no se pudo leer la tabla flights en Supabase. ${error.message}`;
        return;
    }

    state.flights = data || [];
    renderAirportOptions();

    if (state.flights.length === 0) {
        bookingSummary.innerHTML = "No hay vuelos cargados todavia en Supabase. Inserta registros en la tabla flights para visualizarlos aqui.";
        return;
    }

    bookingSummary.innerHTML = `${state.flights.length} vuelo(s) cargado(s) desde Supabase. Selecciona origen, destino y fecha para consultar disponibilidad.`;
}

async function loadCurrentSession() {
    if (!supabaseClient) {
        return;
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        setAuthMessage(`No se pudo consultar la sesion. ${error.message}`, true);
        return;
    }

    setUserUI(data.session);
}

async function loadMyBookings() {
    if (!supabaseClient || !state.session?.user?.id) {
        state.myBookings = [];
        renderMyBookings([]);
        return;
    }

    const { data, error } = await supabaseClient
        .from("bookings")
        .select("id, pnr, flight_id, passengers, currency, total_amount, status, flights:flight_id(origin, destination, departure_at)")
        .eq("user_id", state.session.user.id)
        .order("created_at", { ascending: false });

    if (error) {
        myBookingsList.innerHTML = `<div class="empty-bookings">No se pudieron cargar tus reservas. ${error.message}</div>`;
        return;
    }

    state.myBookings = data || [];
    renderMyBookings(state.myBookings);
}

async function signUpWithEmail() {
    if (!supabaseClient) {
        setAuthMessage("Primero completa config.js con tu Project URL y Publishable key.", true);
        return;
    }

    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    const { error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        setAuthMessage(error.message, true);
        return;
    }

    setAuthMessage("Cuenta creada. Si tu proyecto exige confirmacion por correo, revisa tu email.");
}

async function signInWithEmail() {
    if (!supabaseClient) {
        setAuthMessage("Primero completa config.js con tu Project URL y Publishable key.", true);
        return;
    }

    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        setAuthMessage(error.message, true);
        return;
    }

    setUserUI(data.session);
    setAuthMessage("Sesion iniciada correctamente.");
    authForm.reset();
    await loadMyBookings();
    window.setTimeout(closeAuthModal, 400);
}

async function signOutCurrentUser() {
    if (!supabaseClient) {
        return;
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        setAuthMessage(error.message, true);
        return;
    }

    setUserUI(null);
    setAuthMessage("");
    renderMyBookings([]);
}

function setAuthMode(mode) {
    authMode = mode;
    signUpButton.style.opacity = mode === "signup" ? "1" : "0.82";
    signInButton.style.opacity = mode === "signin" ? "1" : "0.82";
}

function buildBookingRows({ flightsToBook, passengers, currency, totalUSD }) {
    const amountPerSegmentUSD = totalUSD / flightsToBook.length;
    return flightsToBook.map((flight) => ({
        pnr: generatePnr(),
        user_id: state.session.user.id,
        flight_id: flight.id,
        passengers,
        currency,
        total_amount: currency === "USD" ? amountPerSegmentUSD : amountPerSegmentUSD * EXCHANGE_RATES[currency],
        status: "pending"
    }));
}

async function saveBookingsToSupabase(payload) {
    if (!supabaseClient || !state.session?.user?.id) {
        throw new Error("Debes iniciar sesion para guardar la reserva en bookings.");
    }

    const { data, error } = await supabaseClient
        .from("bookings")
        .insert(payload)
        .select("id, pnr, flight_id, total_amount, currency, status");

    if (error) {
        throw error;
    }

    return data || [];
}

function setCheckoutMessage(message, isError = false) {
    checkoutMessage.textContent = message;
    checkoutMessage.style.color = isError ? "#c5334d" : "#315578";
}

function closeCheckoutModal() {
    checkoutModal.classList.add("hidden");
    checkoutModal.setAttribute("aria-hidden", "true");
    state.checkoutBookingId = null;
    state.selectedGatewayId = null;
    checkoutBookingInfo.innerHTML = "";
    checkoutGatewayList.innerHTML = "";
    setCheckoutMessage("");
}

function renderCheckoutGateways(booking) {
    const gateways = getGatewayOptions(booking.currency);

    if (gateways.length === 0) {
        checkoutGatewayList.innerHTML = '<div class="empty-bookings">No hay pasarelas configuradas para esta moneda.</div>';
        state.selectedGatewayId = null;
        return;
    }

    if (!state.selectedGatewayId || !gateways.some((gateway) => gateway.id === state.selectedGatewayId)) {
        state.selectedGatewayId = gateways[0].id;
    }

    checkoutGatewayList.innerHTML = gateways.map((gateway) => `
        <article class="checkout-gateway ${gateway.id === state.selectedGatewayId ? "active" : ""}" data-gateway-id="${gateway.id}">
            <h3>${gateway.label}</h3>
            <p>${gateway.description}</p>
        </article>
    `).join("");
}

function openCheckoutModal(bookingId) {
    const booking = state.myBookings.find((item) => item.id === bookingId);
    if (!booking) {
        return;
    }

    state.checkoutBookingId = booking.id;
    const route = booking.flights?.origin && booking.flights?.destination
        ? `${booking.flights.origin} -> ${booking.flights.destination}`
        : `Vuelo ${booking.flight_id}`;

    checkoutBookingInfo.innerHTML = `
        <strong>Reserva:</strong> ${route}<br>
        <strong>PNR:</strong> ${buildPnrFromBooking(booking)}<br>
        <strong>Aerolinea operadora:</strong> ${OPERATING_AIRLINE}<br>
        <strong>Total:</strong> ${formatCurrency(Number(booking.total_amount), booking.currency)}<br>
        <strong>Estado actual:</strong> ${booking.status}
    `;

    renderCheckoutGateways(booking);
    setCheckoutMessage("Selecciona una pasarela y registra el intento de pago.");
    checkoutModal.classList.remove("hidden");
    checkoutModal.setAttribute("aria-hidden", "false");
}

async function createPaymentAttempt(booking, gateway) {
    if (!supabaseClient || !state.session?.user?.id) {
        throw new Error("Debes iniciar sesion para iniciar pagos.");
    }

    const { data, error } = await supabaseClient
        .from("payments")
        .insert({
            booking_id: booking.id,
            provider: gateway.provider,
            amount: Number(booking.total_amount),
            currency: booking.currency,
            status: "created",
            reference: generatePaymentReference()
        })
        .select("id, provider, amount, currency, status, reference")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function handleCheckoutConfirm() {
    if (!state.checkoutBookingId) {
        setCheckoutMessage("Selecciona una reserva valida.", true);
        return;
    }

    const booking = state.myBookings.find((item) => item.id === state.checkoutBookingId);
    if (!booking) {
        setCheckoutMessage("No se encontro la reserva seleccionada.", true);
        return;
    }

    const gateway = getGatewayOptions(booking.currency).find((item) => item.id === state.selectedGatewayId);
    if (!gateway) {
        setCheckoutMessage("Debes seleccionar una pasarela.", true);
        return;
    }

    checkoutConfirmButton.disabled = true;
    setCheckoutMessage("Registrando intento de pago en Supabase...");

    try {
        const payment = await createPaymentAttempt(booking, gateway);
        setCheckoutMessage(`Intento de pago creado. Referencia ${payment.reference}. Pasarela objetivo: ${gateway.label}. Para cobro real, el siguiente paso es redirigir desde backend y confirmar el resultado por webhook.`);
    } catch (error) {
        setCheckoutMessage(`No se pudo registrar el pago. ${error.message}`, true);
    } finally {
        checkoutConfirmButton.disabled = false;
    }
}

async function handleBookingSubmit(event) {
    event.preventDefault();

    const tripType = document.querySelector("input[name='trip-type']:checked").value;
    const origin = originSelect.value;
    const destination = destinationSelect.value;
    const depart = departInput.value;
    const returnDate = returnInput.value;
    const passengers = Number(passengerSelect.value);
    const currency = bookingCurrency.value;

    if (!origin || !destination || !depart || passengers < 1) {
        bookingSummary.innerHTML = "<strong>Error:</strong> completa los datos del vuelo.";
        return;
    }

    if (origin === destination) {
        bookingSummary.innerHTML = "<strong>Error:</strong> origen y destino no pueden ser iguales.";
        return;
    }

    if (!validateRoute(origin, destination)) {
        bookingSummary.innerHTML = "<strong>Error:</strong> ruta no disponible. Solo: Las Piedras-Caracas y Las Piedras-Curazao (ida y vuelta).";
        return;
    }

    const outboundFlight = findMatchingFlight(origin, destination, depart);
    if (state.flights.length > 0 && !outboundFlight) {
        bookingSummary.innerHTML = "<strong>Error:</strong> no hay un vuelo cargado en Supabase para esa fecha y ruta.";
        return;
    }

    const flightsToBook = [];
    if (outboundFlight) {
        flightsToBook.push(outboundFlight);
    }
    if (tripType === "roundtrip") {
        if (!returnDate) {
            bookingSummary.innerHTML = "<strong>Error:</strong> selecciona fecha de vuelta.";
            return;
        }
        if (returnDate < depart) {
            bookingSummary.innerHTML = "<strong>Error:</strong> la fecha de vuelta no puede ser menor que la fecha de ida.";
            return;
        }

        if (state.flights.length > 0) {
            const returnFlight = findMatchingFlight(destination, origin, returnDate);
            if (!returnFlight) {
                bookingSummary.innerHTML = "<strong>Error:</strong> no hay vuelo de regreso cargado en Supabase para esa fecha.";
                return;
            }
            flightsToBook.push(returnFlight);
        }
    }

    const oneWayUSD = getRoutePriceUSD(origin, destination) * passengers;
    const roundFactor = tripType === "roundtrip" ? 2 : 1;
    const totalUSD = oneWayUSD * roundFactor;
    const totalCurrency = totalUSD * EXCHANGE_RATES[currency];

    if (!state.session?.user?.id) {
        bookingSummary.innerHTML = `
            <strong>Reserva validada</strong><br>
            Ruta: ${origin} -> ${destination}${tripType === "roundtrip" ? " (ida y vuelta)" : " (solo ida)"}<br>
            Fecha ida: ${depart}${tripType === "roundtrip" ? `<br>Fecha vuelta: ${returnDate}` : ""}<br>
            Pasajeros: ${passengers}<br>
            Total: ${formatCurrency(totalCurrency, currency)}<br>
            Inicia sesion para guardar esta reserva en la tabla bookings.
        `;
        openAuthModal();
        setAuthMessage("Crea tu cuenta o inicia sesion para continuar.");
        return;
    }

    try {
        const insertedBookings = await saveBookingsToSupabase(
            buildBookingRows({
                flightsToBook: flightsToBook.length > 0 ? flightsToBook : [{ id: null }],
                passengers,
                currency,
                totalUSD
            })
        );

        bookingSummary.innerHTML = `
            <strong>Reserva generada</strong><br>
            Aerolinea operadora: ${OPERATING_AIRLINE}<br>
            Ruta: ${origin} -> ${destination}${tripType === "roundtrip" ? " (ida y vuelta)" : " (solo ida)"}<br>
            Fecha ida: ${depart}${tripType === "roundtrip" ? `<br>Fecha vuelta: ${returnDate}` : ""}<br>
            Pasajeros: ${passengers}<br>
            Total: ${formatCurrency(totalCurrency, currency)}<br>
            PNR generado: ${buildPnrFromBooking(insertedBookings[0] || {})}<br>
            Reservas guardadas en Supabase: ${insertedBookings.length}
        `;
        await loadMyBookings();
    } catch (error) {
        bookingSummary.innerHTML = `<strong>Error:</strong> no se pudo guardar la reserva en bookings. ${error.message}`;
    }
}

function handlePaymentSubmit(event) {
    event.preventDefault();

    const payerName = document.getElementById("payer-name").value.trim();
    const serviceId = serviceSelect.value;
    const amount = Number(document.getElementById("amount").value);
    const currency = document.getElementById("currency").value;

    if (!payerName || amount <= 0 || !EXCHANGE_RATES[currency]) {
        paymentSummary.innerHTML = "<strong>Error:</strong> verifica los datos del pago.";
        return;
    }

    const service = SERVICES.find((item) => item.id === serviceId);
    const usdAmount = currency === "USD" ? amount : amount / EXCHANGE_RATES[currency];
    const suggestedGateway = getGatewayOptions(currency)[0];

    paymentSummary.innerHTML = `
        <strong>Portal preparado</strong><br>
        Cliente: ${payerName}<br>
        Servicio: ${service ? service.name : "N/A"}<br>
        Monto ingresado: ${formatCurrency(amount, currency)}<br>
        Pasarela sugerida: ${suggestedGateway ? suggestedGateway.label : "Pendiente de configurar"}<br>
        Equivalente: ${formatCurrency(usdAmount, "USD")} | ${formatCurrency(usdAmount * EXCHANGE_RATES.VES, "VES")} | ${formatCurrency(usdAmount * EXCHANGE_RATES.CLP, "CLP")}<br>
        Nota: para cobro real de servicios sin reserva se requiere backend y conciliacion con tu proveedor de pagos.
    `;
}

function loadEditableText() {
    const saved = JSON.parse(localStorage.getItem("siteEditableText") || "{}");
    document.querySelectorAll(".editable-text").forEach((element) => {
        if (saved[element.dataset.key]) {
            element.textContent = saved[element.dataset.key];
        }
    });
}

function setupAuthUI() {
    authButton.addEventListener("click", () => {
        if (state.session?.user?.id) {
            signOutCurrentUser();
            return;
        }

        setAuthMode("signin");
        openAuthModal();
    });

    registerButton.addEventListener("click", () => {
        setAuthMode("signup");
        openAuthModal();
    });

    closeAuthButton.addEventListener("click", closeAuthModal);
    authModal.addEventListener("click", (event) => {
        if (event.target.dataset.closeAuth === "true") {
            closeAuthModal();
        }
    });

    signUpButton.addEventListener("click", signUpWithEmail);
    signInButton.addEventListener("click", signInWithEmail);
}

function setupCheckoutUI() {
    myBookingsList.addEventListener("click", (event) => {
        const trigger = event.target.closest(".booking-pay-btn");
        if (!trigger) {
            return;
        }

        openCheckoutModal(trigger.dataset.bookingId);
    });

    closeCheckoutButton.addEventListener("click", closeCheckoutModal);
    checkoutModal.addEventListener("click", (event) => {
        if (event.target.dataset.closeCheckout === "true") {
            closeCheckoutModal();
            return;
        }

        const gatewayCard = event.target.closest(".checkout-gateway");
        if (!gatewayCard) {
            return;
        }

        state.selectedGatewayId = gatewayCard.dataset.gatewayId;
        const booking = state.myBookings.find((item) => item.id === state.checkoutBookingId);
        if (booking) {
            renderCheckoutGateways(booking);
        }
    });

    checkoutConfirmButton.addEventListener("click", handleCheckoutConfirm);
}

function setupTripTypeToggle() {
    const radios = document.querySelectorAll("input[name='trip-type']");
    radios.forEach((radio) => {
        radio.addEventListener("change", () => {
            const roundTrip = radio.value === "roundtrip" && radio.checked;
            returnInput.disabled = !roundTrip;
            returnInput.required = roundTrip;
            if (!roundTrip) {
                returnInput.value = "";
            }
        });
    });
}

function setSlide(index) {
    const slides = document.querySelectorAll(".banner-slide");
    const dots = document.querySelectorAll(".dot");
    slides.forEach((slide, i) => slide.classList.toggle("active", i === index));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
}

function setupBannerSlider() {
    const slides = document.querySelectorAll(".banner-slide");
    const dots = document.querySelectorAll(".dot");
    if (slides.length < 2) {
        return;
    }

    let current = 0;
    dots.forEach((dot) => {
        dot.addEventListener("click", () => {
            current = Number(dot.dataset.slide || 0);
            setSlide(current);
        });
    });

    setInterval(() => {
        current = (current + 1) % slides.length;
        setSlide(current);
    }, 4200);
}

function initDates() {
    const today = new Date().toISOString().split("T")[0];
    departInput.min = today;
    returnInput.min = today;
    departInput.value = today;
}

async function init() {
    renderServices();
    renderServiceSelect();
    renderAirportOptions();
    initDates();
    setupTripTypeToggle();
    setupBannerSlider();
    loadEditableText();
    setupAuthUI();
    setupCheckoutUI();
    setAuthMode("signin");
    await loadCurrentSession();
    await loadFlightsFromSupabase();
    await loadMyBookings();

    bookingForm.addEventListener("submit", handleBookingSubmit);
    paymentForm.addEventListener("submit", handlePaymentSubmit);
}

init();
