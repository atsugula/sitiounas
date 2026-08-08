# Rebranding — Ramos Nails

## Objetivo

Llevar el sitio de la marca anterior, NailsConVal, a **Ramos Nails**: elegante,
femenina, premium y limpia. Sin tocar arquitectura ni ninguna de las garantías
técnicas cerradas en las Fases 1 a 12.

Este commit es branding. No es una migración de Firebase, ni una fase de
seguridad, ni un cambio de backend.

## Inventario previo y clasificación

Se buscaron todas las variantes en todo el repositorio antes de tocar nada.

| Categoría | Coincidencias | Tratamiento |
| --- | --- | --- |
| **A. Branding visible** | 27 en `index.html` + 6 en herramientas y configuración | Reemplazadas |
| **B. Identificador técnico** | 21 (`salonId`, projectId de test) | Conservadas |
| **D. Configuración externa** | 7 (Firebase config, redes, enlace corto) | Conservadas |
| **C. Documentación histórica** | Docs de Fases 1-12 | Conservadas |

No se hizo ningún reemplazo global a ciegas: cada sustitución se declaró de
forma explícita, precisamente porque `nails-con-val` (el `salonId`) y las URL
de redes comparten cadena con la marca y **no** debían cambiar.

## Archivos modificados

```text
index.html                        marca, paleta, metadatos, logotipo, hero
firestore.rules                   solo el comentario de cabecera
package.json                      name y description
tools/serve.mjs                   mensaje de arranque
tests/firestore.rules.test.mjs    solo el comentario de cabecera
.claude/launch.json               nombre de la configuración local
RESUMEN_FINAL_PROYECTO.md         nota de marca al inicio
```

## Archivos nuevos

```text
assets/brand/ramos-nails-logo.svg   logotipo horizontal (monograma + denominativo)
assets/brand/ramos-nails-mark.svg   monograma RN, para avatares y favicon
CAMBIOS_REBRANDING_RAMOS_NAILS.md
```

## Referencias visibles reemplazadas

21 cadenas de marca en `index.html`, una por una:

| Superficie | Antes | Ahora |
| --- | --- | --- |
| Título del navegador | `NailsConVal \| Salón de Uñas & Nail Art Elegante en Tuluá` | `Ramos Nails \| Uñas, Diseño y Cuidado` |
| Barra de navegación | `NailsConVal` | `Ramos Nails` |
| Pie | `NailsConVal` ×2 | `Ramos Nails` |
| Credencial móvil | `Nails Con Val` | `Ramos Nails` |
| Sobre la fundadora | `...creó NailsConVal...` | `...creó Ramos Nails...` |
| Comunidad | 3 textos | `Ramos Nails` |
| Modal de acceso y registro | 3 textos | `Ramos Nails` |
| Panel administrativo | 3 textos, incluida la cabecera | `Panel Administrativo — Ramos Nails` |
| WhatsApp de reserva | `*NUEVA RESERVA DE CITA NAILSCONVAL*` | `*NUEVA RESERVA DE CITA RAMOS NAILS*` |
| WhatsApp de cumpleaños | `En NailsconVal queremos...` | `En Ramos Nails queremos...` |
| WhatsApp del panel | `te escribo de NailsConVal` | `te escribo de Ramos Nails` |
| Exportación CSV | `Reporte_Financiero_NailsConVal_*.csv` | `Reporte_Financiero_RamosNails_*.csv` |
| Exportación CSV | `Reporte_Citas_NailsConVal_*.csv` | `Reporte_Citas_RamosNails_*.csv` |
| Descarga de diseño | `Diseno_NailsConVal.png` | `Diseno_RamosNails.png` |
| Asistente de IA | `Ubicación del Estudio NailsConVal` | `Ubicación del Estudio Ramos Nails` |
| Galería | `Galería NailsConVal (n de m)` | `Galería Ramos Nails (n de m)` |
| Selector de tema del ticket | `💜 Estándar (Purple Glam)` | `🍷 Estándar (Vino Ramos)` |

La variante `NailsconVal`, con minúscula distinta, apareció solo en el mensaje
de cumpleaños y se detectó con una búsqueda que ignora mayúsculas; una búsqueda
exacta la habría dejado pasar.

## Logo

**No se suministró ningún logotipo definitivo**, así que se creó una identidad
tipográfica propia en SVG, como estaba previsto. No se generó ningún PNG de
baja calidad.

