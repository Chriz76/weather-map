// Globale Basis-URL für die Rohdaten
const BASE_URL = "https://chriz76.github.io/weather-data/";

// Wandelt den Key in ein vollständiges lokales Datum + Uhrzeit um
function formatToLocalDateTimeString(timestampStr) {
    try {
        const year = parseInt(timestampStr.substring(0, 4), 10);
        const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
        const day = parseInt(timestampStr.substring(6, 8), 10);
        const hour = parseInt(timestampStr.substring(9, 11), 10);
        
        const utcDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        return utcDate.toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error("🚨 Fehler bei der Local-DateTime Umwandlung:", error);
        return timestampStr;
    }
}


// =========================================================================
// 1. STATE MANAGEMENT & INITIALISIERUNG
// =========================================================================
// REPARATUR: Verhindert, dass Leaflet das Popup bei einem Map-Klick automatisch schließt
// ÄNDERUNG: zoomControl: false deaktiviert den Standard-Button oben links
const map = L.map('map', { 
    closePopupOnClick: false,
    zoomControl: false 
}).setView([48.3528, 10.9043], 8);

// Fügt die Zoom-Knöpfe manuell oben rechts (topright) ein
L.control.zoom({
    position: 'topright'
}).addTo(map);



const imageBounds = [
    [43.0440, -4.1616],
    [58.1647, 20.5444]
];

const lonMin = -4.1616;
const latMin = 43.0440;

// Globale App-Zustände
let availableTimestamps = []; 
let activeTimestampIndex = 0; 
let activeSpotMarker = null;
let lastClickedLatLng = null; 
let currentClusterData = null; 

// Background & Label-Layers (Sandwich)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, zIndex: 1, tileSize: 512, zoomOffset: -1, className: 'v', detectRetina: true
}).addTo(map);

const windOverlay = L.imageOverlay('', imageBounds, { opacity: 0.65, zIndex: 10 }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, zIndex: 20, tileSize: 512, zoomOffset: -1, pane: 'shadowPane', detectRetina: true
}).addTo(map);

// =========================================================================
// HELPER: UTC-TIMESTAMP IN LOKALE UHRZEIT (LOCAL TIME) UMWANDELN
// =========================================================================
function formatToLocalTimeString(timestampStr) {
    try {
        const year = parseInt(timestampStr.substring(0, 4), 10);
        const month = parseInt(timestampStr.substring(4, 6), 10) - 1;
        const day = parseInt(timestampStr.substring(6, 8), 10);
        const hour = parseInt(timestampStr.substring(9, 11), 10);
        
        const utcDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error("🚨 Fehler bei der Local-Time Umwandlung:", error);
        return timestampStr.split('_')[1] + ":00";
    }
}

// =========================================================================
// 2. DYNAMISCHE INITIALISIERUNG ÜBER INDEX.JSON
// =========================================================================
fetch(`${BASE_URL}index.json`, { cache: "no-cache" })
    .then(r => {
        if (!r.ok) throw new Error(`index.json konnte nicht geladen werden (Status: ${r.status})`);
        return r.json();
    })
    .then(indexData => {
        try {
            availableTimestamps = indexData.available_timestamps.sort(); 
            
            const now = new Date();
            let closestIndex = 0;
            let minDiff = Infinity;
            
            availableTimestamps.forEach((tKey, idx) => {
                const year = parseInt(tKey.substring(0, 4), 10);
                const month = parseInt(tKey.substring(4, 6), 10) - 1;
                const day = parseInt(tKey.substring(6, 8), 10);
                const hour = parseInt(tKey.substring(9, 11), 10);
                const tDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
                
                const diff = Math.abs(now - tDate);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = idx;
                }
            });
            
            activeTimestampIndex = closestIndex;
            
            L.control.weatherTimeline().addTo(map);
            L.control.weatherForecastTable().addTo(map);
            
            // ÄNDERUNG: Befüllt das klassische HTML/CSS Element statt Leaflet-Control
            if (indexData.current_hour) {
                const infoEl = document.getElementById('model-run-info');
                if (infoEl) {
                    infoEl.innerText = `Modell-Basis: ${formatToLocalDateTimeString(indexData.current_hour)}`;
                }
            }
            
            updateActiveWeatherView();
        } catch (innerError) {
            console.error("🚨 Fehler bei der Verarbeitung der Index-Daten:", innerError.message);
        }
    })
    .catch(e => console.error("❌ Kritischer Fehler beim App-Start:", e.message));

