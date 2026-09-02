/* Metas: foto, fecha límite y progreso calculado desde lo que ya haces. */
(function () {
  "use strict";
  var Q = QP;
  var editing = null;

  /* El progreso no se teclea a mano: sale de las tareas y hábitos colgados de
     la meta. Si no hay nada colgado, se usa el valor manual. */
  function progress(g) {
    var tasks = Q.db.tasks.filter(function (t) { return t.goalId === g.id; });
    var habits = Q.db.habits.filter(function (h) { return h.goalId === g.id && !h.archived; });
    if (!tasks.length && !habits.length) {
      return { pct: Q.clamp(g.manual || 0, 0, 100), source: "manual", tasks: 0, habits: 0 };
    }
    var doneTasks = tasks.filter(function (t) { return t.done; }).length;
    var parts = [], weights = [];
    if (tasks.length) { parts.push(doneTasks / tasks.length); weights.push(tasks.length); }
    if (habits.length) {
      var avg = Q.sum(habits, function (h) { return QP.tasks.rate(h, 30).pct; }) / habits.length;
      parts.push(avg / 100); weights.push(habits.length);
    }
    var total = Q.sum(weights);
    var pct = Math.round(Q.sum(parts.map(function (p, i) { return p * weights[i]; })) / total * 100);
    return {
      pct: Q.clamp(pct, 0, 100), source: "auto",
      tasks: tasks.length, doneTasks: doneTasks, habits: habits.length
    };
  }

  function daysLeft(g) {
    if (!g.deadline) return null;
    return Math.round((Q.parseKey(g.deadline) - Q.today()) / 86400000);
  }

  /* Las fotos se guardan como data URI dentro del propio almacén. Se reescalan
     antes para no llenar localStorage con un JPEG de 4 MB. */
  function readPhoto(file, cb) {
    if (!/^image\//.test(file.type)) { Q.toast("Eso no es una imagen.", true); return; }
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 640;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = function () { Q.toast("No se pudo leer la imagen.", true); };
      img.src = String(r.result);
    };
    r.onerror = function () { Q.toast("No se pudo leer el archivo.", true); };
    r.readAsDataURL(file);
  }

  function form(host) {
    Q.clear(host);
    var g = editing || {};
    var photo = g.photo || null;
    var f = Q.el("form", "stack");

    var title = Q.input("text", { maxlength: 80, placeholder: "Correr 10 km seguidos", required: "required" });
    title.value = g.title || "";
    f.appendChild(Q.field("Meta", title));

    var why = Q.input("textarea", { rows: 2, maxlength: 300, placeholder: "Por qué te importa. Léelo los días flojos." });
    why.value = g.why || "";
    f.appendChild(Q.field("Por qué", why));

    var grid = Q.el("div", "grid-2");
    var deadline = Q.input("date", {});
    deadline.value = g.deadline || "";
    grid.appendChild(Q.field("Fecha límite", deadline));
    var manual = Q.input("number", { min: 0, max: 100, step: 1 });
    manual.value = g.manual == null ? 0 : g.manual;
    grid.appendChild(Q.field("Progreso manual (%)", manual));
    f.appendChild(grid);

    var photoWrap = Q.el("div", "photo-field");
    var preview = Q.el("div", "photo-preview");
    function drawPreview() {
      Q.clear(preview);
      if (photo) {
        var im = new Image();
        im.src = photo;
        im.alt = "";
        preview.appendChild(im);
        preview.appendChild(Q.btn("photo-clear", "quitar", function () {
          photo = null; drawPreview();
        }));
      } else preview.appendChild(Q.el("span", "muted small", "sin foto"));
    }
    drawPreview();
    var file = Q.input("file", { accept: "image/*" });
    Q.on(file, "change", function () {
      if (file.files && file.files[0]) readPhoto(file.files[0], function (d) { photo = d; drawPreview(); });
      file.value = "";
    });
    photoWrap.appendChild(preview);
    photoWrap.appendChild(file);
    f.appendChild(Q.field("Foto", photoWrap));

    var actions = Q.el("div", "form-actions");
    var submit = Q.el("button", "btn primary", editing ? "Guardar" : "Añadir meta");
    submit.type = "submit";
    actions.appendChild(submit);
    if (editing) actions.appendChild(Q.btn("btn ghost", "Cancelar", function () {
      editing = null; render();
    }));
    f.appendChild(actions);

    Q.on(f, "submit", function (ev) {
      ev.preventDefault();
      var v = title.value.trim();
      if (!v) return;
      var data = {
        title: v, why: why.value.trim(), deadline: deadline.value || null,
        manual: Q.clamp(parseInt(manual.value, 10) || 0, 0, 100), photo: photo
      };
      if (editing) Object.assign(editing, data);
      else {
        data.id = Q.uid("g");
        data.archived = false;
        data.createdAt = Q.key(Q.today());
        Q.db.goals.push(data);
      }
      editing = null;
      Q.save(); render();
      Q.toast("Meta guardada.");
    });
    host.appendChild(f);
  }

  function render() {
    var v = Q.$("#view-goals");
    Q.clear(v);

    var fc = Q.el("section", "card");
    var fh = Q.el("div", "card-head");
    fh.appendChild(Q.el("h3", null, editing ? "Editar meta" : "Nueva meta"));
    fc.appendChild(fh);
    var host = Q.el("div");
    fc.appendChild(host);
    form(host);
    v.appendChild(fc);

    var live = Q.db.goals.filter(function (g) { return !g.archived; });
    var card = Q.el("section", "card");
    var head = Q.el("div", "card-head");
    head.appendChild(Q.el("h3", null, "Tus metas"));
    head.appendChild(Q.el("span", "count", live.length ? live.length + " activas" : ""));
    card.appendChild(head);

    if (!Q.db.goals.length) {
      card.appendChild(Q.el("p", "empty",
        "Sin metas todavía. Una meta es el sitio donde cuelgas tareas y hábitos para ver si de verdad avanzan."));
    } else {
      var grid = Q.el("div", "goal-grid");
      Q.db.goals.forEach(function (g) {
        var p = progress(g);
        var art = Q.el("article", "goal" + (g.archived ? " is-archived" : ""));

        if (g.photo) {
          var im = new Image();
          im.src = g.photo;
          im.alt = "";
          im.className = "goal-photo";
          art.appendChild(im);
        }

        var body = Q.el("div", "goal-body");
        body.appendChild(Q.el("h4", null, g.title));
        if (g.why) body.appendChild(Q.el("p", "goal-why", g.why));

        var ring = Q.el("div", "goal-progress");
        var track = Q.el("div", "goal-track");
        var fill = Q.el("div", "goal-fill");
        fill.style.width = p.pct + "%";
        track.appendChild(fill);
        ring.appendChild(track);
        ring.appendChild(Q.el("strong", null, p.pct + "%"));
        body.appendChild(ring);

        var meta = Q.el("div", "row-meta");
        var dl = daysLeft(g);
        if (dl != null) {
          meta.appendChild(Q.el("span", "chip" + (dl < 0 ? " is-late" : dl <= 14 ? " is-soon" : ""),
            dl < 0 ? "venció hace " + (-dl) + " días" : dl === 0 ? "vence hoy" : "quedan " + dl + " días"));
        }
        if (p.source === "auto") {
          if (p.tasks) meta.appendChild(Q.el("span", "chip is-quiet", p.doneTasks + "/" + p.tasks + " tareas"));
          if (p.habits) meta.appendChild(Q.el("span", "chip is-quiet", p.habits + (p.habits === 1 ? " hábito" : " hábitos")));
        } else {
          meta.appendChild(Q.el("span", "chip is-quiet", "progreso manual"));
        }
        body.appendChild(meta);

        var acts = Q.el("div", "row-actions");
        acts.appendChild(Q.btn(null, "editar", function () { editing = g; render(); window.scrollTo({ top: 0 }); }));
        acts.appendChild(Q.btn(null, g.archived ? "activar" : "archivar", function () {
          g.archived = !g.archived; Q.save(); render();
        }));
        acts.appendChild(Q.btn("del", "borrar", function () {
          if (!window.confirm("¿Borrar la meta «" + g.title + "»? Las tareas y hábitos colgados de ella se quedan, sueltos.")) return;
          Q.db.goals = Q.db.goals.filter(function (x) { return x.id !== g.id; });
          Q.db.tasks.forEach(function (t) { if (t.goalId === g.id) t.goalId = null; });
          Q.db.habits.forEach(function (h) { if (h.goalId === g.id) h.goalId = null; });
          Q.db.notes.forEach(function (n) { if (n.goalId === g.id) n.goalId = null; });
          if (editing === g) editing = null;
          Q.save(); render();
        }));
        body.appendChild(acts);

        art.appendChild(body);
        grid.appendChild(art);
      });
      card.appendChild(grid);
      card.appendChild(Q.el("p", "muted small",
        "El porcentaje sale solo de las tareas y hábitos asignados a la meta. Sin nada asignado, manda el progreso manual."));
    }
    v.appendChild(card);
  }

  Q.view("goals", render);
  QP.goals = { progress: progress, daysLeft: daysLeft };
})();
