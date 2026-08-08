#!/usr/bin/env node
//
// Migrador de datos legacy de Firestore hacia el modelo que exigen las Rules
// de producción de Ramos Nails.
//
// Por qué existe
// --------------
// Las Rules cerradas en la Fase 3 dan por hecho tres cosas que los datos
// históricos no cumplen necesariamente:
//
//   1. todo documento lleva `salonId == 'nails-con-val'`;
//   2. toda cita lleva `clientUid`, que es lo único que permite distinguir
//      "mi cita" de "la cita de otra persona";
//   3. toda cita activa futura tiene sus locks en `bookingSlots`, que es lo
//      que impide que dos clientas reserven el mismo turno.
//
// Una cita sin `clientUid` deja de ser legible por su dueña en cuanto las
// Rules entran en vigor. Una cita futura sin locks deja su turno aparentemente
// libre y se puede sobrevender. Esto arregla ambas cosas.
//
// Qué NO hace, deliberadamente
// ----------------------------
// - No inventa UIDs. Si no hay una coincidencia inequívoca entre la cita y un
//   usuario, la cita se reporta y se deja intacta.
// - No sobrescribe un lock que ya pertenece a otra cita. Eso es un conflicto
//   real de agenda y lo decide una persona, no un script.
// - No borra nada. Ni usuarios legacy con id de teléfono, ni citas, ni locks.
// - No trae credenciales dentro. La cuenta de servicio se pasa por entorno.
//
// Uso
// ---
//   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json   (fuera del repo)
//
//   node tools/migrate-firebase-production.mjs --audit
//   node tools/migrate-firebase-production.mjs --dry-run
//   node tools/migrate-firebase-production.mjs --apply --backup-verified="gs://bucket/2026-08-08"
//
// `--dry-run` y `--audit` no escriben absolutamente nada. `--apply` exige
// declarar explícitamente un backup: sin él aborta.
//
// El migrador es idempotente: un segundo `--dry-run` después de un `--apply`
// correcto debe reportar 0 acciones pendientes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import {
    computeSlotStartTimes,
    computeSlotIdsForAppointment,
    parseTimeToMinutes,
    buildSlotId,
    DEFAULT_SALON_ID
} from '../assets/js/booking-slots.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Invariantes del proyecto. No son configurables a propósito: cambiar
// cualquiera de las dos convierte esta herramienta en otra cosa.
const SALON_ID = DEFAULT_SALON_ID; // 'nails-con-val'
const EXPECTED_PROJECT_ID = 'nailsconval';

const ACTIVE_STATUSES = ['confirmada', 'pendiente'];

const SETTINGS_DOCS = [
    'custom_services',
    'discount_settings',
    'schedule_blocks',
    'gallery_items',
    'marketing_popup',
    'payment_key',
    'income_goal'
];

const COLLECTIONS = [
    'users',
    'appointments',
    'bookingSlots',
    'loyalty_transactions',
    'reviews',
    'community_posts'
];

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const flags = { audit: false, dryRun: false, apply: false, backupVerified: null, json: null };

    for (const arg of argv) {
        if (arg === '--audit') flags.audit = true;
        else if (arg === '--dry-run') flags.dryRun = true;
        else if (arg === '--apply') flags.apply = true;
        else if (arg.startsWith('--backup-verified=')) flags.backupVerified = arg.slice('--backup-verified='.length);
        else if (arg.startsWith('--json=')) flags.json = arg.slice('--json='.length);
        else if (arg === '--help' || arg === '-h') flags.help = true;
        else throw new Error(`Argumento no reconocido: ${arg}`);
    }

    return flags;
}

const USAGE = `
Migrador de Firestore — Ramos Nails (salonId=${SALON_ID}, projectId=${EXPECTED_PROJECT_ID})

  --audit                       Solo lectura. Inventario y conteos. No escribe.
  --dry-run                     Solo lectura. Calcula el plan de migración. No escribe.
  --apply                       Ejecuta el plan. Exige --backup-verified.
  --backup-verified="<ref>"     Referencia del export/backup ya realizado.
  --json=<ruta>                 Vuelca el resultado en JSON además de por consola.

Credenciales por entorno (nunca en el repositorio):
  GOOGLE_APPLICATION_CREDENTIALS=/ruta/fuera/del/repo/serviceAccount.json
`;

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

