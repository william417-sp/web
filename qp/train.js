/* Entrenamientos: series, repeticiones y peso, con récords y evolución. */
(function () {
  "use strict";
  var Q = QP;
  var openWorkout = null;
  var chartExercise = null;

  function exerciseName(id) {
    var e = Q.byId(Q.db.exercises, id);
    return e ? e.name : "(ejercicio borrado)";
  }
  function ensureExercise(name, group) {
    var s = Q.slug(name);
    for (var i = 0; i < Q.db.exercises.length; i++) {
      if (Q.slug(Q.db.exercises[i].name) === s) return Q.db.exercises[i];
    }
    var e = { id: Q.uid("e"), name: name.trim(), group: group || "" };
    Q.db.exercises.push(e);
    return e;
  }

  /* Volumen = suma de reps × peso. Es la medida que más se mueve cuando
     progresas, aunque el peso máximo se quede quieto. */
  function setVolume(s) { return (s.reps || 0) * (s.weight || 0); }
  function workoutVolume(w) { return Q.sum(w.sets || [], setVolume); }

  function allSets(exerciseId) {
    var out = [];
    Q.db.workouts.forEach(function (w) {
      (w.sets || []).forEach(function (s) {
        if (s.exerciseId === exerciseId) out.push({ date: w.date, set: s });
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function records(exerciseId) {
    var sets = allSets(exerciseId);
    if (!sets.length) return null;
    var heaviest = sets[0], mostReps = sets[0], bestVol = sets[0];
    sets.forEach(function (x) {
      if ((x.set.weight || 0) > (heaviest.set.weight || 0)) heaviest = x;
      if ((x.set.reps || 0) > (mostReps.set.reps || 0)) mostReps = x;
      if (setVolume(x.set) > setVolume(bestVol.set)) bestVol = x;
    });
    // 1RM estimado con Epley: peso × (1 + reps/30).
    var best1rm = sets.reduce(function (acc, x) {
      var v = (x.set.weight || 0) * (1 + (x.set.reps || 0) / 30);
      return v > acc.v ? { v: v, x: x } : acc;
    }, { v: 0, x: sets[0] });
    return {
      heaviest: heaviest, mostReps: mostReps, bestVol: bestVol,
      oneRM: Math.round(best1rm.v * 10) / 10, sessions: new Set(sets.map(function (x) { return x.date; })).size
    };
  }

  /* Serie temporal por sesión: volumen total del ejercicio ese día. */
  function progressSeries(exerciseId) {
    var byDate = {};
    allSets(exerciseId).forEach(function (x) {
      byDate[x.date] = (byDate[x.date] || 0) + setVolume(x.set);
    });
    return Object.keys(byDate).sort().map(function (d) {
      return { label: Q.shortDate(Q.parseKey(d)), value: Math.round(byDate[d]), key: d };
    });
  }

  function newWorkout() {
    var w = {
      id: Q.uid("w"), date: Q.key(Q.today()), name: "Entreno", note: "", sets: []
    };
    Q.db.workouts.push(w);
    Q.save();
    return w;
  }

  /* ── editor de un entreno ─────────────────────────────────────────────── */
  function workoutEditor(w, host) {
    Q.clear(host);

    var top = Q.el("div", "grid-2");
    var name = Q.input("text", { maxlength: 60, placeholder: "Empuje, pierna, cinta…" });
    name.value = w.name || "";
    Q.on(name, "input", function () { w.name = name.value; Q.save(); });
    top.appendChild(Q.field("Sesión", name));
    var date = Q.input("date", {});
    date.value = w.date;
    Q.on(date, "change", function () {
      if (date.value) { w.date = date.value; Q.save(); render(); }
    });
    top.appendChild(Q.field("Fecha", date));
    host.appendChild(top);

    var table = Q.el("div", "sets");
    function drawSets() {
      Q.clear(table);
      if (!w.sets.length) {
        table.appendChild(Q.el("p", "empty", "Sin series. Añade la primera abajo."));
      }
      var byEx = Q.groupBy(w.sets, function (s) { return s.exerciseId; });
      Object.keys(byEx).forEach(function (exId) {
        var block = Q.el("div", "set-block");
        var h = Q.el("div", "set-block-head");
        h.appendChild(Q.el("strong", null, exerciseName(exId)));
        var vol = Q.sum(byEx[exId], setVolume);
        h.appendChild(Q.el("span", "count", byEx[exId].length + " series · " + Math.round(vol) + " kg vol."));
        block.appendChild(h);
        var ul = Q.el("ul", "set-list");
        byEx[exId].forEach(function (s, i) {
          var li = Q.el("li");
          li.appendChild(Q.el("span", "set-n", String(i + 1)));
          var reps = Q.input("number", { min: 0, max: 999, step: 1, "aria-label": "Repeticiones" });
          reps.value = s.reps;
          Q.on(reps, "change", function () {
            var v = Math.max(0, parseInt(reps.value, 10) || 0);
            if (v === s.reps) return;
            s.reps = v; Q.save(); drawSets();
          });
          li.appendChild(reps);
          li.appendChild(Q.el("span", "set-x", "×"));
          var wt = Q.input("number", { min: 0, max: 999, step: 0.5, "aria-label": "Peso en kilos" });
          wt.value = s.weight;
          Q.on(wt, "change", function () {
            var v = Math.max(0, parseFloat(wt.value) || 0);
            if (v === s.weight) return;
            s.weight = v; Q.save(); drawSets();
          });
          li.appendChild(wt);
          li.appendChild(Q.el("span", "set-unit", "kg"));
          li.appendChild(Q.btn("del", "×", function () {
            w.sets = w.sets.filter(function (x) { return x.id !== s.id; });
            Q.save(); drawSets();
          }));
          ul.appendChild(li);
        });
        block.appendChild(ul);
        block.appendChild(Q.btn("btn ghost small", "+ otra serie", function () {
          var last = byEx[exId][byEx[exId].length - 1];
          w.sets.push({
            id: Q.uid("s"), exerciseId: exId,
            reps: last ? last.reps : 8, weight: last ? last.weight : 0
          });
          Q.save(); drawSets();
        }));
        table.appendChild(block);
      });
    }
    drawSets();
    host.appendChild(table);

    var add = Q.el("form", "quickadd");
    var exInput = Q.input("text", { placeholder: "Ejercicio (p. ej. Sentadilla)", list: "exerciseList", maxlength: 60 });
    add.appendChild(exInput);
    var addBtn = Q.el("button", "btn", "Añadir ejercicio");
    addBtn.type = "submit";
    add.appendChild(addBtn);
    Q.on(add, "submit", function (ev) {
      ev.preventDefault();
      var n = exInput.value.trim();
      if (!n) return;
      var e = ensureExercise(n);
      w.sets.push({ id: Q.uid("s"), exerciseId: e.id, reps: 8, weight: 0 });
      exInput.value = "";
      Q.save(); drawSets();
    });
    host.appendChild(add);

    var dl = Q.el("datalist");
    dl.id = "exerciseList";
    Q.db.exercises.forEach(function (e) {
      var o = Q.el("option");
      o.value = e.name;
      dl.appendChild(o);
    });
    host.appendChild(dl);

    var note = Q.input("text", { maxlength: 200, placeholder: "cómo fue, molestias, sensaciones…" });
    note.value = w.note || "";
    Q.on(note, "input", function () { w.note = note.value; Q.save(); });
    host.appendChild(Q.field("Nota", note));

    var acts = Q.el("div", "form-actions");
    acts.appendChild(Q.btn("btn primary", "Cerrar sesión", function () {
      openWorkout = null; render();
    }));
    acts.appendChild(Q.btn("btn danger", "Borrar entreno", function () {
      if (!window.confirm("¿Borrar este entreno y sus series?")) return;
      Q.db.workouts = Q.db.workouts.filter(function (x) { return x.id !== w.id; });
      openWorkout = null;
      Q.save(); render();
    }));
    host.appendChild(acts);
  }

  /* ── vista ────────────────────────────────────────────────────────────── */
  function render() {
    var v = Q.$("#view-train");
    Q.clear(v);

    var card = Q.el("section", "card");
    var head = Q.el("div", "card-head");
    head.appendChild(Q.el("h3", null, openWorkout ? "Entreno abierto" : "Entrenamientos"));
    if (!openWorkout) {
      head.appendChild(Q.btn("btn primary", "Nuevo entreno", function () {
        openWorkout = newWorkout().id;
        render();
      }));
    }
    card.appendChild(head);

    var w = openWorkout && Q.byId(Q.db.workouts, openWorkout);
    if (w) {
      var host = Q.el("div");
      card.appendChild(host);
      workoutEditor(w, host);
      v.appendChild(card);
      return;
    }

    if (!Q.db.workouts.length) {
      card.appendChild(Q.el("p", "empty",
        "Sin entrenos. Crea uno y ve añadiendo ejercicios: rimu-style, series × reps × peso."));
    } else {
      var ul = Q.el("ul", "rows");
      Q.db.workouts.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
        .forEach(function (wk) {
          var li = Q.el("li", "row");
          var body = Q.el("div", "row-body");
          body.appendChild(Q.el("span", "row-title", wk.name || "Entreno"));
          var meta = Q.el("span", "row-meta");
          meta.appendChild(Q.el("span", "chip is-quiet", Q.longDate(Q.parseKey(wk.date))));
          meta.appendChild(Q.el("span", "chip is-quiet", (wk.sets || []).length + " series"));
          meta.appendChild(Q.el("span", "chip is-quiet", Math.round(workoutVolume(wk)) + " kg de volumen"));
          if (wk.note) meta.appendChild(Q.el("span", "chip is-quiet", wk.note));
          body.appendChild(meta);
          li.appendChild(body);
          var acts = Q.el("div", "row-actions");
          acts.appendChild(Q.btn(null, "abrir", function () { openWorkout = wk.id; render(); }));
          li.appendChild(acts);
          ul.appendChild(li);
        });
      card.appendChild(ul);
    }
    v.appendChild(card);

    if (!Q.db.exercises.length) return;

    // Récords por ejercicio.
    var rec = Q.el("section", "card");
    var rh = Q.el("div", "card-head");
    rh.appendChild(Q.el("h3", null, "Récords"));
    rec.appendChild(rh);
    var trained = Q.db.exercises.filter(function (e) { return allSets(e.id).length; });
    if (!trained.length) {
      rec.appendChild(Q.el("p", "empty", "Registra alguna serie con peso y aquí aparecerán tus marcas."));
    } else {
      var table = Q.el("table", "table");
      var thead = Q.el("thead");
      var trh = Q.el("tr");
      ["Ejercicio", "Más peso", "Más reps", "1RM estimado", "Sesiones"].forEach(function (h) {
        trh.appendChild(Q.el("th", null, h));
      });
      thead.appendChild(trh);
      table.appendChild(thead);
      var tb = Q.el("tbody");
      trained.forEach(function (e) {
        var r = records(e.id);
        var tr = Q.el("tr");
        tr.appendChild(Q.el("td", null, e.name));
        tr.appendChild(Q.el("td", null, r.heaviest.set.weight + " kg × " + r.heaviest.set.reps));
        tr.appendChild(Q.el("td", null, r.mostReps.set.reps + " × " + r.mostReps.set.weight + " kg"));
        tr.appendChild(Q.el("td", null, r.oneRM ? r.oneRM + " kg" : "—"));
        tr.appendChild(Q.el("td", null, String(r.sessions)));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      var scroller = Q.el("div", "table-wrap");
      scroller.appendChild(table);
      rec.appendChild(scroller);
      rec.appendChild(Q.el("p", "muted small",
        "El 1RM estimado usa la fórmula de Epley (peso × (1 + reps/30)). Es una referencia, no una orden."));
    }
    v.appendChild(rec);

    // Evolución de un ejercicio.
    if (trained.length) {
      var ev = Q.el("section", "card");
      var eh = Q.el("div", "card-head");
      eh.appendChild(Q.el("h3", null, "Evolución"));
      var pick = Q.select(trained.map(function (e) {
        return { value: e.id, label: e.name };
      }), chartExercise || trained[0].id);
      Q.on(pick, "change", function () { chartExercise = pick.value; render(); });
      eh.appendChild(pick);
      ev.appendChild(eh);
      var host2 = Q.el("div", "viz-host");
      ev.appendChild(host2);
      var exId = chartExercise && Q.byId(Q.db.exercises, chartExercise) ? chartExercise : trained[0].id;
      Q.lineChart(host2, progressSeries(exId), {
        title: "Volumen por sesión de " + exerciseName(exId),
        fmt: function (v) { return Math.round(v) + " kg"; },
        // Sin relleno y con el rango ajustado: el área a cero aplastaría la
        // mejora real hasta parecer una recta plana.
        area: false, zero: false,
        emptyText: "Con una sola sesión no hay evolución que dibujar todavía."
      });
      ev.appendChild(Q.el("p", "muted small",
        "Volumen por sesión: repeticiones × peso, sumado. Sube antes que el peso máximo, así que es lo que mejor muestra que estás progresando."));
      v.appendChild(ev);
    }
  }

  Q.view("train", render);
  QP.train = {
    records: records, progressSeries: progressSeries,
    workoutVolume: workoutVolume, allSets: allSets
  };
})();
