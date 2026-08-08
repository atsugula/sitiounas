// Cálculo de disponibilidad de la agenda.
//
// Es la lógica de la Fase 1 (intervalos y duración real) más los locks de la
// Fase 5, extraída de index.html en la Fase 11.
//
// Se escribió como función pura —recibe todo, no lee `localStorage`, ni
// `window`, ni el reloj— precisamente porque era el trozo de negocio más
// delicado del proyecto y no tenía ni una prueba automática. Quien la llama
// reúne los datos; ella solo decide.

import { parseTimeToMinutes, formatMinutesTo24h, isRangeFree } from './booking-slots.js';
import { matchesDate, getAppointmentDurationMinutes } from './time.js';

/** Turnos que ofrece el estudio, en el formato visible. */
export const ALL_TIME_SLOTS = [
    '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
    '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
    '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM'
];

/** Cierre habitual: 20:00. */
const CLOSING_MINUTES = 20 * 60;
/** Turno noche: la reserva de las 19:00 puede estirarse hasta las 22:00. */
const NIGHT_SLOT_MINUTES = 19 * 60;
const NIGHT_CLOSING_MINUTES = 22 * 60;

/**
 * Une las citas de la nube con las de la cache local.
 *
 * Una cancelación que solo esté registrada en local debe liberar el turno
 * igualmente: si no, la clienta que acaba de cancelar en su móvil seguiría
 * viendo su hueco ocupado.
 */
export function mergeAppointmentSources(cloudAppointments = [], localAppointments = []) {
    const merged = [...(cloudAppointments || [])];

    (localAppointments || []).forEach((local) => {
        const idx = merged.findIndex((app) => (
            (app.id && local.id && app.id === local.id)
            || (app.time === local.time && app.dateKey === local.dateKey)
        ));

        if (idx >= 0) {
            if (local.status === 'cancelada') merged[idx] = { ...merged[idx], status: 'cancelada' };
        } else {
            merged.push(local);
        }
    });

    return merged;
}

/**
 * Disponibilidad de un día para una cita de `durationMinutes`.
 *
 * Motivos posibles de no disponibilidad:
 *   `closed`   — día o turno bloqueado por el estudio
 *   `past`     — ya pasó la hora
 *   `booked`   — hay una cita que empieza exactamente ahí
 *   `no-space` — hay hueco pero no cabe la duración pedida
 *   `closing`  — la cita terminaría después del cierre
 */
export function computeAvailability({
    dateIso,
    durationMinutes,
    now = new Date(),
    todayIso,
    blockedDates = [],
    blockedSlotsByDate = {},
    cloudAppointments = [],
    localAppointments = [],
    lockedStartTimes = new Set(),
    servicesCatalog = [],
    allTimeSlots = ALL_TIME_SLOTS
}) {
    const selectedDateObj = new Date(`${dateIso}T00:00:00`);

    if (blockedDates.some((entry) => entry && entry.date === dateIso)) {
        return {
            date: dateIso,
            closed: true,
            durationMinutes,
            slots: allTimeSlots.map((time) => ({ time, available: false, reason: 'closed' }))
        };
    }

    const isToday = dateIso === todayIso;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const blockedForDate = blockedSlotsByDate[dateIso] || [];
    const locked = lockedStartTimes instanceof Set ? lockedStartTimes : new Set(lockedStartTimes || []);

    const merged = mergeAppointmentSources(cloudAppointments, localAppointments);

    const activeApps = merged.filter((app) => {
        if (!app || app.status === 'cancelada') return false;
        const localMatch = (localAppointments || []).find((l) => (
            l.id === app.id || (l.dateKey === app.dateKey && l.time === app.time)
        ));
        if (localMatch && localMatch.status === 'cancelada') return false;
        return matchesDate(app, selectedDateObj, dateIso);
    });

    const occupiedIntervals = [];
    activeApps.forEach((app) => {
        const startMin = parseTimeToMinutes(app.time || app.appointmentTime);
        if (startMin === null) return;
        occupiedIntervals.push({
            start: startMin,
            end: startMin + getAppointmentDurationMinutes(app, servicesCatalog)
        });
    });

    const slots = allTimeSlots.map((time) => {
        const slotStartMin = parseTimeToMinutes(time);
        if (slotStartMin === null) return { time, available: false, reason: 'closed' };

        const slotEndMin = slotStartMin + durationMinutes;

        if (blockedForDate.includes(time)) {
            return { time, available: false, reason: 'closed' };
        }

        if (isToday && slotStartMin <= currentMinutes) {
            return { time, available: false, reason: 'past' };
        }

        // Los locks son la fuente pública de ocupación: no contienen datos
        // personales y son lo único que ve una visitante sin sesión. Se
        // comprueban ADEMÁS de los intervalos de las citas visibles, porque
        // durante la migración conviven citas antiguas que aún no tienen lock.
        if (locked.size > 0 && !isRangeFree(locked, time, durationMinutes)) {
            return {
                time,
                available: false,
                reason: locked.has(formatMinutesTo24h(slotStartMin)) ? 'booked' : 'no-space'
            };
        }

        const closingLimit = slotStartMin === NIGHT_SLOT_MINUTES
            ? NIGHT_CLOSING_MINUTES
            : CLOSING_MINUTES;

        if (slotEndMin > closingLimit) {
            return { time, available: false, reason: 'closing' };
        }

        for (const interval of occupiedIntervals) {
            const overlaps = slotStartMin < interval.end && slotEndMin > interval.start;
            if (overlaps) {
                return {
                    time,
                    available: false,
                    reason: slotStartMin === interval.start ? 'booked' : 'no-space'
                };
            }
        }

        return { time, available: true, reason: null };
    });

    return { date: dateIso, closed: false, durationMinutes, slots };
}
