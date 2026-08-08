# Conexión al proyecto Firebase propio de Ramos Nails

Fecha: 2026-08-08
Rama: `mejora-v2`

`projectId`: `nailsconval` → **`ramos-nails`**
`salonId`: `nails-con-val` — **sin cambios**
Marca visible: Ramos Nails — **sin cambios**

Alcance: **solo la conexión**. No se ha tocado booking, autenticación,
fidelidad, diseño, marca ni `firestore.rules`.

---

## Nota sobre el Project ID

El mensaje inicial indicaba `ramos-nails-app`, pero la configuración web
entregada por Firebase declara `projectId: "ramos-nails"`, con
`authDomain: "ramos-nails.firebaseapp.com"` y
`storageBucket: "ramos-nails.firebasestorage.app"`. Un proyecto con ID
`ramos-nails-app` tendría el dominio `ramos-nails-app.firebaseapp.com`, así que
`ramos-nails-app` es el *nickname* de la app web, no el ID del proyecto.

Confirmado después por el usuario: el Project ID es **`ramos-nails`**.

---

## 1. Ficheros modificados

### `assets/js/firebase.js`

Sustituida la configuración web completa por la del proyecto nuevo: `apiKey`,
`authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` y
`measurementId`.

Nada más de este fichero ha cambiado: la inicialización, `signInAnonymously()`,
las suscripciones, `isCurrentUserAdmin()` y el resto de la lógica de sesión son
idénticas.

Se ha añadido un comentario que recoge dos cosas que conviene no olvidar:

- estos valores son **públicos por diseño** en Firebase Web. `apiKey` identifica
  al proyecto, no autoriza nada; lo que protege los datos son las Rules. No se
  mueven a variables de entorno porque no son secretos;
- `ncv_firebase_config` en `localStorage` **sigue teniendo prioridad** sobre esta
  configuración. Ver la sección 4.

### `.firebaserc`

```json
{ "projects": { "default": "ramos-nails" } }
```

Es lo que leen `firebase use`, `firebase deploy` y la comprobación de proyecto
del migrador.

### `tools/migrate-firebase-production.mjs`

`EXPECTED_PROJECT_ID` pasa de `'nailsconval'` a `'ramos-nails'`.

No es cosmético: el migrador aborta si `.firebaserc` o el `project_id` de la
cuenta de servicio no coinciden con esa constante. Sin este cambio, la
herramienta se habría negado a ejecutarse contra el proyecto nuevo. El mensaje
de ayuda de `gcloud firestore export` ya derivaba del constante, así que ahora
sugiere `--project=ramos-nails` automáticamente.

### `tests/firestore.rules.test.mjs`

`PROJECT_ID` pasa de `'nailsconval-rules-test'` a `'ramos-nails-rules-test'`.

Es el identificador del sandbox del emulador, no toca ningún proyecto real. Se
renombra solo por coherencia.

---

## 2. Ficheros deliberadamente NO modificados

| Fichero | Motivo |
| --- | --- |
| `firestore.rules` | No contiene ninguna referencia al `projectId`. Usa `$(database)` y `salonId() == 'nails-con-val'`, que se mantiene |
| `firestore.indexes.json` | Sin referencias al proyecto |
| `firebase.json` | La CSP usa comodines (`https://*.googleapis.com`, `https://*.firebaseio.com`); no hay ningún host atado al proyecto anterior |
| `index.html` | Ver abajo |
| `assets/js/booking-slots.js`, `loyalty.js`, `availability.js`, `sanitize.js`, `time.js` | Lógica pura, sin configuración de proyecto |

### Las tres apariciones de "nailsconval" que quedan en `index.html`

```text
línea 30    <meta property="og:url" content="https://bit.ly/nailsconval">
línea 1538  https://www.instagram.com/nailsconval.col/
línea 1544  https://www.tiktok.com/@nailsconval.col
```

**No son el projectId.** Son el enlace corto y los perfiles reales de redes
sociales del salón, es decir, marca visible. Cambiarlos rompería enlaces que
funcionan hoy y queda fuera del alcance pedido. Si el salón migra también sus
redes, es una decisión de marca, no técnica.

---

## 3. Verificación ejecutada

```text
$ npm test
# tests 162  # suites 36  # pass 162  # fail 0

$ npm run check
4 bloque(s) inline revisados en index.html, 0 con error.

$ git diff --check
(limpio)
```

Sin regresiones. No se ha hecho ningún deploy.

Lo que estas pruebas **no** demuestran: que el proyecto `ramos-nails` esté
operativo. Son tests de lógica pura y de sintaxis; ninguno abre una conexión de
red. Que el sitio funcione contra el proyecto nuevo depende de cosas que aún no
están hechas (sección 5).

---

## 4. Trampa conocida: `ncv_firebase_config`

`assets/js/firebase.js` da prioridad a la configuración guardada en
`localStorage` bajo `ncv_firebase_config`. Cualquier navegador que en su día
guardara ahí la config del proyecto anterior **seguirá conectándose a
`nailsconval`** aunque el código apunte a `ramos-nails`, sin ningún aviso.

Para descartarlo, en la consola del navegador:

```js
localStorage.removeItem('ncv_firebase_config'); location.reload();
```

Conviene hacerlo en el navegador de administración antes de dar por buena
cualquier prueba contra el proyecto nuevo.

---

## 5. Lo que falta antes de que el proyecto nuevo sirva

El proyecto `ramos-nails` está recién creado, así que está vacío. Antes de que
el sitio funcione contra él:

1. **Auth**: habilitar **Email/Password** y **Anonymous**. Sin Anonymous, el
   sitio público no puede leer disponibilidad ni publicar en el muro, porque
   arranca con `signInAnonymously()`.
2. **Authorized Domains**: añadir `ramos-nails.web.app`,
   `ramos-nails.firebaseapp.com`, `localhost` y el dominio propio si lo hay.
3. **Firestore**: crear la base de datos.
4. **Rules e índices**: desplegar (pendiente de que exista un JDK para poder
   ejecutar `npm run test:rules` antes; ver
   `CAMBIOS_INTEGRACION_BACKEND_FASE_A.md`).
5. **Contenido**: el proyecto nuevo no tiene `settings/*`, ni usuarios, ni
   citas. Si se quiere conservar lo de `nailsconval`, hace falta un export del
   proyecto viejo y un import en el nuevo — que es una migración **entre
   proyectos**, distinta de la que hace
   `tools/migrate-firebase-production.mjs` (esa normaliza datos dentro de un
   mismo proyecto).
6. **Admin**: crear la cuenta en el proyecto nuevo y su `users/{uid}` con
   `role: 'admin'` y `salonId: 'nails-con-val'`.

Los documentos de fases anteriores (`CAMBIOS_INTEGRACION_BACKEND_FASE_A/B/C.md`,
`AUDITORIA_FIREBASE_REAL.md`, `REPORTE_MIGRACION_FIREBASE.md`,
`CIERRE_INTEGRACION_BACKEND.md`) se escribieron cuando el destino era
`nailsconval` y se conservan como registro histórico. **Donde digan
`nailsconval`, léase `ramos-nails`.**
