// Aritmética de los locks de reserva (Fase 5).
//
// Se mantiene aparte del HTML porque es lógica pura y determinista: sin DOM,
// sin Firestore, sin `window`. Eso permite probarla de verdad con
// `node --test`, que es lo único que garantiza que una cita de 3 horas bloquee
// exactamente los seis turnos que le corresponden.
//
// Unidad de bloqueo: 30 minutos.
// Una cita de 14:00 a 16:00 ocupa 14:00, 14:30, 15:00 y 15:30.
// Las 16:00 quedan libres, porque la cita termina justo cuando empieza.

export const SLOT_INTERVAL_MINUTES = 30;
export const DEFAULT_SALON_ID = 'nails-con-val';

/**
 * Convierte "02:30 PM" o "14:30" a minutos desde medianoche.
 * Devuelve null si no se reconoce el formato.
 */
export function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const str = String(timeStr).trim();

    const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match12) {
        let hours = parseInt(match12[1], 10);
        const minutes = parseInt(match12[2], 10);
        const period = match12[3].toUpperCase();
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
    }

    const match24 = str.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        const hours = parseInt(match24[1], 10);
        const minutes = parseInt(match24[2], 10);
        if (hours > 23 || minutes > 59) return null;
        return hours * 60 + minutes;
    }

    return null;
}

/** Convierte minutos desde medianoche a "HH:MM" en 24h. Formato canónico del lock. */
export function formatMinutesTo24h(totalMinutes) {
    const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Devuelve las horas de inicio de 30 minutos que ocupa una cita.
 *
 * Redondea el inicio hacia abajo y el final hacia arriba al múltiplo de 30 más
 * cercano, de forma que una cita mal alineada (por ejemplo 14:10) bloquee de
 * todos modos el turno que invade. Nunca puede quedar un hueco parcialmente
 * ocupado y aparentemente libre.
 */
export function computeSlotStartTimes(startTime, durationMinutes) {
    const startMin = parseTimeToMinutes(startTime);
    const duration = Number(durationMinutes);

    if (startMin === null || !Number.isFinite(duration) || duration <= 0) {
        return [];
    }

    const alignedStart = Math.floor(startMin / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
    const rawEnd = startMin + Math.round(duration);
    const alignedEnd = Math.ceil(rawEnd / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;

    const slots = [];
    for (let minute = alignedStart; minute < alignedEnd; minute += SLOT_INTERVAL_MINUTES) {
        slots.push(formatMinutesTo24h(minute));
    }
    return slots;
}

/**
 * Id determinista del lock. Dos navegadores que pidan el mismo turno del mismo
 * día generan exactamente el mismo id, que es lo que permite que Firestore
 * arbitre la carrera: el segundo `create` sobre el mismo documento pierde.
 *
 * `dateIso` va en formato YYYY-MM-DD para que el id sea estable y ordenable.
 */
export function buildSlotId(dateIso, slotStartTime, salonId = DEFAULT_SALON_ID) {
    return `${salonId}_${dateIso}_${slotStartTime}`;
}

/** Todos los ids de lock que necesita una cita. */
export function computeSlotIdsForAppointment({ dateIso, startTime, durationMinutes, salonId = DEFAULT_SALON_ID }) {
    if (!dateIso) return [];
    return computeSlotStartTimes(startTime, durationMinutes)
        .map((slotStart) => buildSlotId(dateIso, slotStart, salonId));
}

/**
 * Decide si una reserva puede seguir adelante dado lo que ya hay en la base.
 *
 * `existingSlots` es el resultado de leer cada lock dentro de la transacción:
 * una lista de `{ slotId, exists }`. Si cualquiera existe, se aborta entera.
 * No hay reserva parcial: o se toman todos los turnos o ninguno.
 */
export function resolveBookingConflict(existingSlots) {
    const taken = (existingSlots || [])
        .filter((slot) => slot && slot.exists)
        .map((slot) => slot.slotId);

    return {
        canBook: taken.length === 0,
        takenSlotIds: taken
    };
}

/**
 * Marca de ocupación por fecha a partir de los locks.
 * Devuelve { 'YYYY-MM-DD': Set('14:00', '14:30', ...) }.
 */
export function groupLockedSlotsByDate(slotDocs) {
    const byDate = {};
    (slotDocs || []).forEach((slot) => {
        if (!slot || !slot.dateIso || !slot.startTime) return;
        if (!byDate[slot.dateIso]) byDate[slot.dateIso] = new Set();
        byDate[slot.dateIso].add(slot.startTime);
    });
    return byDate;
}

/**
 * ¿Cabe una cita de `durationMinutes` empezando en `startTime` ese día?
 * Se responde solo con locks, sin necesidad de leer datos personales de
 * ninguna cita: es lo que permite que la disponibilidad sea pública sin
 * exponer PII.
 */
export function isRangeFree(lockedStartTimes, startTime, durationMinutes) {
    const needed = computeSlotStartTimes(startTime, durationMinutes);
    if (needed.length === 0) return false;

    const locked = lockedStartTimes instanceof Set
        ? lockedStartTimes
        : new Set(lockedStartTimes || []);

    return needed.every((slotStart) => !locked.has(slotStart));
}
