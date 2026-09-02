/* Dinero: ingresos, gastos, cuotas e importación de extractos.
   Los importes se guardan en céntimos enteros — nunca se suman floats. */
(function () {
  "use strict";
  var Q = QP;
  var month = Q.monthKey(Q.today());
  var editing = null;

  function inMonth(t, mk) { return (t.date || "").slice(0, 7) === mk; }
  function monthsPresent() {
    var set = {};
    Q.db.tx.forEach(function (t) { set[(t.date || "").slice(0, 7)] = true; });
    set[Q.monthKey(Q.today())] = true;
    return Object.keys(set).filter(Boolean).sort();
  }
  function totals(mk) {
    var rows = Q.db.tx.filter(function (t) { return inMonth(t, mk); });
    var inc = Q.sum(rows.filter(function (t) { return t.kind === "in"; }), function (t) { return t.amount; });
    var out = Q.sum(rows.filter(function (t) { return t.kind === "out"; }), function (t) { return t.amount; });
    return { inc: inc, out: out, net: inc - out, rows: rows };
  }

  /* Una compra a plazos se guarda como N movimientos, uno por mes, unidos por
     un id de grupo. Así el mes que lo pagas ves justo lo que te toca. */
  function addTx(f) {
    var parts = Math.max(1, parseInt(f.parts, 10) || 1);
    var group = parts > 1 ? Q.uid("grp") : null;
    var per = Math.round(f.amount / parts);
    var made = [];
    for (var i = 0; i < parts; i++) {
      var d = Q.addMonths(Q.parseKey(f.date), i);
      // El redondeo sobrante se mete en la última cuota: la suma cuadra.
      var amount = i === parts - 1 ? f.amount - per * (parts - 1) : per;
      made.push({
        id: Q.uid("m"), date: Q.key(d), amount: amount, kind: f.kind,
        category: f.category || "Sin categoría", note: f.note || "",
        group: group, part: parts > 1 ? i + 1 : null, parts: parts > 1 ? parts : null
      });
    }
    Q.db.tx = Q.db.tx.concat(made);
    Q.save();
    return made;
  }

  /* Detecta "3/12", "cuota 2 de 6", "(1 de 4)" en el concepto del extracto. */
  function detectInstallment(text) {
    var m = String(text).match(/(?:cuota\s*)?(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})/i);
    if (!m) return null;
    var part = +m[1], parts = +m[2];
    if (part < 1 || parts < 2 || part > parts || parts > 60) return null;
    return { part: part, parts: parts };
  }

  function categoryTotals(mk) {
    var rows = Q.db.tx.filter(function (t) { return inMonth(t, mk) && t.kind === "out"; });
    var by = Q.groupBy(rows, function (t) { return t.category || "Sin categoría"; });
    return Object.keys(by).map(function (c) {
      return { label: c, value: Q.sum(by[c], function (t) { return t.amount; }), n: by[c].length };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  /* ── importar ─────────────────────────────────────────────────────────── */
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var text = String(r.result);
      var rows;
      if (/\.ofx$/i.test(file.name) || /<STMTTRN>/i.test(text)) {
        rows = Q.parseOFX(text);
      } else if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        rows = fromCSV(Q.parseCSV(text));
      } else {
        Q.toast("Formato no reconocido. Usa CSV u OFX; los .xlsx hay que exportarlos a CSV primero.", true);
        return;
      }
      if (!rows || !rows.length) {
        Q.toast("No encontré movimientos en ese archivo.", true);
        return;
      }
      var added = 0, dupes = 0, split = 0;
      rows.forEach(function (row) {
        var dupe = Q.db.tx.some(function (t) {
          return t.date === row.date && t.amount === row.amount &&
            t.kind === row.kind && Q.slug(t.note) === Q.slug(row.note);
        });
        if (dupe) { dupes++; return; }
        var inst = detectInstallment(row.note);
        Q.db.tx.push({
          id: Q.uid("m"), date: row.date, amount: row.amount, kind: row.kind,
          category: row.category || "Sin categoría", note: row.note,
          group: null, part: inst ? inst.part : null, parts: inst ? inst.parts : null
        });
        if (inst) split++;
        added++;
      });
      Q.save();
      render();
      Q.toast(added + " movimientos importados" +
        (dupes ? ", " + dupes + " repetidos omitidos" : "") +
        (split ? ", " + split + " con cuota detectada" : "") + ".");
    };
    r.onerror = function () { Q.toast("No se pudo leer el archivo.", true); };
    r.readAsText(file);
  }

  function fromCSV(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return Q.slug(h); });
    var find = function (names) {
      for (var i = 0; i < head.length; i++) {
        for (var j = 0; j < names.length; j++) if (head[i].indexOf(names[j]) !== -1) return i;
      }
      return -1;
    };
    var iDate = find(["fecha", "date", "data"]);
    var iAmount = find(["importe", "amount", "valor", "cantidad", "monto"]);
    var iNote = find(["concepto", "descripcion", "description", "memo", "detalle"]);
    var iCat = find(["categoria", "category", "rubro"]);
    var hasHeader = iDate !== -1 && iAmount !== -1;
    var body = hasHeader ? rows.slice(1) : rows;
    if (!hasHeader) { iDate = 0; iAmount = 1; iNote = 2; }

    return body.map(function (r) {
      var raw = (r[iDate] || "").trim();
      var date = normalizeDate(raw);
      var cents = Q.parseMoney(r[iAmount] || "");
      if (!date || isNaN(cents) || cents === 0) return null;
      return {
        date: date, amount: Math.abs(cents),
        kind: cents < 0 ? "out" : "in",
        note: (iNote !== -1 ? r[iNote] : "") || "Movimiento",
        category: iCat !== -1 ? (r[iCat] || "").trim() : ""
      };
    }).filter(Boolean);
  }

  function normalizeDate(s) {
    s = String(s).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
      var y = m[3].length === 2 ? "20" + m[3] : m[3];
      return y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
    }
    return null;
  }

  /* ── formulario ───────────────────────────────────────────────────────── */
  function form(host) {
    Q.clear(host);
    var t = editing || {};
    var f = Q.el("form", "stack");

    var g1 = Q.el("div", "grid-3");
    var kind = Q.select([{ value: "out", label: "Gasto" }, { value: "in", label: "Ingreso" }], t.kind || "out");
    g1.appendChild(Q.field("Tipo", kind));
    var amount = Q.input("text", { placeholder: "34,90", inputmode: "decimal", required: "required" });
    amount.value = t.amount ? (t.amount / 100).toFixed(2) : "";
    g1.appendChild(Q.field("Importe", amount));
    var date = Q.input("date", { required: "required" });
    date.value = t.date || Q.key(Q.today());
    g1.appendChild(Q.field("Fecha", date));
    f.appendChild(g1);

    var g2 = Q.el("div", "grid-2");
    var cats = Q.db.categories.slice();
    if (t.category && cats.indexOf(t.category) === -1) cats.push(t.category);
    var cat = Q.input("text", { list: "catList", placeholder: "Comida", maxlength: 40 });
    cat.value = t.category || "";
    g2.appendChild(Q.field("Categoría", cat));
    var parts = Q.input("number", { min: 1, max: 60, step: 1 });
    parts.value = 1;
    parts.disabled = !!editing;
    g2.appendChild(Q.field(editing ? "Cuotas (solo al crear)" : "Cuotas", parts));
    f.appendChild(g2);

    var dl = Q.el("datalist");
    dl.id = "catList";
    cats.forEach(function (c) { var o = Q.el("option"); o.value = c; dl.appendChild(o); });
    f.appendChild(dl);

    var note = Q.input("text", { maxlength: 120, placeholder: "concepto" });
    note.value = t.note || "";
    f.appendChild(Q.field("Concepto", note));

    var actions = Q.el("div", "form-actions");
    var submit = Q.el("button", "btn primary", editing ? "Guardar" : "Añadir");
    submit.type = "submit";
    actions.appendChild(submit);
    if (editing) actions.appendChild(Q.btn("btn ghost", "Cancelar", function () {
      editing = null; render();
    }));
    f.appendChild(actions);

    Q.on(f, "submit", function (ev) {
      ev.preventDefault();
      var cents = Q.parseMoney(amount.value);
      if (isNaN(cents) || cents <= 0) { Q.toast("Importe no válido.", true); return; }
      if (!date.value) { Q.toast("Falta la fecha.", true); return; }
      var c = cat.value.trim() || "Sin categoría";
      if (Q.db.categories.indexOf(c) === -1 && c !== "Sin categoría") Q.db.categories.push(c);
      if (editing) {
        editing.amount = cents; editing.kind = kind.value; editing.date = date.value;
        editing.category = c; editing.note = note.value.trim();
        editing = null;
      } else {
        var made = addTx({
          amount: cents, kind: kind.value, date: date.value,
          category: c, note: note.value.trim(), parts: parts.value
        });
        if (made.length > 1) Q.toast("Repartido en " + made.length + " cuotas mensuales.");
        month = date.value.slice(0, 7);
      }
      Q.save(); render();
    });
    host.appendChild(f);
  }

  /* ── vista ────────────────────────────────────────────────────────────── */
  function render() {
    var v = Q.$("#view-money");
    Q.clear(v);

    var fc = Q.el("section", "card");
    var fh = Q.el("div", "card-head");
    fh.appendChild(Q.el("h3", null, editing ? "Editar movimiento" : "Nuevo movimiento"));
    var tools = Q.el("div", "row-actions");
    var file = Q.input("file", { accept: ".csv,.tsv,.txt,.ofx,text/csv" });
    file.hidden = true;
    Q.on(file, "change", function () {
      if (file.files && file.files[0]) importFile(file.files[0]);
      file.value = "";
    });
    tools.appendChild(Q.btn(null, "importar CSV/OFX", function () { file.click(); }));
    tools.appendChild(file);
    fh.appendChild(tools);
    fc.appendChild(fh);
    var host = Q.el("div");
    fc.appendChild(host);
    form(host);
    v.appendChild(fc);

    var months = monthsPresent();
    if (months.indexOf(month) === -1) month = months[months.length - 1];
    var t = totals(month);

    var sum = Q.el("section", "card");
    var sh = Q.el("div", "card-head");
    sh.appendChild(Q.el("h3", null, Q.monthLabel(month)));
    var nav = Q.el("div", "segmented");
    nav.appendChild(Q.btn(null, "←", function () {
      var i = months.indexOf(month);
      if (i > 0) { month = months[i - 1]; render(); }
    }));
    var pick = Q.select(months.map(function (m) {
      return { value: m, label: Q.monthLabel(m) };
    }), month);
    Q.on(pick, "change", function () { month = pick.value; render(); });
    nav.appendChild(pick);
    nav.appendChild(Q.btn(null, "→", function () {
      var i = months.indexOf(month);
      if (i < months.length - 1) { month = months[i + 1]; render(); }
    }));
    sh.appendChild(nav);
    sum.appendChild(sh);

    var stats = Q.el("div", "stats");
    [["Ingresos", t.inc, "in"], ["Gastos", t.out, "out"], ["Saldo", t.net, "net"]]
      .forEach(function (p) {
        var s = Q.el("div", "stat");
        var b = Q.el("b", null, Q.money(p[1]));
        if (p[2] === "net") b.className = t.net < 0 ? "is-neg" : "is-pos";
        s.appendChild(b);
        s.appendChild(Q.el("span", null, p[0]));
        stats.appendChild(s);
      });
    sum.appendChild(stats);
    v.appendChild(sum);

    // Gasto por categoría: barras con etiqueta directa siempre visible.
    var byCat = categoryTotals(month);
    var catCard = Q.el("section", "card");
    var ch = Q.el("div", "card-head");
    ch.appendChild(Q.el("h3", null, "En qué se fue"));
    ch.appendChild(Q.el("span", "count", byCat.length ? byCat.length + " categorías" : ""));
    catCard.appendChild(ch);
    var vizHost = Q.el("div", "viz-host");
    catCard.appendChild(vizHost);
    // Más de 8 categorías se pliegan en "Otras": la paleta no se cicla.
    var shown = byCat.slice(0, 8);
    if (byCat.length > 8) {
      shown.push({
        label: "Otras", n: Q.sum(byCat.slice(8), function (c) { return c.n; }),
        value: Q.sum(byCat.slice(8), function (c) { return c.value; })
      });
    }
    Q.barList(vizHost, shown.map(function (c, i) {
      return {
        label: c.label, value: c.value,
        color: c.label === "Otras" ? null : Q.series(i),
        sub: c.n + (c.n === 1 ? " movimiento" : " movimientos") +
          " · " + (t.out ? Math.round(c.value / t.out * 100) : 0) + "% del gasto"
      };
    }), { fmt: function (v) { return Q.money(v); }, emptyText: "Sin gastos este mes." });
    v.appendChild(catCard);

    // Evolución mes a mes.
    if (months.length > 1) {
      var trend = Q.el("section", "card");
      var th = Q.el("div", "card-head");
      th.appendChild(Q.el("h3", null, "Gasto mes a mes"));
      trend.appendChild(th);
      var tHost = Q.el("div", "viz-host");
      trend.appendChild(tHost);
      Q.columns(tHost, months.slice(-12).map(function (m) {
        return {
          label: Q.monthLabel(m), short: Q.MONTHS_SHORT[+m.split("-")[1] - 1],
          // El mes elegido se resalta con el acento de la interfaz, no con un
          // color de serie: es un estado de selección, no otra categoría.
          value: totals(m).out,
          color: m === month ? getComputedStyle(document.documentElement)
            .getPropertyValue("--accent").trim() : null
        };
      }), { fmt: function (v) { return Q.money(v); } });
      v.appendChild(trend);
    }

    // Movimientos del mes.
    var list = Q.el("section", "card");
    var lh = Q.el("div", "card-head");
    lh.appendChild(Q.el("h3", null, "Movimientos"));
    lh.appendChild(Q.el("span", "count", t.rows.length ? t.rows.length + "" : ""));
    list.appendChild(lh);
    if (!t.rows.length) {
      list.appendChild(Q.el("p", "empty", "Nada este mes."));
    } else {
      var ul = Q.el("ul", "rows");
      t.rows.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (tx) {
        var li = Q.el("li", "row");
        var body = Q.el("div", "row-body");
        body.appendChild(Q.el("span", "row-title", tx.note || tx.category));
        var meta = Q.el("span", "row-meta");
        meta.appendChild(Q.el("span", "chip is-quiet", Q.shortDate(Q.parseKey(tx.date))));
        meta.appendChild(Q.el("span", "chip is-quiet", tx.category));
        if (tx.parts) meta.appendChild(Q.el("span", "chip", "cuota " + tx.part + "/" + tx.parts));
        body.appendChild(meta);
        li.appendChild(body);
        var amt = Q.el("span", "amount " + (tx.kind === "in" ? "is-pos" : "is-neg"),
          (tx.kind === "in" ? "+" : "−") + Q.money(tx.amount));
        li.appendChild(amt);
        var acts = Q.el("div", "row-actions");
        acts.appendChild(Q.btn(null, "editar", function () {
          editing = tx; render(); window.scrollTo({ top: 0 });
        }));
        acts.appendChild(Q.btn("del", "borrar", function () {
          var others = tx.group ? Q.db.tx.filter(function (x) { return x.group === tx.group; }).length : 1;
          var msg = others > 1
            ? "Esto forma parte de " + others + " cuotas. ¿Borrar todas?"
            : "¿Borrar este movimiento?";
          if (!window.confirm(msg)) return;
          Q.db.tx = Q.db.tx.filter(function (x) {
            return tx.group ? x.group !== tx.group : x.id !== tx.id;
          });
          Q.save(); render();
        }));
        li.appendChild(acts);
        ul.appendChild(li);
      });
      list.appendChild(ul);
    }
    list.appendChild(Q.el("p", "muted small",
      "Importa extractos en CSV u OFX. Los .xlsx hay que guardarlos como CSV antes — no llevo un lector de Excel dentro. Los repetidos se detectan y se omiten."));
    v.appendChild(list);
  }

  Q.view("money", render);
  // Ojo: NO usar QP.money — ese nombre es el formateador de importes del
  // núcleo, y asignarlo aquí lo dejaría inservible en toda la app.
  QP.finance = {
    totals: totals, categoryTotals: categoryTotals, monthsPresent: monthsPresent,
    detectInstallment: detectInstallment, addTx: addTx, fromCSV: fromCSV
  };
})();
