# web

Sitio personal y experimentos.

## Quiet Process

`quiet-process.html` — una app para llevar hábitos y notas personales, pensada
para ser callada: sin cuentas, sin nube, sin rachas que griten.

Ábrela con doble clic (o sírvela con `npx http-server`). No hay build ni
dependencias: tres archivos y nada más.

- `quiet-process.html`
- `quiet-process.css`
- `quiet-process.js`

### Qué hace

- **Hoy** — marca las prácticas del día, elige cómo estuvo el día y escribe una
  nota. Se guarda solo. Puedes retroceder a días pasados con las flechas.
- **Hábitos** — crear, editar, archivar y borrar. Cada uno con cadencia
  (todos los días / entre semana / días sueltos), color e intención.
- **Diario** — todas las notas en orden, con búsqueda.
- **Reflejo** — mapa de calor de 12 semanas por hábito, porcentaje de
  cumplimiento, mejor racha y el ánimo de los últimos 30 días.

### Dónde viven los datos

En el `localStorage` de ese navegador, bajo la clave `quiet-process.v1`.
No sale nada a ningún servidor. El botón `⋯` exporta una copia `.json`,
la reimporta y borra todo. Si limpias los datos del sitio, se van: exporta
de vez en cuando.

### Detalles de implementación

- JavaScript sin dependencias, en un IIFE; sin `innerHTML` con datos del
  usuario (todo se construye con `createElement`/`textContent`).
- Las fechas se manejan siempre en hora local con claves `YYYY-MM-DD`, para
  que un cambio de día no se desplace por UTC.
- La racha cuenta días programados consecutivos hacia atrás. Si hoy toca y
  aún no está marcado, no rompe la racha: todavía no la suma.
- El porcentaje ignora los días anteriores a la creación del hábito, así que
  uno nuevo no arranca castigado.
- Tema claro/oscuro: sigue al sistema y el botón `◐` lo fuerza
  (claro → oscuro → sistema).
