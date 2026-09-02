/* Arranque: pestañas, tema, panel de datos y cambio de día. */
(function () {
  "use strict";
  var Q = QP;

  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function cycleTheme() {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "light" ? "dark" : cur === "dark" ? "" : "light";
    applyTheme(next);
    try {
      if (next) localStorage.setItem(Q.THEME_KEY, next);
      else localStorage.removeItem(Q.THEME_KEY);
    } catch (e) { /* modo privado */ }
    Q.toast(next === "light" ? "Tema claro." : next === "dark" ? "Tema oscuro." : "Tema del sistema.");
    Q.refresh();
  }

  /* ── panel de datos ───────────────────────────────────────────────────── */
  function exportJSON() {
    Q.download("quiet-process-" + Q.key(Q.today()) + ".json",
      JSON.stringify(Q.db, null, 2), "application/json");
    msg("Copia descargada.");
  }

  function exportCSV() {
    var rows = [["tipo", "fecha", "titulo", "detalle", "valor"]];
    Q.db.tasks.forEach(function (t) {
      rows.push(["tarea", t.due || t.createdAt || "", t.title, t.note || "", t.done ? "hecha" : "pendiente"]);
    });
    Object.keys(Q.db.log).sort().forEach(function (k) {
      var e = Q.db.log[k];
      if ((e.note || "").trim()) rows.push(["diario", k, "", e.note, e.mood || ""]);
      Object.keys(e.habits || {}).forEach(function (id) {
        if (!e.habits[id]) return;
        var h = Q.byId(Q.db.habits, id);
        rows.push(["habito", k, h ? h.name : id, "", "hecho"]);
      });
    });
    Q.db.tx.forEach(function (t) {
      rows.push(["dinero", t.date, t.note || t.category, t.category,
        (t.kind === "out" ? "-" : "") + (t.amount / 100).toFixed(2)]);
    });
    Q.db.workouts.forEach(function (w) {
      (w.sets || []).forEach(function (s) {
        var e = Q.byId(Q.db.exercises, s.exerciseId);
        rows.push(["serie", w.date, e ? e.name : s.exerciseId, s.reps + " reps", s.weight]);
      });
    });
    Q.db.sessions.forEach(function (s) {
      var sub = s.subjectId && Q.byId(Q.db.subjects, s.subjectId);
      rows.push(["estudio", s.date, sub ? sub.name : "sin asignatura", s.kind, s.minutes]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? "" : c);
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\n");
    Q.download("quiet-process-" + Q.key(Q.today()) + ".csv", "﻿" + csv, "text/csv");
    msg("CSV descargado.");
  }

  function importJSON(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(String(r.result));
        var looksRight = d && typeof d === "object" &&
          (Array.isArray(d.habits) || Array.isArray(d.tasks)) &&
          d.log && typeof d.log === "object";
        if (!looksRight) throw new Error("forma");
        if (!window.confirm("Esto reemplaza todo lo que tienes ahora. ¿Seguir?")) return;
        Q.db = d;
        Q.save(true);
        QP.tasks.resetCursor();
        Q.refresh();
        msg("Copia importada.");
      } catch (e) {
        msg("Ese archivo no parece una copia de Quiet Process.", true);
      }
    };
    r.onerror = function () { msg("No se pudo leer el archivo.", true); };
    r.readAsText(file);
  }

  function wipe() {
    if (!window.confirm("Se borra todo: hábitos, tareas, notas, metas, entrenos, dinero y estudio. ¿Seguro?")) return;
    if (!window.confirm("Última confirmación: esto no se puede deshacer.")) return;
    Q.db = Q.blank();
    try { localStorage.removeItem(Q.KEY); } catch (e) { /* nada que hacer */ }
    Q.save(true);
    QP.tasks.resetCursor();
    Q.refresh();
    msg("Todo borrado.");
  }

  var msgTimer = null;
  function msg(t, isError) {
    var n = Q.$("#dataMsg");
    if (!n) return;
    n.textContent = t;
    n.classList.toggle("is-error", !!isError);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { n.textContent = ""; }, 3500);
  }

  function usedSpace() {
    try {
      var bytes = new Blob([localStorage.getItem(Q.KEY) || ""]).size;
      return bytes < 1024 ? bytes + " B"
        : bytes < 1048576 ? (bytes / 1024).toFixed(0) + " KB"
          : (bytes / 1048576).toFixed(1) + " MB";
    } catch (e) { return "?"; }
  }

  function openData() {
    var dlg = Q.$("#dataDialog");
    var body = Q.$("#dataBody");
    Q.clear(body);

    var counts = [
      [Q.db.habits.length, "hábitos"], [Q.db.tasks.length, "tareas"],
      [Q.db.goals.length, "metas"], [Q.db.notes.length, "notas"],
      [Q.db.workouts.length, "entrenos"], [Q.db.tx.length, "movimientos"],
      [Q.db.subjects.length, "asignaturas"], [Object.keys(Q.db.log).length, "días registrados"]
    ].filter(function (c) { return c[0]; });
    if (counts.length) {
      body.appendChild(Q.el("p", "muted small",
        counts.map(function (c) { return c[0] + " " + c[1]; }).join(" · ") +
        " · " + usedSpace() + " usados"));
    }

    var cur = Q.el("div", "grid-2");
    var currency = Q.input("text", { maxlength: 3, placeholder: "EUR" });
    currency.value = Q.db.settings.currency;
    Q.on(currency, "change", function () {
      Q.db.settings.currency = (currency.value || "EUR").toUpperCase().slice(0, 3);
      Q.save(); Q.refresh();
    });
    cur.appendChild(Q.field("Moneda", currency));
    var locale = Q.input("text", { maxlength: 12, placeholder: "es-ES" });
    locale.value = Q.db.settings.locale;
    Q.on(locale, "change", function () {
      Q.db.settings.locale = locale.value || "es-ES";
      Q.save(); Q.refresh();
    });
    cur.appendChild(Q.field("Formato", locale));
    body.appendChild(cur);

    var acts = Q.el("div", "dialog-actions");
    acts.appendChild(Q.btn("btn", "Exportar copia (.json)", exportJSON));
    acts.appendChild(Q.btn("btn", "Exportar todo a CSV", exportCSV));
    var file = Q.input("file", { accept: "application/json,.json" });
    file.hidden = true;
    Q.on(file, "change", function () {
      if (file.files && file.files[0]) importJSON(file.files[0]);
      file.value = "";
    });
    acts.appendChild(Q.btn("btn", "Importar copia", function () { file.click(); }));
    acts.appendChild(file);
    acts.appendChild(Q.btn("btn danger", "Borrar todo", wipe));
    body.appendChild(acts);

    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }

  /* ── arranque ─────────────────────────────────────────────────────────── */
  function init() {
    try { applyTheme(localStorage.getItem(Q.THEME_KEY)); } catch (e) { /* privado */ }

    Q.$$(".tab").forEach(function (t) {
      Q.on(t, "click", function () { Q.show(t.dataset.view); });
    });
    Q.on(Q.$("#themeBtn"), "click", cycleTheme);
    Q.on(Q.$("#dataBtn"), "click", openData);

    // Atajos: 1-8 saltan de pestaña cuando no estás escribiendo.
    Q.on(document, "keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var t = ev.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      var tabs = Q.$$(".tab");
      var n = parseInt(ev.key, 10);
      if (n >= 1 && n <= tabs.length) { Q.show(tabs[n - 1].dataset.view); ev.preventDefault(); }
    });

    // Si la pestaña se queda abierta de un día para otro, la vista se pone al
    // día sola — pero sin arrastrar al usuario si estaba mirando otro día.
    var openedOn = Q.key(Q.today());
    Q.on(document, "visibilitychange", function () {
      if (document.hidden) return;
      var now = Q.key(Q.today());
      if (now === openedOn) return;
      openedOn = now;
      QP.tasks.resetCursor();
      Q.refresh();
    });

    var start = "today";
    try {
      var saved = localStorage.getItem("quiet-process.tab");
      if (saved) start = saved;
    } catch (e) { /* privado */ }
    Q.show(start);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
