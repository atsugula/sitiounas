#!/usr/bin/env node
//
// Comprueba firestore.rules con la Rules Test API de Firebase.
//
// Por qué existe
// --------------
// `npm run test:rules` levanta el emulador de Firestore, que es un binario
// Java. En una máquina sin JDK no hay forma de ejecutarlo, y quedarse sin
// probar las Rules no es aceptable: fue exactamente la ceguera que dejó pasar
// a producción el bug del formato de hora.
//
// La Rules Test API (`projects/{id}:test`) evalúa el mismo ruleset en los
// servidores de Google. No necesita Java, no toca datos y no despliega nada:
// sube el fichero como fuente y devuelve el veredicto de cada caso.
//
// Esto NO sustituye a `npm run test:rules`. El emulador prueba secuencias con
// estado (crear, luego actualizar, luego borrar); esto prueba decisiones
// sueltas. Son complementarios: cuando haya JDK, ejecuta los dos.
//
// Uso:
//   npx firebase login          (una vez)
//   npm run test:rules:api
//
// Depende de módulos internos de firebase-tools, que no son API pública. Si una
// actualización los mueve, este script lo dirá claramente en vez de fallar de
// forma silenciosa.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const PROJECT_ID = 'ramos-nails';
const SALON = 'nails-con-val';
const DB = '/databases/(default)/documents';

const UID = 'uid-clienta-a';
const OTHER_UID = 'uid-clienta-b';
const ADMIN_UID = 'uid-admin';

function loadFirebaseToolsInternals() {
    const base = path.join(ROOT, 'node_modules', 'firebase-tools', 'lib');
    try {
        return {
            requireAuth: require(path.join(base, 'requireAuth.js')).requireAuth,
            auth: require(path.join(base, 'auth.js')),
            Client: require(path.join(base, 'apiv2.js')).Client
        };
    } catch (error) {
        console.error(
            'No se pudieron cargar los módulos internos de firebase-tools.\n' +
            'Este comprobador depende de ellos; usa `npm run test:rules` con el emulador.\n' +
            `Detalle: ${error.message}`
        );
        process.exit(2);
    }
}

// Contextos de autenticación. `sign_in_provider` es lo que distingue una
// sesión registrada de una anónima en isRegistered().
const registered = (uid) => ({ uid, token: { firebase: { sign_in_provider: 'password' } } });
const anonymous = (uid) => ({ uid, token: { firebase: { sign_in_provider: 'anonymous' } } });

const perfil = (uid, extra = {}) => ({
    uid,
    salonId: SALON,
    name: 'Clienta Demo',
    phone: '3001234567',
    email: `${uid}@example.com`,
    birthdate: '1995-04-12',
    role: 'client',
    bookedCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra
});

// Payload con la MISMA forma que produce prepareWhatsAppBooking() tras el fix.
const cita = (extra = {}) => ({
    id: 'app_1',
    clientUid: UID,
    salonId: SALON,
    appointmentDateIso: '2026-09-01',
    dateKey: 'Tue Sep 01 2026',
    serviceIds: ['mani_semi'],
    serviceSummary: 'Manicura semipermanente ($45.000 COP)',
    durationMinutes: 120,
    startTime: '14:00',
    endTime: '16:00',
    time: '02:00 PM',
    name: 'Clienta Demo',
    phone: '3001234567',
    service: 'Manicura semipermanente ($45.000 COP)',
    notes: '',
    promoCode: null,
    birthday: '1995-04-12',
    status: 'confirmada',
    createdAt: '2026-08-08T12:00:00.000Z',
    isWalkIn: false,
    isRefunded: false,
    loyaltyRedeemed: false,
    ...extra
});

const lock = (extra = {}) => ({
    salonId: SALON,
    dateKey: 'Tue Sep 01 2026',
    dateIso: '2026-09-01',
    startTime: '14:00',
    appointmentId: 'app_1',
    createdAt: '2026-08-08T12:00:00.000Z',
    ...extra
});

