# Fase 10 — UX, móvil, accesibilidad y rendimiento

## Objetivo

Arreglar lo que las fases anteriores dejaron incómodo. Al convertir las
operaciones en asíncronas (Fases 4 a 9), la interfaz se quedó sin decir nada
mientras trabajaba: la usuaria pulsa, no pasa nada visible, vuelve a pulsar.

No se rediseña la marca. Se corrige el comportamiento.

## Estado inicial

- Reservar, publicar, guardar ajustes y moderar eran ya operaciones de red,
  **sin ningún indicador ni bloqueo del botón**.
- Ocho `prompt()` y `confirm()` del navegador, heredados y añadidos en las
  Fases 7, 8 y 9.
- Ningún modal se cerraba con Escape.
- Dos atributos de accesibilidad en todo el documento.
- Dos imágenes de diecisiete con carga diferida.

## Archivos modificados

- `index.html`

## Archivos nuevos

- `CAMBIOS_UX_PERFORMANCE_FASE_10.md`

## Funciones nuevas

| Función | Qué hace |
| --- | --- |
| `ensureDialogRoot()` | Crea el modal de diálogo una sola vez. |
| `openDialog({...})` | Abre el diálogo y devuelve una promesa. |
| `closeDialog(value)` | Cierra y resuelve. |
| `window.ncvConfirm(mensaje, opciones)` | Confirmación. Devuelve `true`/`false`. |
| `window.ncvPrompt(mensaje, opciones)` | Entrada de texto. Devuelve el valor o `null`. |
| `withBusyButton(button, action, label)` | Bloquea el botón mientras la acción trabaja. |
| `window.withBusyForm(form, event, action, label)` | Lo mismo para formularios. |

## El problema del doble envío

Desde la Fase 5, confirmar una reserva es una transacción de Firestore: tarda.
El botón "Enviar" no daba ninguna señal, así que el segundo clic era la
reacción natural.

La transacción es correcta y la segunda reserva fallaría por turno ocupado,
pero le mostraría a la clienta un error diciendo que su horario ya está
reservado —**por ella misma, un segundo antes**—. Es confuso y parece un fallo
del sitio.

`withBusyButton` bloquea el botón, le pone `aria-busy`, muestra un indicador
giratorio y lo restaura en un `finally`, de modo que también vuelve si la
operación falla.

Verificado: **tres clics seguidos producen una sola ejecución.**

Aplicado a los 12 formularios del sitio y al botón de confirmación de reserva.

## Sustitución de `prompt()` y `confirm()`

Los diálogos nativos bloquean el hilo, no se pueden estilar, en móvil aparecen
como avisos del sistema —a menudo con la casilla de "impedir que esta página
cree más diálogos", que deja funciones inservibles sin explicación— y no se
integran con el resto de la página.

Se sustituyeron los ocho por un diálogo propio basado en promesas, con las
clases del sitio. Cubre: ajuste de fidelidad (valor y motivo), recuperación de
contraseña, eliminar imagen de galería, editar y eliminar publicación, y editar
y eliminar reseña.

No queda ninguna llamada nativa a `prompt()` ni `confirm()`.

## Accesibilidad

| Cambio | Alcance |
| --- | --- |
| `role="dialog"` y `aria-modal="true"` | 10 modales |
| `aria-label="Cerrar"` en botones que solo tienen un icono | 14 botones |
| Cierre con Escape | 9 modales, en orden de apilamiento |
| `aria-busy` durante las operaciones | Todos los botones bloqueados |
| Foco automático en el diálogo | Entrada de texto o botón de aceptar |
| `Enter` confirma en el diálogo de entrada | — |

Antes, un modal solo se podía cerrar localizando y pulsando el aspa. En móvil,
con el teclado abierto, esa aspa a veces queda fuera de la pantalla.

## Rendimiento

- **24 imágenes** con `loading="lazy"` y `decoding="async"`. La galería tiene
  once fotos que antes se descargaban todas en la carga inicial.
- El logo se deja sin diferir: es contenido crítico visible de entrada.

## Corrección: el bloqueo de scroll se contaba mal

`lockBodyScroll()` / `unlockBodyScroll()` escribían y borraban el estilo
directamente. Con dos modales apilados —por ejemplo, el diálogo de
confirmación sobre el modal de perfil—, cerrar el de arriba devolvía el scroll
al fondo mientras el de abajo seguía abierto.

Ahora se lleva un contador y el scroll solo vuelve cuando no queda ninguno.

## Modelo de datos afectado

Ninguno. Esta fase no toca Firestore ni `localStorage`.

## Decisiones técnicas

1. **Bloquear el botón, no mostrar una capa de carga.** El bloqueo impide el
   doble envío, que es el problema real; una capa solo lo tapa.
