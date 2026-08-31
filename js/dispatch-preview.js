/* ==========================================================================
   Dispatch Preview — SOS -> Smart Match & Route -> Hospital Pre-Alert.
   Save as js/dispatch-preview.js and add a script tag for it in index.html,
   placed after the markup above.
   ========================================================================== */
(function () {
  var svg = document.querySelector('.dispatch-preview-svg');
  if (!svg) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var pin = document.getElementById('preview-patient-pin');
  var ambulance = document.getElementById('preview-ambulance');
  var hospital = document.getElementById('preview-hospital');
  var route1 = document.getElementById('preview-route-1');
  var progress1 = document.getElementById('preview-progress-1');
  var route2 = document.getElementById('preview-route-2');
  var progress2 = document.getElementById('preview-progress-2');
  var etaBadgeText = document.getElementById('preview-eta-badge-text');
  var steps = Array.prototype.slice.call(document.querySelectorAll('.preview-step'));

  if (!pin || !ambulance || !hospital || !route1 || !progress1 || !route2 || !progress2) return;

  var BASE = { x: 60, y: 210 };
  var HOSPITAL = { x: 565, y: 55 };

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function randomPatientPoint() {
    return {
      x: 230 + Math.random() * 180,
      y: 110 + Math.random() * 90
    };
  }

  function setActiveStep(n) {
    steps.forEach(function (el) {
      el.classList.toggle('is-active', Number(el.dataset.step) === n);
    });
  }

  function setupLeg(routeEl, progressEl, from, to) {
    var d = 'M ' + from.x + ' ' + from.y + ' L ' + to.x + ' ' + to.y;
    routeEl.setAttribute('d', d);
    progressEl.setAttribute('d', d);
    var len = progressEl.getTotalLength();
    progressEl.style.strokeDasharray = len + ' ' + len;
    progressEl.style.strokeDashoffset = String(len);
    return len;
  }

  function animateLeg(progressEl, len, duration, onProgress) {
    return new Promise(function (resolve) {
      var start = null;
      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / duration);
        progressEl.style.strokeDashoffset = String(len * (1 - t));
        var pt = progressEl.getPointAtLength(len * t);
        ambulance.setAttribute('transform', 'translate(' + pt.x + ',' + pt.y + ')');
        if (onProgress) onProgress(t);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function resetVisual() {
    pin.classList.remove('is-visible', 'is-pulsing');
    ambulance.classList.remove('is-visible');
    ambulance.setAttribute('transform', 'translate(' + BASE.x + ',' + BASE.y + ')');
    route1.classList.remove('is-visible');
    progress1.classList.remove('is-visible');
    route2.classList.remove('is-visible');
    progress2.classList.remove('is-visible');
    hospital.classList.remove('is-nearing', 'is-alert');
    setActiveStep(0);
  }

  async function cycle() {
    resetVisual();
    var patient = randomPatientPoint();

    // Stage 1 — SOS Raised
    setActiveStep(1);
    pin.setAttribute('transform', 'translate(' + patient.x + ',' + patient.y + ')');
    // reflow so the pulse-ring animation restarts cleanly on this loop
    void pin.getBoundingClientRect();
    pin.classList.add('is-visible', 'is-pulsing');
    await wait(1400);

    // Stage 2 — Smart Match & Route
    setActiveStep(2);
    ambulance.classList.add('is-visible');
    var len1 = setupLeg(route1, progress1, BASE, patient);
    route1.classList.add('is-visible');
    progress1.classList.add('is-visible');
    await animateLeg(progress1, len1, 1600);

    var len2 = setupLeg(route2, progress2, patient, HOSPITAL);
    route2.classList.add('is-visible');
    progress2.classList.add('is-visible');
    await animateLeg(progress2, len2, 1600, function (t) {
      if (t > 0.8) hospital.classList.add('is-nearing');
    });

    // Stage 3 — Hospital Pre-Alert
    setActiveStep(3);
    var eta = Math.max(3, Math.round(4 + Math.random() * 6));
    if (etaBadgeText) etaBadgeText.textContent = 'ETA ' + eta + 'm';
    hospital.classList.add('is-alert');
    await wait(2000);

    // fade out, then loop
    var panel = svg.closest('.dispatch-preview-panel') || svg;
    panel.style.transition = 'opacity 0.5s ease';
    panel.style.opacity = '0.15';
    await wait(500);
    resetVisual();
    panel.style.opacity = '1';
    await wait(200);
    cycle();
  }

  cycle();
})();
