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

/** Jornada por defecto si el estudio no ha configurado la suya. */
export const DEFAULT_BUSINESS_HOURS = { openingTime: '08:00', closingTime: '20:00' };

/**
 * Normaliza la jornada a minutos desde medianoche.
 *
 * Acepta tanto "08:00" como "08:00 AM" porque el documento de configuración lo
 * escribe un `<input type="time">` (24 h) pero los turnos visibles son de 12 h,
 * y ya hubo un bug de producción por mezclarlos.
 */
export function resolveBusinessHours(businessHours = {}) {
    const opening = parseTimeToMinutes(businessHours.openingTime);
    const closing = parseTimeToMinutes(businessHours.closingTime);

    const openingMinutes = opening === null ? parseTimeToMinutes(DEFAULT_BUSINESS_HOURS.openingTime) : opening;
    const closingMinutes = closing === null ? parseTimeToMinutes(DEFAULT_BUSINESS_HOURS.closingTime) : closing;

    // Una jornada invertida o vacía dejaría el día entero sin turnos sin decir
    // por qué. Se ignora y se usa la de por defecto.
    if (closingMinutes <= openingMinutes) {
        return {
            openingMinutes: parseTimeToMinutes(DEFAULT_BUSINESS_HOURS.openingTime),
            closingMinutes: parseTimeToMinutes(DEFAULT_BUSINESS_HOURS.closingTime)
        };
    }

    return { openingMinutes, closingMinutes };
}

/** ¿Hay una duración de servicio real con la que calcular el fin de la cita? */
function hasUsableDuration(durationMinutes) {
    const value = Number(durationMinutes);
    return Number.isFinite(value) && value > 0;
}

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
 *   `closed`        — día o turno bloqueado por el estudio
 *   `outside-hours` — el turno cae fuera de la jornada configurada
 *   `past`          — ya pasó la hora, respecto al reloj de hoy
 *   `booked`        — hay una cita que empieza exactamente ahí
 *   `no-space`      — hay hueco pero no cabe la duración pedida
 *   `closing`       — la cita terminaría después del cierre
 *
 * Cada turno se evalúa por separado y solo contra datos reales: jornada,
 * reloj, citas, locks y bloqueos administrativos. Nada de lo que la clienta
 * haya seleccionado en la pantalla entra en este cálculo, así que elegir una
 * hora no puede cambiar la disponibilidad de otra.
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
    allTimeSlots = ALL_TIME_SLOTS,
    businessHours = DEFAULT_BUSINESS_HOURS
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

    const { openingMinutes, closingMinutes } = resolveBusinessHours(businessHours);

    // Sin servicio elegido no hay duración real. Antes se colaba un valor por
    // defecto de 120 minutos y con él turnos perfectamente reservables salían
    // como "Fuera de horario" sin que la clienta hubiera elegido nada. Cuando
    // no hay duración, simplemente no se evalúa nada que dependa de ella.
    const knowsDuration = hasUsableDuration(durationMinutes);
    const duration = knowsDuration ? Math.round(Number(durationMinutes)) : 0;

    const slots = allTimeSlots.map((time) => {
        const slotStartMin = parseTimeToMinutes(time);
        if (slotStartMin === null) return { time, available: false, reason: 'closed' };

        const slotEndMin = slotStartMin + duration;

        if (blockedForDate.includes(time)) {
            return { time, available: false, reason: 'closed' };
        }

        // Jornada: depende solo de la hora del turno, nunca de la duración.
        if (slotStartMin < openingMinutes || slotStartMin >= closingMinutes) {
            return { time, available: false, reason: 'outside-hours' };
        }

        if (isToday && slotStartMin <= currentMinutes) {
            return { time, available: false, reason: 'past' };
        }

        // Los locks son la fuente pública de ocupación: no contienen datos
        // personales y son lo único que ve una visitante sin sesión. Se
        // comprueban ADEMÁS de los intervalos de las citas visibles, porque
        // durante la migración conviven citas antiguas que aún no tienen lock.
        if (locked.size > 0) {
            const ocupaEsteTurno = locked.has(formatMinutesTo24h(slotStartMin));
            if (ocupaEsteTurno) {
                return { time, available: false, reason: 'booked' };
            }
            if (knowsDuration && !isRangeFree(locked, time, duration)) {
                return { time, available: false, reason: 'no-space' };
            }
        }

        // La cita tiene que caber entera dentro de la jornada:
        //   start >= apertura  Y  start + duración <= cierre.
        if (knowsDuration && slotEndMin > closingMinutes) {
            return { time, available: false, reason: 'closing' };
        }

        for (const interval of occupiedIntervals) {
            // Solapamiento real de intervalos. Sin duración conocida, solo
            // cuenta que otra cita empiece exactamente en este turno.
            const overlaps = knowsDuration
                ? (slotStartMin < interval.end && slotEndMin > interval.start)
                : (slotStartMin >= interval.start && slotStartMin < interval.end);

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