- `assets/brand/ramos-nails-mark.svg` — monograma **RN** en serif vino sobre
  campo marfil, con aro de champagne y filete inferior. Pensado para verse
  recortado en círculo, que es como lo usan la barra de navegación y el pie.
- `assets/brand/ramos-nails-logo.svg` — lockup horizontal: monograma más
  `RAMOS` sobre filete de champagne y `NAILS` en sans muy espaciada.

Ambos son minimalistas, sin clipart, con fondo transparente y vectoriales, así
que se ven nítidos a cualquier tamaño.

Aplicados en: barra de navegación, pie, sección de la fundadora, favicon,
`apple-touch-icon` y metadatos sociales. Todos con `alt="Ramos Nails"`.

**Son provisionales y sustituibles** por el logotipo definitivo sin tocar
código: basta reemplazar los dos archivos.

Limitación conocida: los SVG usan `font-family` con Playfair Display y respaldo
a Georgia. Dentro de la página se ve con la tipografía de marca; fuera —por
ejemplo en el favicon— cae al respaldo del sistema. Convertir el texto a trazos
requiere herramientas de diseño que aquí no había.

## Hero

**No se suministró ninguna imagen nueva.** El código queda preparado con una
clase `.hero-backdrop` que declara dos capas:

```css
background-image:
    url('./assets/brand/ramos-nails-hero.webp'),   /* asset definitivo */
    url('https://images.unsplash.com/...');        /* respaldo actual */
```

Mientras el archivo local no exista, su capa no pinta y se ve la de abajo, así
que **el hero nunca queda vacío**. Al añadir el archivo pasa a mandar sin tocar
el marcado.

**Esto produce un 404 en consola en cada carga** hasta que se añada el asset.
Es el precio de dejar el código preparado, y queda dicho para que no sorprenda.

El fondo es decorativo y se marcó `role="presentation"`; el texto del hero va
aparte y sigue siendo legible (blanco sobre vino, 17:1).

## Paleta y acabado visual

El rebranding cromático se hizo en los **tokens**, no clase por clase. En el
sitio hay unas 440 clases `brand-*` y otras 100 de `purple`, `violet` y
`fuchsia`; redefinir los tokens cambia el color de todo con un diff mínimo y
sin tocar una sola línea de maquetación.

### Paleta de marca

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand-ivory` | `#fdfaf7` | Fondos y campos |
| `--brand-blush` | `#f2d6d5` | Bordes y acentos suaves |
| `--brand-wine` | `#833243` | CTA, enlaces, selección |
| `--brand-wine-deep` | `#331019` | Fondos oscuros, hero |
| `--brand-champagne` | `#c9a86a` | Detalles y sellos |
| `--brand-ink` | `#2b2224` | Texto |

En Tailwind, `brand`, `purple` y `violet` apuntan a la misma rampa vino
—para que las clases heredadas de la marca anterior no desentonen— y `fuchsia`
pasa a ser el rosa empolvado.

`amber`, `rose` y `emerald` se dejaron intactos: en el panel significan aviso,
error y éxito, no marca. Cambiarlos habría roto una convención semántica por un
motivo estético.

### Contraste

Comprobado numéricamente antes de aplicar. Todos los pares de texto cumplen
como mínimo AA:

```text
 8.39:1  AAA  Texto blanco sobre CTA (brand-700)
 6.13:1  AA   Texto blanco sobre brand-600
17.09:1  AAA  Texto blanco sobre brand-950 (hero)
 8.39:1  AAA  brand-700 sobre blanco (enlaces)
12.49:1  AAA  brand-200 sobre brand-950
 7.56:1  AAA  champagne sobre brand-950
14.88:1  AAA  ink sobre ivory
```

### Restos de morado

Además de los tokens, se sustituyeron 7 literales hexadecimales morados que
quedaban sueltos en el CSS escrito a mano (degradado del botón primario, botón
flotante, sombras, bordes lila y los sellos en línea, que pasaron de ámbar
chillón a champagne) y un `rgba(30,11,80,.82)` en el overlay del modal de
acceso, que se detectó recorriendo el DOM en busca de colores realmente
renderizados con tono entre 255° y 320°.

Tras el cambio ese barrido devuelve **0 elementos morados** en todo el
documento, modales ocultos incluidos.

### Tipografía

Sin cambios: Playfair Display para títulos y Plus Jakarta Sans para texto. Ya
son una combinación serif editorial más sans limpia, exactamente lo que pedía
la dirección visual. No se añadió ninguna fuente, así que no cambian ni la
carga ni la CSP.

