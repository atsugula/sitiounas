# Fase 11 — Modularización del JavaScript

## Objetivo

Sacar JavaScript de `index.html` a `assets/js/`, de forma gradual y probando
después de cada extracción. Sin reescritura total y sin cambiar de framework.

## Estado inicial

`index.html` tenía 9.382 líneas con cinco bloques `<script>` embebidos, uno de
ellos de 5.631 líneas. Las Fases 5, 7 y 9 ya habían sacado tres módulos de
lógica pura (`booking-slots.js`, `loyalty.js`, `sanitize.js`), que marcaron el
patrón: lo puro sale y se prueba; lo que toca el DOM se queda de momento.

## Extracciones realizadas

Cada una se aplicó y se verificó por separado antes de pasar a la siguiente.

| # | Qué salió | A dónde | Líneas |
| --- | --- | --- | --- |
| 1 | Todo el bloque `<script type="module">` de Firebase | `assets/js/firebase.js` | 365 |
| 2 | Helpers de fecha, hora y duración | `assets/js/time.js` | 114 |
| 3 | Cálculo de disponibilidad | `assets/js/availability.js` | 163 |
| 4 | Lista canónica de turnos | dentro de `availability.js` | — |

## Estado final

```text
index.html                    8.887 lineas   (antes 9.382)
assets/js/firebase.js           377
assets/js/availability.js       163
assets/js/booking-slots.js      144
assets/js/sanitize.js           134
assets/js/loyalty.js            130
assets/js/time.js               114
```

`index.html` pasa de cinco bloques `<script>` inline a cuatro; el de módulo
desaparece por completo.

## Lo más valioso de la fase: `availability.js`

`computeClientAvailability` era el corazón del negocio —la lógica de intervalos
de la Fase 1 más los locks de la Fase 5— y **no tenía ni una prueba
automática**. `CAMBIOS_AGENDA_FASE_1.md` enumeraba escenarios comprobados a
mano; nada impedía que una fase posterior los rompiera en silencio.

Se reescribió como función pura: recibe bloqueos, citas, locks, catálogo y
hasta el reloj, y no lee `localStorage` ni `window`. `index.html` solo reúne
los datos y llama.

Eso permitió fijar 29 tests, incluidos exactamente los escenarios que la Fase 1
decía haber probado:

- una cita de 14:00 a 16:00 bloquea 14:00, 14:30, 15:00 y 15:30;
- las 16:00 quedan libres porque la cita termina justo ahí;
- un servicio de 13:30 a 14:30 no cabe si existe 14:00-16:00;
- varios servicios suman su duración real;
- una cita de 3 horas bloquea su intervalo completo;
- el turno noche de las 19:00 admite hasta 3 horas y no más.

Más los casos de cierre, bloqueos, horas pasadas, citas canceladas, citas de
otro día, citas antiguas sin `durationMinutes` y convivencia de locks con
citas sin lock.

## Duplicación eliminada

`parseTimeToMinutes` estaba implementado dos veces: en `index.html` y en
`booking-slots.js`. Dos implementaciones del mismo parseo son dos formas de
divergir, y una divergencia ahí produce reservas solapadas. Ahora `time.js`
reexporta la de `booking-slots.js` y `index.html` delega.

Igual con `ALL_TIME_SLOTS`, que estaba duplicada.

## Funciones nuevas

### `assets/js/time.js`

`toIsoDateString`, `formatMinutesToTimeString`, `matchesDate`,
`getSelectedServicesDurationMinutes`, `getServiceDurationFromSummary`,
`getAppointmentDurationMinutes`, `computeEndTime`. Reexporta
`parseTimeToMinutes` y `formatMinutesTo24h`.

### `assets/js/availability.js`

`ALL_TIME_SLOTS`, `computeAvailability({...})`, `mergeAppointmentSources()`.

## Decisiones técnicas

1. **Envoltorios finos en `index.html`.** Las funciones extraídas se siguen
   llamando por su nombre desde cientos de puntos y desde atributos `onclick`
   del HTML, que necesitan nombres globales. Renombrar todas las llamadas sería
   un diff enorme sin beneficio.