2. **Restaurar en `finally`.** Si la operación falla, el botón debe volver.
3. **Diálogos con promesas.** Permiten `const ok = await ncvConfirm(...)`, que
   se lee igual que el `confirm()` que sustituyen.
4. **Escape en orden de apilamiento.** Se cierra el modal de más arriba, no
   todos.
5. **`loading="lazy"` en lugar de un observador propio.** Es nativo y no añade
   JavaScript.
6. **Sin rediseño.** No se cambió ni un color, ni una tipografía, ni una
   disposición. Los controles nuevos usan las clases existentes.

## Compatibilidad mantenida

- La apariencia del sitio es la misma.
- `ncvConfirm` y `ncvPrompt` tienen la misma semántica que los nativos.
- Fases 1 a 9 intactas.
- Sin framework, sin bundler, sin dependencias nuevas.

## Seguridad

Esta fase no cambia ninguna garantía de seguridad. Un apunte relacionado: el
bloqueo del botón **no** es un control de concurrencia. La garantía sigue
siendo la transacción de la Fase 5. Esto solo evita que la propia usuaria
compita consigo misma.

## Pruebas ejecutadas

Sobre `http://localhost:5173`, en navegador real.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Los 5 bloques `<script>` inline compilan | 5/5 OK |
| 2 | Los tests unitarios siguen en verde | 84/84 |
| 3 | El diálogo se abre con `role="dialog"` | OK |
| 4 | Aceptar devuelve `true` | `true` |
| 5 | Cancelar devuelve `false` | `false` |
| 6 | `ncvPrompt` prellena el valor por defecto | `"hola"` |
| 7 | Escape cierra y devuelve `null` | `null` |
| 8 | Al cerrar, el scroll del cuerpo se libera | OK |
| 9 | El botón se bloquea durante la operación | `disabled = true` |
| 10 | Se marca `aria-busy` | `"true"` |
| 11 | **Tres clics seguidos → una sola ejecución** | `1` |
| 12 | El botón se restaura al terminar | OK |
| 13 | Todas las imágenes van diferidas | 24/24 |
| 14 | Modales con semántica de diálogo | 10 |
| 15 | Botones de cierre etiquetados | 14 |
| 16 | El botón de reserva usa el bloqueo | OK |
| 17 | Formularios con estado de carga | 12 |
| 18 | **Sin scroll horizontal a 375 px** | `scrollWidth` = 375 |
| 19 | No queda ninguna llamada nativa a `prompt`/`confirm` | 0 |
| 20 | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO

- Los 40 tests de `firestore.rules` (el emulador requiere Java).
- No se pudo tomar una captura de pantalla: el panel del navegador no estaba
  visible y no compone fotogramas. La comprobación de móvil se hizo midiendo el
  desbordamiento en el DOM a 375 px, **no mirando la página**.
- No se midió rendimiento real (Lighthouse, Web Vitals) ni se probó en
  dispositivos físicos.

## Resultado de git diff --check

Sin avisos.

## Riesgos encontrados

- **El diálogo no atrapa el foco.** Con Tab se puede salir a los elementos de
  detrás. Cerrar con Escape y el foco inicial cubren lo básico, pero no es una
  implementación completa.
- **El foco no vuelve al elemento que abrió el diálogo** al cerrarlo.
- **Tailwind sigue cargándose desde CDN**, que él mismo advierte en consola que
  no es para producción. Cambiarlo exige un paso de compilación, que el alcance
  acordado excluye. Se documenta para la Fase 12.
- **Los listeners repintan de más.** Cada snapshot llama a varios `render*`
  completos que rehacen el `innerHTML`. Con los volúmenes de un salón no se
  nota; no se optimizó para no arriesgar regresiones visuales.
- **Las fotos siguen sin redimensionarse** antes de guardarse (viene de la
  Fase 9).
- **La verificación de móvil fue por medición, no visual.**

## Deuda técnica

- Atrapar el foco dentro del diálogo y devolverlo al cerrar.
- Compilar Tailwind en lugar de servirlo por CDN.
- Repintado incremental en vez de reconstruir el `innerHTML`.
- Redimensionar imágenes antes de subirlas.
- Medición real de rendimiento.

## Cosas deliberadamente no modificadas

- La marca: colores, tipografías, disposición, textos.
- La estructura de las secciones del sitio.
- El panel de administración, más allá de los diálogos y estados de carga.
- No se añadió ninguna dependencia.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 11 — Modularización: extraer el JavaScript de `index.html` a
`assets/js/*.js` de forma gradual, probando después de cada extracción. Ya hay
tres módulos (`booking-slots.js`, `loyalty.js`, `sanitize.js`) que marcan el
patrón.

## Commit de cierre

```text
refactor: improve mobile ux accessibility and performance
```
