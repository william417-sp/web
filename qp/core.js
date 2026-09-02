/* Quiet Process — núcleo compartido: estado, fechas, DOM, router y gráficos.
   Script clásico (no módulo ES) para que la app siga abriéndose con doble
   clic desde file:// sin servidor ni build. */
var QP = (function () {
  "use strict";

  var KEY = "quiet-process.v2";
  var LEGACY_KEY = "quiet-process.v1";
  var THEME_KEY = "quiet-process.theme";

  var DAY_SHORT = ["D", "L", "M", "X", "J", "V", "S"];
  var DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic"];

  /* Paleta categórica validada con el validador de dataviz: orden fijo, nunca
     ciclado. Los pares adyacentes superan los umbrales de daltonismo y de
     visión normal en claro y en oscuro. */
  var SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100",
    "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
  var SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500",
    "#d55181", "#008300", "#9085e9", "#e66767"];

  /* Colores de identidad (hábitos, metas, asignaturas). Deliberadamente
     apagados: no son una escala de gráfico y nunca cargan el significado
     solos — siempre acompañan al nombre escrito. */
  var HUES = ["#6f8a75", "#7a8496", "#8a7f6f", "#96757f", "#87906a", "#6f8a8a"];

  /* ── fechas: siempre hora local, clave YYYY-MM-DD ─────────────────────── */
  function key(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function parseKey(s) {
    var p = String(s).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function addDays(d, n) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    c.setDate(c.getDate() + n);
    return c;
  }
  function addMonths(d, n) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = c.getDate();
    c.setDate(1);
    c.setMonth(c.getMonth() + n);
    // Si el día no existe en el mes destino (31 → febrero), cae al último.
    c.setDate(Math.min(day, new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()));
    return c;
  }
  function longDate(d) {
    return DAY_LONG[d.getDay()] + " " + d.getDate() + " de " +
      MONTHS[d.getMonth()] + " de " + d.getFullYear();
  }
  function shortDate(d) { return d.getDate() + " " + MONTHS_SHORT[d.getMonth()]; }
  function monthKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function monthLabel(mk) {
    var p = mk.split("-");
    return MONTHS[+p[1] - 1] + " " + p[0];
  }
  function relativeDay(d) {
    var diff = Math.round((d - today()) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === -1) return "Ayer";
    if (diff === 1) return "Mañana";
    return shortDate(d);
  }
  function dueLabel(dateKey) {
    if (!dateKey) return null;
    var d = parseKey(dateKey);
    var diff = Math.round((d - today()) / 86400000);
    if (diff < 0) return { text: diff === -1 ? "ayer" : "hace " + (-diff) + " días", late: true };
    if (diff === 0) return { text: "hoy", soon: true };
    if (diff === 1) return { text: "mañana", soon: true };
    if (diff <= 7) return { text: "en " + diff + " días" };
    return { text: shortDate(d) };
  }

  /* ── utilidades ───────────────────────────────────────────────────────── */
  function uid(p) {
    return (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function sum(arr, f) {
    return arr.reduce(function (a, x) { return a + (f ? f(x) : x); }, 0);
  }
  function groupBy(arr, f) {
    var out = {};
    arr.forEach(function (x) {
      var k = f(x);
      (out[k] = out[k] || []).push(x);
    });
    return out;
  }
  function byId(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function slug(s) {
    return String(s).trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* Dinero en céntimos enteros: nada de sumar floats. */
  function money(cents, opts) {
    var o = opts || {};
    var v = (cents || 0) / 100;
    var s;
    try {
      s = v.toLocaleString(db.settings.locale || "es-ES", {
        style: "currency", currency: db.settings.currency || "EUR",
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    } catch (e) {
      s = v.toFixed(2) + " " + (db.settings.currency || "EUR");
    }
    if (o.sign && cents > 0) s = "+" + s;
    return s;
  }
  function parseMoney(str) {
    var s = String(str).trim().replace(/[^\d,.\-]/g, "");
    if (!s) return NaN;
    // El último separador manda: "1.234,56" y "1,234.56" salen igual.
    var lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var n = parseFloat(s);
    return isNaN(n) ? NaN : Math.round(n * 100);
  }

  /* ── DOM ──────────────────────────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  /* Vaciar un nodo puede disparar un blur en el hijo que se quita, y ese blur
     puede volver a redibujar la misma zona. Si eso pasa, el nodo ya no es hijo
     nuestro: se corta en seco en vez de lanzar. */
  function clear(node) {
    if (!node) return;
    while (node.firstChild) {
      var c = node.firstChild;
      if (c.parentNode !== node) break;
      node.removeChild(c);
    }
  }
  function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
  function svg(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }
  function btn(cls, text, fn) {
    var b = el("button", cls, text);
    b.type = "button";
    if (fn) b.addEventListener("click", fn);
    return b;
  }
  function field(labelText, control) {
    var l = el("label", "field");
    l.appendChild(el("span", "field-label", labelText));
    l.appendChild(control);
    return l;
  }
  function input(type, attrs) {
    var i = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") i.type = type;
    for (var k in attrs) if (attrs[k] != null) i.setAttribute(k, attrs[k]);
    return i;
  }
  function select(options, value) {
    var s = document.createElement("select");
    options.forEach(function (o) {
      var op = el("option", null, o.label);
      op.value = o.value;
      if (String(o.value) === String(value)) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }

  /* ── estado ───────────────────────────────────────────────────────────── */
  function blank() {
    return {
      version: 2,
      createdAt: key(today()),
      settings: {
        currency: "EUR", locale: "es-ES",
        pomo: { work: 25, short: 5, long: 15, rounds: 4 }
      },
      habits: [], log: {}, tasks: [], goals: [], notes: [],
      exercises: [], workouts: [],
      tx: [], categories: ["Casa", "Comida", "Transporte", "Salud", "Ocio", "Trabajo"],
      subjects: [], sessions: []
    };
  }

  /* Rellena huecos sin pisar lo que ya existe: sirve tanto para datos viejos
     como para archivos importados a los que les falte una sección. */
  function normalize(d) {
    var base = blank();
    if (!d || typeof d !== "object") return base;
    ["habits", "tasks", "goals", "notes", "exercises", "workouts", "tx",
      "categories", "subjects", "sessions"].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = base[k];
    });
    if (!d.log || typeof d.log !== "object") d.log = {};
    if (!d.settings || typeof d.settings !== "object") d.settings = base.settings;
    if (!d.settings.pomo) d.settings.pomo = base.settings.pomo;
    if (!d.settings.currency) d.settings.currency = "EUR";
    if (!d.settings.locale) d.settings.locale = "es-ES";
    if (!d.createdAt) d.createdAt = key(today());
    d.version = 2;
    return d;
  }

  function migrateV1(old) {
    var d = blank();
    d.habits = Array.isArray(old.habits) ? old.habits : [];
    d.log = (old.log && typeof old.log === "object") ? old.log : {};
    d.createdAt = old.createdAt || key(today());
    return d;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        var v1 = JSON.parse(legacy);
        if (v1 && Array.isArray(v1.habits)) {
          var moved = migrateV1(v1);
          localStorage.setItem(KEY, JSON.stringify(moved));
          return moved;
        }
      }
    } catch (e) { /* datos ilegibles: se empieza limpio */ }
    return blank();
  }

  var db = load();
  var saveTimer = null;
  var listeners = [];

  function save(now) {
    clearTimeout(saveTimer);
    var write = function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch (e) {
        toast("No se pudo guardar: almacenamiento lleno o bloqueado.", true);
      }
    };
    if (now) write(); else saveTimer = setTimeout(write, 200);
    listeners.forEach(function (f) { f(); });
  }
  function onChange(fn) { listeners.push(fn); }

  /* ── avisos ───────────────────────────────────────────────────────────── */
  var toastTimer = null;
  function toast(text, isError) {
    var box = $("#toast");
    if (!box) return;
    box.textContent = text;
    box.className = "toast is-on" + (isError ? " is-error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = "toast"; }, 3200);
  }

  /* ── router ───────────────────────────────────────────────────────────── */
  var views = {};
  var current = null;
  function view(name, render) { views[name] = render; }
  function show(name) {
    if (!views[name]) name = "today";
    current = name;
    $$(".tab").forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.view === name);
      t.setAttribute("aria-selected", String(t.dataset.view === name));
    });
    $$(".view").forEach(function (v) {
      v.classList.toggle("is-active", v.id === "view-" + name);
    });
    try { localStorage.setItem("quiet-process.tab", name); } catch (e) { /* privado */ }
    views[name]();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function refresh() { if (current && views[current]) views[current](); }

  /* ── tema ─────────────────────────────────────────────────────────────── */
  function isDark() {
    var forced = document.documentElement.getAttribute("data-theme");
    if (forced) return forced === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function series(i) {
    var pal = isDark() ? SERIES_DARK : SERIES_LIGHT;
    return pal[i % pal.length];
  }

  /* ── gráficos ─────────────────────────────────────────────────────────────
     SVG a mano, sin librería. Marcas finas, un solo eje, rejilla discreta y
     capa de hover con tooltip — nunca dos escalas Y en el mismo gráfico. */

  function tooltipLayer(host) {
    var tip = el("div", "viz-tip");
    tip.hidden = true;
    host.appendChild(tip);
    return {
      show: function (html, x, y) {
        tip.textContent = "";
        html.forEach(function (line, i) {
          var p = el("div", i === 0 ? "viz-tip-head" : null, line);
          tip.appendChild(p);
        });
        tip.hidden = false;
        var w = host.clientWidth;
        tip.style.left = clamp(x, 4, Math.max(4, w - tip.offsetWidth - 4)) + "px";
        tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + "px";
      },
      hide: function () { tip.hidden = true; }
    };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  /* Gráfico de línea de una sola serie: evolución en el tiempo.
     points: [{ label, value, sub }] en orden cronológico. */
  function lineChart(host, points, opts) {
    var o = opts || {};
    clear(host);
    host.classList.add("viz");
    if (points.length < 2) {
      host.appendChild(el("p", "empty", o.emptyText || "Hacen falta al menos dos registros para dibujar la evolución."));
      return;
    }
    var W = 640, H = 180, padL = 46, padR = 12, padT = 12, padB = 26;
    var vals = points.map(function (p) { return p.value; });
    var hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals);
    var max, min;
    if (o.zero === false) {
      // Rango ajustado con un margen del 12 % arriba y abajo, para que la
      // línea no se pegue a los bordes del panel.
      var pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
      min = lo - pad; max = hi + pad;
    } else {
      min = 0; max = niceMax(hi);
    }
    if (min === max) max = min + 1;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var X = function (i) { return padL + (points.length === 1 ? innerW / 2 : innerW * i / (points.length - 1)); };
    var Y = function (v) { return padT + innerH - innerH * (v - min) / (max - min); };

    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, class: "viz-svg", role: "img" });
    s.appendChild(svg("title", {})).textContent = o.title || "Evolución";

    [0, 0.5, 1].forEach(function (f) {
      var v = min + (max - min) * f;
      s.appendChild(svg("line", { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), class: "viz-grid" }));
      var t = svg("text", { x: padL - 8, y: Y(v) + 4, class: "viz-axis", "text-anchor": "end" });
      t.textContent = o.fmt ? o.fmt(v) : Math.round(v);
      s.appendChild(t);
    });

    var d = points.map(function (p, i) { return (i ? "L" : "M") + X(i) + " " + Y(p.value); }).join(" ");
    if (o.area !== false) {
      s.appendChild(svg("path", {
        d: d + " L" + X(points.length - 1) + " " + Y(min) + " L" + X(0) + " " + Y(min) + " Z",
        class: "viz-area", fill: o.color || series(0)
      }));
    }
    s.appendChild(svg("path", { d: d, class: "viz-line", stroke: o.color || series(0) }));

    points.forEach(function (p, i) {
      s.appendChild(svg("circle", {
        cx: X(i), cy: Y(p.value), r: 4, class: "viz-dot", fill: o.color || series(0)
      }));
    });

    // Etiquetas selectivas: primera, última y el máximo. Nunca todas.
    var maxI = vals.indexOf(Math.max.apply(null, vals));
    [0, points.length - 1, maxI].filter(function (v, i, a) { return a.indexOf(v) === i; })
      .forEach(function (i) {
        var t = svg("text", {
          x: clamp(X(i), padL + 14, W - padR - 14), y: Y(points[i].value) - 10,
          class: "viz-label", "text-anchor": "middle"
        });
        t.textContent = o.fmt ? o.fmt(points[i].value) : points[i].value;
        s.appendChild(t);
      });

    [0, points.length - 1].forEach(function (i) {
      var t = svg("text", {
        x: clamp(X(i), padL, W - padR), y: H - 8, class: "viz-axis",
        "text-anchor": i === 0 ? "start" : "end"
      });
      t.textContent = points[i].label;
      s.appendChild(t);
    });

    var cross = svg("line", { class: "viz-cross", y1: padT, y2: padT + innerH, x1: 0, x2: 0 });
    cross.style.opacity = 0;
    s.appendChild(cross);
    host.appendChild(s);

    var tip = tooltipLayer(host);
    on(s, "pointermove", function (ev) {
      var r = s.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width * W;
      var i = clamp(Math.round((px - padL) / (innerW / (points.length - 1))), 0, points.length - 1);
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
      cross.style.opacity = 1;
      var p = points[i];
      tip.show([p.label, (o.fmt ? o.fmt(p.value) : String(p.value)) + (p.sub ? " · " + p.sub : "")],
        (X(i) / W) * r.width, (Y(p.value) / H) * r.height);
    });
    on(s, "pointerleave", function () { cross.style.opacity = 0; tip.hide(); });
  }

  /* Barras horizontales con etiqueta directa: comparación de magnitud entre
     categorías. La etiqueta visible cumple la regla de relieve para los tonos
     que quedan por debajo de 3:1 sobre fondo claro. */
  function barList(host, rows, opts) {
    var o = opts || {};
    clear(host);
    if (!rows.length) {
      host.appendChild(el("p", "empty", o.emptyText || "Sin datos todavía."));
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
    var list = el("ul", "barlist");
    rows.forEach(function (r, i) {
      var li = el("li");
      var head = el("div", "barlist-head");
      var sw = el("span", "barlist-swatch");
      sw.style.background = r.color || series(i);
      head.appendChild(sw);
      head.appendChild(el("span", "barlist-name", r.label));
      head.appendChild(el("span", "barlist-val", o.fmt ? o.fmt(r.value) : String(r.value)));
      li.appendChild(head);
      var track = el("div", "barlist-track");
      var fill = el("div", "barlist-fill");
      fill.style.width = (Math.abs(r.value) / max * 100) + "%";
      fill.style.background = r.color || series(i);
      track.appendChild(fill);
      li.appendChild(track);
      if (r.sub) li.appendChild(el("p", "barlist-sub", r.sub));
      list.appendChild(li);
    });
    host.appendChild(list);
  }

  /* Barras verticales para una serie temporal corta (meses, días). */
  function columns(host, points, opts) {
    var o = opts || {};
    clear(host);
    if (!points.length) {
      host.appendChild(el("p", "empty", o.emptyText || "Sin datos todavía."));
      return;
    }
    var max = Math.max.apply(null, points.map(function (p) { return p.value; })) || 1;
    var wrap = el("div", "columns");
    points.forEach(function (p) {
      var col = el("div", "column");
      var bar = el("div", "column-bar");
      bar.style.height = Math.max(2, p.value / max * 100) + "%";
      if (p.color) bar.style.background = p.color;
      if (!p.value) bar.classList.add("is-zero");
      bar.title = p.label + " — " + (o.fmt ? o.fmt(p.value) : p.value);
      col.appendChild(bar);
      col.appendChild(el("span", "column-label", p.short || p.label));
      wrap.appendChild(col);
    });
    host.appendChild(wrap);
  }

  /* ── CSV / OFX ────────────────────────────────────────────────────────── */
  /* Detecta el separador antes de partir: un CSV europeo usa ";" y deja la
     coma como decimal, así que tratar ambos como delimitador rompe "45,20". */
  function sniffDelimiter(text) {
    var head = text.slice(0, 4096).split(/\r?\n/).slice(0, 5).join("\n");
    var outside = head.replace(/"[^"]*"/g, "");
    var counts = [
      { d: ";", n: (outside.match(/;/g) || []).length },
      { d: "\t", n: (outside.match(/\t/g) || []).length },
      { d: ",", n: (outside.match(/,/g) || []).length }
    ].sort(function (a, b) { return b.n - a.n; });
    return counts[0].n ? counts[0].d : ",";
  }

  function parseCSV(text, delim) {
    var d = delim || sniffDelimiter(text);
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
  }

  function parseOFX(text) {
    var out = [];
    var blocks = text.split(/<STMTTRN>/i).slice(1);
    blocks.forEach(function (b) {
      var get = function (tag) {
        var m = b.match(new RegExp("<" + tag + ">([^<\\r\\n]*)", "i"));
        return m ? m[1].trim() : "";
      };
      var raw = get("DTPOSTED").slice(0, 8);
      if (raw.length !== 8) return;
      var amt = parseFloat(get("TRNAMT"));
      if (isNaN(amt)) return;
      out.push({
        date: raw.slice(0, 4) + "-" + raw.slice(4, 6) + "-" + raw.slice(6, 8),
        amount: Math.round(Math.abs(amt) * 100),
        kind: amt < 0 ? "out" : "in",
        note: get("MEMO") || get("NAME") || "Movimiento"
      });
    });
    return out;
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  try {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onScheme = function () { refresh(); };
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  } catch (e) { /* navegador sin matchMedia utilizable */ }

  return {
    KEY: KEY, THEME_KEY: THEME_KEY,
    DAY_SHORT: DAY_SHORT, DAY_LONG: DAY_LONG, MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT,
    HUES: HUES,
    get db() { return db; },
    set db(v) { db = normalize(v); },
    blank: blank, normalize: normalize, save: save, onChange: onChange,
    key: key, parseKey: parseKey, today: today, addDays: addDays, addMonths: addMonths,
    longDate: longDate, shortDate: shortDate, relativeDay: relativeDay, dueLabel: dueLabel,
    monthKey: monthKey, monthLabel: monthLabel,
    uid: uid, clamp: clamp, sum: sum, groupBy: groupBy, byId: byId, slug: slug,
    money: money, parseMoney: parseMoney,
    $: $, $$: $$, el: el, clear: clear, on: on, svg: svg, btn: btn,
    field: field, input: input, select: select,
    toast: toast, view: view, show: show, refresh: refresh,
    isDark: isDark, series: series,
    lineChart: lineChart, barList: barList, columns: columns,
    parseCSV: parseCSV, sniffDelimiter: sniffDelimiter, parseOFX: parseOFX, download: download
  };
})();