const log = (...args) => console.log(...args);
const section = (title) => log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);

/**
 * Normaliza un teléfono a solo dígitos para poder comparar "+34 600 11 22 33"
 * con "600112233". Se conservan los últimos 9 dígitos, que es lo que
 * identifica de forma estable a una línea en los datos del salón.
 */
function normalizePhone(value) {
    if (!value) return null;
    const digits = String(value).replace(/\D+/g, '');
    if (digits.length < 6) return null;
    return digits.slice(-9);
}

function normalizeEmail(value) {
    if (!value) return null;
    const email = String(value).trim().toLowerCase();
    return email.includes('@') ? email : null;
}

/** Fecha/hora real de la cita, en la zona del proceso. Null si no se puede leer. */
function appointmentStartDate(appointment) {
    const iso = appointment.appointmentDateIso;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return null;

    const minutes = parseTimeToMinutes(appointment.startTime || appointment.time);
    if (minutes === null) return null;

    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function isActive(appointment) {
    return ACTIVE_STATUSES.includes(String(appointment.status || '').toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// Conexión
// ─────────────────────────────────────────────────────────────

function readDefaultProjectId() {
    try {
        const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
        return rc?.projects?.default || null;
    } catch {
        return null;
    }
}

function connect() {
    const declaredProject = readDefaultProjectId();

    if (declaredProject && declaredProject !== EXPECTED_PROJECT_ID) {
        throw new Error(
            `.firebaserc apunta a "${declaredProject}" y se esperaba "${EXPECTED_PROJECT_ID}". ` +
            'Abortado: este migrador no opera contra otro proyecto.'
        );
    }

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
        throw new Error(
            'Falta GOOGLE_APPLICATION_CREDENTIALS. Exporta la ruta a la cuenta de servicio ' +
            '(fuera del repositorio) antes de ejecutar. BLOQUEO EXTERNO.'
        );
    }

    const resolved = path.resolve(credentialsPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`No existe el fichero de credenciales: ${resolved}`);
    }

    // Una cuenta de servicio dentro del repositorio es un secreto commiteable.
    // Se rechaza aunque .gitignore la cubra: el riesgo no compensa.
    if (!path.relative(ROOT, resolved).startsWith('..')) {
        throw new Error(
            `La cuenta de servicio está dentro del repositorio (${resolved}). ` +
            'Muévela fuera antes de continuar.'
        );
    }

    const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
        throw new Error(
            `La cuenta de servicio pertenece a "${serviceAccount.project_id}" y se esperaba ` +
            `"${EXPECTED_PROJECT_ID}". Abortado.`
        );
    }

    initializeApp({
        credential: cert(serviceAccount),
        projectId: EXPECTED_PROJECT_ID
    });

    return getFirestore();
}

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

async function loadAll(db) {
    const snapshot = {};

    for (const name of COLLECTIONS) {
        const docs = await db.collection(name).get();
        snapshot[name] = docs.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
    }

    const settings = {};
    for (const docId of SETTINGS_DOCS) {
        const ref = await db.collection('settings').doc(docId).get();
        settings[docId] = ref.exists ? { id: docId, data: ref.data() || {} } : null;
    }
    snapshot.settings = settings;

    return snapshot;
}

// ─────────────────────────────────────────────────────────────
// Auditoría (no escribe)
// ─────────────────────────────────────────────────────────────

