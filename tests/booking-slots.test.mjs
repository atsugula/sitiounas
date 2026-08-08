// Tests de la aritmética de locks de reserva (Fase 5).
//
// Estos SÍ se ejecutan en cualquier máquina con Node 18+: no necesitan
// emulador ni Java.
//
//   npm run test:booking
//
// La prueba de concurrencia usa una Firestore falsa en memoria que reproduce
// el comportamiento que importa: dos transacciones concurrentes que leen el
// mismo documento y ambas intentan crearlo; solo una puede ganar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    SLOT_INTERVAL_MINUTES,
    parseTimeToMinutes,
    formatMinutesTo24h,
    computeSlotStartTimes,
    buildSlotId,
    computeSlotIdsForAppointment,
    resolveBookingConflict,
    groupLockedSlotsByDate,
    isRangeFree
} from '../assets/js/booking-slots.js';

describe('parseo y formato de horas', () => {
    test('acepta 12h y 24h', () => {
        assert.equal(parseTimeToMinutes('02:30 PM'), 870);
        assert.equal(parseTimeToMinutes('14:30'), 870);
        assert.equal(parseTimeToMinutes('12:00 AM'), 0);
        assert.equal(parseTimeToMinutes('12:00 PM'), 720);
        assert.equal(parseTimeToMinutes('07:00 PM'), 1140);
    });

    test('rechaza basura', () => {
        assert.equal(parseTimeToMinutes(''), null);
        assert.equal(parseTimeToMinutes(null), null);
        assert.equal(parseTimeToMinutes('mañana'), null);
        assert.equal(parseTimeToMinutes('25:00'), null);
    });

    test('el formato canónico del lock es 24h', () => {
        assert.equal(formatMinutesTo24h(870), '14:30');
        assert.equal(formatMinutesTo24h(0), '00:00');
        assert.equal(formatMinutesTo24h(1140), '19:00');
    });
});

describe('cálculo de turnos ocupados', () => {
    test('una cita de 14:00 a 16:00 bloquea exactamente cuatro turnos', () => {
        assert.deepEqual(
            computeSlotStartTimes('02:00 PM', 120),
            ['14:00', '14:30', '15:00', '15:30']
        );
    });

    test('las 16:00 quedan libres cuando la cita anterior termina ahí', () => {
        const ocupados = computeSlotStartTimes('02:00 PM', 120);
        assert.ok(!ocupados.includes('16:00'));
    });

    test('una cita de 3 horas bloquea su intervalo completo', () => {
        assert.deepEqual(
            computeSlotStartTimes('07:00 PM', 180),
            ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30']
        );
    });

    test('media hora bloquea un solo turno', () => {
        assert.deepEqual(computeSlotStartTimes('08:00 AM', 30), ['08:00']);
    });

    test('una cita mal alineada bloquea igualmente los turnos que invade', () => {
        // 14:10 + 40 min = 14:50 -> debe morder 14:00 y 14:30
        assert.deepEqual(computeSlotStartTimes('14:10', 40), ['14:00', '14:30']);
    });

    test('duración inválida no bloquea nada', () => {
        assert.deepEqual(computeSlotStartTimes('14:00', 0), []);
        assert.deepEqual(computeSlotStartTimes('14:00', -60), []);
        assert.deepEqual(computeSlotStartTimes('nope', 60), []);
    });

    test('el intervalo declarado es de 30 minutos', () => {
        assert.equal(SLOT_INTERVAL_MINUTES, 30);
    });
});

describe('ids de lock', () => {
    test('el id es determinista y lleva salonId', () => {
        assert.equal(buildSlotId('2026-09-01', '14:00'), 'nails-con-val_2026-09-01_14:00');
        assert.equal(buildSlotId('2026-09-01', '14:00', 'otro-salon'), 'otro-salon_2026-09-01_14:00');
    });

    test('dos clientas que piden el mismo turno generan el mismo id', () => {
        const a = computeSlotIdsForAppointment({ dateIso: '2026-09-01', startTime: '02:00 PM', durationMinutes: 120 });
        const b = computeSlotIdsForAppointment({ dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120 });
        assert.deepEqual(a, b);
        assert.equal(a.length, 4);
    });

    test('salones distintos no comparten locks', () => {
        const a = computeSlotIdsForAppointment({ dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 60 });
        const b = computeSlotIdsForAppointment({ dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 60, salonId: 'otro' });
        assert.equal(a.filter((id) => b.includes(id)).length, 0);
    });

    test('sin fecha no hay locks', () => {
        assert.deepEqual(computeSlotIdsForAppointment({ dateIso: '', startTime: '14:00', durationMinutes: 60 }), []);
    });
});