## SEO y metadata

| Etiqueta | Valor |
| --- | --- |
| `<title>` | `Ramos Nails \| Uñas, Diseño y Cuidado` |
| `description` | `Ramos Nails: diseños de uñas, manicure y cuidado profesional con reserva de citas en línea.` |
| `og:site_name` | `Ramos Nails` (nueva) |
| `og:title` / `twitter:title` | `Ramos Nails \| Uñas, Diseño y Cuidado` |
| `og:description` / `twitter:description` | Descripción nueva |
| `og:image` / `twitter:image` | `./assets/brand/ramos-nails-logo.svg` |
| `theme-color` | `#833243` (nueva) |
| `icon` / `apple-touch-icon` | `./assets/brand/ramos-nails-mark.svg` (nuevas) |

No se inventó ciudad, dirección ni servicios: la descripción anterior mencionaba
Tuluá y a Val, y la nueva —la sugerida en el encargo— simplemente no afirma
nada que no se pueda comprobar. Se retiraron `og:image:width` y
`og:image:height`, que declaraban 960×960 del logotipo anterior.

**Pendiente: falta el `og:image` en mapa de bits.** Facebook, WhatsApp y X no
renderizan SVG en las vistas previas, así que hasta que exista un JPG o PNG
—1200×630 es lo habitual— la tarjeta se mostrará sin imagen. Se prefirió eso a
seguir enseñando el logotipo de la marca anterior. No hay herramientas de
rasterización en este entorno, así que **no se generó** y no se finge lo
contrario.

## WhatsApp y textos

Se cambiaron las cuatro firmas de marca en mensajes generados: reserva,
cumpleaños, contacto desde el panel y nombre del archivo de diseño adjunto.

**No se tocó** el número de WhatsApp, la llave de pago, los precios, los
horarios, las duraciones ni el formato de la reserva.

Se conservó el saludo `Hola Val!` del mensaje de reserva, por coherencia con el
resto: ver la nota sobre la persona más abajo.

## Referencias técnicas legacy conservadas

Tras el barrido final quedan 27 coincidencias, todas deliberadas:

| Qué | Dónde | Por qué |
| --- | --- | --- |
| `salonId = 'nails-con-val'` | `index.html` ×9, `booking-slots.js`, `loyalty.js`, `firestore.rules`, tests ×7 | Ver sección `salonId` |
| `projectId: 'nailsconval'` | `.firebaserc`, `assets/js/firebase.js` ×3 | Configuración de Firebase; el encargo lo prohíbe expresamente |
| `PROJECT_ID = 'nailsconval-rules-test'` | `tests/firestore.rules.test.mjs` | Espacio de nombres del emulador, puramente local |
| `https://bit.ly/nailsconval` | `og:url` | Enlace corto real en circulación |
| `instagram.com/nailsconval.col` | Pie | Cuenta real |
| `tiktok.com/@nailsconval.col` | Pie | Cuenta real |

Las tres últimas son **BLOQUEO EXTERNO**: cambiarlas en el código no renombra
las cuentas, y apuntar a un usuario que todavía no existe rompería enlaces que
hoy funcionan. Hay que crear o renombrar los perfiles primero y luego
actualizar el sitio.

La documentación de las Fases 1 a 12 conserva el nombre anterior a propósito:
es historial técnico y describe el estado de cada momento. Solo se añadió una
nota de marca al inicio de `RESUMEN_FINAL_PROYECTO.md`, que sí describe el
estado presente.

## salonId

**Conservado como `nails-con-val`.**

```text
IDENTIFICADOR LEGACY CONSERVADO:
"nails-con-val" permanece como salonId interno para no romper datos existentes.
```

Razonamiento: no se pudo comprobar si hay datos reales con ese `salonId`, y
todo apunta a que sí. El sitio está en producción —`RESUMEN_FINAL_PROYECTO.md`
lo dice explícitamente— y la Fase 5 dejó documentado un relleno pendiente de
`clientUid` sobre citas que ya existen. Además, en este entorno la
autenticación de Firebase responde HTTP 400, así que no había forma de mirar.

Ante la duda, el encargo manda conservar. Cambiarlo habría dejado huérfanas las
citas, los locks, los perfiles, la fidelidad y los ajustes ya guardados.

Visualmente **nada** muestra ese identificador: es un campo interno.

### Plan de migración, si algún día se quiere hacer

No forma parte de este commit. Requiere copia de seguridad y acceso de
administración.

