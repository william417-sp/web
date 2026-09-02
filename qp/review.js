/* Reflejo: el diario, los mapas de calor de hábitos y las cifras del proceso. */
(function () {
  "use strict";
  var Q = QP;
  var WEEKS = 12;
  var query = "";
  var onlyNotes = true;   // por defecto, sólo los días que escribiste
  var shown = 30;         // paginación: el diario de un año no cabe de golpe

  var MOOD_LABEL = ["", "duro", "flojo", "normal", "bien", "pleno"];

  function heatmap(host, h) {
    var end = Q.today();
    var gridEnd = Q.addDays(end, 6 - end.getDay());   // sábado de esta semana
    var gridStart = Q.addDays(gridEnd, -(WEEKS * 7 - 1)); // cae en domingo
    var start = QP.tasks.habitStart(h);

    var map = Q.el("div", "heatmap");
    var labels = Q.el("div", "daylabels");
    Q.DAY_SHORT.forEach(function (s) { labels.appendChild(Q.el("span", null, s)); });
    map.appendChild(labels);

    // Columnas = semanas, filas = días de la semana.
    var cells = Q.el("div", "cells");
    for (var d = new Date(gridStart); d <= gridEnd; d = Q.addDays(d, 1)) {
      var c = Q.el("div", "cell");
      var before = d < start;
      if (d > end) c.classList.add("future");
      if (!QP.tasks.scheduled(h, d) || before) c.classList.add("off");
      else if (QP.tasks.habitDone(h, d)) c.style.background = h.color || Q.HUES[0];
      c.title = Q.longDate(d) + (before || !QP.tasks.scheduled(h, d) ? ""
        : QP.tasks.habitDone(h, d) ? " — hecho" : " — sin marcar");
      cells.appendChild(c);
    }
    map.appendChild(cells);
    host.appendChild(map);
  }

  function render() {
    var v = Q.$("#view-review");
    Q.clear(v);

    /* Cifras */
    var habits = QP.tasks.activeHabits();
    var stats = Q.el("section", "card");
    var sh = Q.el("div", "card-head");
    sh.appendChild(Q.el("h3", null, "El proceso"));
    sh.appendChild(Q.el("span", "count", WEEKS + " semanas"));
    stats.appendChild(sh);

    var due = 0, hit = 0, best = 0;
    habits.forEach(function (h) {
      var r = QP.tasks.rate(h, WEEKS * 7);
      due += r.due; hit += r.hit;
      best = Math.max(best, QP.tasks.streak(h));
    });
    var notes = Object.keys(Q.db.log).filter(function (k) {
      return (Q.db.log[k].note || "").trim();
    }).length;
    var doneTasks = Q.db.tasks.filter(function (t) { return t.done; }).length;
    var studyMin = Q.sum(Q.db.sessions, function (s) { return s.minutes; });

    var row = Q.el("div", "stats");
    [
      [due ? Math.round(hit / due * 100) + "%" : "—", "hábitos cumplidos"],
      [String(best), best === 1 ? "día seguido (mejor)" : "días seguidos (mejor)"],
      [String(doneTasks), doneTasks === 1 ? "tarea hecha" : "tareas hechas"],
      [QP.study.fmtHours(studyMin), "estudiadas"],
      [String(Q.db.workouts.length), Q.db.workouts.length === 1 ? "entreno" : "entrenos"],
      [String(notes), notes === 1 ? "nota de diario" : "notas de diario"]
    ].forEach(function (p) {
      var s = Q.el("div", "stat");
      s.appendChild(Q.el("b", null, p[0]));
      s.appendChild(Q.el("span", null, p[1]));
      row.appendChild(s);
    });
    stats.appendChild(row);
    v.appendChild(stats);

    /* Mapas de calor */
    var grids = Q.el("section", "card");
    var gh = Q.el("div", "card-head");
    gh.appendChild(Q.el("h3", null, "Últimas semanas"));
    grids.appendChild(gh);
    if (!habits.length) {
      grids.appendChild(Q.el("p", "empty",
        "Cuando tengas hábitos y algunos días marcados, aquí verás el patrón."));
    } else {
      habits.forEach(function (h) {
        var block = Q.el("div", "gridrow");
        var head = Q.el("div", "gridrow-head");
        var dot = Q.el("span", "hue-dot");
        dot.style.background = h.color || Q.HUES[0];
        head.appendChild(dot);
        head.appendChild(Q.el("span", null, h.name));
        var r = QP.tasks.rate(h, WEEKS * 7);
        head.appendChild(Q.el("span", "pct", r.pct + "% · " + r.hit + "/" + r.due));
        block.appendChild(head);
        heatmap(block, h);
        block.appendChild(Q.el("p", "gridrow-foot", "hace " + WEEKS + " semanas  →  hoy"));
        grids.appendChild(block);
      });
    }
    v.appendChild(grids);

    /* Ánimo */
    var moodCard = Q.el("section", "card");
    var mh = Q.el("div", "card-head");
    mh.appendChild(Q.el("h3", null, "Ánimo"));
    mh.appendChild(Q.el("span", "count", "últimos 30 días"));
    moodCard.appendChild(mh);
    var chart = Q.el("div", "moodchart");
    var any = false;
    for (var i = 29; i >= 0; i--) {
      var d = Q.addDays(Q.today(), -i);
      var e = Q.db.log[Q.key(d)];
      var val = e && e.mood ? e.mood : 0;
      if (val) any = true;
      var bar = Q.el("div", "bar" + (val ? " on" : ""));
      bar.style.height = val ? (val / 5 * 100) + "%" : "3px";
      bar.title = Q.longDate(d) + (val ? " — " + MOOD_LABEL[val] : " — sin registrar");
      chart.appendChild(bar);
    }
    moodCard.appendChild(chart);
    moodCard.appendChild(Q.el("p", "muted small", any
      ? "Los huecos son días sin registrar — también cuentan como parte del proceso."
      : "Todavía sin registros de ánimo. Se marca desde la pestaña Hoy."));
    v.appendChild(moodCard);

    /* Diario */
    var journal = Q.el("section", "card");
    var jh = Q.el("div", "card-head");
    jh.appendChild(Q.el("h3", null, "Diario"));
    journal.appendChild(jh);
    var tools = Q.el("div", "toolbar");
    var search = Q.input("search", { placeholder: "buscar una palabra…" });
    search.value = query;
    var listHost = Q.el("div");
    Q.on(search, "input", function () {
      query = search.value; shown = 30; drawJournal(listHost);
    });
    tools.appendChild(search);
    var lbl = Q.el("label", "toggle");
    var cb = Q.input("checkbox", {});
    cb.checked = !onlyNotes;
    Q.on(cb, "change", function () {
      onlyNotes = !cb.checked; shown = 30; drawJournal(listHost);
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(" incluir días sin nota escrita"));
    tools.appendChild(lbl);
    journal.appendChild(tools);
    journal.appendChild(listHost);
    drawJournal(listHost);
    v.appendChild(journal);
  }

  function drawJournal(host) {
    Q.clear(host);
    var q = Q.slug(query);
    var keys = Object.keys(Q.db.log).filter(function (k) {
      var e = Q.db.log[k];
      if (!e) return false;
      var written = (e.note || "").trim();
      if (onlyNotes) { if (!written) return false; }
      else {
        var has = written || e.mood ||
          Object.keys(e.habits || {}).some(function (id) { return e.habits[id]; });
        if (!has) return false;
      }
      if (!q) return true;
      return Q.slug(e.note || "").indexOf(q) !== -1 || k.indexOf(q) !== -1;
    }).sort().reverse();

    if (!keys.length) {
      host.appendChild(Q.el("p", "empty", query
        ? "Nada coincide con «" + query + "»."
        : onlyNotes
          ? "Ningún día con nota escrita todavía. Se escriben desde «Hoy» — o marca la casilla para ver también los días sólo marcados."
          : "Sin entradas todavía."));
      return;
    }

    var ol = Q.el("ol", "entries");
    keys.slice(0, shown).forEach(function (k) {
      var e = Q.db.log[k];
      var d = Q.parseKey(k);
      var li = Q.el("li");
      var head = Q.el("div", "entry-head");
      head.appendChild(Q.el("span", "entry-date", Q.longDate(d)));
      if (e.mood) {
        var mo = Q.el("span", "entry-mood");
        var f = Q.el("i");
        f.style.height = (e.mood * 20) + "%";
        mo.appendChild(f);
        mo.title = MOOD_LABEL[e.mood];
        head.appendChild(mo);
      }
      var hits = Object.keys(e.habits || {}).filter(function (id) { return e.habits[id]; }).length;
      var dueCount = QP.tasks.habitsDueOn(d).length;
      if (dueCount) head.appendChild(Q.el("span", "entry-tally", hits + "/" + dueCount + " prácticas"));
      li.appendChild(head);
      if ((e.note || "").trim()) li.appendChild(Q.el("p", "entry-text", e.note));
      ol.appendChild(li);
    });
    host.appendChild(ol);
    if (keys.length > shown) {
      var rest = keys.length - shown;
      host.appendChild(Q.btn("btn ghost",
        "Mostrar " + Math.min(30, rest) + " más  ·  quedan " + rest, function () {
          shown += 30;
          drawJournal(host);
        }));
    }
  }

  Q.view("review", render);
})();
