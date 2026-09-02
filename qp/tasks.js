/* Tareas y hábitos: la lista de Hoy, la matriz de Eisenhower y el tablero. */
(function () {
  "use strict";
  var Q = QP;

  /* ── hábitos: cadencia, marcas y rachas ───────────────────────────────── */
  function scheduled(h, d) {
    if (h.cadence === "daily") return true;
    if (h.cadence === "weekdays") return d.getDay() >= 1 && d.getDay() <= 5;
    return (h.days || []).indexOf(d.getDay()) !== -1;
  }
  function habitDone(h, d) {
    var e = Q.db.log[Q.key(d)];
    return !!(e && e.habits && e.habits[h.id]);
  }
  function habitStart(h) {
    return Q.parseKey(h.createdAt || Q.db.createdAt);
  }
  /* Días programados consecutivos hacia atrás. Si hoy toca y aún no está
     marcado no rompe la racha: todavía no la suma. */
  function streak(h) {
    var d = Q.today();
    if (scheduled(h, d) && !habitDone(h, d)) d = Q.addDays(d, -1);
    var floor = habitStart(h), n = 0, guard = 0;
    while (d >= floor && guard++ < 3650) {
      if (scheduled(h, d)) {
        if (habitDone(h, d)) n++; else break;
      }
      d = Q.addDays(d, -1);
    }
    return n;
  }
  function rate(h, days) {
    var end = Q.today(), start = Q.addDays(end, -(days - 1)), floor = habitStart(h);
    if (start < floor) start = floor;
    var due = 0, hit = 0;
    for (var d = new Date(start); d <= end; d = Q.addDays(d, 1)) {
      if (!scheduled(h, d)) continue;
      due++;
      if (habitDone(h, d)) hit++;
    }
    return { due: due, hit: hit, pct: due ? Math.round(hit / due * 100) : 0 };
  }
  function activeHabits() {
    return Q.db.habits.filter(function (h) { return !h.archived; });
  }
  function habitsDueOn(d) {
    return activeHabits().filter(function (h) {
      return scheduled(h, d) && Q.parseKey(Q.key(d)) >= habitStart(h);
    });
  }
  function entry(k, make) {
    var e = Q.db.log[k];
    if (!e && make) { e = { habits: {}, mood: null, note: "" }; Q.db.log[k] = e; }
    if (e && !e.habits) e.habits = {};
    return e || null;
  }
  function pruneEntry(k) {
    var e = Q.db.log[k];
    if (!e) return;
    var any = Object.keys(e.habits || {}).some(function (id) { return e.habits[id]; });
    if (!any && !e.mood && !(e.note || "").trim()) delete Q.db.log[k];
  }
  function toggleHabit(id, d) {
    var k = Q.key(d), e = entry(k, true);
    if (e.habits[id]) delete e.habits[id]; else e.habits[id] = true;
    pruneEntry(k);
    Q.save();
  }

  /* ── tareas ───────────────────────────────────────────────────────────── */
  function openTasks() {
    return Q.db.tasks.filter(function (t) { return !t.done; });
  }
  function tasksDueOn(d) {
    var k = Q.key(d);
    return Q.db.tasks.filter(function (t) {
      if (t.done) return t.doneAt === k;      // hechas hoy: siguen visibles
      return t.due && t.due <= k;             // sin fecha = no invade el día
    });
  }
  function toggleTask(id) {
    var t = Q.byId(Q.db.tasks, id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Q.key(Q.today()) : null;
    if (t.done) t.status = "done";
    else if (t.status === "done") t.status = "todo";
    Q.save();
  }
  function addTask(fields) {
    var t = {
      id: Q.uid("t"), title: fields.title, note: fields.note || "",
      done: false, doneAt: null, due: fields.due || null,
      urgent: !!fields.urgent, important: !!fields.important,
      status: fields.status || "todo",
      goalId: fields.goalId || null, subjectId: fields.subjectId || null,
      order: Date.now(), createdAt: Q.key(Q.today())
    };
    Q.db.tasks.push(t);
    Q.save();
    return t;
  }

  /* ── piezas de interfaz reutilizables ─────────────────────────────────── */
  function goalOptions(sel) {
    return [{ value: "", label: "— sin meta —" }].concat(
      Q.db.goals.filter(function (g) { return !g.archived; }).map(function (g) {
        return { value: g.id, label: g.title };
      }));
  }
  function subjectOptions() {
    return [{ value: "", label: "— sin asignatura —" }].concat(
      Q.db.subjects.map(function (s) { return { value: s.id, label: s.name }; }));
  }

  function taskRow(t, opts) {
    var o = opts || {};
    var li = Q.el("li", "row" + (t.done ? " is-done" : ""));

    var box = Q.btn("box", null, function () { toggleTask(t.id); Q.refresh(); });
    box.setAttribute("aria-pressed", String(!!t.done));
    box.setAttribute("aria-label", (t.done ? "Desmarcar " : "Marcar ") + t.title);
    li.appendChild(box);

    var body = Q.el("div", "row-body");
    body.appendChild(Q.el("span", "row-title", t.title));
    var meta = Q.el("span", "row-meta");
    var due = Q.dueLabel(t.due);
    if (due) {
      var dd = Q.el("span", "chip" + (due.late ? " is-late" : due.soon ? " is-soon" : ""), due.text);
      meta.appendChild(dd);
    }
    if (t.urgent || t.important) {
      meta.appendChild(Q.el("span", "chip",
        t.urgent && t.important ? "urgente e importante" : t.urgent ? "urgente" : "importante"));
    }
    var g = t.goalId && Q.byId(Q.db.goals, t.goalId);
    if (g) meta.appendChild(Q.el("span", "chip is-link", "◎ " + g.title));
    var s = t.subjectId && Q.byId(Q.db.subjects, t.subjectId);
    if (s) meta.appendChild(Q.el("span", "chip is-link", "✎ " + s.name));
    if (t.note) meta.appendChild(Q.el("span", "chip is-quiet", t.note));
    if (meta.childNodes.length) body.appendChild(meta);
    li.appendChild(body);

    if (o.actions !== false) {
      var acts = Q.el("div", "row-actions");
      acts.appendChild(Q.btn(null, "editar", function () { editTask(t); }));
      acts.appendChild(Q.btn("del", "borrar", function () {
        if (!window.confirm("¿Borrar «" + t.title + "»?")) return;
        Q.db.tasks = Q.db.tasks.filter(function (x) { return x.id !== t.id; });
        Q.save(); Q.refresh();
      }));
      li.appendChild(acts);
    }
    return li;
  }

  function habitRow(h, d) {
    var isDone = habitDone(h, d);
    var li = Q.el("li", "row" + (isDone ? " is-done" : ""));

    var box = Q.btn("box is-round", null, function () { toggleHabit(h.id, d); Q.refresh(); });
    box.style.setProperty("--hue", h.color || Q.HUES[0]);
    box.setAttribute("aria-pressed", String(isDone));
    box.setAttribute("aria-label", (isDone ? "Desmarcar " : "Marcar ") + h.name);
    li.appendChild(box);

    var body = Q.el("div", "row-body");
    body.appendChild(Q.el("span", "row-title", h.name));
    var meta = Q.el("span", "row-meta");
    if (h.note) meta.appendChild(Q.el("span", "chip is-quiet", h.note));
    var g = h.goalId && Q.byId(Q.db.goals, h.goalId);
    if (g) meta.appendChild(Q.el("span", "chip is-link", "◎ " + g.title));
    if (meta.childNodes.length) body.appendChild(meta);
    li.appendChild(body);

    var n = streak(h);
    if (n > 0) {
      var flame = Q.el("span", "flame", "▲ " + n);
      flame.title = n + (n === 1 ? " día seguido" : " días seguidos");
      li.appendChild(flame);
    }
    return li;
  }

  /* ── editor de tareas (panel inline, no modal) ────────────────────────── */
  var editingTask = null;
  function editTask(t) {
    editingTask = t;
    Q.show("tasks");
    var host = Q.$("#taskFormHost");
    if (host) host.scrollIntoView({ block: "center" });
  }

  function taskForm(host) {
    Q.clear(host);
    var t = editingTask || {};
    var f = Q.el("form", "stack");

    var title = Q.input("text", { maxlength: 120, placeholder: "Llamar al banco", required: "required" });
    title.value = t.title || "";
    f.appendChild(Q.field("Tarea", title));

    var note = Q.input("text", { maxlength: 200, placeholder: "detalle opcional" });
    note.value = t.note || "";
    f.appendChild(Q.field("Nota", note));

    var grid = Q.el("div", "grid-2");
    var due = Q.input("date", {});
    due.value = t.due || "";
    grid.appendChild(Q.field("Para cuándo", due));
    var goal = Q.select(goalOptions(), t.goalId || "");
    grid.appendChild(Q.field("Meta", goal));
    f.appendChild(grid);

    var grid2 = Q.el("div", "grid-2");
    var subj = Q.select(subjectOptions(), t.subjectId || "");
    grid2.appendChild(Q.field("Asignatura", subj));
    var status = Q.select([
      { value: "todo", label: "Por hacer" },
      { value: "doing", label: "En marcha" },
      { value: "done", label: "Hecho" }
    ], t.status || "todo");
    grid2.appendChild(Q.field("Estado", status));
    f.appendChild(grid2);

    var flags = Q.el("div", "checkrow");
    var urgent = Q.input("checkbox", {}); urgent.checked = !!t.urgent;
    var important = Q.input("checkbox", {}); important.checked = !!t.important;
    var l1 = Q.el("label"); l1.appendChild(urgent); l1.appendChild(document.createTextNode(" Urgente"));
    var l2 = Q.el("label"); l2.appendChild(important); l2.appendChild(document.createTextNode(" Importante"));
    flags.appendChild(l1); flags.appendChild(l2);
    f.appendChild(Q.field("Prioridad", flags));

    var actions = Q.el("div", "form-actions");
    var submit = Q.el("button", "btn primary", editingTask ? "Guardar" : "Añadir tarea");
    submit.type = "submit";
    actions.appendChild(submit);
    if (editingTask) {
      actions.appendChild(Q.btn("btn ghost", "Cancelar", function () {
        editingTask = null; Q.refresh();
      }));
    }
    f.appendChild(actions);

    Q.on(f, "submit", function (ev) {
      ev.preventDefault();
      var v = title.value.trim();
      if (!v) return;
      var fields = {
        title: v, note: note.value.trim(), due: due.value || null,
        goalId: goal.value || null, subjectId: subj.value || null,
        status: status.value, urgent: urgent.checked, important: important.checked
      };
      if (editingTask) {
        Object.assign(editingTask, fields);
        editingTask.done = fields.status === "done";
        editingTask.doneAt = editingTask.done ? (editingTask.doneAt || Q.key(Q.today())) : null;
        editingTask = null;
      } else {
        var nt = addTask(fields);
        nt.done = fields.status === "done";
        if (nt.done) nt.doneAt = Q.key(Q.today());
      }
      Q.save(); Q.refresh();
      Q.toast("Tarea guardada.");
    });

    host.appendChild(f);
  }

  /* ── editor de hábitos ────────────────────────────────────────────────── */
  var editingHabit = null;
  var habitDays = [1, 2, 3, 4, 5];
  var habitColor = Q.HUES[0];

  function habitForm(host) {
    Q.clear(host);
    var h = editingHabit || {};
    var f = Q.el("form", "stack");

    var name = Q.input("text", { maxlength: 60, placeholder: "Caminar 20 minutos", required: "required" });
    name.value = h.name || "";
    f.appendChild(Q.field("Hábito", name));

    var note = Q.input("text", { maxlength: 120, placeholder: "para despejar la cabeza" });
    note.value = h.note || "";
    f.appendChild(Q.field("Intención", note));

    var cadWrap = Q.el("div", "stack-tight");
    var cadRow = Q.el("div", "checkrow");
    var chosen = h.cadence || "daily";
    ["daily", "weekdays", "custom"].forEach(function (v, i) {
      var lbl = Q.el("label");
      var r = Q.input("radio", { name: "cad-" + (h.id || "new") });
      r.value = v;
      r.checked = chosen === v;
      Q.on(r, "change", function () { picker.hidden = v !== "custom"; });
      lbl.appendChild(r);
      lbl.appendChild(document.createTextNode(
        " " + ["Todos los días", "Entre semana", "Días sueltos"][i]));
      cadRow.appendChild(lbl);
    });
    cadWrap.appendChild(cadRow);
    var picker = Q.el("div", "daypicker");
    picker.hidden = chosen !== "custom";
    habitDays = (h.days && h.days.length) ? h.days.slice() : [1, 2, 3, 4, 5];
    function drawPicker() {
      Q.clear(picker);
      Q.DAY_SHORT.forEach(function (s, i) {
        var on = habitDays.indexOf(i) !== -1;
        var b = Q.btn(on ? "is-on" : "", s, function () {
          var at = habitDays.indexOf(i);
          if (at === -1) habitDays.push(i); else habitDays.splice(at, 1);
          drawPicker();
        });
        b.setAttribute("aria-pressed", String(on));
        picker.appendChild(b);
      });
    }
    drawPicker();
    cadWrap.appendChild(picker);
    f.appendChild(Q.field("Días", cadWrap));

    var grid = Q.el("div", "grid-2");
    var goal = Q.select(goalOptions(), h.goalId || "");
    grid.appendChild(Q.field("Meta", goal));
    var swatches = Q.el("div", "swatches");
    habitColor = h.color || Q.HUES[Q.db.habits.length % Q.HUES.length];
    function drawSwatches() {
      Q.clear(swatches);
      Q.HUES.forEach(function (c) {
        var b = Q.btn("swatch" + (c === habitColor ? " is-on" : ""), null, function () {
          habitColor = c; drawSwatches();
        });
        b.style.background = c;
        b.setAttribute("aria-label", "Color " + c);
        swatches.appendChild(b);
      });
    }
    drawSwatches();
    grid.appendChild(Q.field("Color", swatches));
    f.appendChild(grid);

    var actions = Q.el("div", "form-actions");
    var submit = Q.el("button", "btn primary", editingHabit ? "Guardar" : "Añadir hábito");
    submit.type = "submit";
    actions.appendChild(submit);
    if (editingHabit) {
      actions.appendChild(Q.btn("btn ghost", "Cancelar", function () {
        editingHabit = null; Q.refresh();
      }));
    }
    f.appendChild(actions);

    Q.on(f, "submit", function (ev) {
      ev.preventDefault();
      var v = name.value.trim();
      if (!v) return;
      var cad = f.querySelector('input[type=radio]:checked').value;
      if (cad === "custom" && !habitDays.length) {
        Q.toast("Elige al menos un día.", true);
        return;
      }
      var data = {
        name: v, note: note.value.trim(), cadence: cad,
        days: cad === "custom" ? habitDays.slice().sort() : [],
        color: habitColor, goalId: goal.value || null
      };
      if (editingHabit) Object.assign(editingHabit, data);
      else {
        data.id = Q.uid("h");
        data.archived = false;
        data.createdAt = Q.key(Q.today());
        Q.db.habits.push(data);
      }
      editingHabit = null;
      Q.save(); Q.refresh();
      Q.toast("Hábito guardado.");
    });

    host.appendChild(f);
  }

  /* ── vista: HOY ───────────────────────────────────────────────────────── */
  var cursor = Q.today();

  function renderToday() {
    var v = Q.$("#view-today");
    Q.clear(v);
    var k = Q.key(cursor);

    // Primera visita: portada en vez de nueve pestañas vacías.
    if (QP.demo && QP.demo.shouldWelcome()) {
      v.appendChild(QP.demo.welcome());
      return;
    }
    var bar0 = QP.demo && QP.demo.banner();
    if (bar0) v.appendChild(bar0);

    var bar = Q.el("div", "daybar");
    bar.appendChild(Q.btn("step", "←", function () {
      cursor = Q.addDays(cursor, -1); renderToday();
    }));
    var lab = Q.el("div", "daybar-label");
    lab.appendChild(Q.el("h2", null, Q.relativeDay(cursor)));
    lab.appendChild(Q.el("p", "muted small", Q.longDate(cursor)));
    bar.appendChild(lab);
    var next = Q.btn("step", "→", function () {
      if (cursor >= Q.today()) return;
      cursor = Q.addDays(cursor, 1); renderToday();
    });
    next.disabled = cursor >= Q.today();
    bar.appendChild(next);
    v.appendChild(bar);

    // Añadir rápido: una tarea para el día que se está viendo.
    var quick = Q.el("form", "quickadd");
    var qi = Q.input("text", { placeholder: "Añadir algo para este día…", maxlength: 120 });
    quick.appendChild(qi);
    var qb = Q.el("button", "btn primary", "Añadir");
    qb.type = "submit";
    quick.appendChild(qb);
    Q.on(quick, "submit", function (ev) {
      ev.preventDefault();
      var t = qi.value.trim();
      if (!t) return;
      addTask({ title: t, due: k });
      qi.value = "";
      renderToday();
    });
    v.appendChild(quick);

    // Una sola lista: primero las prácticas, luego lo puntual.
    var card = Q.el("section", "card");
    var head = Q.el("div", "card-head");
    head.appendChild(Q.el("h3", null, "Tu día"));
    var habits = habitsDueOn(cursor);
    var tasks = tasksDueOn(cursor);
    var doneN = habits.filter(function (h) { return habitDone(h, cursor); }).length +
      tasks.filter(function (t) { return t.done; }).length;
    var totalN = habits.length + tasks.length;
    head.appendChild(Q.el("span", "count", totalN ? doneN + " de " + totalN : ""));
    card.appendChild(head);

    if (!totalN) {
      card.appendChild(Q.el("p", "empty",
        Q.db.habits.length || Q.db.tasks.length
          ? "Nada pendiente para este día. Descansar también es parte."
          : "Aún no hay nada. Escribe algo arriba, o crea un hábito en la pestaña Hábitos."));
    } else {
      var ul = Q.el("ul", "rows");
      habits.forEach(function (h) { ul.appendChild(habitRow(h, cursor)); });
      tasks.sort(function (a, b) { return (a.done - b.done) || (a.order - b.order); })
        .forEach(function (t) { ul.appendChild(taskRow(t, { actions: false })); });
      card.appendChild(ul);
    }
    v.appendChild(card);

    // Ánimo y nota del día.
    var mood = Q.el("section", "card");
    var mh = Q.el("div", "card-head");
    mh.appendChild(Q.el("h3", null, "¿Cómo estuvo el día?"));
    mood.appendChild(mh);
    var e = entry(k, false);
    var row = Q.el("div", "moods");
    ["duro", "flojo", "normal", "bien", "pleno"].forEach(function (label, i) {
      var val = i + 1;
      var b = Q.btn("mood" + (e && e.mood === val ? " is-on" : ""), null, function () {
        var en = entry(k, true);
        en.mood = en.mood === val ? null : val;
        pruneEntry(k); Q.save(); renderToday();
      });
      b.setAttribute("aria-pressed", String(!!(e && e.mood === val)));
      var face = Q.el("span", "face");
      var fill = Q.el("i");
      fill.style.height = (val * 20) + "%";
      face.appendChild(fill);
      b.appendChild(face);
      b.appendChild(Q.el("span", "label", label));
      row.appendChild(b);
    });
    mood.appendChild(row);

    var ta = Q.input("textarea", { rows: 4, placeholder: "Lo que pasó, lo que costó, lo que agradeces…" });
    ta.value = (e && e.note) || "";
    var hint = Q.el("p", "saved");
    var timer = null;
    Q.on(ta, "input", function () {
      clearTimeout(timer);
      var val = ta.value;
      timer = setTimeout(function () {
        var en = entry(k, true);
        en.note = val;
        pruneEntry(k);
        Q.save();
        hint.textContent = "guardado";
        setTimeout(function () { hint.textContent = ""; }, 1400);
      }, 500);
    });
    mood.appendChild(Q.field("Una nota, si quieres", ta));
    mood.appendChild(hint);
    v.appendChild(mood);
  }

  /* ── vista: TAREAS (lista + Eisenhower + tablero) ─────────────────────── */
  var taskMode = "list";

  function renderTasks() {
    var v = Q.$("#view-tasks");
    Q.clear(v);

    var form = Q.el("section", "card");
    var fh = Q.el("div", "card-head");
    fh.appendChild(Q.el("h3", null, editingTask ? "Editar tarea" : "Nueva tarea"));
    form.appendChild(fh);
    var host = Q.el("div");
    host.id = "taskFormHost";
    form.appendChild(host);
    taskForm(host);
    v.appendChild(form);

    var card = Q.el("section", "card");
    var head = Q.el("div", "card-head");
    head.appendChild(Q.el("h3", null, "Tareas"));
    var modes = Q.el("div", "segmented");
    [["list", "Lista"], ["matrix", "Eisenhower"], ["board", "Tablero"]].forEach(function (m) {
      var b = Q.btn(taskMode === m[0] ? "is-on" : "", m[1], function () {
        taskMode = m[0]; renderTasks();
      });
      b.setAttribute("aria-pressed", String(taskMode === m[0]));
      modes.appendChild(b);
    });
    head.appendChild(modes);
    card.appendChild(head);

    if (!Q.db.tasks.length) {
      card.appendChild(Q.el("p", "empty", "Sin tareas. Añade la primera arriba."));
    } else if (taskMode === "list") renderList(card);
    else if (taskMode === "matrix") renderMatrix(card);
    else renderBoard(card);

    v.appendChild(card);
  }

  function renderList(card) {
    var open = Q.db.tasks.filter(function (t) { return !t.done; });
    var done = Q.db.tasks.filter(function (t) { return t.done; });
    open.sort(function (a, b) {
      var ad = a.due || "9999", bd = b.due || "9999";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (b.urgent + b.important) - (a.urgent + a.important);
    });
    var ul = Q.el("ul", "rows");
    open.forEach(function (t) { ul.appendChild(taskRow(t)); });
    card.appendChild(ul);
    if (done.length) {
      var det = Q.el("details", "done-fold");
      det.appendChild(Q.el("summary", null, done.length + (done.length === 1 ? " hecha" : " hechas")));
      var dl = Q.el("ul", "rows");
      done.sort(function (a, b) { return (b.doneAt || "") < (a.doneAt || "") ? -1 : 1; })
        .forEach(function (t) { dl.appendChild(taskRow(t)); });
      det.appendChild(dl);
      card.appendChild(det);
    }
  }

  function renderMatrix(card) {
    var open = Q.db.tasks.filter(function (t) { return !t.done; });
    var quads = [
      { key: "do", title: "Hazlo ya", sub: "urgente e importante", f: function (t) { return t.urgent && t.important; } },
      { key: "plan", title: "Planifícalo", sub: "importante, no urgente", f: function (t) { return !t.urgent && t.important; } },
      { key: "deleg", title: "Delégalo o acórtalo", sub: "urgente, no importante", f: function (t) { return t.urgent && !t.important; } },
      { key: "drop", title: "Déjalo caer", sub: "ni urgente ni importante", f: function (t) { return !t.urgent && !t.important; } }
    ];
    var wrap = Q.el("div", "matrix");
    quads.forEach(function (q) {
      var cell = Q.el("div", "quad quad-" + q.key);
      var h = Q.el("div", "quad-head");
      h.appendChild(Q.el("strong", null, q.title));
      h.appendChild(Q.el("span", null, q.sub));
      cell.appendChild(h);
      var items = open.filter(q.f);
      if (!items.length) cell.appendChild(Q.el("p", "empty", "—"));
      else {
        var ul = Q.el("ul", "rows tight");
        items.forEach(function (t) { ul.appendChild(taskRow(t, { actions: false })); });
        cell.appendChild(ul);
      }
      wrap.appendChild(cell);
    });
    card.appendChild(wrap);
    card.appendChild(Q.el("p", "muted small",
      "Marca «urgente» e «importante» al editar una tarea para colocarla en su cuadrante."));
  }

  function renderBoard(card) {
    var cols = [
      { key: "todo", title: "Por hacer" },
      { key: "doing", title: "En marcha" },
      { key: "done", title: "Hecho" }
    ];
    var wrap = Q.el("div", "board");
    cols.forEach(function (c) {
      var col = Q.el("div", "col");
      col.dataset.status = c.key;
      var h = Q.el("div", "col-head");
      h.appendChild(Q.el("strong", null, c.title));
      var items = Q.db.tasks.filter(function (t) {
        return (t.status || (t.done ? "done" : "todo")) === c.key;
      });
      h.appendChild(Q.el("span", "count", String(items.length)));
      col.appendChild(h);

      var list = Q.el("div", "col-list");
      items.forEach(function (t) {
        var cardEl = Q.el("article", "tcard" + (t.done ? " is-done" : ""));
        cardEl.draggable = true;
        cardEl.dataset.id = t.id;
        cardEl.appendChild(Q.el("p", "tcard-title", t.title));
        var m = Q.el("div", "tcard-meta");
        var due = Q.dueLabel(t.due);
        if (due) m.appendChild(Q.el("span", "chip" + (due.late ? " is-late" : due.soon ? " is-soon" : ""), due.text));
        var g = t.goalId && Q.byId(Q.db.goals, t.goalId);
        if (g) m.appendChild(Q.el("span", "chip is-link", "◎ " + g.title));
        if (m.childNodes.length) cardEl.appendChild(m);
        var mv = Q.el("div", "tcard-move");
        cols.forEach(function (other) {
          if (other.key === c.key) return;
          mv.appendChild(Q.btn(null, "→ " + other.title, function () {
            moveTask(t.id, other.key);
          }));
        });
        cardEl.appendChild(mv);
        Q.on(cardEl, "dragstart", function (ev) {
          ev.dataTransfer.setData("text/plain", t.id);
          ev.dataTransfer.effectAllowed = "move";
          cardEl.classList.add("dragging");
        });
        Q.on(cardEl, "dragend", function () { cardEl.classList.remove("dragging"); });
        list.appendChild(cardEl);
      });
      if (!items.length) list.appendChild(Q.el("p", "empty", "—"));
      col.appendChild(list);

      Q.on(col, "dragover", function (ev) { ev.preventDefault(); col.classList.add("over"); });
      Q.on(col, "dragleave", function () { col.classList.remove("over"); });
      Q.on(col, "drop", function (ev) {
        ev.preventDefault();
        col.classList.remove("over");
        var id = ev.dataTransfer.getData("text/plain");
        if (id) moveTask(id, c.key);
      });
      wrap.appendChild(col);
    });
    card.appendChild(wrap);
    card.appendChild(Q.el("p", "muted small",
      "Arrastra las tarjetas entre columnas, o usa los botones de cada tarjeta."));
  }

  function moveTask(id, status) {
    var t = Q.byId(Q.db.tasks, id);
    if (!t) return;
    t.status = status;
    t.done = status === "done";
    t.doneAt = t.done ? (t.doneAt || Q.key(Q.today())) : null;
    Q.save();
    renderTasks();
  }

  /* ── vista: HÁBITOS ───────────────────────────────────────────────────── */
  var showArchived = false;

  function renderHabits() {
    var v = Q.$("#view-habits");
    Q.clear(v);

    var form = Q.el("section", "card");
    var fh = Q.el("div", "card-head");
    fh.appendChild(Q.el("h3", null, editingHabit ? "Editar hábito" : "Nuevo hábito"));
    form.appendChild(fh);
    var host = Q.el("div");
    form.appendChild(host);
    habitForm(host);
    v.appendChild(form);

    var card = Q.el("section", "card");
    var head = Q.el("div", "card-head");
    head.appendChild(Q.el("h3", null, "Tus hábitos"));
    var lbl = Q.el("label", "toggle");
    var cb = Q.input("checkbox", {});
    cb.checked = showArchived;
    Q.on(cb, "change", function () { showArchived = cb.checked; renderHabits(); });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(" ver archivados"));
    head.appendChild(lbl);
    card.appendChild(head);

    var rows = Q.db.habits.filter(function (h) { return showArchived || !h.archived; });
    if (!rows.length) {
      card.appendChild(Q.el("p", "empty", "Nada aquí todavía. Empieza con uno solo — de verdad, uno."));
    } else {
      var ul = Q.el("ul", "rows");
      rows.forEach(function (h) {
        var li = Q.el("li", "row" + (h.archived ? " is-archived" : ""));
        var dot = Q.el("span", "hue-dot");
        dot.style.background = h.color || Q.HUES[0];
        li.appendChild(dot);
        var body = Q.el("div", "row-body");
        body.appendChild(Q.el("span", "row-title", h.name));
        var r = rate(h, 30);
        var meta = Q.el("span", "row-meta");
        meta.appendChild(Q.el("span", "chip is-quiet", cadenceLabel(h)));
        meta.appendChild(Q.el("span", "chip is-quiet", r.hit + "/" + r.due + " en 30 días"));
        var n = streak(h);
        if (n) meta.appendChild(Q.el("span", "chip", "▲ " + n));
        if (h.note) meta.appendChild(Q.el("span", "chip is-quiet", h.note));
        body.appendChild(meta);
        li.appendChild(body);

        var acts = Q.el("div", "row-actions");
        acts.appendChild(Q.btn(null, "editar", function () { editingHabit = h; renderHabits(); }));
        acts.appendChild(Q.btn(null, h.archived ? "activar" : "archivar", function () {
          h.archived = !h.archived; Q.save(); renderHabits();
        }));
        acts.appendChild(Q.btn("del", "borrar", function () {
          if (!window.confirm("¿Borrar «" + h.name + "» y sus marcas? No se puede deshacer.")) return;
          Q.db.habits = Q.db.habits.filter(function (x) { return x.id !== h.id; });
          Object.keys(Q.db.log).forEach(function (k) {
            var e = Q.db.log[k];
            if (e.habits && e.habits[h.id]) delete e.habits[h.id];
            pruneEntry(k);
          });
          if (editingHabit === h) editingHabit = null;
          Q.save(); renderHabits();
        }));
        li.appendChild(acts);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    v.appendChild(card);
  }

  function cadenceLabel(h) {
    if (h.cadence === "daily") return "todos los días";
    if (h.cadence === "weekdays") return "de lunes a viernes";
    var d = (h.days || []).slice().sort();
    if (!d.length) return "sin días";
    return d.map(function (i) { return Q.DAY_LONG[i].slice(0, 3); }).join(", ");
  }

  Q.view("today", renderToday);
  Q.view("tasks", renderTasks);
  Q.view("habits", renderHabits);

  QP.tasks = {
    scheduled: scheduled, habitDone: habitDone, habitStart: habitStart,
    streak: streak, rate: rate, activeHabits: activeHabits,
    habitsDueOn: habitsDueOn, entry: entry, pruneEntry: pruneEntry,
    cadenceLabel: cadenceLabel, addTask: addTask, goalOptions: goalOptions,
    subjectOptions: subjectOptions, taskRow: taskRow,
    resetCursor: function () { cursor = Q.today(); }
  };
})();
