/* Estudio: asignaturas, temas, horas registradas y Pomodoro.
   El temporizador vive fuera del render para que cambiar de pestaña no lo
   reinicie, y se calcula por marca de tiempo: si el navegador ralentiza los
   intervalos en segundo plano, el reloj sigue siendo correcto. */
(function () {
  "use strict";
  var Q = QP;
  var editingSubject = null;
  /* Qué asignaturas están desplegadas. Se guarda aparte del DOM para que
     añadir un tema no cierre el bloque que estabas usando. */
  var openSubjects = {};

  var timer = {
    phase: "work",     // work | short | long
    running: false,
    endsAt: 0,
    left: 0,           // segundos restantes cuando está en pausa
    round: 1,
    subjectId: null,
    tick: null
  };

  function cfg() { return Q.db.settings.pomo; }
  function phaseMinutes(p) {
    var c = cfg();
    return p === "work" ? c.work : p === "short" ? c.short : c.long;
  }
  function secondsLeft() {
    if (timer.running) return Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
    return timer.left;
  }
  function fmtClock(s) {
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function setPhase(p, autoStart) {
    timer.phase = p;
    timer.left = phaseMinutes(p) * 60;
    timer.running = false;
    if (autoStart) start();
    paint();
  }
  function start() {
    if (timer.running) return;
    if (!timer.left) timer.left = phaseMinutes(timer.phase) * 60;
    timer.endsAt = Date.now() + timer.left * 1000;
    timer.running = true;
    if (timer.tick) clearInterval(timer.tick);
    timer.tick = setInterval(onTick, 500);
    paint();
  }
  function pause() {
    if (!timer.running) return;
    timer.left = secondsLeft();
    timer.running = false;
    clearInterval(timer.tick);
    timer.tick = null;
    paint();
  }
  function reset() {
    pause();
    timer.left = phaseMinutes(timer.phase) * 60;
    paint();
  }

  function onTick() {
    if (!timer.running) return;
    if (secondsLeft() > 0) { paint(); return; }
    // Fin de fase.
    clearInterval(timer.tick);
    timer.tick = null;
    timer.running = false;
    timer.left = 0;
    var wasWork = timer.phase === "work";
    if (wasWork) {
      logSession(phaseMinutes("work"), timer.subjectId, "pomodoro");
      chime();
      var c = cfg();
      var isLong = timer.round % c.rounds === 0;
      timer.round++;
      Q.toast("Pomodoro completado. Toca " + (isLong ? "descanso largo" : "descanso corto") + ".");
      setPhase(isLong ? "long" : "short", false);
    } else {
      chime();
      Q.toast("Se acabó el descanso.");
      setPhase("work", false);
    }
  }

  /* Un pitido corto con WebAudio: no hace falta ningún archivo de sonido. */
  function chime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.95);
      setTimeout(function () { ctx.close(); }, 1200);
    } catch (e) { /* sin sonido, no pasa nada */ }
  }

  function logSession(minutes, subjectId, kind) {
    if (minutes <= 0) return;
    Q.db.sessions.push({
      id: Q.uid("ss"), date: Q.key(Q.today()), minutes: Math.round(minutes),
      subjectId: subjectId || null, kind: kind || "manual"
    });
    Q.save();
  }

  function minutesOn(dateKey, subjectId) {
    return Q.sum(Q.db.sessions.filter(function (s) {
      return s.date === dateKey && (!subjectId || s.subjectId === subjectId);
    }), function (s) { return s.minutes; });
  }
  function subjectMinutes(subjectId) {
    return Q.sum(Q.db.sessions.filter(function (s) { return s.subjectId === subjectId; }),
      function (s) { return s.minutes; });
  }
  function fmtHours(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? h + " h " + (m ? m + " min" : "") : m + " min";
  }

  /* ── pintado del reloj sin volver a construir la vista entera ─────────── */
  function paint() {
    var clock = Q.$("#pomoClock");
    if (!clock) return;
    var s = secondsLeft();
    clock.textContent = fmtClock(s);
    var ring = Q.$("#pomoRing");
    if (ring) {
      var total = phaseMinutes(timer.phase) * 60 || 1;
      ring.style.setProperty("--p", (1 - s / total));
      ring.dataset.phase = timer.phase;
    }
    var label = Q.$("#pomoPhase");
    if (label) {
      label.textContent = timer.phase === "work"
        ? "Concentración · ronda " + timer.round
        : timer.phase === "short" ? "Descanso corto" : "Descanso largo";
    }
    var pp = Q.$("#pomoToggle");
    if (pp) pp.textContent = timer.running ? "Pausar" : "Empezar";
    document.title = timer.running
      ? fmtClock(s) + " · Quiet Process"
      : "Quiet Process";
  }

  /* ── vista ────────────────────────────────────────────────────────────── */
  function render() {
    var v = Q.$("#view-study");
    Q.clear(v);

    /* Pomodoro */
    var pomo = Q.el("section", "card");
    var ph = Q.el("div", "card-head");
    ph.appendChild(Q.el("h3", null, "Pomodoro"));
    ph.appendChild(Q.el("span", "count", "hoy: " + fmtHours(minutesOn(Q.key(Q.today())))));
    pomo.appendChild(ph);

    var box = Q.el("div", "pomo");
    var ring = Q.el("div", "pomo-ring");
    ring.id = "pomoRing";
    var clock = Q.el("div", "pomo-clock");
    clock.id = "pomoClock";
    clock.setAttribute("aria-live", "off");
    ring.appendChild(clock);
    box.appendChild(ring);

    var side = Q.el("div", "pomo-side");
    var phase = Q.el("p", "pomo-phase");
    phase.id = "pomoPhase";
    side.appendChild(phase);

    var subj = Q.select(QP.tasks.subjectOptions(), timer.subjectId || "");
    Q.on(subj, "change", function () { timer.subjectId = subj.value || null; });
    side.appendChild(Q.field("Asignatura", subj));

    var controls = Q.el("div", "form-actions");
    var toggle = Q.btn("btn primary", "Empezar", function () {
      timer.running ? pause() : start();
    });
    toggle.id = "pomoToggle";
    controls.appendChild(toggle);
    controls.appendChild(Q.btn("btn ghost", "Reiniciar", reset));
    controls.appendChild(Q.btn("btn ghost", "Saltar", function () {
      pause();
      if (timer.phase === "work") { timer.round++; setPhase("short", false); }
      else setPhase("work", false);
    }));
    side.appendChild(controls);

    var cfgRow = Q.el("div", "grid-3");
    [["work", "Trabajo"], ["short", "Corto"], ["long", "Largo"]].forEach(function (p) {
      var n = Q.input("number", { min: 1, max: 120, step: 1 });
      n.value = cfg()[p[0]];
      Q.on(n, "change", function () {
        cfg()[p[0]] = Q.clamp(parseInt(n.value, 10) || 25, 1, 120);
        Q.save();
        if (!timer.running && timer.phase === p[0]) reset();
        paint();
      });
      cfgRow.appendChild(Q.field(p[1] + " (min)", n));
    });
    side.appendChild(cfgRow);
    box.appendChild(side);
    pomo.appendChild(box);

    var manual = Q.el("form", "quickadd");
    var mm = Q.input("number", { min: 1, max: 600, step: 1, placeholder: "minutos" });
    mm.value = 30;
    manual.appendChild(mm);
    var mb = Q.el("button", "btn", "Registrar a mano");
    mb.type = "submit";
    manual.appendChild(mb);
    Q.on(manual, "submit", function (ev) {
      ev.preventDefault();
      var n = parseInt(mm.value, 10);
      if (!n || n <= 0) return;
      logSession(n, subj.value || null, "manual");
      Q.toast(fmtHours(n) + " registrados.");
      render();
    });
    pomo.appendChild(manual);
    v.appendChild(pomo);

    if (!timer.left && !timer.running) timer.left = phaseMinutes(timer.phase) * 60;
    paint();

    /* Asignaturas y temas */
    var subjects = Q.el("section", "card");
    var sh = Q.el("div", "card-head");
    sh.appendChild(Q.el("h3", null, "Asignaturas"));
    subjects.appendChild(sh);

    var f = Q.el("form", "quickadd");
    var ni = Q.input("text", { placeholder: editingSubject ? "nuevo nombre" : "Añadir asignatura…", maxlength: 60 });
    if (editingSubject) ni.value = editingSubject.name;
    f.appendChild(ni);
    var fb = Q.el("button", "btn primary", editingSubject ? "Guardar" : "Añadir");
    fb.type = "submit";
    f.appendChild(fb);
    Q.on(f, "submit", function (ev) {
      ev.preventDefault();
      var n = ni.value.trim();
      if (!n) return;
      if (editingSubject) { editingSubject.name = n; editingSubject = null; }
      else {
        Q.db.subjects.push({
          id: Q.uid("sub"), name: n,
          color: Q.HUES[Q.db.subjects.length % Q.HUES.length], topics: []
        });
      }
      Q.save(); render();
    });
    subjects.appendChild(f);

    if (!Q.db.subjects.length) {
      subjects.appendChild(Q.el("p", "empty",
        "Sin asignaturas. Añade una y cuelga temas, tareas, notas y horas de Pomodoro."));
    } else {
      Q.db.subjects.forEach(function (s) {
        var det = Q.el("details", "subject");
        det.open = !!openSubjects[s.id];
        Q.on(det, "toggle", function () { openSubjects[s.id] = det.open; });
        var sm = Q.el("summary");
        var dot = Q.el("span", "hue-dot");
        dot.style.background = s.color;
        sm.appendChild(dot);
        sm.appendChild(Q.el("strong", null, s.name));
        var doneT = (s.topics || []).filter(function (t) { return t.done; }).length;
        sm.appendChild(Q.el("span", "count",
          (s.topics || []).length ? doneT + "/" + s.topics.length + " temas · " + fmtHours(subjectMinutes(s.id))
            : fmtHours(subjectMinutes(s.id))));
        det.appendChild(sm);

        var inner = Q.el("div", "subject-body");
        var ul = Q.el("ul", "rows tight");
        (s.topics || []).forEach(function (t) {
          var li = Q.el("li", "row" + (t.done ? " is-done" : ""));
          var box2 = Q.btn("box", null, function () {
            t.done = !t.done; Q.save(); render();
          });
          box2.setAttribute("aria-pressed", String(!!t.done));
          li.appendChild(box2);
          var b = Q.el("div", "row-body");
          b.appendChild(Q.el("span", "row-title", t.name));
          li.appendChild(b);
          var acts = Q.el("div", "row-actions");
          acts.appendChild(Q.btn("del", "×", function () {
            s.topics = s.topics.filter(function (x) { return x.id !== t.id; });
            Q.save(); render();
          }));
          li.appendChild(acts);
          ul.appendChild(li);
        });
        inner.appendChild(ul);

        var tf = Q.el("form", "quickadd");
        var ti = Q.input("text", { placeholder: "Añadir tema…", maxlength: 80 });
        tf.appendChild(ti);
        var tb = Q.el("button", "btn ghost small", "+");
        tb.type = "submit";
        tf.appendChild(tb);
        Q.on(tf, "submit", function (ev) {
          ev.preventDefault();
          var n = ti.value.trim();
          if (!n) return;
          s.topics = s.topics || [];
          s.topics.push({ id: Q.uid("tp"), name: n, done: false });
          Q.save(); render();
        });
        inner.appendChild(tf);

        var acts2 = Q.el("div", "row-actions");
        acts2.appendChild(Q.btn(null, "renombrar", function () { editingSubject = s; render(); }));
        acts2.appendChild(Q.btn("del", "borrar asignatura", function () {
          if (!window.confirm("¿Borrar «" + s.name + "»? Sus horas registradas se quedan sin asignatura.")) return;
          Q.db.subjects = Q.db.subjects.filter(function (x) { return x.id !== s.id; });
          Q.db.sessions.forEach(function (ss) { if (ss.subjectId === s.id) ss.subjectId = null; });
          Q.db.tasks.forEach(function (t) { if (t.subjectId === s.id) t.subjectId = null; });
          Q.db.notes.forEach(function (n) { if (n.subjectId === s.id) n.subjectId = null; });
          Q.save(); render();
        }));
        inner.appendChild(acts2);
        det.appendChild(inner);
        subjects.appendChild(det);
      });
    }
    v.appendChild(subjects);

    /* Horas de las últimas semanas */
    if (Q.db.sessions.length) {
      var hours = Q.el("section", "card");
      var hh = Q.el("div", "card-head");
      hh.appendChild(Q.el("h3", null, "Horas de estudio"));
      hh.appendChild(Q.el("span", "count", "últimos 14 días"));
      hours.appendChild(hh);
      var host = Q.el("div", "viz-host");
      hours.appendChild(host);
      var pts = [];
      for (var i = 13; i >= 0; i--) {
        var d = Q.addDays(Q.today(), -i);
        pts.push({
          label: Q.longDate(d), short: Q.DAY_SHORT[d.getDay()],
          value: minutesOn(Q.key(d))
        });
      }
      Q.columns(host, pts, { fmt: function (v) { return fmtHours(v); } });

      var byS = Q.db.subjects.map(function (s) {
        return { label: s.name, value: subjectMinutes(s.id) };
      }).filter(function (r) { return r.value > 0; })
        .sort(function (a, b) { return b.value - a.value; });
      var loose = Q.sum(Q.db.sessions.filter(function (s) { return !s.subjectId; }),
        function (s) { return s.minutes; });
      if (loose) byS.push({ label: "Sin asignatura", value: loose });
      if (byS.length) {
        hours.appendChild(Q.el("h4", "note-sub", "Por asignatura, en total"));
        var host2 = Q.el("div", "viz-host");
        hours.appendChild(host2);
        Q.barList(host2, byS.slice(0, 8).map(function (r, i) {
          return { label: r.label, value: r.value, color: Q.series(i) };
        }), { fmt: function (v) { return fmtHours(v); } });
      }
      v.appendChild(hours);
    }
  }

  Q.view("study", render);
  QP.study = {
    minutesOn: minutesOn, subjectMinutes: subjectMinutes,
    fmtHours: fmtHours, logSession: logSession, timer: timer
  };
})();