function updateActiveWeatherView() {
    try {
        if (!availableTimestamps || availableTimestamps.length === 0) return;

        const currentKey = availableTimestamps[activeTimestampIndex];
        if (!currentKey) return;
        
        const imageUrl = `${BASE_URL}${currentKey}Z.png`;

        // Trick: Bild per Fetch mit ETag-Prüfung anfordern
        fetch(imageUrl, { cache: "no-cache" })
            .then(response => {
                if (!response.ok) throw new Error("Bild konnte nicht geladen werden");
                return response.blob(); // Das Bild als Binärdaten (Blob) abfangen
            })
            .then(imageBlob => {
                // Erstellt eine temporäre, rein lokale URL für das geladene Bild
                const localBlobUrl = URL.createObjectURL(imageBlob);
                
                // Altes Blob-Objekt im Speicher freigeben, um Memory Leaks zu verhindern
                const oldUrl = windOverlay._url;
                if (oldUrl && oldUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(oldUrl);
                }

                // Leaflet das exakt validierte Bild übergeben
                windOverlay.setUrl(localBlobUrl);
            })
            .catch(err => {
                console.error("🚨 Fehler beim ETag-Check des Wetterbildes:", err.message);
                // Fallback: Versuche es normal zu laden, falls fetch fehlschlägt
                windOverlay.setUrl(imageUrl);
            });
        
        const localTimeDisplayStr = formatToLocalTimeString(currentKey);
        const el = document.getElementById('timeline-time-display');
        if (el) el.innerText = localTimeDisplayStr;
        
        const slider = document.getElementById('time-slider');
        if (slider) slider.value = activeTimestampIndex;

        if (lastClickedLatLng && currentClusterData) {
            calculateInterpolationFromLoadedCluster(lastClickedLatLng, currentClusterData);
        }
        
        if (window.highlightActiveForecastHour) {
            window.highlightActiveForecastHour();
        }
        if (window.scrollActiveForecastHourToCenter) {
            window.scrollActiveForecastHourToCenter();
        }

    } catch (error) {
        console.error("🚨 Fehler beim Aktualisieren der Kartenansicht (Slider-Wechsel):", error.message);
    }
}

// =========================================================================
// 3. MATHEMATISCHE INTERPOLATION & FORECAST AUS DEN CLUSTERN
// =========================================================================
map.on('click', function(e) {
    try {
        lastClickedLatLng = e.latlng;
        
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;
        
        const col = Math.floor((clickLng - lonMin) / 2.0);
        const row = Math.floor((clickLat - latMin) / 2.0);
        const clusterUrl = `${BASE_URL}grid_cluster/cluster_${col}_${row}.json`;

        fetch(clusterUrl, { cache: "no-cache" })
            .then(response => {
                if (!response.ok) throw new Error(`Cluster-Datei existiert nicht für diesen Ort (${response.status})`);
                return response.json();
            })
            .then(cluster => {
                try {
                    if (!cluster || !cluster.timeline || !cluster.lats) {
                        throw new Error("Cluster-Datenstruktur ist ungültig.");
                    }
                    
                    currentClusterData = cluster;
                    calculateInterpolationFromLoadedCluster(e.latlng, cluster);
                } catch (procError) {
                    console.error("🚨 Fehler beim Parsen der Cluster-Inhalte:", procError.message);
                }
            })
            .catch(err => console.warn("📍 Klick außerhalb des gültigen Wetterbereichs:", err.message));
            
    } catch (error) {
        console.error("🚨 Allgemeiner Fehler beim Karten-Klick-Event:", error.message);
    }
});

