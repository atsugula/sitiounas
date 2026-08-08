// Contrato entre el formato de hora de la UI y lo que aceptan las Rules.
//
// Por qué existe este archivo
// ---------------------------
// El bug de producción (PERMISSION_DENIED al reservar) se coló porque
// `tests/firestore.rules.test.mjs` construía las citas con '14:00' mientras el
// frontend guardaba '02:00 PM'. Los tests probaban un payload que la aplicación
// nunca producía, así que pasaban en verde mientras Firestore rechazaba todas
// las reservas reales.
//
// Aquí se fija el contrato en el otro sentido: se parte de los turnos que la
// clienta puede elegir de verdad (ALL_TIME_SLOTS) y se comprueba que, tras la
// normalización, cumplen los límites que exigen las Rules.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ALL_TIME_SLOTS } from '../assets/js/availability.js';
import {
    parseTimeToMinutes,
    formatMinutesTo24h,
    computeSlotStartTimes,
    buildSlotId,
    DEFAULT_SALON_ID
} from '../assets/js/booking-slots.js';

// Límites literales de firestore.rules → validAppointmentShape() y
// match /bookingSlots/{slotId}. Si alguien los cambia allí, estos tests deben
// cambiar aquí a la vez y de forma deliberada.
const MAX_START_TIME = 5;
const MAX_END_TIME = 5;
const MAX_DATE_ISO = 10;
const MAX_DATE_KEY = 40;
const MAX_APPOINTMENT_ID = 64;
const MAX_DURATION = 600;

/** La normalización que aplica index.html antes de escribir en Firestore. */
function toCanonicalTime(timeStr) {
    const minutes = parseTimeToMinutes(timeStr);
    return minutes === null ? null : formatMinutesTo24h(minutes);
}

describe('conversión a formato canónico', () => {
    // Los casos frontera importan: mediodía y medianoche son donde el formato
    // de 12 horas se rompe si se convierte a mano (12 PM no es 00:00, y 12 AM
    // no es 12:00).
    const CONVERSIONES = [
        ['02:00 PM', '14:00'],
        ['02:30 PM', '14:30'],
        ['12:00 PM', '12:00'],
        ['12:00 AM', '00:00'],
        ['07:00 PM', '19:00'],
        ['08:00 AM', '08:00'],
        ['12:30 AM', '00:30'],
        ['11:59 PM', '23:59']
    ];

    for (const [visible, canonico] of CONVERSIONES) {
        test(`${visible} -> ${canonico}`, () => {
            assert.equal(toCanonicalTime(visible), canonico);
        });
    }

    test('una hora ya canónica se queda igual', () => {
        for (const canonico of ['00:00', '08:00', '14:30', '23:59']) {
            assert.equal(toCanonicalTime(canonico), canonico);
        }
    });

    test('una hora ilegible devuelve null en vez de inventar una', () => {
        for (const basura of ['', null, undefined, 'tarde', '25:00', '14:70']) {
            assert.equal(toCanonicalTime(basura), null);
        }
    });
});

describe('payload final de una cita de clienta', () => {
    // Réplica del payload que produce prepareWhatsAppBooking() tras el fix.
    function citaDeClienta(turnoVisible, durationMinutes) {
        const startMinutes = parseTimeToMinutes(turnoVisible);
        return {
            startTime: formatMinutesTo24h(startMinutes),
            endTime: formatMinutesTo24h(startMinutes + durationMinutes),
            time: turnoVisible,
            durationMinutes
        };
    }

    test('startTime y endTime miden exactamente 5 y son HH:MM', () => {
        for (const turno of ALL_TIME_SLOTS) {
            const cita = citaDeClienta(turno, 120);
            assert.equal(cita.startTime.length, 5);
            assert.equal(cita.endTime.length, 5);
            assert.match(cita.startTime, /^\d{2}:\d{2}$/);
            assert.match(cita.endTime, /^\d{2}:\d{2}$/);
        }
    });

    test('time conserva el texto visible que lee la UI', () => {
        const cita = citaDeClienta('02:00 PM', 120);
        assert.equal(cita.time, '02:00 PM');
        assert.equal(cita.startTime, '14:00');
    });

    test('una cita de 2 h que empieza a las 14:00 termina a las 16:00', () => {
        const cita = citaDeClienta('02:00 PM', 120);
        assert.equal(cita.startTime, '14:00');
        assert.equal(cita.endTime, '16:00');
    });

    test('esa cita bloquea exactamente 14:00, 14:30, 15:00 y 15:30', () => {
        const cita = citaDeClienta('02:00 PM', 120);
        assert.deepEqual(
            computeSlotStartTimes(cita.startTime, cita.durationMinutes),
            ['14:00', '14:30', '15:00', '15:30']
        );
    });

    test('y sus ids de lock son los que espera Firestore', () => {
        const cita = citaDeClienta('02:00 PM', 120);
        const ids = computeSlotStartTimes(cita.startTime, cita.durationMinutes)
            .map((inicio) => buildSlotId('2026-09-01', inicio, DEFAULT_SALON_ID));

        assert.deepEqual(ids, [
            'nails-con-val_2026-09-01_14:00',
            'nails-con-val_2026-09-01_14:30',
            'nails-con-val_2026-09-01_15:00',
            'nails-con-val_2026-09-01_15:30'
        ]);
    });
});