function audit(snapshot, now) {
    const users = snapshot.users;
    const appointments = snapshot.appointments;
    const slots = snapshot.bookingSlots;

    const counts = {};
    for (const name of COLLECTIONS) counts[name] = snapshot[name].length;

    // users/{phone} es la ruta legacy documentada en MODELO_FIRESTORE_FASE_3.md:
    // el id del documento no es el uid de Auth, así que las Rules nunca podrán
    // reconocer a esa persona como dueña de nada.
    const legacyUsers = users.filter((u) => !u.data.uid || u.data.uid !== u.id);
    const usersWithoutSalon = users.filter((u) => u.data.salonId !== SALON_ID);
    const usersByRole = users.reduce((acc, u) => {
        const role = u.data.role || '(sin role)';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
    }, {});

    const appsWithoutClientUid = appointments.filter((a) => !a.data.clientUid);
    const appsWithoutSalon = appointments.filter((a) => a.data.salonId !== SALON_ID);
    const appsUnparseable = appointments.filter((a) => appointmentStartDate(a.data) === null);

    const futureActive = appointments.filter((a) => {
        const start = appointmentStartDate(a.data);
        return start !== null && start.getTime() >= now.getTime() && isActive(a.data);
    });

    const slotsById = new Map(slots.map((s) => [s.id, s]));

    const futureActiveWithoutLocks = [];
    for (const app of futureActive) {
        const expected = expectedSlotIds(app);
        const missing = expected.filter((slotId) => !slotsById.has(slotId));
        if (missing.length > 0) {
            futureActiveWithoutLocks.push({ id: app.id, expected, missing });
        }
    }

    // Un lock cuyo appointmentId apunta a una cita inexistente o cancelada es
    // un turno bloqueado sin motivo: se reporta, no se borra.
    const appointmentIds = new Set(appointments.map((a) => a.id));
    const appointmentsById = new Map(appointments.map((a) => [a.id, a]));
    const orphanSlots = slots.filter((s) => !appointmentIds.has(s.data.appointmentId));
    const staleSlots = slots.filter((s) => {
        const owner = appointmentsById.get(s.data.appointmentId);
        return owner && !isActive(owner.data);
    });
    const slotsWithoutSalon = slots.filter((s) => s.data.salonId !== SALON_ID);

    const conflicts = detectConflicts(appointments, slotsById, now);

    const settingsPresence = Object.entries(snapshot.settings).map(([docId, value]) => ({
        docId,
        exists: Boolean(value),
        keys: value ? Object.keys(value.data) : []
    }));

    return {
        counts,
        usersByRole,
        legacyUsers: legacyUsers.map((u) => ({ id: u.id, uid: u.data.uid || null, phone: u.data.phone || null })),
        usersWithoutSalon: usersWithoutSalon.map((u) => ({ id: u.id, salonId: u.data.salonId ?? null })),
        appsWithoutClientUid: appsWithoutClientUid.map((a) => ({
            id: a.id,
            phone: a.data.phone || null,
            name: a.data.name || null,
            dateIso: a.data.appointmentDateIso || null,
            status: a.data.status || null
        })),
        appsWithoutSalon: appsWithoutSalon.map((a) => ({ id: a.id, salonId: a.data.salonId ?? null })),
        appsUnparseable: appsUnparseable.map((a) => ({
            id: a.id,
            appointmentDateIso: a.data.appointmentDateIso ?? null,
            startTime: a.data.startTime ?? a.data.time ?? null
        })),
        futureActiveCount: futureActive.length,
        futureActiveWithoutLocks,
        orphanSlots: orphanSlots.map((s) => ({ id: s.id, appointmentId: s.data.appointmentId || null })),
        staleSlots: staleSlots.map((s) => ({ id: s.id, appointmentId: s.data.appointmentId })),
        slotsWithoutSalon: slotsWithoutSalon.map((s) => ({ id: s.id, salonId: s.data.salonId ?? null })),
        conflicts,
        settings: settingsPresence
    };
}

/**
 * Ids de lock que le corresponden a una cita, calculados con la MISMA
 * aritmética que usa el navegador (assets/js/booking-slots.js). No se
 * reimplementa aquí a propósito: si la regla de los 30 minutos cambiara, debe
 * cambiar en un solo sitio.
 */
function expectedSlotIds(appointmentDoc) {
    const data = appointmentDoc.data;
    return computeSlotIdsForAppointment({
        dateIso: data.appointmentDateIso,
        startTime: data.startTime || data.time,
        durationMinutes: data.durationMinutes,
        salonId: SALON_ID
    });
}