// GLOBALES MAP-EVENT GEGEN WACKELN: Schließt den Forecast zuverlässig, egal wie das Popup zugeht
map.on('popupclose', function() {
    console.log("ℹ️ Popup geschlossen. Lösche Marker & verstecke Forecast.");
    if (activeSpotMarker) {
        map.removeLayer(activeSpotMarker);
        activeSpotMarker = null;
    }
    lastClickedLatLng = null;
    currentClusterData = null;
    if (window.hideForecastTableUI) {
        window.hideForecastTableUI();
    }
});

function calculateInterpolationFromLoadedCluster(latlng, cluster) {
    try {
        const clickLat = latlng.lat;
        const clickLng = latlng.lng;
        const currentTimeKey = availableTimestamps[activeTimestampIndex];
        const totalPoints = cluster.lats.length;
        let distances = [];

        for (let i = 0; i < totalPoints; i++) {
            const dLat = cluster.lats[i] - clickLat;
            const dLng = cluster.lons[i] - clickLng;
            const distSq = (dLat * dLat) + (dLng * dLng);
            distances.push({ index: i, dist: Math.sqrt(distSq) });
        }

        distances.sort((a, b) => a.dist - b.dist);
        const d1 = distances[0], d2 = distances[1], d3 = distances[2];

        const currentTimelineWinds = cluster.timeline[currentTimeKey] || [];
        let interpolatedWind = 0;

        if (d1.dist < 0.005) { 
            interpolatedWind = currentTimelineWinds[d1.index];
        } else {
            const w1 = 1 / d1.dist, w2 = 1 / d2.dist, w3 = 1 / d3.dist;
            const sumW = w1 + w2 + w3;
            const wind1 = currentTimelineWinds[d1.index] || 0;
            const wind2 = currentTimelineWinds[d2.index] || 0;
            const wind3 = currentTimelineWinds[d3.index] || 0;
            interpolatedWind = (wind1 * w1 + wind2 * w2 + wind3 * w3) / sumW;
        }
        interpolatedWind = Math.round(interpolatedWind * 10) / 10;

        updateMapMarker(clickLat, clickLng, interpolatedWind);

        let dynamicForecastArray = [];
        const sortedTimelineKeys = Object.keys(cluster.timeline).sort();

        sortedTimelineKeys.forEach(tKey => {
            const tWinds = cluster.timeline[tKey];
            let tWindInterpolated = 0;

            if (d1.dist < 0.005) {
                tWindInterpolated = tWinds[d1.index];
            } else {
                const w1 = 1 / d1.dist, w2 = 1 / d2.dist, w3 = 1 / d3.dist;
                tWindInterpolated = ((tWinds[d1.index]||0)*w1 + (tWinds[d2.index]||0)*w2 + (tWinds[d3.index]||0)*w3) / (w1+w2+w3);
            }

            const localTimeStr = formatToLocalTimeString(tKey);
            const displayHour = localTimeStr.split(':')[0]; 
            
            // REPARATUR: tKey als 'fullKey' mitsenden, um doppelte Stunden unterscheidbar zu machen
            dynamicForecastArray.push({ 
                hour: displayHour, 
                wind: tWindInterpolated, 
                fullKey: tKey 
            });
        });

        if (window.updateForecastTableUI) {
            window.updateForecastTableUI(dynamicForecastArray);
        }
    } catch (mathError) {
        console.error("🚨 Mathematischer Interpolationsfehler:", mathError.message);
    }
}