1. Exportar Firestore (`gcloud firestore export`).
2. Cambiar el valor en los cuatro sitios que lo definen: `index.html` (9
   literales), `assets/js/booking-slots.js`, `assets/js/loyalty.js` y
   `firestore.rules`.
3. Actualizar los fixtures de los tests (7 sitios) y ejecutar la suite.
4. **Reconstruir los ids de `bookingSlots`**: son deterministas y llevan el
   `salonId` dentro (`{salonId}_{fecha}_{hora}`), así que cambiarlo obliga a
   recrear todos los locks activos. Hacerlo mal produce doble reserva.
5. Reescribir el campo `salonId` en `users`, `appointments`,
   `loyalty_transactions`, `reviews`, `community_posts` y `settings`.
6. Desplegar reglas y verificar.

Recomendación: centralizar antes el valor en una única constante, para que el
paso 2 sea una línea en vez de doce. No se hizo aquí porque tocaría el camino
de escritura de citas, y este commit es de branding.

## Firebase projectId

**Sin cambios**, como exigía el encargo. `.firebaserc` y el `firebaseConfig` de
`assets/js/firebase.js` siguen apuntando a `nailsconval`.

El nombre comercial y el projectId no necesitan coincidir. Cambiar de proyecto
Firebase es una migración con datos, cuentas y reglas de por medio, no un
rebranding.

## localStorage legacy

**Sin cambios.** Las claves `ncv_*` se conservan tal cual.

Aunque el prefijo venga de la marca anterior, hoy son identificadores técnicos
de cache y compatibilidad. Renombrarlas invalidaría la cache de todas las
clientas que ya tienen el sitio abierto y podría provocar regresiones en los
caminos de rehidratación que se estabilizaron en las Fases 4, 8 y 9.

Si algún día se quiere renombrar: leer la clave antigua, migrar a la nueva,
mantener respaldo temporal y retirar la antigua en una versión posterior.

## Correo de administración

El `admin@nailsconval.com` que aparecía era el `placeholder` del campo de
acceso administrativo. Se sustituyó por `correo@ejemplo.com`, no por
`admin@ramosnails.com`.

Motivo: un placeholder con aspecto de dirección real sugiere una cuenta
concreta, y esa cuenta en Firebase Auth **no existe**. Un ejemplo neutro no
afirma nada falso y tampoco deja la marca anterior a la vista.

```text
BLOQUEO EXTERNO: actualizar el correo de la cuenta admin en Firebase Auth.
```

Cambiar una cadena local no renombra la cuenta. Si se quiere una dirección de
la marca nueva, hay que crearla o cambiarla en la consola de Firebase y
asignarle `role: "admin"` en su documento `users/{uid}`.

## Sobre la persona: "Val"

Se conservaron **todas** las referencias a Val y Valeria: `Hola, soy Val`,
`Val AI`, `Val te responde por WhatsApp`, `Sobre Val`, el ancla `#sobre-val` y
el saludo `Hola Val!` del mensaje de reserva.

Es el nombre de una persona, no la marca. Renombrarla sería inventarse una
identidad, y borrarla dejaría textos cojos.

**Requiere confirmación de la propietaria.** Si "Ramos" corresponde a otra
persona, o si Val ya no atiende el estudio, hay unas diez cadenas que actualizar
y no se pueden decidir sin esa información. Es la única decisión de contenido
que este commit deja abierta.

La sección "Sobre" mostraba `logo.jpg` como si fuera un retrato. Ahora muestra
el logotipo, con un comentario en el código indicando que ahí debería ir la
fotografía real: se prefirió eso a poner una imagen de banco de nadie del
estudio.

## Tests ejecutados

```bash
npm test          # 137 tests | 137 pass | 0 fail
npm run check     # 4 bloques inline, 0 errores
git diff --check  # sin avisos
```

Sin regresiones. Ninguna prueba se modificó: en `tests/` solo se tocó un
comentario de cabecera.

## Verificación visual

Sobre `http://localhost:5173`, en navegador real, con la CSP de producción
activa.

**Aviso honesto:** el panel del navegador no estaba visible y no compone
fotogramas, así que **no se pudo tomar ninguna captura de pantalla**. La
verificación se hizo leyendo el DOM y los **estilos computados** —es decir, los
colores que el navegador resolvió de verdad, no los que dice el código— y
midiendo geometría. Es sólido para color, texto y disposición; no sustituye a
mirar la página.

