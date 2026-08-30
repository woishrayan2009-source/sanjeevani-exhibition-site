(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config — fixed demo geography (Ahmedabad)
   * ------------------------------------------------------------------ */
  var DEFAULT_PATIENT = { lat: 23.0225, lng: 72.5714 }; // Lal Darwaja area — default demo coordinate

  var AMBULANCES = [
    { id: 'AMB-01', name: 'Navrangpura Base', lat: 23.0395, lng: 72.5660 },
    { id: 'AMB-02', name: 'Maninagar Base', lat: 22.9969, lng: 72.6031 },
    { id: 'AMB-03', name: 'Bopal Base', lat: 23.0325, lng: 72.4707 }
  ];

  var HOSPITALS = [
    { id: 'HOSP-1', name: 'City Trauma & General Hospital', lat: 23.0300, lng: 72.5800, types: ['Trauma', 'General'] },
    { id: 'HOSP-2', name: 'Apex Cardiac Institute', lat: 23.0100, lng: 72.5500, types: ['Cardiac', 'General'] }
  ];

  var DEFAULT_ZOOM = 12;
  var FOCUS_ZOOM = 13;
  var MAX_LOG = 8;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    dispatched: false,
    log: []
  };

  var leafletAvailable = (typeof L !== 'undefined');
  var map = null;
  var patientMarker = null;
  var ambulanceMarkers = {};   // id -> marker
  var hospitalMarkers = {};    // id -> marker
  var routeLine1 = null;       // ambulance -> patient
  var routeLine2 = null;       // patient -> hospital
  var fallbackEntries = [];    // for the no-Leaflet fallback list

  /* ------------------------------------------------------------------ *
   * DOM refs
   * ------------------------------------------------------------------ */
  var els = {
    clock: document.getElementById('clock'),

    statusBanner: document.getElementById('status-banner'),
    statusText: document.getElementById('status-text'),
    statusDetail: document.getElementById('status-detail'),

    mapEl: document.getElementById('map'),
    fallbackEl: document.getElementById('map-fallback'),
    fallbackList: document.getElementById('fallback-list'),

    leg1Distance: document.getElementById('leg1-distance'),
    leg1DistanceTrend: document.getElementById('leg1-distance-trend'),
    leg1Eta: document.getElementById('leg1-eta'),
    leg1EtaTrend: document.getElementById('leg1-eta-trend'),
    leg1AmbulanceId: document.getElementById('leg1-ambulance-id'),
    leg1State: document.getElementById('leg1-state'),
    leg1Note: document.getElementById('leg1-note'),

    leg2Distance: document.getElementById('leg2-distance'),
    leg2DistanceTrend: document.getElementById('leg2-distance-trend'),
    leg2Eta: document.getElementById('leg2-eta'),
    leg2EtaTrend: document.getElementById('leg2-eta-trend'),
    leg2HospitalId: document.getElementById('leg2-hospital-id'),
    leg2State: document.getElementById('leg2-state'),
    leg2Note: document.getElementById('leg2-note'),

    prealertPanel: document.getElementById('prealert-panel'),
    prealertMeta: document.getElementById('prealert-meta'),
    prealertMessage: document.getElementById('prealert-message'),

    logList: document.getElementById('log-list'),
    logToggle: document.getElementById('log-toggle'),

    typeSelect: document.getElementById('input-emergency-type'),
    locationInput: document.getElementById('input-location'),
    reportBtn: document.getElementById('report-emergency'),
    resetBtn: document.getElementById('reset-dispatch')
  };

  /* ------------------------------------------------------------------ *
   * Clock
   * ------------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, '0'); }
  function tickClock() {
    var now = new Date();
    els.clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ------------------------------------------------------------------ *
   * Log
   * ------------------------------------------------------------------ */
  function logEvent(message, level) {
    var now = new Date();
    var time = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    state.log.unshift({ time: time, message: message, level: level });
    if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
    renderLog();
  }

  function renderLog() {
    els.logList.innerHTML = '';
    if (!state.log.length) {
      var empty = document.createElement('li');
      empty.className = 'log-empty';
      empty.textContent = 'No dispatch events yet.';
      els.logList.appendChild(empty);
      return;
    }
    state.log.forEach(function (entry) {
      var li = document.createElement('li');
      li.className = 'log-' + entry.level;
      var timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = entry.time;
      var msgSpan = document.createElement('span');
      msgSpan.textContent = entry.message;
      li.appendChild(timeSpan);
      li.appendChild(msgSpan);
      els.logList.appendChild(li);
    });
  }
  logEvent('Dispatch console initialized. Standing by.', 'info');

  /* ------------------------------------------------------------------ *
   * Leaflet init — falls back to a coordinate list if it can't load
   * ------------------------------------------------------------------ */
  var iconAmbulance, iconHospital, iconPatient;

  if (leafletAvailable) {
    els.fallbackEl.classList.remove('is-visible');
    els.mapEl.style.display = 'block';

    map = L.map('map').setView([DEFAULT_PATIENT.lat, DEFAULT_PATIENT.lng], DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    iconAmbulance = function (dispatched) {
      return L.divIcon({
        html: '<div class="marker-icon marker-icon-ambulance' + (dispatched ? ' is-dispatched' : '') + '">🚑</div>',
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 26]
      });
    };
    iconHospital = function (chosen) {
      return L.divIcon({
        html: '<div class="marker-icon marker-icon-hospital' + (chosen ? ' is-chosen' : '') + '">🏥</div>',
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 26]
      });
    };
    iconPatient = L.divIcon({
      html: '<div class="marker-icon marker-icon-patient">🚨</div>',
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 26]
    });

  } else {
    els.mapEl.style.display = 'none';
    els.fallbackEl.classList.add('is-visible');
    console.warn('[Dispatch] Leaflet not available — showing fallback coordinate panel.');
  }

  /* ------------------------------------------------------------------ *
   * Fallback list rendering (no-Leaflet path)
   * ------------------------------------------------------------------ */
  function fallbackAdd(role, label, coords) {
    fallbackEntries.push({ role: role, label: label, coords: coords });
    renderFallback();
  }
  function renderFallback() {
    els.fallbackList.innerHTML = '';
    if (!fallbackEntries.length) {
      var empty = document.createElement('li');
      empty.className = 'map-fallback-empty';
      empty.textContent = 'Awaiting reported emergency…';
      els.fallbackList.appendChild(empty);
      return;
    }
    fallbackEntries.forEach(function (entry) {
      var li = document.createElement('li');
      li.setAttribute('data-role', entry.role);
      li.textContent = entry.label + ' — ' + entry.coords.lat.toFixed(5) + ', ' + entry.coords.lng.toFixed(5);
      els.fallbackList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------ *
   * Status banner
   * ------------------------------------------------------------------ */
  function setStatus(mode, valueText, detailText) {
    els.statusBanner.className = 'status-banner status-' + mode;
    els.statusText.textContent = valueText;
    els.statusDetail.textContent = detailText;
  }

  /* ------------------------------------------------------------------ *
   * OSRM routing helper
   * ------------------------------------------------------------------ */
  function fetchRoute(from, to) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
      '?overview=full&geometries=geojson';

    return fetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (!data.routes || !data.routes.length) throw new Error('No route returned');
        var route = data.routes[0];
        return {
          distanceKm: route.distance / 1000,
          durationMin: route.duration / 60,
          geometry: route.geometry
        };
      });
  }

  function drawRouteLine(existing, geometry, color) {
    if (!leafletAvailable || !map) return existing;
    if (existing) map.removeLayer(existing);
    var latlngs = geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
    var line = L.polyline(latlngs, { color: color, weight: 4, opacity: 0.85 }).addTo(map);
    return line;
  }

  /* ------------------------------------------------------------------ *
   * Location parsing
   * ------------------------------------------------------------------ */
  function parseLocation(raw) {
    if (!raw) return null;
    var parts = raw.split(',').map(function (p) { return parseFloat(p.trim()); });
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return { lat: parts[0], lng: parts[1] };
  }

  /* ------------------------------------------------------------------ *
   * Report Emergency — main flow
   * ------------------------------------------------------------------ */
  function reportEmergency() {
    if (state.dispatched) return;

    var type = els.typeSelect.value;
    var patientCoords = parseLocation(els.locationInput.value) || DEFAULT_PATIENT;

    state.dispatched = true;
    els.reportBtn.disabled = true;

    setStatus('emergency', 'DISPATCHING', type + ' call received — matching nearest ambulance');
    logEvent(type + ' emergency reported at ' + patientCoords.lat.toFixed(5) + ', ' + patientCoords.lng.toFixed(5) + '.', 'emergency');

    // Place patient marker
    if (leafletAvailable && map) {
      patientMarker = L.marker([patientCoords.lat, patientCoords.lng], { icon: iconPatient })
        .addTo(map)
        .bindTooltip('Patient — ' + type, { direction: 'top', offset: [0, -24], className: 'ext-marker-tooltip' })
        .bindPopup('<b>🚨 Patient</b><br>' + type + ' emergency');
      map.flyTo([patientCoords.lat, patientCoords.lng], FOCUS_ZOOM);
    } else {
      fallbackAdd('patient', '🚨 Patient — ' + type, patientCoords);
    }

    // Place all ambulance markers (undispatched styling to start)
    AMBULANCES.forEach(function (amb) {
      if (leafletAvailable && map) {
        var marker = L.marker([amb.lat, amb.lng], { icon: iconAmbulance(false) })
          .addTo(map)
          .bindTooltip(amb.name + ' (' + amb.id + ')', { direction: 'top', offset: [0, -22], className: 'ext-marker-tooltip' });
        ambulanceMarkers[amb.id] = marker;
      } else {
        fallbackAdd('ambulance', '🚑 ' + amb.id + ' — ' + amb.name, { lat: amb.lat, lng: amb.lng });
      }
    });

    logEvent('Evaluating ' + AMBULANCES.length + ' ambulances by live driving time to patient…', 'info');

    // Leg 1 — compare all ambulances by real driving time, not straight-line distance
    var ambRoutePromises = AMBULANCES.map(function (amb) {
      return fetchRoute(amb, patientCoords).then(function (result) {
        return { ambulance: amb, result: result };
      }).catch(function (err) {
        return { ambulance: amb, error: err };
      });
    });

    Promise.all(ambRoutePromises).then(function (outcomes) {
      var valid = outcomes.filter(function (o) { return o.result; });
      if (!valid.length) {
        els.leg1Note.textContent = 'Route lookup failed for all ambulances. Check internet connectivity — OSRM requires a live connection.';
        logEvent('Ambulance routing failed — no OSRM responses.', 'info');
        setStatus('warning', 'ROUTING FAILED', 'Could not reach OSRM routing service');
        return;
      }

      valid.sort(function (a, b) { return a.result.durationMin - b.result.durationMin; });
      var chosen = valid[0];
      var chosenAmb = chosen.ambulance;
      var chosenResult = chosen.result;

      // Re-style markers: chosen = dispatched, rest = dimmed
      AMBULANCES.forEach(function (amb) {
        var isChosen = amb.id === chosenAmb.id;
        if (leafletAvailable && ambulanceMarkers[amb.id]) {
          ambulanceMarkers[amb.id].setIcon(iconAmbulance(isChosen));
          if (isChosen) {
            ambulanceMarkers[amb.id].bindPopup('<b>🚑 ' + amb.id + ' — Dispatched</b><br>' + amb.name).openPopup();
          }
        } else if (!leafletAvailable) {
          fallbackEntries.forEach(function (entry) {
            if (entry.label.indexOf(amb.id) !== -1) {
              entry.role = isChosen ? 'ambulance-dispatched' : 'ambulance';
              entry.label = isChosen ? '🚑 ' + amb.id + ' — DISPATCHED — ' + amb.name : '🚑 ' + amb.id + ' — ' + amb.name;
            }
          });
        }
      });
      if (!leafletAvailable) renderFallback();

      routeLine1 = drawRouteLine(routeLine1, chosenResult.geometry, '#35e0c4');
      if (leafletAvailable && map && routeLine1) {
        map.fitBounds(routeLine1.getBounds(), { padding: [30, 30] });
      }

      var km1 = chosenResult.distanceKm.toFixed(2);
      var mins1 = Math.round(chosenResult.durationMin);

      els.leg1Distance.textContent = km1;
      els.leg1Distance.classList.add('is-active');
      els.leg1DistanceTrend.textContent = '↓';
      els.leg1DistanceTrend.setAttribute('data-trend', 'down');
      els.leg1Eta.textContent = mins1;
      els.leg1Eta.classList.add('is-active');
      els.leg1EtaTrend.textContent = '↓';
      els.leg1EtaTrend.setAttribute('data-trend', 'down');
      els.leg1AmbulanceId.textContent = chosenAmb.id + ' — ' + chosenAmb.name + ' — Dispatched';
      els.leg1State.textContent = 'En route to patient';
      els.leg1Note.textContent = 'Compared by live OSRM driving time: ' + valid.map(function (o) {
        return o.ambulance.id + ' (' + Math.round(o.result.durationMin) + ' min)';
      }).join(', ') + '. Fastest by road, not necessarily nearest by straight-line distance.';

      logEvent(chosenAmb.id + ' selected — ' + km1 + ' km, ETA ' + mins1 + ' min (fastest of ' + valid.length + ' by driving time).', 'warning');
      setStatus('emergency', 'AMBULANCE EN ROUTE', chosenAmb.id + ' dispatched — routing to hospital next');

      // Leg 2 — hospital pre-alert
      dispatchToHospital(type, patientCoords, chosenAmb, mins1);
    });
  }

  function dispatchToHospital(type, patientCoords, chosenAmb, ambEtaMin) {
    var eligible = HOSPITALS.filter(function (h) { return h.types.indexOf(type) !== -1; });
    if (!eligible.length) eligible = HOSPITALS.slice();

    // Place hospital markers
    HOSPITALS.forEach(function (h) {
      if (leafletAvailable && map) {
        var marker = L.marker([h.lat, h.lng], { icon: iconHospital(false) })
          .addTo(map)
          .bindTooltip(h.name, { direction: 'top', offset: [0, -22], className: 'ext-marker-tooltip' });
        hospitalMarkers[h.id] = marker;
      } else {
        fallbackAdd('hospital', '🏥 ' + h.id + ' — ' + h.name, { lat: h.lat, lng: h.lng });
      }
    });

    els.leg2State.textContent = 'Matching hospital by type (' + type + ')…';
    logEvent('Matching hospital for ' + type + ' case among ' + eligible.length + ' eligible facilit' + (eligible.length === 1 ? 'y' : 'ies') + '.', 'info');

    var hospRoutePromises = eligible.map(function (h) {
      return fetchRoute(patientCoords, h).then(function (result) {
        return { hospital: h, result: result };
      }).catch(function (err) {
        return { hospital: h, error: err };
      });
    });

    Promise.all(hospRoutePromises).then(function (outcomes) {
      var valid = outcomes.filter(function (o) { return o.result; });
      if (!valid.length) {
        els.leg2Note.textContent = 'Route lookup failed for all eligible hospitals. Check internet connectivity — OSRM requires a live connection.';
        logEvent('Hospital routing failed — no OSRM responses.', 'info');
        return;
      }

      valid.sort(function (a, b) { return a.result.durationMin - b.result.durationMin; });
      var chosen = valid[0];
      var chosenHosp = chosen.hospital;
      var chosenResult = chosen.result;

      HOSPITALS.forEach(function (h) {
        var isChosen = h.id === chosenHosp.id;
        if (leafletAvailable && hospitalMarkers[h.id]) {
          hospitalMarkers[h.id].setIcon(iconHospital(isChosen));
          if (isChosen) {
            hospitalMarkers[h.id].bindPopup('<b>🏥 ' + h.name + '</b><br>Pre-alert sent — ' + type + ' inbound').openPopup();
          }
        } else if (!leafletAvailable) {
          fallbackEntries.forEach(function (entry) {
            if (entry.label.indexOf(h.id) !== -1) {
              entry.role = isChosen ? 'hospital-chosen' : 'hospital';
              entry.label = isChosen ? '🏥 ' + h.id + ' — SELECTED — ' + h.name : '🏥 ' + h.id + ' — ' + h.name;
            }
          });
        }
      });
      if (!leafletAvailable) renderFallback();

      routeLine2 = drawRouteLine(routeLine2, chosenResult.geometry, '#ff9d2e');
      if (leafletAvailable && map && routeLine1 && routeLine2) {
        var group = L.featureGroup([routeLine1, routeLine2]);
        map.fitBounds(group.getBounds(), { padding: [30, 30] });
      }

      var km2 = chosenResult.distanceKm.toFixed(2);
      var mins2 = Math.round(chosenResult.durationMin);

      els.leg2Distance.textContent = km2;
      els.leg2Distance.classList.add('is-active');
      els.leg2DistanceTrend.textContent = '↓';
      els.leg2DistanceTrend.setAttribute('data-trend', 'down');
      els.leg2Eta.textContent = mins2;
      els.leg2Eta.classList.add('is-active');
      els.leg2EtaTrend.textContent = '↓';
      els.leg2EtaTrend.setAttribute('data-trend', 'down');
      els.leg2HospitalId.textContent = chosenHosp.id + ' — ' + chosenHosp.name;
      els.leg2State.textContent = 'Pre-alert sent';
      els.leg2Note.textContent = eligible.length > 1
        ? 'Compared by live OSRM driving time among hospitals equipped for ' + type + ' cases: ' + valid.map(function (o) {
            return o.hospital.id + ' (' + Math.round(o.result.durationMin) + ' min)';
          }).join(', ') + '.'
        : chosenHosp.name + ' is the only facility in this demo equipped for ' + type + ' cases.';

      logEvent('Route to ' + chosenHosp.name + ' calculated: ' + km2 + ' km, ETA ' + mins2 + ' min.', 'warning');

      showPreAlert(type, chosenAmb, chosenHosp, mins2);
      setStatus('normal', 'DISPATCHED', chosenAmb.id + ' → patient → ' + chosenHosp.name);
      logEvent('Hospital pre-alert sent to ' + chosenHosp.name + '.', 'normal');
      els.leg1State.textContent = 'Dispatched — ETA ' + ambEtaMin + ' min to patient';
    });
  }

  function showPreAlert(type, ambulance, hospital, hospitalEtaMin) {
    var now = new Date();
    var timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    els.prealertMeta.textContent = hospital.name + ' · received ' + timeStr;
    els.prealertMessage.innerHTML =
      '<strong>' + type.toUpperCase() + ' CASE INBOUND</strong>\n' +
      'Ambulance: ' + ambulance.id + ' (' + ambulance.name + ')\n' +
      'Patient ETA to hospital: ~' + Math.round(hospitalEtaMin) + ' min\n' +
      'Please prepare the appropriate team and bay for arrival.';

    els.prealertPanel.classList.add('is-visible');
  }

  /* ------------------------------------------------------------------ *
   * Reset
   * ------------------------------------------------------------------ */
  function resetDispatch() {
    state.dispatched = false;
    els.reportBtn.disabled = false;

    setStatus('normal', 'STANDBY', 'No active call');

    // Clear map layers
    if (leafletAvailable && map) {
      if (patientMarker) { map.removeLayer(patientMarker); patientMarker = null; }
      Object.keys(ambulanceMarkers).forEach(function (id) { map.removeLayer(ambulanceMarkers[id]); });
      ambulanceMarkers = {};
      Object.keys(hospitalMarkers).forEach(function (id) { map.removeLayer(hospitalMarkers[id]); });
      hospitalMarkers = {};
      if (routeLine1) { map.removeLayer(routeLine1); routeLine1 = null; }
      if (routeLine2) { map.removeLayer(routeLine2); routeLine2 = null; }
      map.flyTo([DEFAULT_PATIENT.lat, DEFAULT_PATIENT.lng], DEFAULT_ZOOM);
    } else {
      fallbackEntries = [];
      renderFallback();
    }

    // Reset tiles
    [els.leg1Distance, els.leg1Eta, els.leg2Distance, els.leg2Eta].forEach(function (el) {
      el.textContent = '—';
      el.classList.remove('is-active');
    });
    [els.leg1DistanceTrend, els.leg1EtaTrend, els.leg2DistanceTrend, els.leg2EtaTrend].forEach(function (el) {
      el.textContent = '▬';
      el.removeAttribute('data-trend');
    });
    els.leg1AmbulanceId.textContent = 'No ambulance selected';
    els.leg1State.textContent = 'Awaiting report';
    els.leg1Note.textContent = 'All available ambulances are compared by live driving time to the patient — not straight-line distance — and the fastest is dispatched.';
    els.leg2HospitalId.textContent = 'No hospital selected';
    els.leg2State.textContent = 'Awaiting Leg 1';
    els.leg2Note.textContent = 'Routed to the nearest hospital equipped for the reported emergency type.';

    els.prealertPanel.classList.remove('is-visible');
    els.prealertMessage.innerHTML = '';
    els.prealertMeta.textContent = '—';

    logEvent('Dispatch reset. Standing by.', 'normal');
  }

  /* ------------------------------------------------------------------ *
   * Wire up
   * ------------------------------------------------------------------ */
  els.reportBtn.addEventListener('click', reportEmergency);
  els.resetBtn.addEventListener('click', resetDispatch);

  els.logToggle.addEventListener('click', function () {
    var expanded = els.logToggle.getAttribute('aria-expanded') === 'true';
    els.logToggle.setAttribute('aria-expanded', String(!expanded));
  });

})();