/**
 * Dos citas que se pisan el mismo turno. No se resuelve automáticamente:
 * decidir cuál de las dos clientas pierde su hora no es una decisión de script.
 */
function detectConflicts(appointments, slotsById, now) {
    const claimedBy = new Map(); // slotId → [appointmentId]
    const conflicts = [];

    for (const app of appointments) {
        if (!isActive(app.data)) continue;
        for (const slotId of expectedSlotIds(app)) {
            if (!claimedBy.has(slotId)) claimedBy.set(slotId, []);
            claimedBy.get(slotId).push(app.id);
        }
    }

    for (const [slotId, ids] of claimedBy) {
        if (ids.length > 1) {
            const isFuture = slotIsFuture(slotId, now);
            conflicts.push({
                type: 'DOS_CITAS_MISMO_TURNO',
                slotId,
                appointmentIds: ids,
                horizon: isFuture ? 'futuro' : 'historico'
            });
        }
    }

    // Lock existente que pertenece a una cita distinta de la que lo reclama.
    for (const [slotId, ids] of claimedBy) {
        const existing = slotsById.get(slotId);
        if (existing && !ids.includes(existing.data.appointmentId)) {
            conflicts.push({
                type: 'LOCK_DE_OTRA_CITA',
                slotId,
                ownerAppointmentId: existing.data.appointmentId || null,
                claimedBy: ids
            });
        }
    }

    return conflicts;
}

function slotIsFuture(slotId, now) {
    // slotId = `${salonId}_${YYYY-MM-DD}_${HH:MM}`
    const match = String(slotId).match(/_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/);
    if (!match) return false;
    const [year, month, day] = match[1].split('-').map(Number);
    const [hour, minute] = match[2].split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime() >= now.getTime();
}

// ─────────────────────────────────────────────────────────────
// Plan de migración
// ─────────────────────────────────────────────────────────────

/**
 * Índice de usuarios por teléfono y por email, marcando las claves ambiguas.
 * Si dos usuarias comparten teléfono, ese teléfono deja de servir para
 * identificar a nadie y se descarta como criterio.
 */
function indexUsers(users) {
    const byPhone = new Map();
    const byEmail = new Map();

    for (const user of users) {
        if (!user.data.uid || user.data.uid !== user.id) continue; // legacy: no es un uid de Auth

        const phone = normalizePhone(user.data.phone);
        if (phone) {
            if (!byPhone.has(phone)) byPhone.set(phone, []);
            byPhone.get(phone).push(user.id);
        }

        const email = normalizeEmail(user.data.email);
        if (email) {
            if (!byEmail.has(email)) byEmail.set(email, []);
            byEmail.get(email).push(user.id);
        }
    }

    return { byPhone, byEmail };
}