| # | Comprobación | Resultado |
| --- | --- | --- |
| 1 | Título del navegador | `Ramos Nails \| Uñas, Diseño y Cuidado` |
| 2 | Metadatos y favicon | Correctos, favicon `ramos-nails-mark.svg` |
| 3 | Barra de navegación: marca y logotipo | `Ramos Nails` + SVG nuevo |
| 4 | CTA "Agendar Cita" (color resuelto) | `rgb(131,50,67)` → `rgb(87,31,47)` |
| 5 | Fondo del hero (color resuelto) | vino profundo → vino |
| 6 | Capas del hero | WebP local + respaldo remoto |
| 7 | Campos de formulario | fondo marfil, borde blush |
| 8 | Botón primario | degradado vino |
| 9 | Tokens CSS | `--brand-wine: #833243`, `--brand-champagne: #c9a86a` |
| 10 | **Elementos morados en todo el DOM** | **0** |
| 11 | Referencias al logotipo anterior | **0** |
| 12 | Logotipos nuevos en la página | 3 |
| 13 | Marca anterior en texto visible | **0** |
| 14 | Menciones de `Ramos Nails` en la página | 18 |
| 15 | Modal de acceso: marca y overlay | `Ramos Nails`, overlay vino |
| 16 | Pestaña de registro | Abre correctamente |
| 17 | Perfil: nombre, fidelidad, formulario de edición | `4 / 10 citas`, formulario presente |
| 18 | Agenda: calendario y turnos | 37 días pintados |
| 19 | Reseñas y comunidad | Renderizan |
| 20 | Pie | `Ramos Nails © 2026 Ramos Nails...` |
| 21 | Panel administrativo | `Panel Administrativo — Ramos Nails` |
| 22 | Selector de tema del ticket | `purple` → `🍷 Estándar (Vino Ramos)` |
| 23 | Placeholder de correo admin | `correo@ejemplo.com` |
| 24 | **Móvil 375 px: sin scroll horizontal** | `scrollWidth` = 375 |
| 25 | Móvil: logotipo y marca visibles | 40×40 px, marca 130 px dentro de pantalla |
| 26 | Móvil: CTA como objetivo táctil | 56 px de alto |
| 27 | Los dos SVG cargan | 200 OK |
| 28 | Consola | Solo el 404 previsto del hero y el HTTP 400 preexistente de Firebase |

## Riesgos

| Riesgo | Gravedad | Nota |
| --- | --- | --- |
| **Falta el `og:image` en raster** | Media | Las vistas previas en redes saldrán sin imagen |
| **404 del hero en consola** | Baja | Hasta que se añada `ramos-nails-hero.webp`; el respaldo funciona |
| **Logotipo provisional** | Media | Es tipográfico propio; sustituible reemplazando dos archivos |
| **Las referencias a "Val" quedan sin confirmar** | Media | Única decisión de contenido abierta |
| **Redes y enlace corto siguen con el nombre anterior** | Media | Bloqueo externo: hay que renombrar las cuentas primero |
| No se pudo tomar captura de pantalla | Media | Verificado por DOM y estilos computados |
| El hero sigue dependiendo de una imagen remota | Baja | Es el respaldo, no la fuente definitiva |
| La imagen del hero no es de Ramos Nails | Baja | Es una foto genérica de manicura; se sustituye con el asset final |

## Cosas deliberadamente no modificadas

- **`salonId`**, que sigue siendo `nails-con-val`.
- **Firebase projectId, `.firebaserc` y `firebaseConfig`.**
- **Claves `ncv_*` de `localStorage`.**
- **Firestore Rules**: solo cambió el comentario de cabecera.
- **Tests**: solo cambió un comentario de cabecera.
- Booking atómico, autenticación, fidelidad, esquema de citas, permisos de
  admin, lógica de disponibilidad y saneamiento: intactos.
- Colores `amber`, `rose` y `emerald`: son semánticos, no de marca.
- Tipografías: ya encajaban con la dirección visual.
- El archivo `logo.jpg`: ya no se referencia desde ningún sitio, pero no se
  borró. Es un asset de la propietaria y esa decisión es suya.
- Los identificadores de tema del ticket (`purple`, `rose`, …): están guardados
  en `settings/discount_settings` y renombrarlos dejaría la configuración
  huérfana. Solo se cambió la etiqueta visible.
- Números de teléfono, llave de pago, precios, horarios y duraciones.
- **Bot de Telegram: sigue fuera de alcance.**

## Commit

```text
feat: rebrand site to Ramos Nails
```