2. **El catálogo se pasa como parámetro.** `time.js` y `availability.js` no
   leen `SERVICES_DATA`: lo reciben. Así son puros y probables.
3. **También se pasa el reloj.** `computeAvailability` recibe `now` y
   `todayIso`. Sin eso, cualquier test sobre "horas pasadas" dependería de la
   hora a la que se ejecute.
4. **`ALL_TIME_SLOTS` se expone con un getter.** Aquí hubo un fallo real, ver
   abajo.
5. **Nada de bundler.** Módulos ES nativos, sin build, como exige el alcance.

## Fallo cometido y corregido durante la fase

Al principio se escribió:

```js
const ALL_TIME_SLOTS = window.availabilityUtils.ALL_TIME_SLOTS;
```

El script clásico se ejecuta **mientras se analiza el documento**; los módulos
ES son diferidos y corren después. En ese punto `window.availabilityUtils` no
existía todavía, así que la línea lanzaba `TypeError` y **dejaba sin definir
todo el resto del script clásico**: la página cargaba visualmente pero ninguna
función respondía.

No lo detectó `npm run check`, porque la sintaxis era correcta. Lo detectó la
consola del navegador. Se corrigió con una propiedad de solo lectura:

```js
Object.defineProperty(window, 'ALL_TIME_SLOTS', {
    configurable: true,
    get: () => window.availabilityUtils.ALL_TIME_SLOTS
});
```

Así la lectura ocurre cuando alguien la usa, que siempre es después de que los
módulos hayan cargado.

## Segundo fallo, en las herramientas

El primer intento de extracción usó `indexOf` sobre el archivo completo para
delimitar el bloque de `ALL_TIME_SLOTS`, con `const monthNames = [` como marca
de fin. Esa cadena aparece **tres veces** en el archivo, y la primera está
mucho antes, así que el corte quedó invertido y **duplicó unas 3.000 líneas**.

Se detectó porque `npm run check` falló y porque el archivo creció en vez de
menguar. Se revirtió con `git checkout -- index.html` (sin pérdida: no había
nada más sin confirmar) y se rehízo con un script que opera por líneas y exige
que cada ancla sea **única** en el archivo.

## Compatibilidad mantenida

- La semántica de disponibilidad de la Fase 1 se verificó idéntica tras la
  extracción, en el navegador y en los tests.
- Ni un cambio visual.
- Todos los nombres globales que usan los atributos `onclick` siguen existiendo.
- Sin framework, sin bundler, sin dependencias nuevas.

## Cambio operativo

Ya venía de la Fase 5: el sitio debe servirse por http(s). Ahora hay seis
módulos ES relativos en lugar de tres.

```bash
npm start
```

## Seguridad

Esta fase no cambia ninguna garantía de seguridad. El efecto indirecto es que
la lógica de disponibilidad, la de locks, la de fidelidad y la de saneamiento
están ahora bajo pruebas automáticas, así que una regresión futura en
cualquiera de ellas se detecta.

## Pruebas ejecutadas

### Unitarias — ejecutadas

```bash
npm test
# tests 137 | pass 137 | fail 0
```

Reparto: 27 de reservas, 24 de fidelidad, 33 de saneamiento, 24 de fecha y
hora, 29 de disponibilidad.

### En navegador — ejecutadas tras cada extracción

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Los bloques inline compilan (`npm run check`) | 4/4 OK |
| 2 | Los cinco módulos se publican en `window` | OK |
| 3 | Firebase se inicializa desde el archivo externo | `dbInstance` y 12 utilidades |
| 4 | Los envoltorios de tiempo devuelven lo mismo que antes | OK |
| 5 | `ALL_TIME_SLOTS` da 23 turnos y es la misma lista del módulo | OK |
| 6 | Fase 1 a través de la delegación: 13:30 `no-space`, 14:00 `booked`, 16:00 libre | OK |
| 7 | Fase 5 a través de la delegación: turno con lock `booked` | OK |
| 8 | Turno noche: 3 h cabe, 4 h da `closing` | OK |
| 9 | Calendario, servicios, galería y multiservicios se pintan | 37 / 12 / 11 / 12 |
| 10 | Reseñas y muro se pintan | OK |
| 11 | Los globales clave siguen existiendo | 7/7 |
| 12 | **Consola limpia en pestaña nueva** | Solo el HTTP 400 de Firebase, preexistente |
| 13 | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO

- Los 40 tests de `firestore.rules` (el emulador requiere Java).
- No se probó contra Firebase real: la autenticación responde HTTP 400.

## Resultado de git diff --check

Sin avisos.

## Lo que NO se extrajo, y por qué

El plan proponía además `auth.js`, `services.js`, `booking.js`, `admin.js`,
`content.js` y `app.js`. **No se hicieron**, y conviene decir por qué en vez de
dejarlo como una casilla a medias.

Esas funciones no son puras: comparten un cierre común con variables mutables
del script clásico —`currentUserSession`, `SERVICES_DATA`,
`adminDiscountSettings`, `selectedServiceIds`, `pendingAppointmentData`,
`currentDate`, `selectedDateObj`…— y se llaman entre ellas sin pasar por
`window`.

Sacarlas exige una de dos cosas:

1. **Convertir el script clásico entero en un módulo.** Es un cambio de una
   sola vez sobre 5.000 líneas que rompería todos los atributos `onclick` del
   HTML —dentro de un módulo nada es global— y obligaría a sustituirlos por
   `addEventListener`. Es exactamente el *big bang rewrite* que el alcance
   prohíbe.
2. **Mover el estado compartido a un módulo de estado** e ir migrando por
   partes. Es lo correcto, es incremental, y es más trabajo del que cabe aquí
   con garantías.

Se eligió no empezarlo a medias. Un `booking.js` que aún dependa de cinco
variables del cierre de `index.html` no es modularización: es el mismo
acoplamiento repartido en más archivos.

### Plan concreto para continuar

1. `assets/js/state.js` con el estado compartido y sus setters
   (`currentUserSession`, catálogo, ajustes, selección de reserva).
2. Sustituir los `onclick="..."` del HTML por `data-action` más un único
   delegador de eventos. Sin eso no se puede modularizar el resto.
3. Con los dos pasos anteriores, extraer en este orden: `content.js`,
   `admin.js`, `booking.js`, `auth.js`, y por último `app.js` como arranque.
4. Probar en el navegador después de cada uno, como en esta fase.

## Riesgos encontrados

- **`index.html` sigue teniendo 8.887 líneas.** La reducción es del 5 %; el
  valor de la fase está en las pruebas y en la duplicación eliminada, no en el
  recuento.
- **Los envoltorios añaden una indirección.** Es el precio de no tocar cientos
  de llamadas.
- **El orden de carga es ahora significativo.** El script clásico no puede leer
  `window.*Utils` en su nivel superior. Está documentado en el código, junto al
  getter, porque volverá a morder a quien no lo sepa.
- **`npm run check` no detecta este tipo de fallo**, solo sintaxis. La
  comprobación real sigue siendo abrir la página.

## Deuda técnica

- Los seis módulos del plan que no se extrajeron.
- Sustituir los `onclick` por delegación de eventos.
- `escapeHtml` sigue duplicado entre `index.html` y `sanitize.js`: no se
  unificó porque se usa en el nivel superior del script clásico y volvería a
  chocar con el orden de carga.

## Cosas deliberadamente no modificadas

- El HTML visible y el diseño.
- El comportamiento de todas las fases anteriores.
- No se añadió bundler, transpilador ni framework.
- No se convirtió el script clásico en módulo.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 12 — QA, seguridad y despliegue: matriz de pruebas por rol, intentos de
ataque, revisión de seguridad, preparación del despliegue con su checklist y
plan de vuelta atrás, y `RESUMEN_FINAL_PROYECTO.md`.

## Commit de cierre

```text
refactor: modularize frontend javascript
```