function buildPlan(snapshot, now) {
    const { byPhone, byEmail } = indexUsers(snapshot.users);
    const slotsById = new Map(snapshot.bookingSlots.map((s) => [s.id, s]));

    const actions = [];
    const skipped = [];
    const conflicts = [];

    // ── 1. salonId ausente ───────────────────────────────────
    for (const user of snapshot.users) {
        if (user.data.salonId === SALON_ID) continue;
        if (user.data.salonId == null) {
            actions.push({ kind: 'SET_SALON_ID', collection: 'users', id: user.id, value: SALON_ID });
        } else {
            // salonId presente pero distinto: es otro salón o un dato corrupto.
            // No se pisa.
            conflicts.push({
                type: 'SALON_ID_DISTINTO',
                collection: 'users',
                id: user.id,
                found: user.data.salonId
            });
        }
    }

    for (const app of snapshot.appointments) {
        if (app.data.salonId === SALON_ID) continue;
        if (app.data.salonId == null) {
            actions.push({ kind: 'SET_SALON_ID', collection: 'appointments', id: app.id, value: SALON_ID });
        } else {
            conflicts.push({
                type: 'SALON_ID_DISTINTO',
                collection: 'appointments',
                id: app.id,
                found: app.data.salonId
            });
        }
    }

    // ── 2. clientUid ─────────────────────────────────────────
    for (const app of snapshot.appointments) {
        if (app.data.clientUid) continue;

        const phone = normalizePhone(app.data.phone);
        const email = normalizeEmail(app.data.email);

        const phoneMatches = phone ? (byPhone.get(phone) || []) : [];
        const emailMatches = email ? (byEmail.get(email) || []) : [];

        // Se acepta una única resolución: exactamente un candidato, y si hay
        // dos criterios, que apunten al mismo uid.
        const candidates = new Set([...phoneMatches, ...emailMatches]);

        if (candidates.size === 1 && (phoneMatches.length <= 1) && (emailMatches.length <= 1)) {
            const uid = [...candidates][0];
            actions.push({
                kind: 'SET_CLIENT_UID',
                collection: 'appointments',
                id: app.id,
                value: uid,
                matchedBy: [phoneMatches.length ? 'phone' : null, emailMatches.length ? 'email' : null]
                    .filter(Boolean)
                    .join('+')
            });
        } else {
            skipped.push({
                reason: candidates.size === 0 ? 'SIN_USUARIO_COINCIDENTE' : 'COINCIDENCIA_AMBIGUA',
                collection: 'appointments',
                id: app.id,
                phone: app.data.phone || null,
                candidates: [...candidates]
            });
        }
    }

    // ── 3. locks de citas activas futuras ────────────────────
    const claimedInThisRun = new Map(); // slotId → appointmentId

    for (const app of snapshot.appointments) {
        if (!isActive(app.data)) continue;

        const start = appointmentStartDate(app.data);
        if (start === null) {
            skipped.push({
                reason: 'FECHA_U_HORA_ILEGIBLE',
                collection: 'appointments',
                id: app.id,
                appointmentDateIso: app.data.appointmentDateIso ?? null,
                startTime: app.data.startTime ?? app.data.time ?? null
            });
            continue;
        }

        if (start.getTime() < now.getTime()) continue; // pasado: no se bloquea nada

        const slotStartTimes = computeSlotStartTimes(
            app.data.startTime || app.data.time,
            app.data.durationMinutes
        );

        if (slotStartTimes.length === 0) {
            skipped.push({
                reason: 'DURACION_INVALIDA',
                collection: 'appointments',
                id: app.id,
                durationMinutes: app.data.durationMinutes ?? null
            });
            continue;
        }

        const dateIso = app.data.appointmentDateIso;

        for (const startTime of slotStartTimes) {
            const slotId = buildSlotId(dateIso, startTime, SALON_ID);
            const existing = slotsById.get(slotId);

            if (existing) {
                if (existing.data.appointmentId === app.id) continue; // ya está: idempotente
                conflicts.push({
                    type: 'LOCK_OCUPADO_POR_OTRA_CITA',
                    slotId,
                    ownerAppointmentId: existing.data.appointmentId || null,
                    requestedBy: app.id
                });
                continue;
            }

            const alreadyClaimed = claimedInThisRun.get(slotId);
            if (alreadyClaimed && alreadyClaimed !== app.id) {
                conflicts.push({
                    type: 'DOS_CITAS_ACTIVAS_MISMO_TURNO',
                    slotId,
                    appointmentIds: [alreadyClaimed, app.id]
                });
                continue;
            }

            claimedInThisRun.set(slotId, app.id);
            actions.push({
                kind: 'CREATE_SLOT_LOCK',
                collection: 'bookingSlots',
                id: slotId,
                value: {
                    salonId: SALON_ID,
                    dateKey: app.data.dateKey || '',
                    dateIso,
                    startTime,
                    appointmentId: app.id
                }
            });
        }
    }

    // Un turno reclamado por dos citas activas debe abortar el lote entero de
    // locks: crear uno de los dos sería elegir ganadora en silencio.
    const contested = new Set(
        conflicts
            .filter((c) => c.type === 'DOS_CITAS_ACTIVAS_MISMO_TURNO' || c.type === 'LOCK_OCUPADO_POR_OTRA_CITA')
            .map((c) => c.slotId)
    );

    const safeActions = actions.filter((a) => !(a.kind === 'CREATE_SLOT_LOCK' && contested.has(a.id)));
    const withheldLocks = actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK' && contested.has(a.id));

    for (const withheld of withheldLocks) {
        skipped.push({
            reason: 'LOCK_EN_CONFLICTO_NO_SE_CREA',
            collection: 'bookingSlots',
            id: withheld.id,
            appointmentId: withheld.value.appointmentId
        });
    }

    return { actions: safeActions, skipped, conflicts };
}