describe('resolución de conflicto', () => {
    test('si ningún lock existe, la reserva procede', () => {
        const r = resolveBookingConflict([
            { slotId: 'a', exists: false },
            { slotId: 'b', exists: false }
        ]);
        assert.equal(r.canBook, true);
        assert.deepEqual(r.takenSlotIds, []);
    });

    test('un solo turno ocupado aborta la reserva entera', () => {
        const r = resolveBookingConflict([
            { slotId: 'a', exists: false },
            { slotId: 'b', exists: true },
            { slotId: 'c', exists: false }
        ]);
        assert.equal(r.canBook, false);
        assert.deepEqual(r.takenSlotIds, ['b']);
    });
});

describe('disponibilidad derivada de locks', () => {
    test('agrupa locks por fecha', () => {
        const byDate = groupLockedSlotsByDate([
            { dateIso: '2026-09-01', startTime: '14:00' },
            { dateIso: '2026-09-01', startTime: '14:30' },
            { dateIso: '2026-09-02', startTime: '09:00' },
            null
        ]);
        assert.deepEqual([...byDate['2026-09-01']].sort(), ['14:00', '14:30']);
        assert.deepEqual([...byDate['2026-09-02']], ['09:00']);
    });

    test('un servicio de 13:30 a 14:30 no cabe si existe 14:00-16:00', () => {
        const locked = new Set(['14:00', '14:30', '15:00', '15:30']);
        assert.equal(isRangeFree(locked, '13:30', 60), false);
    });

    test('las 16:00 sí quedan disponibles', () => {
        const locked = new Set(['14:00', '14:30', '15:00', '15:30']);
        assert.equal(isRangeFree(locked, '16:00', 120), true);
    });

    test('un día sin locks está libre', () => {
        assert.equal(isRangeFree(new Set(), '08:00', 180), true);
        assert.equal(isRangeFree([], '08:00', 180), true);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Concurrencia
// ─────────────────────────────────────────────────────────────────────────

/**
 * Firestore falsa con la única garantía que nos importa: control de
 * concurrencia optimista. Una transacción registra la versión de cada
 * documento que leyó; al confirmar, si alguna cambió, se reintenta. Es el
 * mismo contrato que da `runTransaction` de verdad.
 */
function createFakeFirestore() {
    const store = new Map();     // id -> { data }
    const versions = new Map();  // id -> número de versión
    let commits = 0;

    function version(id) {
        return versions.get(id) || 0;
    }

    async function runTransaction(updateFn, maxAttempts = 5) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const readVersions = new Map();
            const writes = [];

            const tx = {
                get(id) {
                    readVersions.set(id, version(id));
                    return { id, exists: store.has(id), data: store.get(id) };
                },
                set(id, data) {
                    writes.push({ id, data });
                }
            };

            // El cuerpo puede lanzar por conflicto de negocio: eso no se reintenta.
            const result = await updateFn(tx);

            // Punto de confirmación: ¿cambió algo de lo que leímos?
            const stale = [...readVersions.entries()].some(([id, v]) => version(id) !== v);
            if (stale) continue;

            writes.forEach(({ id, data }) => {
                store.set(id, data);
                versions.set(id, version(id) + 1);
            });
            commits++;
            return result;
        }
        throw new Error('too much contention');
    }

    return {
        runTransaction,
        store,
        get commits() { return commits; },
        // Fuerza una escritura externa entre la lectura y la confirmación.
        injectExternalWrite(id, data) {
            store.set(id, data);
            versions.set(id, version(id) + 1);
        }
    };
}

/** El mismo algoritmo que usa index.html, expresado sobre la Firestore falsa. */
async function bookAppointment(db, { dateIso, startTime, durationMinutes, appointmentId, clientUid }, hooks = {}) {
    const slotIds = computeSlotIdsForAppointment({ dateIso, startTime, durationMinutes });

    return db.runTransaction(async (tx) => {
        // 1. Todas las lecturas primero.
        const reads = slotIds.map((slotId) => {
            const snap = tx.get(slotId);
            return { slotId, exists: snap.exists };
        });

        if (hooks.afterRead) await hooks.afterRead();

        // 2. Abortar si cualquiera está ocupado.
        const { canBook, takenSlotIds } = resolveBookingConflict(reads);
        if (!canBook) {
            const err = new Error('SLOT_TAKEN');
            err.takenSlotIds = takenSlotIds;
            throw err;
        }

        // 3. Crear todos los locks y la cita en la misma transacción.
        slotIds.forEach((slotId) => tx.set(slotId, { appointmentId, dateIso, startTime }));
        tx.set(`appointments/${appointmentId}`, { clientUid, dateIso, startTime, durationMinutes });

        return { appointmentId, slotIds };
    });
}

describe('reserva atómica', () => {
    test('una reserva limpia crea todos sus locks y la cita', async () => {
        const db = createFakeFirestore();
        const r = await bookAppointment(db, {
            dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120,
            appointmentId: 'app_1', clientUid: 'cliente-a'
        });

        assert.equal(r.slotIds.length, 4);
        assert.ok(db.store.has('appointments/app_1'));
        r.slotIds.forEach((id) => assert.ok(db.store.has(id), `falta el lock ${id}`));
    });

    test('dos reservas sobre el mismo horario: solo una gana', async () => {
        const db = createFakeFirestore();

        const results = await Promise.allSettled([
            bookAppointment(db, {
                dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120,
                appointmentId: 'app_A', clientUid: 'cliente-a'
            }),
            bookAppointment(db, {
                dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120,
                appointmentId: 'app_B', clientUid: 'cliente-b'
            })
        ]);

        const ok = results.filter((r) => r.status === 'fulfilled');
        const ko = results.filter((r) => r.status === 'rejected');

        assert.equal(ok.length, 1, 'debe ganar exactamente una');
        assert.equal(ko.length, 1, 'la otra debe ser rechazada');
        assert.equal(ko[0].reason.message, 'SLOT_TAKEN');

        // Solo la ganadora dejó cita.
        const citas = [...db.store.keys()].filter((k) => k.startsWith('appointments/'));
        assert.equal(citas.length, 1);
    });

    test('una escritura externa entre lectura y confirmación fuerza reintento y pierde', async () => {
        const db = createFakeFirestore();
        let injected = false;

        await assert.rejects(
            bookAppointment(
                db,
                {
                    dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 60,
                    appointmentId: 'app_lento', clientUid: 'cliente-a'
                },
                {
                    afterRead: async () => {
                        // Otra clienta se lleva el turno justo en medio.
                        if (!injected) {
                            injected = true;
                            db.injectExternalWrite('nails-con-val_2026-09-01_14:00', { appointmentId: 'app_rapido' });
                        }
                    }
                }
            ),
            (err) => err.message === 'SLOT_TAKEN'
        );

        assert.ok(!db.store.has('appointments/app_lento'));
    });

    test('reservas solapadas parciales también chocan', async () => {
        const db = createFakeFirestore();

        await bookAppointment(db, {
            dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120,
            appointmentId: 'app_larga', clientUid: 'cliente-a'
        });

        await assert.rejects(
            bookAppointment(db, {
                dateIso: '2026-09-01', startTime: '15:00', durationMinutes: 60,
                appointmentId: 'app_solapada', clientUid: 'cliente-b'
            }),
            (err) => err.message === 'SLOT_TAKEN'
        );
    });

    test('reservas contiguas no chocan', async () => {
        const db = createFakeFirestore();

        await bookAppointment(db, {
            dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120,
            appointmentId: 'app_1', clientUid: 'cliente-a'
        });
        await bookAppointment(db, {
            dateIso: '2026-09-01', startTime: '16:00', durationMinutes: 120,
            appointmentId: 'app_2', clientUid: 'cliente-b'
        });

        const citas = [...db.store.keys()].filter((k) => k.startsWith('appointments/'));
        assert.equal(citas.length, 2);
    });

    test('días distintos no comparten locks', async () => {
        const db = createFakeFirestore();

        await bookAppointment(db, {
            dateIso: '2026-09-01', startTime: '14:00', durationMinutes: 120,
            appointmentId: 'app_1', clientUid: 'cliente-a'
        });
        await bookAppointment(db, {
            dateIso: '2026-09-02', startTime: '14:00', durationMinutes: 120,
            appointmentId: 'app_2', clientUid: 'cliente-b'
        });

        const citas = [...db.store.keys()].filter((k) => k.startsWith('appointments/'));
        assert.equal(citas.length, 2);
    });

    test('diez clientas peleando por el mismo turno: exactamente una gana', async () => {
        const db = createFakeFirestore();

        const results = await Promise.allSettled(
            Array.from({ length: 10 }, (_, i) => bookAppointment(db, {
                dateIso: '2026-09-03', startTime: '10:00', durationMinutes: 90,
                appointmentId: `app_${i}`, clientUid: `cliente-${i}`
            }))
        );

        const ganadoras = results.filter((r) => r.status === 'fulfilled');
        assert.equal(ganadoras.length, 1);

        const citas = [...db.store.keys()].filter((k) => k.startsWith('appointments/'));
        assert.equal(citas.length, 1);
    });
});