function updateMapMarker(lat, lng, value) {
    try {
        const formattedValue = isNaN(value) ? '?' : value.toFixed(1);

        // IN updateMapMarker(lat, lng, value) DAS KLASSISCHE POPUP-TEMPLATE ERSETZEN:
        const coordsDisplay = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        if (!activeSpotMarker) {
            activeSpotMarker = L.circleMarker([lat, lng], {
                radius: 6, color: '#ffffff', fillColor: '#0077a4', fillOpacity: 1, weight: 2
            }).addTo(map);
        
            const initialPopupContent = `
                <div style="text-align: center; font-family: sans-serif; min-width: 120px;">
                    <strong style="font-size: 16px; color: #333;"><span id="popup-wind-value">${formattedValue}</span> kts</strong><br>
                    <span style="font-size: 10px; color: #777; white-space: nowrap;" id="popup-coords-value">${coordsDisplay}</span>
                </div>
            `;
            
            activeSpotMarker.bindPopup(initialPopupContent, { offset: [0, -10] }).openPopup();
        
        } else {
            activeSpotMarker.setLatLng([lat, lng]);
        
            const popup = activeSpotMarker.getPopup();
            if (popup && popup.isOpen()) {
                popup.setLatLng([lat, lng]);
            }
        
            const valueSpan = document.getElementById('popup-wind-value');
            if (valueSpan) valueSpan.innerText = formattedValue;
            
            // Koordinaten aktualisieren
            const coordsSpan = document.getElementById('popup-coords-value');
            if (coordsSpan) coordsSpan.innerText = coordsDisplay;
        }

        
    } catch (markerError) {
        console.error("🚨 Fehler beim Verschieben des Karten-Markers/Popups:", markerError.message);
    }
}

// =========================================================================
// 4. TIMELINE CONTROL (SLIDER UNTEN)
// =========================================================================
L.Control.WeatherTimeline = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-weather-timeline');
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        try {
            container.innerHTML = `
                <div class="timeline-time-display" id="timeline-time-display">--:--</div>
                <div class="timeline-slider-wrapper">
                    <input type="range" class="timeline-slider" id="time-slider" min="0" max="${availableTimestamps.length - 1}" value="${activeTimestampIndex}">
                </div>
                <div class="timeline-navigation">
                    <button class="timeline-nav-btn" id="btn-prev">&#10094;</button>
                    <button class="timeline-nav-btn" id="btn-next">&#10095;</button>
                </div>
            `;

            const slider = container.querySelector('#time-slider');
            const btnPrev = container.querySelector('#btn-prev');
            const btnNext = container.querySelector('#btn-next');

            slider.addEventListener('input', (e) => {
                activeTimestampIndex = parseInt(e.target.value, 10);
                updateActiveWeatherView();
            });

            btnPrev.addEventListener('click', () => {
                if (activeTimestampIndex > 0) {
                    activeTimestampIndex--;
                    updateActiveWeatherView();
                }
            });

            btnNext.addEventListener('click', () => {
                if (activeTimestampIndex < availableTimestamps.length - 1) {
                    activeTimestampIndex++;
                    updateActiveWeatherView();
                }
            });

        } catch (uiError) {
            console.error("🚨 Fehler beim Aufbau des Timeline-UI-Elements:", uiError.message);
        }

        return container;
    }
});

