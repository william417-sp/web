/* Notas enlazadas y grafo interactivo.
   Escribe [[Otra nota]] para enlazar. Las notas también cuelgan de metas y
   asignaturas, y las casillas "- [ ] algo" se convierten en tareas reales. */
(function () {
  "use strict";
  var Q = QP;
  var openId = null;
  var query = "";

  var LINK_RE = /\[\[([^\]\n]{1,80})\]\]/g;

  function linkTargets(note) {
    var out = [], m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(note.body || "")) !== null) {
      var name = m[1].trim();
      if (name) out.push(name);
    }
    return out;
  }
  function findByTitle(name) {
    var s = Q.slug(name);
    for (var i = 0; i < Q.db.notes.length; i++) {
      if (Q.slug(Q.db.notes[i].title) === s) return Q.db.notes[i];
    }
    return null;
  }
  function backlinks(note) {
    return Q.db.notes.filter(function (n) {
      if (n.id === note.id) return false;
      return linkTargets(n).some(function (t) { return Q.slug(t) === Q.slug(note.title); });
    });
  }

  function newNote(title) {
    var n = {
      id: Q.uid("n"), title: title || "Nota sin título", body: "",
      goalId: null, subjectId: null,
      createdAt: Q.key(Q.today()), updatedAt: Q.key(Q.today())
    };
    Q.db.notes.push(n);
    Q.save();
    return n;
  }

  /* ── casillas dentro de la nota ───────────────────────────────────────── */
  function checkboxLines(note) {
    return (note.body || "").split("\n").map(function (line, i) {
      var m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/);
      return m ? { i: i, done: m[1].toLowerCase() === "x", text: m[2].trim() } : null;
    }).filter(Boolean);
  }
  function setLine(note, i, done) {
    var lines = note.body.split("\n");
    lines[i] = lines[i].replace(/\[( |x|X)\]/, done ? "[x]" : "[ ]");
    note.body = lines.join("\n");
    note.updatedAt = Q.key(Q.today());
  }
  function promoteToTasks(note) {
    var made = 0;
    checkboxLines(note).forEach(function (c) {
      if (c.done) return;
      var exists = Q.db.tasks.some(function (t) {
        return !t.done && Q.slug(t.title) === Q.slug(c.text);
      });
      if (exists) return;
      QP.tasks.addTask({
        title: c.text, note: "de la nota «" + note.title + "»",
        goalId: note.goalId, subjectId: note.subjectId
      });
      made++;
    });
    Q.toast(made ? made + (made === 1 ? " tarea creada." : " tareas creadas.")
      : "No había casillas sin marcar que no estuvieran ya en tus tareas.");
    Q.refresh();
  }

  /* Renderiza el cuerpo: enlaces clicables, casillas vivas, resto tal cual. */
  function renderBody(note, host) {
    Q.clear(host);
    (note.body || "").split("\n").forEach(function (line, idx) {
      var check = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/);
      if (check) {
        var done = check[1].toLowerCase() === "x";
        var row = Q.el("div", "note-check" + (done ? " is-done" : ""));
        var box = Q.btn("box", null, function () {
          setLine(note, idx, !done);
          Q.save();
          renderBody(note, host);
        });
        box.setAttribute("aria-pressed", String(done));
        row.appendChild(box);
        row.appendChild(inline(check[2]));
        host.appendChild(row);
        return;
      }
      if (!line.trim()) { host.appendChild(Q.el("div", "note-gap")); return; }
      var h = line.match(/^(#{1,3})\s+(.+)$/);
      if (h) {
        host.appendChild(Q.el("h" + (h[1].length + 3), "note-h", h[2]));
        return;
      }
      var p = Q.el("p", "note-p");
      p.appendChild(inline(line));
      host.appendChild(p);
    });
    if (!(note.body || "").trim()) host.appendChild(Q.el("p", "empty", "Nota vacía."));
  }

  function inline(text) {
    var frag = document.createDocumentFragment();
    var last = 0, m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var name = m[1].trim();
      var target = findByTitle(name);
      var a = Q.btn("wikilink" + (target ? "" : " is-missing"), name, function () {
        var t = findByTitle(name) || newNote(name);
        openId = t.id;
        render();
      });
      a.title = target ? "Ir a «" + name + "»" : "Crear «" + name + "»";
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  /* ── grafo ────────────────────────────────────────────────────────────────
     Simulación de fuerzas mínima sobre canvas: repulsión entre todos los
     nodos, muelles en las aristas y un tirón suave al centro. */
  function buildGraph() {
    var nodes = [], edges = [], index = {};
    function add(id, label, kind) {
      if (index[id]) return index[id];
      var n = {
        id: id, label: label, kind: kind,
        x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200,
        vx: 0, vy: 0, deg: 0
      };
      index[id] = n;
      nodes.push(n);
      return n;
    }
    Q.db.notes.forEach(function (n) { add("n:" + n.id, n.title, "note"); });
    Q.db.goals.filter(function (g) { return !g.archived; })
      .forEach(function (g) { add("g:" + g.id, g.title, "goal"); });
    Q.db.subjects.forEach(function (s) { add("s:" + s.id, s.name, "subject"); });

    function link(a, b) {
      if (!index[a] || !index[b] || a === b) return;
      edges.push({ a: index[a], b: index[b] });
      index[a].deg++; index[b].deg++;
    }
    Q.db.notes.forEach(function (n) {
      linkTargets(n).forEach(function (t) {
        var target = findByTitle(t);
        if (target) link("n:" + n.id, "n:" + target.id);
      });
      if (n.goalId) link("n:" + n.id, "g:" + n.goalId);
      if (n.subjectId) link("n:" + n.id, "s:" + n.subjectId);
    });
    Q.db.tasks.filter(function (t) { return !t.done; }).forEach(function (t) {
      if (!t.goalId && !t.subjectId) return;
      add("t:" + t.id, t.title, "task");
      if (t.goalId) link("t:" + t.id, "g:" + t.goalId);
      if (t.subjectId) link("t:" + t.id, "s:" + t.subjectId);
    });
    Q.db.habits.filter(function (h) { return !h.archived && h.goalId; }).forEach(function (h) {
      add("h:" + h.id, h.name, "habit");
      link("h:" + h.id, "g:" + h.goalId);
    });
    return { nodes: nodes, edges: edges };
  }

  var raf = null;
  function drawGraph(canvas) {
    var g = buildGraph();
    if (raf) cancelAnimationFrame(raf);
    if (!g.nodes.length) return null;

    var ctx = canvas.getContext("2d");
    var hover = null, dragging = null, pan = { x: 0, y: 0 }, zoom = 1;
    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue("--ink").trim() || "#2c2f2c";
    var faint = css.getPropertyValue("--line").trim() || "#ddd8ce";
    var KIND = {
      note: { c: Q.series(0), r: 6 }, goal: { c: Q.series(1), r: 9 },
      subject: { c: Q.series(2), r: 8 }, task: { c: Q.series(3), r: 5 },
      habit: { c: Q.series(4), r: 5 }
    };

    function size() {
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: w, h: h };
    }

    var steps = 0;
    function tick() {
      var s = size();
      var cx = s.w / 2 + pan.x, cy = s.h / 2 + pan.y;

      if (steps < 600) {
        steps++;
        for (var i = 0; i < g.nodes.length; i++) {
          var a = g.nodes[i];
          if (a === dragging) continue;
          for (var j = i + 1; j < g.nodes.length; j++) {
            var b = g.nodes[j];
            var dx = b.x - a.x, dy = b.y - a.y;
            var d2 = dx * dx + dy * dy || 0.01;
            var d = Math.sqrt(d2);
            var f = 1600 / d2;
            var ux = dx / d, uy = dy / d;
            a.vx -= ux * f; a.vy -= uy * f;
            b.vx += ux * f; b.vy += uy * f;
          }
          a.vx -= a.x * 0.0016;
          a.vy -= a.y * 0.0016;
        }
        g.edges.forEach(function (e) {
          var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var f = (d - 70) * 0.012;
          var ux = dx / d, uy = dy / d;
          e.a.vx += ux * f; e.a.vy += uy * f;
          e.b.vx -= ux * f; e.b.vy -= uy * f;
        });
        g.nodes.forEach(function (n) {
          if (n === dragging) { n.vx = n.vy = 0; return; }
          n.vx *= 0.86; n.vy *= 0.86;
          n.x += Q.clamp(n.vx, -8, 8);
          n.y += Q.clamp(n.vy, -8, 8);
        });
      }

      ctx.clearRect(0, 0, s.w, s.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = faint;
      g.edges.forEach(function (e) {
        ctx.globalAlpha = (hover && (hover === e.a || hover === e.b)) ? 0.9 : 0.45;
        ctx.beginPath();
        ctx.moveTo(cx + e.a.x * zoom, cy + e.a.y * zoom);
        ctx.lineTo(cx + e.b.x * zoom, cy + e.b.y * zoom);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      g.nodes.forEach(function (n) {
        var k = KIND[n.kind] || KIND.note;
        var r = (k.r + Math.min(4, n.deg)) * zoom;
        var x = cx + n.x * zoom, y = cy + n.y * zoom;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = k.c;
        ctx.fill();
        if (hover === n) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = ink;
          ctx.stroke();
        }
        if (hover === n || n.deg > 1 || g.nodes.length < 18) {
          ctx.fillStyle = ink;
          ctx.globalAlpha = hover === n ? 1 : 0.72;
          var label = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label;
          ctx.fillText(label, x, y + r + 13);
          ctx.globalAlpha = 1;
        }
      });
      raf = requestAnimationFrame(tick);
    }

    function at(ev) {
      var r = canvas.getBoundingClientRect();
      var s = { w: canvas.clientWidth, h: canvas.clientHeight };
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var cx = s.w / 2 + pan.x, cy = s.h / 2 + pan.y;
      var best = null, bestD = 22;
      g.nodes.forEach(function (n) {
        var d = Math.hypot(cx + n.x * zoom - mx, cy + n.y * zoom - my);
        if (d < bestD) { bestD = d; best = n; }
      });
      return { node: best, mx: mx, my: my, cx: cx, cy: cy };
    }

    Q.on(canvas, "pointermove", function (ev) {
      var h = at(ev);
      if (dragging) {
        dragging.x = (h.mx - h.cx) / zoom;
        dragging.y = (h.my - h.cy) / zoom;
        steps = Math.min(steps, 560);
        return;
      }
      hover = h.node;
      canvas.style.cursor = hover ? "pointer" : "default";
    });
    Q.on(canvas, "pointerdown", function (ev) {
      var h = at(ev);
      if (h.node) { dragging = h.node; canvas.setPointerCapture(ev.pointerId); }
    });
    Q.on(canvas, "pointerup", function (ev) {
      var h = at(ev);
      if (dragging && h.node === dragging && Math.abs(dragging.vx) < 2) openNode(dragging);
      dragging = null;
    });
    Q.on(canvas, "pointerleave", function () { hover = null; dragging = null; });
    Q.on(canvas, "wheel", function (ev) {
      ev.preventDefault();
      zoom = Q.clamp(zoom * (ev.deltaY < 0 ? 1.1 : 0.9), 0.4, 2.5);
    }, { passive: false });

    tick();
    return function () { if (raf) cancelAnimationFrame(raf); raf = null; };
  }

  function openNode(n) {
    var parts = n.id.split(":");
    if (parts[0] === "n") { openId = parts[1]; render(); }
    else if (parts[0] === "g") Q.show("goals");
    else if (parts[0] === "s") Q.show("study");
    else if (parts[0] === "t") Q.show("tasks");
    else if (parts[0] === "h") Q.show("habits");
  }

  /* ── vista ────────────────────────────────────────────────────────────── */
  var mode = "list";
  var stopGraph = null;

  function render() {
    if (stopGraph) { stopGraph(); stopGraph = null; }
    var v = Q.$("#view-notes");
    Q.clear(v);

    var card = Q.el("section", "card");
    var head = Q.el("div", "card-head");
    head.appendChild(Q.el("h3", null, "Notas"));
    var seg = Q.el("div", "segmented");
    [["list", "Lista"], ["graph", "Grafo"]].forEach(function (m) {
      var b = Q.btn(mode === m[0] ? "is-on" : "", m[1], function () { mode = m[0]; render(); });
      b.setAttribute("aria-pressed", String(mode === m[0]));
      seg.appendChild(b);
    });
    head.appendChild(seg);
    card.appendChild(head);

    if (mode === "graph") {
      var canvas = Q.el("canvas", "graph");
      canvas.setAttribute("aria-label", "Grafo de notas, metas, asignaturas, tareas y hábitos enlazados");
      card.appendChild(canvas);
      var legend = Q.el("div", "graph-legend");
      [["note", "nota"], ["goal", "meta"], ["subject", "asignatura"],
        ["task", "tarea"], ["habit", "hábito"]].forEach(function (p, i) {
        var item = Q.el("span", "legend-item");
        var dot = Q.el("span", "legend-dot");
        dot.style.background = Q.series(i);
        item.appendChild(dot);
        item.appendChild(document.createTextNode(p[1]));
        legend.appendChild(item);
      });
      card.appendChild(legend);
      card.appendChild(Q.el("p", "muted small",
        "Arrastra los nodos, haz rueda para acercar y clic para abrir. Los enlaces salen de escribir [[Nombre]] en una nota y de asignar metas o asignaturas."));
      v.appendChild(card);
      requestAnimationFrame(function () { stopGraph = drawGraph(canvas); });
      return;
    }

    var tools = Q.el("div", "toolbar");
    var search = Q.input("search", { placeholder: "buscar en notas…" });
    search.value = query;
    Q.on(search, "input", function () {
      query = search.value;
      drawList(listHost);
    });
    tools.appendChild(search);
    tools.appendChild(Q.btn("btn primary", "Nueva nota", function () {
      var n = newNote("Nota del " + Q.shortDate(Q.today()));
      openId = n.id;
      render();
    }));
    card.appendChild(tools);

    var listHost = Q.el("div", "note-split");
    card.appendChild(listHost);
    drawList(listHost);
    v.appendChild(card);
  }

  function drawList(host) {
    Q.clear(host);
    var q = Q.slug(query);
    var notes = Q.db.notes.filter(function (n) {
      if (!q) return true;
      return Q.slug(n.title).indexOf(q) !== -1 || Q.slug(n.body).indexOf(q) !== -1;
    }).sort(function (a, b) { return (b.updatedAt || "") < (a.updatedAt || "") ? -1 : 1; });

    var side = Q.el("aside", "note-list");
    if (!notes.length) {
      side.appendChild(Q.el("p", "empty", query ? "Nada coincide." : "Sin notas todavía."));
    }
    notes.forEach(function (n) {
      var b = Q.btn("note-item" + (n.id === openId ? " is-on" : ""), null, function () {
        openId = n.id; drawList(host);
      });
      b.appendChild(Q.el("strong", null, n.title));
      var links = linkTargets(n).length;
      var subParts = [n.updatedAt || n.createdAt];
      if (links) subParts.push(links + (links === 1 ? " enlace" : " enlaces"));
      b.appendChild(Q.el("span", null, subParts.join(" · ")));
      side.appendChild(b);
    });
    host.appendChild(side);

    var pane = Q.el("div", "note-pane");
    // Si no hay ninguna elegida, se abre la más reciente en vez de dejar el
    // panel derecho vacío.
    if ((!openId || !Q.byId(Q.db.notes, openId)) && notes.length) openId = notes[0].id;
    var note = openId && Q.byId(Q.db.notes, openId);
    if (!note) {
      pane.appendChild(Q.el("p", "empty",
        "Elige una nota, o crea una nueva. Escribe [[Nombre]] dentro para enlazarla con otra — el grafo se dibuja solo."));
      host.appendChild(pane);
      return;
    }

    var title = Q.input("text", { maxlength: 100 });
    title.className = "note-title";
    title.value = note.title;
    Q.on(title, "input", function () {
      note.title = title.value;
      note.updatedAt = Q.key(Q.today());
      Q.save();
    });
    pane.appendChild(title);

    var meta = Q.el("div", "grid-2");
    var goal = Q.select(QP.tasks.goalOptions(), note.goalId || "");
    Q.on(goal, "change", function () { note.goalId = goal.value || null; Q.save(); });
    meta.appendChild(Q.field("Meta", goal));
    var subj = Q.select(QP.tasks.subjectOptions(), note.subjectId || "");
    Q.on(subj, "change", function () { note.subjectId = subj.value || null; Q.save(); });
    meta.appendChild(Q.field("Asignatura", subj));
    pane.appendChild(meta);

    var body = Q.input("textarea", {
      rows: 12,
      placeholder: "Escribe.\n\n## Un título\n- [ ] una casilla que puede volverse tarea\nEnlaza con [[Otra nota]]."
    });
    body.className = "note-body";
    body.value = note.body;
    var preview = Q.el("div", "note-render");
    var t = null;
    Q.on(body, "input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        note.body = body.value;
        note.updatedAt = Q.key(Q.today());
        Q.save();
        renderBody(note, preview);
      }, 400);
    });
    pane.appendChild(body);

    var acts = Q.el("div", "form-actions");
    var pending = checkboxLines(note).filter(function (c) { return !c.done; }).length;
    acts.appendChild(Q.btn("btn", "Pasar casillas a tareas" + (pending ? " (" + pending + ")" : ""), function () {
      note.body = body.value;
      promoteToTasks(note);
    }));
    acts.appendChild(Q.btn("btn danger", "Borrar nota", function () {
      if (!window.confirm("¿Borrar «" + note.title + "»?")) return;
      Q.db.notes = Q.db.notes.filter(function (x) { return x.id !== note.id; });
      openId = null;
      Q.save(); drawList(host);
    }));
    pane.appendChild(acts);

    pane.appendChild(Q.el("h4", "note-sub", "Vista"));
    renderBody(note, preview);
    pane.appendChild(preview);

    var back = backlinks(note);
    if (back.length) {
      pane.appendChild(Q.el("h4", "note-sub", "Enlazan aquí"));
      var ul = Q.el("ul", "backlinks");
      back.forEach(function (b) {
        var li = Q.el("li");
        li.appendChild(Q.btn("wikilink", b.title, function () { openId = b.id; drawList(host); }));
        ul.appendChild(li);
      });
      pane.appendChild(ul);
    }
    host.appendChild(pane);
  }

  Q.view("notes", render);
  QP.notes = { linkTargets: linkTargets, findByTitle: findByTitle, buildGraph: buildGraph };
})();
