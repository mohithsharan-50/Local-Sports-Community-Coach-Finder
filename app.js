// If the visitor says no to location sharing, we start here instead.
const FALLBACK = { lat: 12.9716, lng: 77.5946, label: "Bengaluru (default)" };

const state = {
  me: null,
  sports: new Set(),
  kinds: new Set(["club", "academy", "trainer"]),
  activeId: null,
};

const $ = (id) => document.getElementById(id);
const map = L.map("map", { zoomControl: true }).setView([FALLBACK.lat, FALLBACK.lng], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let meMarker = null;
let radiusCircle = null;
let places = [];

// --- helpers -------------------------------------------------------------

function offsetToLatLng(origin, dxKm, dyKm) {
  const lat = origin.lat + dyKm / 110.574;
  const lng = origin.lng + dxKm / (111.32 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const priceText = (p) => (p === 0 ? "Free" : `${CURRENCY}${p.toLocaleString()}/mo`);
const kindLabel = { club: "Club", academy: "Academy", trainer: "Trainer" };

function stars(r) {
  const full = Math.round(r);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function pinIcon(p) {
  return L.divIcon({
    className: "",
    html: `<div class="pin ${p.kind}"><span>${SPORT_ICONS[p.sport] || "•"}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

// --- location ------------------------------------------------------------

function setLocation(lat, lng, label) {
  state.me = { lat, lng };
  places = PLACES.map((p, i) => ({ ...p, id: i, ...offsetToLatLng(state.me, p.dx, p.dy) }));

  if (meMarker) meMarker.remove();
  meMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16] }),
    zIndexOffset: 1000,
  }).addTo(map).bindTooltip("You're here");

  $("status").textContent = label;
  map.setView([lat, lng], 13);
  render();
}

function locate() {
  if (!navigator.geolocation) {
    setLocation(FALLBACK.lat, FALLBACK.lng, `Your browser can't share location, so we're showing ${FALLBACK.label}.`);
    return;
  }
  $("status").textContent = "Finding where you are…";
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation(pos.coords.latitude, pos.coords.longitude, "Showing spots around you."),
    () => setLocation(FALLBACK.lat, FALLBACK.lng, `Couldn't get your location — showing ${FALLBACK.label} instead.`),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// --- filtering & rendering -----------------------------------------------

function filtered() {
  const q = $("q").value.trim().toLowerCase();
  const budget = +$("budget").value;
  const minRating = +$("rating").value;
  const radius = +$("radius").value;

  return places
    .map((p) => ({ ...p, dist: distanceKm(state.me, p) }))
    .filter((p) =>
      p.dist <= radius &&
      p.price <= budget &&
      p.rating >= minRating &&
      state.kinds.has(p.kind) &&
      (state.sports.size === 0 || state.sports.has(p.sport)) &&
      (!q || `${p.name} ${p.sport} ${p.blurb}`.toLowerCase().includes(q))
    )
    .sort((a, b) => {
      const by = $("sort").value;
      if (by === "rating") return b.rating - a.rating;
      if (by === "price") return a.price - b.price;
      return a.dist - b.dist;
    });
}

function render() {
  if (!state.me) return;
  const items = filtered();
  const radius = +$("radius").value;

  $("budgetOut").textContent = +$("budget").value >= 8000 ? "no limit" : `${CURRENCY}${(+$("budget").value).toLocaleString()}`;
  $("radiusOut").textContent = `${radius} km`;
  $("count").textContent = `${items.length} ${items.length === 1 ? "place" : "places"}`;

  if (radiusCircle) radiusCircle.remove();
  radiusCircle = L.circle([state.me.lat, state.me.lng], {
    radius: radius * 1000, color: "#2f6b4f", weight: 1, fillOpacity: 0.04,
  }).addTo(map);

  markerLayer.clearLayers();
  const list = $("list");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<li class="empty">Nothing matches yet. Try widening the distance or bumping the budget a little.</li>`;
    return;
  }

  items.forEach((p) => {
    const marker = L.marker([p.lat, p.lng], { icon: pinIcon(p) })
      .bindPopup(`
        <h4>${p.name}</h4>
        <div><span class="pill">${kindLabel[p.kind]}</span>${p.sport}</div>
        <div class="stars">${stars(p.rating)} <small>${p.rating} (${p.reviews})</small></div>
        <div>${priceText(p)} · ${p.dist.toFixed(1)} km away</div>
        <a href="https://www.openstreetmap.org/directions?from=${state.me.lat},${state.me.lng}&to=${p.lat},${p.lng}" target="_blank" rel="noopener">Get directions →</a>
      `)
      .addTo(markerLayer);

    const li = document.createElement("li");
    li.className = "card" + (state.activeId === p.id ? " active" : "");
    li.innerHTML = `
      <h3>${SPORT_ICONS[p.sport] || ""} ${p.name}</h3>
      <div class="meta">
        <span class="pill">${kindLabel[p.kind]}</span>
        <span class="stars">★ ${p.rating}</span>
        <span>${p.reviews} reviews</span>
        <span>${priceText(p)}</span>
        <span>${p.dist.toFixed(1)} km</span>
      </div>
      <p class="blurb">${p.blurb}</p>
    `;
    li.addEventListener("click", () => {
      state.activeId = p.id;
      document.querySelectorAll(".card.active").forEach((c) => c.classList.remove("active"));
      li.classList.add("active");
      map.flyTo([p.lat, p.lng], 15, { duration: 0.6 });
      marker.openPopup();
    });
    list.appendChild(li);
  });
}

// --- wire up -------------------------------------------------------------

function buildSportChips() {
  const box = $("sports");
  Object.entries(SPORT_ICONS).forEach(([sport, icon]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = `${icon} ${sport}`;
    b.addEventListener("click", () => {
      state.sports.has(sport) ? state.sports.delete(sport) : state.sports.add(sport);
      b.classList.toggle("on");
      render();
    });
    box.appendChild(b);
  });
}

document.querySelectorAll("#kinds .chip").forEach((b) =>
  b.addEventListener("click", () => {
    const k = b.dataset.kind;
    state.kinds.has(k) ? state.kinds.delete(k) : state.kinds.add(k);
    b.classList.toggle("on");
    render();
  })
);

["q", "budget", "rating", "radius", "sort"].forEach((id) => $(id).addEventListener("input", render));
$("locate").addEventListener("click", locate);

buildSportChips();
locate();
