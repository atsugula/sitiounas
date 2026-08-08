# Parche — eliminar el riesgo de configuración Firebase legacy

Fecha: 2026-08-08
Rama: `mejora-v2`

Proyecto real y definitivo: **`ramos-nails`**.

Alcance: solo la resolución de la configuración de Firebase. No se ha tocado
`salonId` (`nails-con-val`), Auth, booking, Rules, fidelidad ni diseño.

---

## El riesgo

`assets/js/firebase.js` arrancaba así:

```js
const savedFbConfig = JSON.parse(localStorage.getItem('ncv_firebase_config') || 'null');
const explicitFirebaseConfig = savedFbConfig || { ...config del código... };
```

El `||` daba prioridad total a `localStorage`. Un navegador que hubiera guardado
esa clave alguna vez seguiría conectándose a **otro proyecto para siempre**, en
silencio, aunque el código apuntara a `ramos-nails`. No es un problema teórico:
el panel de administración tiene un formulario que escribe esa clave
(`saveCustomFirebaseConfig`), así que cualquier navegador donde se usara alguna
vez arrastra la configuración vieja.

Consecuencia concreta: esa clienta o esa administradora estaría leyendo y
escribiendo citas, perfiles y fidelidad en una base que no es la del salón, sin
ningún aviso en pantalla.

---

## La solución

Se ha adoptado la tercera opción del enunciado — conservar el override pero
acotado — porque el formulario del panel tiene un uso legítimo: **rotar
credenciales del mismo proyecto** sin tocar el código ni redesplegar.

Lo que cambia es que el `projectId` deja de ser negociable.

### `assets/js/firebase.js`

1. La configuración del código pasa a llamarse `CANONICAL_FIREBASE_CONFIG` y se
   exporta. Es **la autoridad**.
2. Nueva función `resolveFirebaseConfig()`:
   - sin entrada en `localStorage` → configuración canónica;
   - entrada con `projectId !== 'ramos-nails'` → **se borra del navegador**, se
     avisa por consola y se arranca con la canónica;
   - entrada corrupta, nula, array o no-objeto → **se borra** igual;
   - entrada del mismo proyecto → se acepta, pero **fusionada sobre la
     canónica**, de forma que un override incompleto no deje campos sin
     definir. El `projectId` se fuerza al canónico en cualquier caso.
   - `localStorage` inaccesible (modo privado) → configuración canónica, sin
     romper el arranque.
3. Se expone `window.firebaseCanonicalConfig` porque el script clásico de
   `index.html` no puede importar este módulo.

La purga se hace sobre el valor **crudo** de `localStorage`, no sobre el
resultado de `JSON.parse`. Es una diferencia real: en la primera versión de este
parche, un JSON corrupto arrancaba correctamente con la canónica pero **no se
borraba**, y la entrada basura se quedaba en el navegador indefinidamente. Se
detectó probándolo en el navegador (ver sección de verificación) y está
corregido.

### `index.html` — `saveCustomFirebaseConfig`

El formulario ahora rechaza un `projectId` distinto del canónico, con un aviso
explícito, en vez de guardarlo y que el arranque siguiente lo descarte en
silencio. Sin esto, el botón parecería funcionar y no haría nada.

Además se corrigen dos valores por defecto que seguían siendo del proyecto
anterior:

```diff
-  messagingSenderId: "1010450777173",
-  appId: appId || "1:1010450777173:web:custom"
+  messagingSenderId: canonical ? canonical.messagingSenderId : "653901900568",
+  appId: appId || (canonical ? canonical.appId : "1:653901900568:web:...")
```

Eran residuo legacy: si alguien guardaba la configuración sin rellenar el App
ID, se escribía el identificador del proyecto viejo.

---

## Verificación

### Comandos pedidos

```text
$ npm test
# tests 162  # suites 36  # pass 162  # fail 0

$ npm run check
4 bloque(s) inline revisados en index.html, 0 con error.

$ git diff --check
(limpio)
```

### En navegador real (`npm start`, localhost:5173)

Los tests de Node no pueden cubrir esto: `assets/js/firebase.js` importa el SDK
desde `gstatic.com` y depende de `localStorage`. Se comprobó a mano, sembrando
cada caso y recargando:

| Caso sembrado en `localStorage` | Resultado observado |
| --- | --- |
| Config del proyecto anterior (`projectId: "nailsconval"`) | clave **borrada**; `app.options.projectId === "ramos-nails"`; aviso en consola |
| JSON corrupto (`{esto no es json`) | clave **borrada**; arranque normal en `ramos-nails` |
| Override legítimo e incompleto (`{apiKey, projectId: "ramos-nails"}`) | clave **conservada**; `projectId`, `authDomain`, `appId` y `storageBucket` correctos, rellenados desde la canónica |

Aviso emitido en el primer caso:

```text
[firebase] ncv_firebase_config descartado: projectId "nailsconval" no es
"ramos-nails". Se usa la configuración de ramos-nails.
```

**No se ha hecho ningún deploy.** Lo verificado es la resolución de la
configuración; que el proyecto `ramos-nails` esté operativo (Auth habilitado,
Firestore creado, Rules desplegadas) sigue pendiente — ver
`CAMBIOS_CONEXION_FIREBASE_RAMOS_NAILS.md`, sección 5.