// =========================================================================
// 5. FORECAST SCROLL-TABELLEN CONTROL (KOMPAKT, TRANSITION & EINDEUTIG)
// =========================================================================
L.Control.WeatherForecastTable = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-weather-table-control');
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        container.innerHTML = `
            <div class="forecast-scroll-container" id="forecast-scroll-box">
                <table class="forecast-table">
                    <tr id="forecast-row-header"></tr>
                    <tr id="forecast-row-values"></tr>
                </table>
            </div>
        `;

        window.updateForecastTableUI = function(forecastData) {
            try {
                // Nutzt das CSS-Klassen-gesteuerte Aufgleiten statt abruptes display:block
                container.classList.add('has-data');

                const headerRow = document.getElementById('forecast-row-header');
                const valuesRow = document.getElementById('forecast-row-values');
                if (!headerRow || !valuesRow) return;

                function getColorClass(wind) {
                    if (wind < 3.0)  return 'w-under-3_0';
                    if (wind < 5.0)  return 'w-under-5_0';
                    if (wind < 6.0)  return 'w-under-6_0';
                    if (wind < 7.0)  return 'w-under-7_0';
                    if (wind < 8.0)  return 'w-under-8_0';
                    if (wind < 9.0)  return 'w-under-9_0';
                    if (wind < 10.0) return 'w-under-10_0';
                    if (wind < 12.5) return 'w-under-12_5';
                    if (wind < 14.6) return 'w-under-14_6';
                    if (wind < 19.4) return 'w-under-19_4';
                    if (wind < 24.3) return 'w-under-24_3';
                    return 'w-over-24_3'; // Alles ab 24.3 Knoten
                }


                let headerHtml = '';
                let valuesHtml = '';

                forecastData.forEach(item => {
                    const colorClass = getColorClass(item.wind);
                    const formattedValue = item.wind >= 10 ? Math.round(item.wind) : item.wind.toFixed(1);
                    
                    // REPARATUR: Nutzt data-time mit dem eindeutigen Key gegen doppelte Highlights
                    headerHtml += `<th data-time="${item.fullKey}">${item.hour}h</th>`;
                    valuesHtml += `<td data-time="${item.fullKey}" class="${colorClass}">${formattedValue}</td>`;
                });

                headerRow.innerHTML = headerHtml;
                valuesRow.innerHTML = valuesHtml;

                window.highlightActiveForecastHour();

                // Scrollt nach minimalem Delay (bis DOM bereit ist) zur Stunde
                setTimeout(window.scrollActiveForecastHourToCenter, 50);

            } catch (tableRenderError) {
                console.error("🚨 Fehler beim Befüllen der Tabelle:", tableRenderError.message);
            }
        };

        window.highlightActiveForecastHour = function() {
            try {
                const currentKey = availableTimestamps[activeTimestampIndex];
                if (!currentKey) return;

                document.querySelectorAll('.forecast-table th, .forecast-table td').forEach(el => {
                    el.classList.remove('active-hour-column');
                });

                // REPARATUR: Sucht nun präzise nach dem exakten, eindeutigen Zeitstempel
                document.querySelectorAll(`.forecast-table [data-time="${currentKey}"]`).forEach(el => {
                    el.classList.add('active-hour-column');
                });
            } catch (e) {
                console.error("🚨 Fehler beim Highlighten der Tabellenspalte:", e);
            }
        };

        // REPARATUR: Richtige Scrollfunktion im Control verankert
        window.scrollActiveForecastHourToCenter = function() {
            try {
                const scrollBox = document.getElementById('forecast-scroll-box');
                const activeTh = document.querySelector('.forecast-table th.active-hour-column');
                
                if (scrollBox && activeTh) {
                    const boxWidth = scrollBox.clientWidth;
                    const elementLeft = activeTh.offsetLeft;
                    const elementWidth = activeTh.clientWidth;
                    
                    const targetScrollLeft = elementLeft - (boxWidth / 2) + (elementWidth / 2);
                    
                    scrollBox.scrollTo({
                        left: targetScrollLeft,
                        behavior: 'smooth'
                    });
                }
            } catch (e) {
                console.error("🚨 Fehler beim Scrollen der Tabelle:", e);
            }
        };

        // REPARATUR: Schließfunktion blendet die Tabelle via CSS flüssig aus
        window.hideForecastTableUI = function() {
            container.classList.remove('has-data');
        };

        return container;
    }
});

L.control.weatherTimeline = function (options) { return new L.Control.WeatherTimeline(options); };
L.control.weatherForecastTable = function (options) { return new L.Control.WeatherForecastTable(options); };