// ─────────────────────────────────────────────────────────────
// Aplicación
// ─────────────────────────────────────────────────────────────

async function applyPlan(db, plan) {
    const applied = [];
    const failed = [];

    for (const action of plan.actions) {
        const ref = db.collection(action.collection).doc(action.id);

        try {
            if (action.kind === 'SET_SALON_ID') {
                // update() falla si el documento no existe: es lo que queremos,
                // este migrador no crea usuarios ni citas de la nada.
                await ref.update({ salonId: action.value });
            } else if (action.kind === 'SET_CLIENT_UID') {
                await ref.update({ clientUid: action.value });
            } else if (action.kind === 'CREATE_SLOT_LOCK') {
                // create() falla si alguien tomó el turno entre el plan y la
                // escritura. Esa carrera se reporta, no se pisa.
                await ref.create({
                    ...action.value,
                    createdAt: FieldValue.serverTimestamp()
                });
            } else {
                throw new Error(`Acción desconocida: ${action.kind}`);
            }

            applied.push(action);
        } catch (error) {
            failed.push({ action, error: error.message });
        }
    }

    return { applied, failed };
}

// ─────────────────────────────────────────────────────────────
// Salida
// ─────────────────────────────────────────────────────────────

function printAudit(result) {
    section('Conteos');
    for (const [name, count] of Object.entries(result.counts)) {
        log(`  ${name.padEnd(22)} ${count}`);
    }

    section('users');
    log(`  por role: ${JSON.stringify(result.usersByRole)}`);
    log(`  legacy (id != uid): ${result.legacyUsers.length}`);
    result.legacyUsers.slice(0, 20).forEach((u) => log(`    - ${u.id} (uid=${u.uid})`));
    log(`  sin salonId=${SALON_ID}: ${result.usersWithoutSalon.length}`);

    section('appointments');
    log(`  sin clientUid: ${result.appsWithoutClientUid.length}`);
    result.appsWithoutClientUid.slice(0, 20).forEach((a) => log(`    - ${a.id} ${a.dateIso} ${a.status} tel=${a.phone}`));
    log(`  sin salonId=${SALON_ID}: ${result.appsWithoutSalon.length}`);
    log(`  fecha/hora ilegible: ${result.appsUnparseable.length}`);
    log(`  activas futuras: ${result.futureActiveCount}`);
    log(`  activas futuras sin locks completos: ${result.futureActiveWithoutLocks.length}`);
    result.futureActiveWithoutLocks.slice(0, 20).forEach((a) => log(`    - ${a.id} faltan ${a.missing.length}/${a.expected.length}`));

    section('bookingSlots');
    log(`  huérfanos (cita inexistente): ${result.orphanSlots.length}`);
    log(`  obsoletos (cita no activa): ${result.staleSlots.length}`);
    log(`  sin salonId=${SALON_ID}: ${result.slotsWithoutSalon.length}`);

    section('Conflictos');
    if (result.conflicts.length === 0) log('  ninguno');
    result.conflicts.forEach((c) => log(`  [${c.type}] ${JSON.stringify(c)}`));

    section('settings');
    result.settings.forEach((s) => log(`  ${s.docId.padEnd(20)} ${s.exists ? 'presente' : 'AUSENTE'}  ${s.keys.join(', ')}`));
}