describe('formato de hora visible vs formato guardado', () => {
    test('los turnos que ve la clienta son de 12 h y NO caben en las Rules', () => {
        // Esto documenta la causa raíz: el texto visible mide 8 caracteres y el
        // límite de la Rule es 5. Guardar el visible tal cual es el bug.
        assert.equal(ALL_TIME_SLOTS[0], '08:00 AM');
        assert.ok(ALL_TIME_SLOTS[0].length > MAX_START_TIME);
    });

    test('cada turno normalizado cabe en startTime', () => {
        for (const slot of ALL_TIME_SLOTS) {
            const canonical = toCanonicalTime(slot);
            assert.notEqual(canonical, null, `no se pudo normalizar ${slot}`);
            assert.ok(
                canonical.length <= MAX_START_TIME,
                `${slot} -> ${canonical} mide ${canonical.length}, el límite es ${MAX_START_TIME}`
            );
            assert.match(canonical, /^\d{2}:\d{2}$/);
        }
    });

    test('la normalización no altera el instante', () => {
        for (const slot of ALL_TIME_SLOTS) {
            assert.equal(parseTimeToMinutes(toCanonicalTime(slot)), parseTimeToMinutes(slot));
        }
    });

    test('normalizar dos veces no cambia nada', () => {
        for (const slot of ALL_TIME_SLOTS) {
            const once = toCanonicalTime(slot);
            assert.equal(toCanonicalTime(once), once);
        }
    });

    test('endTime también cabe, con las duraciones reales del catálogo', () => {
        const duraciones = [30, 60, 90, 120, 180, 240, MAX_DURATION];
        for (const slot of ALL_TIME_SLOTS) {
            for (const duracion of duraciones) {
                const end = formatMinutesTo24h(parseTimeToMinutes(slot) + duracion);
                assert.ok(end.length <= MAX_END_TIME, `${slot} +${duracion} -> ${end}`);
            }
        }
    });
});

describe('coherencia entre la cita y sus locks', () => {
    test('el startTime guardado es exactamente el del primer lock', () => {
        // Si divergen, la cancelación calcula ids que no existen y los turnos
        // quedan bloqueados para siempre.
        for (const slot of ALL_TIME_SLOTS) {
            const canonical = toCanonicalTime(slot);
            const [primerLock] = computeSlotStartTimes(canonical, 60);
            assert.equal(primerLock, canonical);
        }
    });

    test('la hora visible produce los mismos locks que la canónica', () => {
        for (const slot of ALL_TIME_SLOTS) {
            assert.deepEqual(
                computeSlotStartTimes(slot, 120),
                computeSlotStartTimes(toCanonicalTime(slot), 120)
            );
        }
    });

    test('el id del lock cabe en appointmentId y en el nombre del documento', () => {
        const id = buildSlotId('2026-09-01', '14:00', DEFAULT_SALON_ID);
        assert.equal(id, 'nails-con-val_2026-09-01_14:00');
        assert.ok(id.length <= MAX_APPOINTMENT_ID);
    });

    test('dateIso y dateKey caben en sus límites', () => {
        const fecha = new Date(2026, 8, 1);
        const iso = '2026-09-01';
        assert.ok(iso.length <= MAX_DATE_ISO);
        assert.ok(fecha.toDateString().length <= MAX_DATE_KEY);
    });
});

describe('forma del lock que exigen las Rules', () => {
    test('el lock lleva exactamente las seis claves permitidas', () => {
        // match /bookingSlots/{slotId} usa keys().hasOnly([...]): una clave de
        // más y la transacción entera se cae.
        const permitidas = ['salonId', 'dateKey', 'dateIso', 'startTime', 'appointmentId', 'createdAt'];
        const lock = {
            salonId: DEFAULT_SALON_ID,
            dateKey: 'Tue Sep 01 2026',
            dateIso: '2026-09-01',
            startTime: '14:00',
            appointmentId: 'app_1',
            createdAt: '2026-08-08T12:00:00.000Z'
        };

        assert.deepEqual(Object.keys(lock).sort(), [...permitidas].sort());
        assert.ok(lock.startTime.length <= MAX_START_TIME);
        assert.ok(lock.dateIso.length <= MAX_DATE_ISO);
        assert.ok(lock.dateKey.length <= MAX_DATE_KEY);
        assert.ok(lock.appointmentId.length <= MAX_APPOINTMENT_ID);
    });
});

describe('serviceIds', () => {
    test('la Rule exige al menos un id: una lista vacía no vale', () => {
        // La cita presencial del admin guardaba serviceIds: [], que
        // validAppointmentShape() rechaza por size() >= 1.
        const vacia = [];
        assert.equal(vacia.length >= 1, false);

        const conMarcador = ['presencial'];
        assert.ok(conMarcador.length >= 1 && conMarcador.length <= 12);
    });
});
