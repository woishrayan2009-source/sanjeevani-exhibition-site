(function () {
  "use strict";

  var svg = document.querySelector(".dispatch-preview-svg");
  if (!svg) return; // section not present on this page

  var panel = document.querySelector(".dispatch-preview-panel");
  var routePath1 = document.getElementById("preview-route-1");
  var routePath2 = document.getElementById("preview-route-2");
  var progressPath1 = document.getElementById("preview-progress-1");
  var progressPath2 = document.getElementById("preview-progress-2");
  var ambulance = document.getElementById("preview-ambulance");
  var patientPin = document.getElementById("preview-patient-pin");
  var etaBadge = document.getElementById("preview-eta-badge");
  var etaBadgeText = document.getElementById("preview-eta-badge-text");
  var notifyIcon = document.querySelector(".preview-notify-icon");

  var stepperItems = Array.prototype.slice.call(
    document.querySelectorAll(".stepper-item")
  );
  var stepperFill = document.getElementById("stepper-track-fill");
  var caption = document.getElementById("dispatch-caption");

  var statusDot = document.getElementById("status-bar-dot");
  var statusValue = document.getElementById("status-bar-value");
  var statusNote = document.getElementById("status-bar-note");

  var readoutSos = document.getElementById("readout-sos");
  var readoutAmbulance = document.getElementById("readout-ambulance");
  var readoutEta = document.getElementById("readout-eta");
  var readoutZone = document.getElementById("readout-zone");
  var readoutHospital = document.getElementById("readout-hospital");

  var BASE = { x: 60, y: 210 };
  var HOSPITAL = { x: 565, y: 55 };

  var STEP_COUNT = stepperItems.length || 3;

  var CAPTIONS = {
    1: "A bystander raises an SOS with live GPS location, logged instantly to the dispatch grid.",
    2: "The nearest available ambulance is matched by real-time distance and traffic, then routed along the fastest live path.",
    3: "The nearest suitable hospital is notified in advance with patient status and ETA, so care teams are ready on arrival.",
  };

  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  var timers = []; // setTimeout handles, cleared on each loop restart

  function clearTimers() {
    timers.forEach(function (t) {
      window.clearTimeout(t);
    });
    timers = [];
  }

  function after(ms, fn) {
    timers.push(window.setTimeout(fn, ms));
  }

  function setStatus(isLive, valueText, noteText) {
    if (!statusDot || !statusValue) return;
    statusDot.classList.toggle("is-live", isLive);
    statusValue.classList.toggle("is-live", isLive);
    statusValue.textContent = valueText;
    if (statusNote && noteText) statusNote.textContent = noteText;
  }

  function setStep(n) {
    stepperItems.forEach(function (el) {
      var step = Number(el.dataset.step);
      el.classList.toggle("is-active", step === n);
      el.classList.toggle("is-done", step < n);
    });
    if (stepperFill) {
      var pct = ((n - 1) / (STEP_COUNT - 1)) * 100;
      stepperFill.style.width = pct + "%";
    }
    if (caption && CAPTIONS[n]) caption.textContent = CAPTIONS[n];
  }

  function clearSteps() {
    stepperItems.forEach(function (el) {
      el.classList.remove("is-active", "is-done");
    });
    if (stepperFill) stepperFill.style.width = "0%";
  }

  // Random patient location inside a band between the base and the hospital,
  // kept clear of both fixed icons so paths stay legible.
  function randomPatient() {
    return {
      x: 240 + Math.random() * 140,
      y: 70 + Math.random() * 130,
    };
  }

  function curvedPath(a, b, bend) {
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2 + bend;
    return "M " + a.x + " " + a.y + " Q " + mx + " " + my + " " + b.x + " " + b.y;
  }

  function setStaticPath(el, d) {
    el.setAttribute("d", d);
  }

  // Animate a progress path "drawing itself" over duration ms using
  // stroke-dasharray/offset, driven manually so it works without waiting on
  // CSS transition support for non-numeric dasharray values.
  function drawProgress(el, duration, onDone) {
    var length = el.getTotalLength();
    el.style.strokeDasharray = String(length);
    el.style.strokeDashoffset = String(length);

    if (reduceMotion) {
      el.style.strokeDashoffset = "0";
      if (onDone) onDone();
      return null;
    }

    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var elapsed = ts - start;
      var pct = Math.min(elapsed / duration, 1);
      el.style.strokeDashoffset = String(length * (1 - pct));
      if (pct < 1) {
        window.requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    }
    window.requestAnimationFrame(step);
  }

  // Move the ambulance icon group along a path over duration ms.
  function moveAlong(el, groupEl, duration, onDone) {
    var length = el.getTotalLength();

    if (reduceMotion) {
      var end = el.getPointAtLength(length);
      groupEl.setAttribute(
        "transform",
        "translate(" + end.x + "," + end.y + ")"
      );
      if (onDone) onDone();
      return;
    }

    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var elapsed = ts - start;
      var pct = Math.min(elapsed / duration, 1);
      var point = el.getPointAtLength(length * pct);
      groupEl.setAttribute(
        "transform",
        "translate(" + point.x + "," + point.y + ")"
      );
      if (pct < 1) {
        window.requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    }
    window.requestAnimationFrame(step);
  }

  function resetVisualState() {
    clearSteps();
    patientPin.classList.remove("is-active");
    etaBadge.classList.remove("is-active");
    if (notifyIcon) notifyIcon.classList.remove("is-active");
    [progressPath1, progressPath2].forEach(function (el) {
      var length = el.getTotalLength ? el.getTotalLength() : 1;
      el.style.strokeDasharray = String(length);
      el.style.strokeDashoffset = String(length);
    });
    ambulance.setAttribute(
      "transform",
      "translate(" + BASE.x + "," + BASE.y + ")"
    );

    if (readoutSos) { readoutSos.textContent = "STANDBY"; readoutSos.classList.remove("is-active"); }
    if (readoutAmbulance) { readoutAmbulance.textContent = "BASE"; readoutAmbulance.classList.remove("is-active"); }
    if (readoutEta) { readoutEta.textContent = "—"; readoutEta.classList.remove("is-active"); }
    if (readoutHospital) { readoutHospital.textContent = "STANDBY"; readoutHospital.classList.remove("is-active"); }

    setStatus(false, "STANDBY", "Demo grid idle — watching for the next simulated SOS below.");
  }

  function runLoop() {
    clearTimers();

    var patient = randomPatient();
    patientPin.setAttribute(
      "transform",
      "translate(" + patient.x + "," + patient.y + ")"
    );
    if (readoutZone) {
      readoutZone.textContent =
        "X:" + Math.round(patient.x) + " Y:" + Math.round(patient.y);
    }

    var d1 = curvedPath(BASE, patient, -40);
    var d2 = curvedPath(patient, HOSPITAL, -30);
    setStaticPath(routePath1, d1);
    setStaticPath(routePath2, d2);
    setStaticPath(progressPath1, d1);
    setStaticPath(progressPath2, d2);

    resetVisualState();

    var etaMinutes = 5 + Math.floor(Math.random() * 6); // 5–10 min
    etaBadgeText.textContent = "ETA " + etaMinutes + "m";

    var LEG_DURATION = reduceMotion ? 0 : 2200;
    var HOLD = reduceMotion ? 400 : 1400;

    // Step 1 — SOS raised
    setStep(1);
    patientPin.classList.add("is-active");
    if (readoutSos) { readoutSos.textContent = "RECEIVED"; readoutSos.classList.add("is-active"); }
    setStatus(true, "ACTIVE INCIDENT", "Incident logged — matching the nearest available ambulance.");

    after(HOLD, function () {
      // Step 2 — smart match & route: ambulance drives base -> patient
      setStep(2);
      if (readoutAmbulance) { readoutAmbulance.textContent = "EN ROUTE"; readoutAmbulance.classList.add("is-active"); }
      if (readoutEta) { readoutEta.textContent = etaMinutes + "m"; readoutEta.classList.add("is-active"); }
      drawProgress(progressPath1, LEG_DURATION);
      moveAlong(routePath1, ambulance, LEG_DURATION, function () {
        after(HOLD, function () {
          // Step 3 — hospital pre-alert: notify fires, ambulance drives on
          setStep(3);
          etaBadge.classList.add("is-active");
          if (notifyIcon) notifyIcon.classList.add("is-active");
          if (readoutAmbulance) readoutAmbulance.textContent = "ARRIVING";
          if (readoutHospital) { readoutHospital.textContent = "NOTIFIED"; readoutHospital.classList.add("is-active"); }
          setStatus(true, "HOSPITAL NOTIFIED", "Care team alerted — ready for arrival.");
          drawProgress(progressPath2, LEG_DURATION);
          moveAlong(routePath2, ambulance, LEG_DURATION, function () {
            after(HOLD * 1.4, runLoop); // pause on arrival, then loop
          });
        });
      });
    });
  }

  // Play a single entrance reveal the first time the panel appears — one
  // orchestrated moment, not a repeating effect, so it grabs attention on
  // load without becoming distracting on every scroll.
  function playEntrance() {
    if (!panel || reduceMotion) return;
    panel.classList.add("pre-reveal");
    // Force layout so the browser registers the hidden state before we
    // remove it — otherwise the transition can get collapsed into one frame.
    void panel.offsetWidth;
    window.requestAnimationFrame(function () {
      panel.classList.remove("pre-reveal");
    });
  }

  // getTotalLength() needs the paths to have real geometry first; run once
  // on load so the initial state is correct even before the loop starts.
  function init() {
    playEntrance();

    var patient = randomPatient();
    patientPin.setAttribute(
      "transform",
      "translate(" + patient.x + "," + patient.y + ")"
    );
    setStaticPath(routePath1, curvedPath(BASE, patient, -40));
    setStaticPath(routePath2, curvedPath(patient, HOSPITAL, -30));
    setStaticPath(progressPath1, routePath1.getAttribute("d"));
    setStaticPath(progressPath2, routePath2.getAttribute("d"));
    runLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
