/* Quiet Process — hábitos, ánimo y notas. Todo en localStorage, sin red. */
(function () {
  "use strict";

  var KEY = "quiet-process.v1";
  var THEME_KEY = "quiet-process.theme";

  var COLORS = ["#6f8a75", "#8a7f6f", "#7a8496", "#96757f", "#87906a", "#6f8a8a"];
  var DAY_SHORT = ["D", "L", "M", "X", "J", "V", "S"];
  var DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var MOODS = [
    { v: 1, label: "duro" },
    { v: 2, label: "flojo" },
    { v: 3, label: "normal" },
    { v: 4, label: "bien" },
    { v: 5, label: "pleno" }
  ];

  // ── fechas (siempre en hora local, nunca UTC) ────────────────────────────
  function key(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function parseKey(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(d, n) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    c.setDate(c.getDate() + n);
    return c;
  }
  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function longDate(d) {
    return DAY_LONG[d.getDay()] + " " + d.getDate() + " de " + MONTHS[d.getMonth()] + " de " + d.getFullYear();
  }
  function relativeDay(d) {
    var diff = Math.round((d - today()) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === -1) return "Ayer";
    if (diff === 1) return "Mañana";
    return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
  }

  // ── estado ───────────────────────────────────────────────────────────────
  var state = load();
  var cursor = today();          // día que se está viendo en «Hoy»
  var editingColor = COLORS[0];
  var customDays = [1, 2, 3, 4, 5];
  var noteTimer = null;

  function blank() {
    return { version: 1, habits: [], log: {}, createdAt: key(today()) };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var d = JSON.parse(raw);
      if (!d || typeof d !== "object") return blank();
      if (!Array.isArray(d.habits)) d.habits = [];
      if (!d.log || typeof d.log !== "object") d.log = {};
      if (!d.createdAt) d.createdAt = key(today());
      d.version = 1;
      return d;
    } catch (e) {
      return blank();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function entry(k, make) {
    var e = state.log[k];
    if (!e && make) {
      e = { habits: {}, mood: null, note: "" };
      state.log[k] = e;
    }
    if (e && !e.habits) e.habits = {};
    return e || null;
  }

  function pruneEntry(k) {
    var e = state.log[k];
    if (!e) return;
    var anyHabit = Object.keys(e.habits || {}).some(function (id) { return e.habits[id]; });
    if (!anyHabit && !e.mood && !(e.note || "").trim()) delete state.log[k];
  }

  // ── reglas de hábitos ────────────────────────────────────────────────────
  function scheduled(habit, d) {
    if (habit.cadence === "daily") return true;
    if (habit.cadence === "weekdays") return d.getDay() >= 1 && d.getDay() <= 5;
    return (habit.days || []).indexOf(d.getDay()) !== -1;
  }

  function done(habit, d) {
    var e = state.log[key(d)];
    return !!(e && e.habits && e.habits[habit.id]);
  }

  function startOf(habit) {
    var created = habit.createdAt ? parseKey(habit.createdAt) : parseKey(state.createdAt);
    return created;
  }

  /* Racha: días programados consecutivos cumplidos, hacia atrás.
     Si hoy toca y aún no está hecho, no rompe la racha — sólo aún no suma. */
  function streak(habit) {
    var d = today();
    if (scheduled(habit, d) && !done(habit, d)) d = addDays(d, -1);
    var floor = startOf(habit);
    var n = 0;
    var guard = 0;
    while (d >= floor && guard++ < 3650) {
      if (scheduled(habit, d)) {
        if (done(habit, d)) n++;
        else break;
      }
      d = addDays(d, -1);
    }
    return n;
  }

  function rate(habit, days) {
    var end = today();
    var start = addDays(end, -(days - 1));
    var floor = startOf(habit);
    if (start < floor) start = floor;
    var due = 0, hit = 0;
    for (var d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (!scheduled(habit, d)) continue;
      due++;
      if (done(habit, d)) hit++;
    }
    return { due: due, hit: hit, pct: due ? Math.round((hit / due) * 100) : 0 };
  }

  function activeHabits() {
    return state.habits.filter(function (h) { return !h.archived; });
  }

  function dueOn(d) {
    return activeHabits().filter(function (h) {
      return scheduled(h, d) && parseKey(key(d)) >= startOf(h);
    });
  }

  // ── helpers dom ──────────────────────────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function uid() {
    return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── vista: HOY ───────────────────────────────────────────────────────────
  function renderToday() {
    var k = key(cursor);
    $("#dayTitle").textContent = relativeDay(cursor);
    $("#daySub").textContent = longDate(cursor);
    $("#nextDay").disabled = cursor >= today();

    var list = $("#todayList");
    list.textContent = "";
    var habits = dueOn(cursor);
    $("#todayEmpty").hidden = activeHabits().length > 0;

    if (!habits.length && activeHabits().length) {
      var li = el("li");
      li.appendChild(el("p", "empty", "Hoy no toca ninguno. Descansar también es parte."));
      list.appendChild(li);
      $("#todayCount").textContent = "";
    } else {
      var hits = 0;
      habits.forEach(function (h) {
        var isDone = done(h, cursor);
        if (isDone) hits++;

        var btn = el("button", "check" + (isDone ? " done" : ""));
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(isDone));

        var dot = el("span", "dot");
        dot.style.setProperty("--hue", h.color || COLORS[0]);
        btn.appendChild(dot);

        var body = el("span", "check-body");
        body.appendChild(el("span", "check-name", h.name));
        if (h.note) body.appendChild(el("span", "check-note", h.note));
        btn.appendChild(body);

        var s = streak(h);
        if (s > 0) btn.appendChild(el("span", "streak", s + (s === 1 ? " día" : " días")));

        btn.addEventListener("click", function () { toggle(h.id); });

        var item = el("li");
        item.appendChild(btn);
        list.appendChild(item);
      });
      $("#todayCount").textContent = habits.length ? hits + " de " + habits.length : "";
    }

    var e = entry(k, false);
    var moodRow = $("#moodRow");
    moodRow.textContent = "";
    MOODS.forEach(function (m) {
      var b = el("button", "mood" + (e && e.mood === m.v ? " is-on" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", String(!!(e && e.mood === m.v)));
      var face = el("span", "face");
      var fill = el("i");
      fill.style.height = (m.v * 20) + "%";
      face.appendChild(fill);
      b.appendChild(face);
      b.appendChild(el("span", "label", m.label));
      b.addEventListener("click", function () { setMood(m.v); });
      moodRow.appendChild(b);
    });

    var ta = $("#dayNote");
    if (document.activeElement !== ta) ta.value = (e && e.note) || "";
  }

  function toggle(id) {
    var k = key(cursor);
    var e = entry(k, true);
    e.habits[id] = !e.habits[id];
    if (!e.habits[id]) delete e.habits[id];
    pruneEntry(k);
    save();
    renderToday();
  }

  function setMood(v) {
    var k = key(cursor);
    var e = entry(k, true);
    e.mood = e.mood === v ? null : v;
    pruneEntry(k);
    save();
    renderToday();
  }

  function flashSaved() {
    var hint = $("#savedHint");
    hint.textContent = "guardado";
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(function () { hint.textContent = ""; }, 1400);
  }

  // ── vista: HÁBITOS ───────────────────────────────────────────────────────
  function renderSwatches() {
    var wrap = $("#swatches");
    wrap.textContent = "";
    COLORS.forEach(function (c) {
      var b = el("button", "swatch" + (c === editingColor ? " is-on" : ""));
      b.type = "button";
      b.style.background = c;
      b.setAttribute("aria-label", "Color " + c);
      b.addEventListener("click", function () { editingColor = c; renderSwatches(); });
      wrap.appendChild(b);
    });
  }

  function renderDayPicker() {
    var wrap = $("#dayPicker");
    wrap.textContent = "";
    for (var i = 0; i < 7; i++) {
      (function (i) {
        var on = customDays.indexOf(i) !== -1;
        var b = el("button", on ? "is-on" : "", DAY_SHORT[i]);
        b.type = "button";
        b.setAttribute("aria-pressed", String(on));
        b.addEventListener("click", function () {
          var at = customDays.indexOf(i);
          if (at === -1) customDays.push(i); else customDays.splice(at, 1);
          renderDayPicker();
        });
        wrap.appendChild(b);
      })(i);
    }
  }

  function cadenceLabel(h) {
    if (h.cadence === "daily") return "todos los días";
    if (h.cadence === "weekdays") return "de lunes a viernes";
    var d = (h.days || []).slice().sort();
    if (!d.length) return "sin días";
    return d.map(function (i) { return DAY_LONG[i].slice(0, 3); }).join(", ");
  }

  function renderHabits() {
    var showArch = $("#showArchived").checked;
    var list = $("#habitList");
    list.textContent = "";
    var rows = state.habits.filter(function (h) { return showArch || !h.archived; });
    $("#habitsEmpty").hidden = rows.length > 0;

    rows.forEach(function (h) {
      var li = el("li", h.archived ? "archived" : "");

      var dot = el("span", "hue-dot");
      dot.style.background = h.color || COLORS[0];
      li.appendChild(dot);

      var meta = el("div", "habit-meta");
      meta.appendChild(el("strong", null, h.name));
      var r = rate(h, 30);
      var sub = cadenceLabel(h) + " · " + r.hit + "/" + r.due + " en 30 días";
      if (h.note) sub += " · " + h.note;
      meta.appendChild(el("span", null, sub));
      li.appendChild(meta);

      var acts = el("div", "row-actions");

      var edit = el("button", null, "editar");
      edit.type = "button";
      edit.addEventListener("click", function () { startEdit(h.id); });
      acts.appendChild(edit);

      var arch = el("button", null, h.archived ? "activar" : "archivar");
      arch.type = "button";
      arch.addEventListener("click", function () {
        h.archived = !h.archived;
        save(); renderHabits(); renderToday(); renderReview();
      });
      acts.appendChild(arch);

      var del = el("button", "del", "borrar");
      del.type = "button";
      del.addEventListener("click", function () { removeHabit(h); });
      acts.appendChild(del);

      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function removeHabit(h) {
    if (!window.confirm("¿Borrar «" + h.name + "» y sus marcas? Esto no se puede deshacer.")) return;
    state.habits = state.habits.filter(function (x) { return x.id !== h.id; });
    Object.keys(state.log).forEach(function (k) {
      var e = state.log[k];
      if (e.habits && e.habits[h.id]) delete e.habits[h.id];
      pruneEntry(k);
    });
    if ($("#habitId").value === h.id) resetForm();
    save(); renderAll();
  }

  function readCadence() {
    var picked = document.querySelector('input[name="cadence"]:checked');
    return picked ? picked.value : "daily";
  }

  function setCadence(v) {
    var input = document.querySelector('input[name="cadence"][value="' + v + '"]');
    if (input) input.checked = true;
    $("#dayPicker").hidden = v !== "custom";
  }

  function startEdit(id) {
    var h = state.habits.find(function (x) { return x.id === id; });
    if (!h) return;
    $("#habitId").value = h.id;
    $("#habitName").value = h.name;
    $("#habitNote").value = h.note || "";
    editingColor = h.color || COLORS[0];
    customDays = (h.days && h.days.length) ? h.days.slice() : [1, 2, 3, 4, 5];
    setCadence(h.cadence);
    renderSwatches();
    renderDayPicker();
    $("#formTitle").textContent = "Editar hábito";
    $("#habitSubmit").textContent = "Guardar";
    $("#habitCancel").hidden = false;
    $("#habitName").focus();
  }

  function resetForm() {
    $("#habitForm").reset();
    $("#habitId").value = "";
    editingColor = COLORS[state.habits.length % COLORS.length];
    customDays = [1, 2, 3, 4, 5];
    setCadence("daily");
    renderSwatches();
    renderDayPicker();
    $("#formTitle").textContent = "Nuevo hábito";
    $("#habitSubmit").textContent = "Añadir";
    $("#habitCancel").hidden = true;
  }

  function submitHabit(ev) {
    ev.preventDefault();
    var name = $("#habitName").value.trim();
    if (!name) return;
    var cadence = readCadence();
    if (cadence === "custom" && !customDays.length) {
      window.alert("Elige al menos un día.");
      return;
    }
    var id = $("#habitId").value;
    var data = {
      name: name,
      note: $("#habitNote").value.trim(),
      cadence: cadence,
      days: cadence === "custom" ? customDays.slice().sort() : [],
      color: editingColor
    };
    if (id) {
      var h = state.habits.find(function (x) { return x.id === id; });
      if (h) Object.assign(h, data);
    } else {
      data.id = uid();
      data.archived = false;
      data.createdAt = key(today());
      state.habits.push(data);
    }
    save();
    resetForm();
    renderAll();
  }

  // ── vista: DIARIO ────────────────────────────────────────────────────────
  function renderJournal() {
    var q = $("#journalSearch").value.trim().toLowerCase();
    var list = $("#journalList");
    list.textContent = "";

    var keys = Object.keys(state.log).filter(function (k) {
      var e = state.log[k];
      if (!e) return false;
      var hasSomething = (e.note || "").trim() || e.mood ||
        Object.keys(e.habits || {}).some(function (id) { return e.habits[id]; });
      if (!hasSomething) return false;
      if (!q) return true;
      return (e.note || "").toLowerCase().indexOf(q) !== -1 || k.indexOf(q) !== -1;
    }).sort().reverse();

    $("#journalEmpty").hidden = keys.length > 0;
    if (keys.length && q) $("#journalEmpty").hidden = true;

    keys.forEach(function (k) {
      var e = state.log[k];
      var d = parseKey(k);
      var li = el("li");

      var head = el("div", "entry-head");
      head.appendChild(el("span", "entry-date", longDate(d)));
      if (e.mood) {
        var m = MOODS.find(function (x) { return x.v === e.mood; });
        var mo = el("span", "entry-mood");
        var mf = el("i");
        mf.style.height = (e.mood * 20) + "%";
        mo.appendChild(mf);
        mo.title = m ? m.label : "";
        head.appendChild(mo);
      }
      var hits = Object.keys(e.habits || {}).filter(function (id) { return e.habits[id]; }).length;
      var dueCount = dueOn(d).length;
      if (dueCount) head.appendChild(el("span", "entry-tally", hits + "/" + dueCount + " prácticas"));
      li.appendChild(head);

      if ((e.note || "").trim()) li.appendChild(el("p", "entry-text", e.note));
      list.appendChild(li);
    });

    if (!keys.length && q) {
      $("#journalEmpty").hidden = false;
      $("#journalEmpty").textContent = "Nada coincide con «" + q + "».";
    } else if (!keys.length) {
      $("#journalEmpty").textContent = "Sin entradas todavía. Las notas que escribas en «Hoy» aparecen aquí.";
    }
  }

  // ── vista: REFLEJO ───────────────────────────────────────────────────────
  var WEEKS = 12;

  function renderReview() {
    var habits = activeHabits();
    $("#reviewEmpty").hidden = habits.length > 0;
    $("#rangeLabel").textContent = WEEKS + " semanas";

    // La rejilla empieza un domingo, para que las columnas sean días de la semana.
    var end = today();
    var gridEnd = addDays(end, 6 - end.getDay());
    var gridStart = addDays(gridEnd, -(WEEKS * 7 - 1));

    var statRow = $("#statRow");
    statRow.textContent = "";
    if (habits.length) {
      var due = 0, hit = 0, best = 0;
      habits.forEach(function (h) {
        var r = rate(h, WEEKS * 7);
        due += r.due; hit += r.hit;
        best = Math.max(best, streak(h));
      });
      var noted = Object.keys(state.log).filter(function (k) {
        return (state.log[k].note || "").trim();
      }).length;
      [
        [due ? Math.round((hit / due) * 100) + "%" : "—", "cumplido"],
        [String(best), best === 1 ? "día seguido (mejor)" : "días seguidos (mejor)"],
        [String(habits.length), habits.length === 1 ? "hábito activo" : "hábitos activos"],
        [String(noted), noted === 1 ? "nota escrita" : "notas escritas"]
      ].forEach(function (pair) {
        var s = el("div", "stat");
        s.appendChild(el("b", null, pair[0]));
        s.appendChild(el("span", null, pair[1]));
        statRow.appendChild(s);
      });
    }

    var wrap = $("#gridWrap");
    wrap.textContent = "";
    habits.forEach(function (h) {
      var row = el("div", "gridrow");

      var head = el("div", "gridrow-head");
      var dot = el("span", "hue-dot");
      dot.style.background = h.color || COLORS[0];
      head.appendChild(dot);
      head.appendChild(el("span", null, h.name));
      var r = rate(h, WEEKS * 7);
      head.appendChild(el("span", "pct", r.pct + "% · " + r.hit + "/" + r.due));
      row.appendChild(head);

      var map = el("div", "heatmap");

      var labels = el("div", "daylabels");
      DAY_SHORT.forEach(function (s) { labels.appendChild(el("span", null, s)); });
      map.appendChild(labels);

      // Columnas = semanas, filas = días. gridStart siempre cae en domingo.
      var cells = el("div", "cells");
      for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
        var c = el("div", "cell");
        var beforeStart = d < startOf(h);
        if (d > end) c.classList.add("future");
        if (!scheduled(h, d) || beforeStart) {
          c.classList.add("off");
        } else if (done(h, d)) {
          c.style.background = h.color || COLORS[0];
          c.classList.add("hit");
        }
        c.title = longDate(d) + (beforeStart || !scheduled(h, d) ? "" :
          (done(h, d) ? " — hecho" : " — sin marcar"));
        cells.appendChild(c);
      }
      map.appendChild(cells);
      row.appendChild(map);

      row.appendChild(el("p", "gridrow-foot", "hace " + WEEKS + " semanas  →  hoy"));
      wrap.appendChild(row);
    });

    renderMoodChart();
  }

  function renderMoodChart() {
    var chart = $("#moodChart");
    chart.textContent = "";
    var end = today();
    for (var i = 29; i >= 0; i--) {
      var d = addDays(end, -i);
      var e = state.log[key(d)];
      var v = e && e.mood ? e.mood : 0;
      var b = el("div", "bar" + (v ? " on" : ""));
      b.style.height = v ? (v / 5 * 100) + "%" : "3px";
      var m = MOODS.find(function (x) { return x.v === v; });
      b.title = longDate(d) + (m ? " — " + m.label : " — sin registrar");
      chart.appendChild(b);
    }
  }

  // ── datos ────────────────────────────────────────────────────────────────
  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "quiet-process-" + key(today()) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    msg("Copia descargada.");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(String(reader.result));
        if (!d || !Array.isArray(d.habits) || typeof d.log !== "object") {
          throw new Error("formato");
        }
        if (!window.confirm("Esto reemplaza lo que tienes ahora. ¿Seguir?")) return;
        state = d;
        if (!state.createdAt) state.createdAt = key(today());
        state.version = 1;
        save();
        renderAll();
        msg("Copia importada.");
      } catch (e) {
        msg("Ese archivo no parece una copia de Quiet Process.");
      }
    };
    reader.onerror = function () { msg("No se pudo leer el archivo."); };
    reader.readAsText(file);
  }

  function wipe() {
    if (!window.confirm("Se borran todos los hábitos, marcas y notas. ¿Seguro?")) return;
    if (!window.confirm("Última confirmación: esto no se puede deshacer.")) return;
    state = blank();
    try { localStorage.removeItem(KEY); } catch (e) { /* nada que hacer */ }
    save();
    resetForm();
    renderAll();
    msg("Todo borrado.");
  }

  function msg(t) {
    var n = $("#dataMsg");
    n.textContent = t;
    clearTimeout(msg._t);
    msg._t = setTimeout(function () { n.textContent = ""; }, 3000);
  }

  // ── tema ─────────────────────────────────────────────────────────────────
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function cycleTheme() {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "light" ? "dark" : cur === "dark" ? "" : "light";
    applyTheme(next);
    try {
      if (next) localStorage.setItem(THEME_KEY, next);
      else localStorage.removeItem(THEME_KEY);
    } catch (e) { /* modo privado */ }
  }

  // ── navegación ───────────────────────────────────────────────────────────
  function show(view) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.view === view);
    });
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("is-active", v.id === "view-" + view);
    });
    if (view === "journal") renderJournal();
    if (view === "review") renderReview();
    if (view === "habits") renderHabits();
  }

  function renderAll() {
    renderToday();
    renderHabits();
    renderJournal();
    renderReview();
  }

  // ── arranque ─────────────────────────────────────────────────────────────
  function init() {
    try { applyTheme(localStorage.getItem(THEME_KEY)); } catch (e) { /* modo privado */ }

    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () { show(t.dataset.view); });
    });
    document.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { show(b.dataset.goto); });
    });

    $("#prevDay").addEventListener("click", function () {
      cursor = addDays(cursor, -1);
      renderToday();
    });
    $("#nextDay").addEventListener("click", function () {
      if (cursor >= today()) return;
      cursor = addDays(cursor, 1);
      renderToday();
    });

    $("#dayNote").addEventListener("input", function () {
      clearTimeout(noteTimer);
      var val = this.value;
      noteTimer = setTimeout(function () {
        var k = key(cursor);
        var e = entry(k, true);
        e.note = val;
        pruneEntry(k);
        save();
        flashSaved();
        renderJournal();
      }, 500);
    });

    $("#habitForm").addEventListener("submit", submitHabit);
    $("#habitCancel").addEventListener("click", resetForm);
    $("#showArchived").addEventListener("change", renderHabits);
    document.querySelectorAll('input[name="cadence"]').forEach(function (r) {
      r.addEventListener("change", function () { $("#dayPicker").hidden = r.value !== "custom"; });
    });

    $("#journalSearch").addEventListener("input", renderJournal);

    $("#themeBtn").addEventListener("click", cycleTheme);
    var dlg = $("#dataDialog");
    $("#dataBtn").addEventListener("click", function () {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    });
    $("#exportBtn").addEventListener("click", exportData);
    $("#importBtn").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function () {
      if (this.files && this.files[0]) importData(this.files[0]);
      this.value = "";
    });
    $("#wipeBtn").addEventListener("click", wipe);

    // Si la pestaña queda abierta de un día para otro, la vista se pone al día
    // sola — pero sólo si el usuario no se había ido a mirar un día anterior.
    var openedOn = key(today());
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      var now = key(today());
      if (now === openedOn) return;
      if (key(cursor) === openedOn) cursor = today();
      openedOn = now;
      renderAll();
    });

    resetForm();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
