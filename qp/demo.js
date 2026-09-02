/* Datos de ejemplo. Sólo existen para que alguien que abre la app por primera
   vez vea de qué va en lugar de nueve pestañas vacías. Se cargan a mano, se
   marcan como ejemplo y se borran de una vez. */
(function () {
  "use strict";
  var Q = QP;

  function isEmpty() {
    var d = Q.db;
    return !d.habits.length && !d.tasks.length && !d.goals.length &&
      !d.notes.length && !d.workouts.length && !d.tx.length &&
      !d.subjects.length && !Object.keys(d.log).length;
  }

  function build() {
    var K = function (n) { return Q.key(Q.addDays(Q.today(), -n)); };
    var M = function (n) {
      var d = Q.addMonths(Q.today(), -n);
      return Q.key(new Date(d.getFullYear(), d.getMonth(), Math.min(15, d.getDate())));
    };
    var pick = function (p) { return Math.random() < p; };

    var habits = [
      { id: "dh1", name: "Caminar 20 minutos", note: "antes de abrir el portátil", cadence: "daily", days: [], color: Q.HUES[0], archived: false, createdAt: K(75), goalId: "dg1" },
      { id: "dh2", name: "Leer 10 páginas", note: "", cadence: "daily", days: [], color: Q.HUES[1], archived: false, createdAt: K(75), goalId: null },
      { id: "dh3", name: "Estirar la espalda", note: "", cadence: "weekdays", days: [], color: Q.HUES[2], archived: false, createdAt: K(60), goalId: null },
      { id: "dh4", name: "Llamar a casa", note: "", cadence: "custom", days: [0], color: Q.HUES[3], archived: false, createdAt: K(75), goalId: null }
    ];

    var log = {};
    for (var i = 80; i >= 0; i--) {
      var k = K(i), e = { habits: {}, mood: null, note: "" };
      habits.forEach(function (h) {
        if (k < h.createdAt) return;
        if (pick(h.id === "dh2" ? 0.55 : 0.76)) e.habits[h.id] = true;
      });
      if (pick(0.6)) e.mood = 2 + Math.floor(Math.random() * 4);
      log[k] = e;
    }
    log[K(0)] = { habits: { dh1: true, dh3: true }, mood: 4, note: "Día tranquilo. Caminé por el parque grande y volví sin prisa." };
    log[K(2)] = { habits: { dh1: true, dh2: true }, mood: 3, note: "Costó arrancar. Igual salí." };
    log[K(9)] = { habits: { dh1: true, dh2: true, dh3: true }, mood: 5, note: "Terminé el borrador. Me lo tomo como una victoria." };

    var goals = [
      { id: "dg1", title: "Correr 10 km seguidos", why: "Para subir la cuesta de casa sin pararme.", deadline: K(-95), manual: 0, photo: null, archived: false, createdAt: K(75) },
      { id: "dg2", title: "Terminar el máster", why: "", deadline: K(-260), manual: 0, photo: null, archived: false, createdAt: K(75) }
    ];

    var tasks = [
      ["Reservar dorsal de la carrera", K(-2), true, true, "doing", "dg1", null, false],
      ["Renovar el pasaporte", K(3), true, true, "todo", null, null, false],
      ["Escribir el capítulo 3", K(-6), false, true, "doing", "dg2", "ds1", false],
      ["Contestar el correo de Marta", K(0), true, false, "todo", null, null, false],
      ["Ordenar las fotos del verano", null, false, false, "todo", null, null, false],
      ["Comprar zapatillas nuevas", K(0), false, true, "done", "dg1", null, true],
      ["Leer el artículo de estadística", K(1), false, true, "done", "dg2", "ds1", true]
    ].map(function (r, i) {
      return {
        id: "dt" + i, title: r[0], note: i === 1 ? "cita previa" : "",
        done: r[7], doneAt: r[7] ? r[1] : null, due: r[1],
        urgent: r[2], important: r[3], status: r[4],
        goalId: r[5], subjectId: r[6], order: i, createdAt: K(20)
      };
    });

    var notes = [
      { id: "dn1", title: "Ideas para el capítulo 3", body: "## Guion\n- [x] Reunir las fuentes\n- [ ] Escribir la introducción\n- [ ] Revisar los gráficos\n\nConecta con [[Lecturas de estadística]]: el argumento del intervalo va aquí.", goalId: "dg2", subjectId: "ds1", createdAt: K(20), updatedAt: K(1) },
      { id: "dn2", title: "Lecturas de estadística", body: "Bootstrapping, intervalos, y por qué la media miente cuando la cola es larga.\n\nVer también [[Ideas para el capítulo 3]].", goalId: "dg2", subjectId: "ds1", createdAt: K(18), updatedAt: K(3) },
      { id: "dn3", title: "Plan de carrera", body: "Series los martes, tirada larga los domingos.\n- [ ] Probar zapatillas nuevas en la tirada corta\n\nEl ritmo se parece al de [[Ideas para el capítulo 3]]: constante, no heroico.", goalId: "dg1", subjectId: null, createdAt: K(12), updatedAt: K(2) }
    ];

    var exercises = [
      { id: "de1", name: "Sentadilla", group: "" },
      { id: "de2", name: "Press banca", group: "" },
      { id: "de3", name: "Remo con barra", group: "" }
    ];
    var workouts = [30, 23, 16, 9, 2].map(function (ago, i) {
      return {
        id: "dw" + i, date: K(ago), name: i % 2 ? "Empuje" : "Pierna",
        note: i === 4 ? "buenas sensaciones" : "",
        sets: [
          { id: "ds" + i + "a", exerciseId: "de1", reps: 8, weight: 60 + i * 5 },
          { id: "ds" + i + "b", exerciseId: "de1", reps: 8, weight: 60 + i * 5 },
          { id: "ds" + i + "c", exerciseId: "de1", reps: 6, weight: 65 + i * 5 },
          { id: "ds" + i + "d", exerciseId: "de2", reps: 10, weight: 40 + i * 2.5 },
          { id: "ds" + i + "e", exerciseId: "de3", reps: 12, weight: 30 + i * 2.5 }
        ]
      };
    });

    var tx = [], n = 0;
    var add = function (date, cents, kind, cat, note, part, parts, group) {
      tx.push({
        id: "dm" + (n++), date: date, amount: cents, kind: kind,
        category: cat, note: note, group: group || null,
        part: part || null, parts: parts || null
      });
    };
    [["Alquiler", "Casa", 95000], ["Supermercado", "Comida", 21340],
     ["Supermercado", "Comida", 18760], ["Gasolina", "Transporte", 8990],
     ["Cine", "Ocio", 2400], ["Farmacia", "Salud", 1845],
     ["Restaurante", "Ocio", 4720], ["Abono transporte", "Transporte", 5450]
    ].forEach(function (r, i) { add(K(i * 3), r[2], "out", r[1], r[0]); });
    add(K(18), 230000, "in", "Trabajo", "Nómina");
    [0, 1, 2].forEach(function (i) {
      add(Q.key(Q.addMonths(Q.parseKey(K(20)), i)), 9158, "out", "Casa", "Portátil", i + 1, 12, "dgrp");
    });
    [1, 2, 3].forEach(function (m) {
      ["Comida", "Casa", "Ocio", "Transporte"].forEach(function (c) {
        add(M(m), 18000 + Math.floor(Math.random() * 55000), "out", c, c);
      });
      add(M(m), 230000, "in", "Trabajo", "Nómina");
    });

    var subjects = [
      { id: "ds1", name: "Estadística", color: Q.HUES[1], topics: [
        { id: "dtp1", name: "Inferencia", done: true },
        { id: "dtp2", name: "Bootstrapping", done: true },
        { id: "dtp3", name: "Modelos mixtos", done: false }] },
      { id: "ds2", name: "Escritura académica", color: Q.HUES[2], topics: [
        { id: "dtp4", name: "Estructura IMRyD", done: true },
        { id: "dtp5", name: "Citación", done: false }] }
    ];

    var sessions = [];
    for (var j = 0; j < 14; j++) {
      if (!pick(0.65)) continue;
      sessions.push({
        id: "dss" + j, date: K(j), minutes: 25 * (1 + Math.floor(Math.random() * 3)),
        subjectId: pick(0.6) ? "ds1" : "ds2", kind: "pomodoro"
      });
    }
    sessions.push({ id: "dssx", date: K(0), minutes: 50, subjectId: "ds1", kind: "pomodoro" });

    var d = Q.blank();
    d.createdAt = K(80);
    d.demo = true;
    d.habits = habits; d.log = log; d.tasks = tasks; d.goals = goals;
    d.notes = notes; d.exercises = exercises; d.workouts = workouts;
    d.tx = tx; d.subjects = subjects; d.sessions = sessions;
    d.categories = ["Casa", "Comida", "Transporte", "Salud", "Ocio", "Trabajo"];
    return d;
  }

  function load() {
    Q.db = build();
    Q.db.demo = true;          // normalize() no lo conoce, así que se repone
    Q.save(true);
    QP.tasks.resetCursor();
    Q.show("today");
    Q.toast("Datos de ejemplo cargados. Bórralos cuando quieras empezar de cero.");
  }

  function wipe() {
    if (!window.confirm("Se borran los datos de ejemplo y empiezas con todo vacío. ¿Seguir?")) return;
    Q.db = Q.blank();
    Q.save(true);
    QP.tasks.resetCursor();
    Q.show("today");
    Q.toast("Listo. Todo tuyo.");
  }

  /* Aviso permanente mientras haya datos de ejemplo: nadie debe confundirlos
     con los suyos. */
  function banner() {
    if (!Q.db.demo) return null;
    var b = Q.el("div", "demo-bar");
    b.appendChild(Q.el("span", null, "Estás viendo datos de ejemplo."));
    b.appendChild(Q.btn("linkish", "Borrarlos y empezar de cero", wipe));
    return b;
  }

  /* Portada de la primera visita. Sustituye a la pantalla vacía. */
  function welcome() {
    var card = Q.el("section", "card welcome");
    card.appendChild(Q.el("h2", null, "Bienvenido a Quiet Process"));
    card.appendChild(Q.el("p", "welcome-lead",
      "Tareas, hábitos, metas, notas, entrenos, dinero y estudio en un solo sitio. " +
      "Sin cuentas y sin nube: todo se queda en este navegador."));

    var list = Q.el("ul", "welcome-list");
    [["Hoy", "hábitos y tareas del día en una sola lista"],
     ["Tareas", "lista, matriz de Eisenhower y tablero"],
     ["Metas", "el progreso sale solo de lo que ya haces"],
     ["Notas", "enlaces [[así]] y un grafo de todo"],
     ["Entreno", "series, récords y evolución"],
     ["Dinero", "cuotas e importación de extractos"],
     ["Estudio", "Pomodoro, asignaturas y horas"],
     ["Reflejo", "mapas de calor y diario"]].forEach(function (p) {
      var li = Q.el("li");
      li.appendChild(Q.el("strong", null, p[0]));
      li.appendChild(Q.el("span", null, p[1]));
      list.appendChild(li);
    });
    card.appendChild(list);

    var acts = Q.el("div", "form-actions");
    acts.appendChild(Q.btn("btn primary", "Ver con datos de ejemplo", load));
    acts.appendChild(Q.btn("btn ghost", "Empezar de cero", function () {
      dismissed = true;
      Q.refresh();
      Q.toast("Escribe algo arriba, o crea un hábito en la pestaña Hábitos.");
    }));
    card.appendChild(acts);
    card.appendChild(Q.el("p", "muted small",
      "Los datos de ejemplo son inventados y se borran de un clic. No tocan nada tuyo."));
    return card;
  }

  var dismissed = false;
  function shouldWelcome() { return !dismissed && isEmpty(); }

  QP.demo = {
    isEmpty: isEmpty, shouldWelcome: shouldWelcome,
    welcome: welcome, banner: banner, load: load, wipe: wipe
  };
})();