function printPlan(plan) {
    const byKind = plan.actions.reduce((acc, a) => {
        acc[a.kind] = (acc[a.kind] || 0) + 1;
        return acc;
    }, {});

    section('Plan de migración');
    if (plan.actions.length === 0) log('  0 acciones pendientes (estado ya migrado)');
    for (const [kind, count] of Object.entries(byKind)) log(`  ${kind.padEnd(24)} ${count}`);

    section('No se toca (requiere decisión humana)');
    if (plan.skipped.length === 0) log('  nada');
    plan.skipped.slice(0, 50).forEach((s) => log(`  [${s.reason}] ${s.collection}/${s.id} ${JSON.stringify(s.candidates || '')}`));
    if (plan.skipped.length > 50) log(`  ... y ${plan.skipped.length - 50} más`);

    section('Conflictos');
    if (plan.conflicts.length === 0) log('  ninguno');
    plan.conflicts.forEach((c) => log(`  [${c.type}] ${JSON.stringify(c)}`));
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
    let flags;
    try {
        flags = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        console.error(USAGE);
        process.exit(2);
    }

    if (flags.help || (!flags.audit && !flags.dryRun && !flags.apply)) {
        log(USAGE);
        process.exit(flags.help ? 0 : 2);
    }

    if (flags.apply && flags.dryRun) {
        console.error('--apply y --dry-run son excluyentes.');
        process.exit(2);
    }

    if (flags.apply && !flags.backupVerified) {
        console.error(
            'BLOQUEO: --apply exige --backup-verified="<referencia del export>".\n' +
            'Haz primero un export de Firestore:\n' +
            '  gcloud firestore export gs://<bucket>/$(date +%F) --project=' + EXPECTED_PROJECT_ID + '\n'
        );
        process.exit(3);
    }

    const db = connect();
    const now = new Date();

    log(`Proyecto: ${EXPECTED_PROJECT_ID}`);
    log(`salonId:  ${SALON_ID}`);
    log(`Modo:     ${flags.apply ? 'APPLY (escribe)' : flags.dryRun ? 'DRY-RUN (no escribe)' : 'AUDIT (no escribe)'}`);
    if (flags.backupVerified) log(`Backup:   ${flags.backupVerified}`);

    const snapshot = await loadAll(db);
    const auditResult = audit(snapshot, now);
    const output = { generatedAt: now.toISOString(), projectId: EXPECTED_PROJECT_ID, salonId: SALON_ID, audit: auditResult };

    printAudit(auditResult);

    if (flags.audit && !flags.dryRun && !flags.apply) {
        if (flags.json) fs.writeFileSync(flags.json, JSON.stringify(output, null, 2));
        return;
    }

    const plan = buildPlan(snapshot, now);
    output.plan = plan;
    printPlan(plan);

    if (!flags.apply) {
        log('\nDRY-RUN: no se ha escrito nada.');
        if (flags.json) fs.writeFileSync(flags.json, JSON.stringify(output, null, 2));
        return;
    }

    section('Aplicando');
    const { applied, failed } = await applyPlan(db, plan);
    output.applied = applied.length;
    output.failed = failed;

    log(`  aplicadas: ${applied.length}`);
    log(`  fallidas:  ${failed.length}`);
    failed.forEach((f) => log(`    ! ${f.action.kind} ${f.action.collection}/${f.action.id}: ${f.error}`));

    if (flags.json) fs.writeFileSync(flags.json, JSON.stringify(output, null, 2));

    if (failed.length > 0) process.exit(1);
    log('\nAhora ejecuta un segundo --dry-run: debe reportar 0 acciones pendientes.');
}

// Se ejecuta solo como CLI. Importado desde los tests, expone la lógica pura
// para poder verificar el plan sin tocar producción.
const invokedDirectly = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
    main().catch((error) => {
        console.error(`\nERROR: ${error.message}`);
        process.exit(1);
    });
}

export {
    audit,
    buildPlan,
    normalizePhone,
    normalizeEmail,
    appointmentStartDate,
    expectedSlotIds,
    detectConflicts,
    isActive,
    SALON_ID,
    EXPECTED_PROJECT_ID
};