const SLOT_ID = `${SALON}_2026-09-01_14:00`;

// [descripción, método, ruta, auth, datos, expectativa]
const CASES = [
    // ── users / login ────────────────────────────────────────
    ['la clienta lee su propio perfil', 'get', `${DB}/users/${UID}`, registered(UID), null, 'ALLOW'],
    ['la clienta NO lee el perfil de otra', 'get', `${DB}/users/${OTHER_UID}`, registered(UID), null, 'DENY'],
    ['anónimo NO lee perfiles', 'get', `${DB}/users/${UID}`, anonymous('anon-1'), null, 'DENY'],
    ['sin sesión NO lee perfiles', 'get', `${DB}/users/${UID}`, null, null, 'DENY'],
    ['registro: perfil client válido', 'create', `${DB}/users/${UID}`, registered(UID), perfil(UID), 'ALLOW'],
    ['registro: no puede nacer como admin', 'create', `${DB}/users/${UID}`, registered(UID), perfil(UID, { role: 'admin' }), 'DENY'],
    ['registro: no puede nacer con fidelidad', 'create', `${DB}/users/${UID}`, registered(UID), perfil(UID, { bookedCount: 7 }), 'DENY'],
    ['registro: no puede crear el perfil de otra', 'create', `${DB}/users/${OTHER_UID}`, registered(UID), perfil(OTHER_UID), 'DENY'],
    ['registro: una sesión anónima no crea perfil', 'create', `${DB}/users/${UID}`, anonymous(UID), perfil(UID), 'DENY'],
    ['registro: salonId ajeno', 'create', `${DB}/users/${UID}`, registered(UID), perfil(UID, { salonId: 'ramos-nails' }), 'DENY'],
    ['registro: campo de más', 'create', `${DB}/users/${UID}`, registered(UID), { ...perfil(UID), token: 'x' }, 'DENY'],

    // ── appointments / reserva ───────────────────────────────
    ['reserva: payload real de la clienta', 'create', `${DB}/appointments/app_1`, registered(UID), cita(), 'ALLOW'],
    ['reserva: hora en formato visible de 12 h (BUG)', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ startTime: '02:00 PM', endTime: '04:00 PM' }), 'DENY'],
    ['reserva: endTime de 12 h', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ endTime: '04:00 PM' }), 'DENY'],
    ['reserva: serviceIds vacío (BUG del walk-in)', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ serviceIds: [] }), 'DENY'],
    ['reserva: clientUid de otra clienta', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ clientUid: OTHER_UID }), 'DENY'],
    ['reserva: clientUid nulo', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ clientUid: null }), 'DENY'],
    ['reserva: salonId incorrecto', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ salonId: 'ramos-nails' }), 'DENY'],
    ['reserva: sesión anónima con su propio uid', 'create', `${DB}/appointments/app_1`, anonymous(UID), cita(), 'ALLOW'],
    ['reserva: sin sesión', 'create', `${DB}/appointments/app_1`, null, cita(), 'DENY'],
    ['reserva: no puede marcarse como walk-in', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ isWalkIn: true }), 'DENY'],
    ['reserva: no puede nacer devuelta', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ isRefunded: true }), 'DENY'],
    ['reserva: no puede nacer pagada', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ paidStatus: 'pagado' }), 'DENY'],
    ['reserva: no puede nacer completada', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ status: 'completada' }), 'DENY'],
    ['reserva: duración fuera de rango', 'create', `${DB}/appointments/app_1`, registered(UID), cita({ durationMinutes: 900 }), 'DENY'],

    // ── bookingSlots / locks ─────────────────────────────────
    ['lock: creación válida', 'create', `${DB}/bookingSlots/${SLOT_ID}`, registered(UID), lock(), 'ALLOW'],
    ['lock: campo de más', 'create', `${DB}/bookingSlots/${SLOT_ID}`, registered(UID), lock({ extra: 'x' }), 'DENY'],
    ['lock: salonId incorrecto', 'create', `${DB}/bookingSlots/${SLOT_ID}`, registered(UID), lock({ salonId: 'ramos-nails' }), 'DENY'],
    ['lock: startTime en 12 h', 'create', `${DB}/bookingSlots/${SLOT_ID}`, registered(UID), lock({ startTime: '02:00 PM' }), 'DENY'],
    ['lock: sin sesión', 'create', `${DB}/bookingSlots/${SLOT_ID}`, null, lock(), 'DENY'],
    ['lock: la disponibilidad es pública', 'get', `${DB}/bookingSlots/${SLOT_ID}`, null, null, 'ALLOW'],

    // ── settings ─────────────────────────────────────────────
    ['settings públicos: lectura sin sesión', 'get', `${DB}/settings/custom_services`, null, null, 'ALLOW'],
    ['settings privados: income_goal no es público', 'get', `${DB}/settings/income_goal`, registered(UID), null, 'DENY'],
    ['settings: la clienta no escribe', 'update', `${DB}/settings/custom_services`, registered(UID), { services: [] }, 'DENY'],

    // ── loyalty ──────────────────────────────────────────────
    ['fidelidad: la clienta no se acredita estampas', 'create', `${DB}/loyalty_transactions/tx_1`, registered(UID), { userId: UID, salonId: SALON, type: 'earn', stampsDelta: 5 }, 'DENY']
];

