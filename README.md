# web

Sitio personal y experimentos.

## Quiet Process

`quiet-process.html` — un sistema personal completo: tareas, hábitos, metas,
notas enlazadas, entrenamientos, dinero y estudio. Inspirado en las funciones
de [rimu](https://www.rimuapp.com/), pero sin cuentas y sin nube: todo vive en
el `localStorage` de tu navegador.

Se abre con doble clic. No hay build ni dependencias — scripts clásicos, por eso
funciona desde `file://` sin servidor.

### Las nueve secciones

| Pestaña | Qué hace |
|---|---|
| **Hoy** | Hábitos y tareas del día en **una sola lista**, ánimo y nota. Las flechas van a días pasados. |
| **Tareas** | Lista, **matriz de Eisenhower** y **tablero Kanban** con arrastrar y soltar. Fecha, prioridad, meta y asignatura. |
| **Hábitos** | Cadencia (diaria, entre semana, días sueltos), color, intención y racha. |
| **Metas** | Foto, fecha límite y progreso. Cuelgas tareas y hábitos y el porcentaje se calcula solo. |
| **Notas** | Enlaces `[[Nombre]]`, casillas `- [ ]` que se convierten en tareas reales, y un **grafo interactivo**. |
| **Entreno** | Series × repeticiones × peso, récords, 1RM estimado y evolución del volumen. |
| **Dinero** | Ingresos, gastos, **cuotas** repartidas por meses, importación **CSV/OFX** y gasto por categoría. |
| **Estudio** | **Pomodoro** con fases configurables, asignaturas, temas y horas registradas. |
| **Reflejo** | Mapas de calor de 12 semanas, cifras del proceso, ánimo de 30 días y el diario. |

Atajos: teclas `1`–`9` para saltar de pestaña (inertes mientras escribes).

### Dónde viven los datos

En `localStorage`, bajo la clave `quiet-process.v2`. Nada sale a ningún
servidor. El botón `⋯` exporta una copia `.json`, exporta todo a CSV, reimporta
y borra. Si limpias los datos del sitio, se van: **exporta de vez en cuando**.

Si ya usabas la versión anterior (`quiet-process.v1`, sólo hábitos y diario),
al abrir la app tus hábitos y notas se migran solos.

### Lo que no hace, y por qué

Tres funciones de rimu necesitan un servidor y cuentas de usuario, así que
quedan fuera de una app que se abre con doble clic:

- **Sincronización entre dispositivos.** Los datos no salen del navegador. El
  sustituto es exportar e importar el `.json`.
- **Integración con WhatsApp.** Requiere la API de WhatsApp Business y un
  backend que reciba los mensajes.
- **Organizar con IA.** Requiere una clave de API, que no puede vivir en un
  archivo estático sin quedar expuesta.

Además, los extractos `.xlsx` hay que guardarlos como CSV antes de importarlos:
no lleva un lector de Excel dentro.

### Estructura

```
quiet-process.html      esqueleto y pestañas
quiet-process.css       estilos, tema claro/oscuro
qp/core.js              estado, fechas, DOM, router, gráficos, CSV/OFX
qp/tasks.js             Hoy, Tareas (lista/Eisenhower/tablero), Hábitos
qp/goals.js             Metas
qp/notes.js             Notas, enlaces y grafo de fuerzas
qp/train.js             Entrenamientos y récords
qp/money.js             Dinero, cuotas e importación
qp/study.js             Pomodoro, asignaturas y horas
qp/review.js            Reflejo y diario
qp/boot.js              arranque, tema, panel de datos
```

### Decisiones que conviene conocer

- **Fechas en hora local** con claves `YYYY-MM-DD` construidas a mano.
  `toISOString()` desplaza el día según la zona horaria.
- **Dinero en céntimos enteros.** Nunca se suman floats. Al repartir en cuotas,
  el sobrante del redondeo va a la última: la suma cuadra al céntimo.
- **La racha no se rompe** si hoy toca y aún no lo marcaste — todavía no suma.
- **Los porcentajes ignoran los días anteriores** a la creación del hábito, así
  que uno nuevo no nace castigado.
- **El separador del CSV se detecta** por línea: un extracto europeo usa `;` y
  deja la coma como decimal.
- **Nada de `innerHTML` con texto tuyo** — todo se construye con
  `createElement`/`textContent`.
- **Los colores de los gráficos** salen de una paleta categórica verificada con
  un validador de contraste y daltonismo, en orden fijo y sin ciclar. Los tonos
  apagados de hábitos y metas son identidad de interfaz, no escala de gráfico, y
  siempre van junto al nombre escrito.
