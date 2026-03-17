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

const state = {
    editMode: false,
    flights: []
};

const servicesGrid = document.getElementById("services-grid");
const serviceSelect = document.getElementById("service-select");
const paymentForm = document.getElementById("payment-form");
const paymentSummary = document.getElementById("payment-summary");
const toggleEditButton = document.getElementById("toggle-edit");

const bookingForm = document.getElementById("booking-form");
const bookingSummary = document.getElementById("booking-summary");
const originSelect = document.getElementById("booking-origin");
const destinationSelect = document.getElementById("booking-destination");
const departInput = document.getElementById("booking-depart");
const returnInput = document.getElementById("booking-return");
const passengerSelect = document.getElementById("booking-passengers");
const bookingCurrency = document.getElementById("booking-currency");

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

function handleBookingSubmit(event) {
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
        }
    }

    const oneWayUSD = getRoutePriceUSD(origin, destination) * passengers;
    const roundFactor = tripType === "roundtrip" ? 2 : 1;
    const totalUSD = oneWayUSD * roundFactor;
    const totalCurrency = totalUSD * EXCHANGE_RATES[currency];

    bookingSummary.innerHTML = `
        <strong>Reserva generada</strong><br>
        Ruta: ${origin} -> ${destination}${tripType === "roundtrip" ? " (ida y vuelta)" : " (solo ida)"}<br>
        Fecha ida: ${depart}${tripType === "roundtrip" ? `<br>Fecha vuelta: ${returnDate}` : ""}<br>
        Pasajeros: ${passengers}<br>
        Total: ${formatCurrency(totalCurrency, currency)}<br>
        Referencia: ${formatCurrency(totalUSD, "USD")} | ${formatCurrency(totalUSD * EXCHANGE_RATES.VES, "VES")} | ${formatCurrency(totalUSD * EXCHANGE_RATES.CLP, "CLP")}
    `;
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

    paymentSummary.innerHTML = `
        <strong>Pago registrado (demo)</strong><br>
        Cliente: ${payerName}<br>
        Servicio: ${service ? service.name : "N/A"}<br>
        Monto ingresado: ${formatCurrency(amount, currency)}<br>
        Equivalente: ${formatCurrency(usdAmount, "USD")} | ${formatCurrency(usdAmount * EXCHANGE_RATES.VES, "VES")} | ${formatCurrency(usdAmount * EXCHANGE_RATES.CLP, "CLP")}
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

function persistEditableText() {
    const data = {};
    document.querySelectorAll(".editable-text").forEach((element) => {
        data[element.dataset.key] = element.textContent.trim();
    });
    localStorage.setItem("siteEditableText", JSON.stringify(data));
}

function setEditMode(enabled) {
    state.editMode = enabled;
    toggleEditButton.textContent = `Editar textos: ${enabled ? "ON" : "OFF"}`;

    document.querySelectorAll(".editable-text").forEach((element) => {
        element.contentEditable = String(enabled);
        element.classList.toggle("editable", enabled);
    });
}

function setupEditing() {
    toggleEditButton.addEventListener("click", () => {
        const nextMode = !state.editMode;
        setEditMode(nextMode);
        if (!nextMode) {
            persistEditableText();
        }
    });
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

function init() {
    renderServices();
    renderServiceSelect();
    renderAirportOptions();
    initDates();
    setupTripTypeToggle();
    setupBannerSlider();
    loadEditableText();
    setEditMode(false);
    setupEditing();
    loadFlightsFromSupabase();

    bookingForm.addEventListener("submit", handleBookingSubmit);
    paymentForm.addEventListener("submit", handlePaymentSubmit);
}

init();