async function main() {
    const { requireAuth, auth, Client } = loadFirebaseToolsInternals();

    const options = { project: PROJECT_ID, projectId: PROJECT_ID };
    const account = auth.getGlobalDefaultAccount();
    if (!account) {
        console.error('BLOQUEO: la CLI de Firebase no tiene sesión. Ejecuta `npx firebase login`.');
        process.exit(3);
    }
    auth.setActiveAccount(options, account);
    await requireAuth(options);

    const rulesPath = path.join(ROOT, 'firestore.rules');
    const source = { files: [{ name: 'firestore.rules', content: fs.readFileSync(rulesPath, 'utf8') }] };

    const testCases = CASES.map(([, method, docPath, authCtx, data, expectation]) => ({
        expectation,
        pathEncoding: 'PLAIN',
        request: {
            auth: authCtx,
            path: docPath,
            method,
            ...(data ? { resource: { data } } : {})
        }
    }));

    const client = new Client({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1' });
    const res = await client.post(`/projects/${PROJECT_ID}:test`, { source, testSuite: { testCases } });

    const issues = res.body.issues || [];
    const errores = issues.filter((i) => i.severity === 'ERROR');
    if (errores.length > 0) {
        console.error('firestore.rules no compila:');
        errores.forEach((i) => console.error(`  L${i.sourcePosition?.line}: ${i.description}`));
        process.exit(1);
    }

    const results = res.body.testResults || [];
    let fallos = 0;

    console.log(`Rules Test API — proyecto ${PROJECT_ID}, ${results.length} casos\n`);
    results.forEach((r, i) => {
        const [label, , , , , expectation] = CASES[i];
        const ok = r.state === 'SUCCESS';
        if (!ok) fallos++;
        console.log(`${ok ? 'ok  ' : 'FALL'} ${expectation.padEnd(5)} ${label}`);
        if (!ok && r.debugMessages) r.debugMessages.forEach((m) => console.log(`         ${m}`));
    });

    console.log(`\n# casos ${results.length}\n# pass ${results.length - fallos}\n# fail ${fallos}`);
    if (fallos > 0) process.exit(1);
}

main().catch((error) => {
    console.error(`\nERROR: ${error.message}`);
    if (error.context?.body) console.error(JSON.stringify(error.context.body).slice(0, 1000));
    process.exit(1);
});
