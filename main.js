// ─── map setup ───────────────────────────────────────────────────────────────
const map = L.map("map").setView([39.5, -98.35], 4);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

let geoLayer;                // will hold the current polyline layer
let originMarkers = [];      // to clear old markers
let originData = {};         // { "City, ST": { coords: [lat,lng], rows: [...] } }

// ─── draw origin pins ──────────────────────────────────────────────────────
function drawOriginMarkers() {
  // clear old markers
  originMarkers.forEach(m => map.removeLayer(m));
  originMarkers = [];

  Object.entries(originData).forEach(([label, { coords, rows }]) => {
    const marker = L.marker(coords)
      .addTo(map)
      .bindPopup(`<strong>${label}</strong><br>${rows.length} loads`)
      .on("click", () => {
        drawLinesForOrigin(label, rows);
        updateSidebar(label, rows);
      });
    originMarkers.push(marker);
  });
}

// ─── draw selected-city lines ───────────────────────────────────────────────
function drawLinesForOrigin(originKey, rows) {
  if (geoLayer) map.removeLayer(geoLayer);

  const features = rows.map(r => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [r.orig_lng, r.orig_lat],
        [r.dest_lng, r.dest_lat]
      ]
    },
    properties: r
  }));

  geoLayer = L.geoJSON({ type: "FeatureCollection", features }, {
    style: { color: "#FF851B", weight: 2 },
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindPopup(`To ${p.dest_city}, ${p.dest_state}`);
    }
  }).addTo(map);
}

// ─── sidebar update ─────────────────────────────────────────────────────────
function updateSidebar(originKey, rows) {
  const sb = document.getElementById("sidebar");
  sb.innerHTML = `<h3>From ${originKey}</h3>`;

  // log to make sure your dest fields exist
  console.log("Sidebar rows for", originKey, rows);

  rows.forEach(r => {
    const div = document.createElement("div");
    div.classList.add("dest");
    div.innerHTML = `
      <strong>${r.dest_city}, ${r.dest_state}</strong><br>
      <a href="${r.bookingUrl || "#"}" target="_blank">Book / Interest</a>
    `;
    sb.appendChild(div);
  });
}

// ─── drop‐zone handler ───────────────────────────────────────────────────────
const dropPanel = document.getElementById("drop-panel");

;["dragenter","dragover"].forEach(ev =>
  dropPanel.addEventListener(ev, e => {
    e.preventDefault();
    dropPanel.classList.add("dragover");
  })
);
;["dragleave","drop"].forEach(ev =>
  dropPanel.addEventListener(ev, e => {
    dropPanel.classList.remove("dragover");
  })
);

dropPanel.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();

  function handleRows(rows) {
    originData = {};

    rows.forEach(r => {
      // coerce & validate
      const oLat = parseFloat(r.orig_lat),
            oLng = parseFloat(r.orig_lng),
            dLat = parseFloat(r.dest_lat),
            dLng = parseFloat(r.dest_lng);
      if ([oLat,oLng,dLat,dLng].some(v=>isNaN(v))) {
        console.warn("Skipping invalid row:", r);
        return;
      }
      r.orig_lat = oLat; r.orig_lng = oLng;
      r.dest_lat = dLat; r.dest_lng = dLng;

      const key = `${r.origin_city}, ${r.origin_state}`;
      if (!originData[key]) {
        originData[key] = { coords: [oLat,oLng], rows: [] };
      }
      originData[key].rows.push(r);
    });

    // build UI
    drawOriginMarkers();
    document.getElementById("sidebar").innerHTML =
      "<em>Click a city marker to see routes</em>";
  }

  if (ext === "csv") {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: res => handleRows(res.data)
    });
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      handleRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
    };
    reader.readAsBinaryString(file);
  }
});