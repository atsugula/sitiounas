// Utilidades de fecha y hora de la agenda.
//
// Extraídas de index.html en la Fase 11. Son puras: sin DOM, sin Firestore,
// sin `window`. `parseTimeToMinutes` se reexporta desde `booking-slots.js`
// en lugar de duplicarse: había dos implementaciones idénticas y dos
// implementaciones del mismo parseo son dos oportunidades de divergir.

export { parseTimeToMinutes, formatMinutesTo24h } from './booking-slots.js';
import { parseTimeToMinutes } from './booking-slots.js';

/** Fecha local en formato YYYY-MM-DD, sin pasar por UTC. */
export function toIsoDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Minutos desde medianoche a "hh:mm AM/PM", que es el formato visible. */
export function formatMinutesToTimeString(totalMinutes) {
    const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const hours24 = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * ¿Esta cita cae en la fecha indicada?
 *
 * Convive con tres formatos porque los datos históricos los tienen: el
 * `appointmentDateIso` de la Fase 1, el `dateKey` de `toDateString()` y algún
 * `dateKey` que ya venía en ISO.
 */
export function matchesDate(appointment, selectedDateObj, dateIso) {
    if (!appointment) return false;
    if (appointment.appointmentDateIso && appointment.appointmentDateIso === dateIso) return true;

    if (appointment.dateKey) {
        if (appointment.dateKey === dateIso) return true;
        if (selectedDateObj && appointment.dateKey === selectedDateObj.toDateString()) return true;
        const parsed = new Date(appointment.dateKey);
        if (!isNaN(parsed.getTime()) && toIsoDateString(parsed) === dateIso) return true;
    }

    return false;
}

/**
 * Duración total en minutos de una lista de servicios seleccionados.
 * Los servicios sin duración válida no suman.
 */
export function getSelectedServicesDurationMinutes(selectedList) {
    if (!Array.isArray(selectedList) || selectedList.length === 0) return 0;
    return selectedList.reduce((sum, service) => {
        const minutes = Math.round((Number(service?.durationHours) || 0) * 60);
        return sum + (minutes > 0 ? minutes : 0);
    }, 0);
}

/**
 * Duración de un servicio deducida de su descripción en texto.
 *
 * Hace falta para las citas antiguas y las presenciales, que guardan el
 * servicio como una cadena en vez de como lista de ids.
 */
export function getServiceDurationFromSummary(serviceSummary, servicesCatalog = []) {
    if (!serviceSummary) return 120;

    const summary = String(serviceSummary).toLowerCase();
    let total = 0;

    servicesCatalog.forEach((service) => {
        if (service?.name && summary.includes(String(service.name).toLowerCase())) {
            total += Math.round((Number(service.durationHours) || 0) * 60) || 120;
        }
    });

    return total > 0 ? total : 120;
}

/**
 * Duración de una cita, con los respaldos en orden de fiabilidad:
 * el campo explícito, luego los ids de servicio, luego el texto.
 */
export function getAppointmentDurationMinutes(appointment, servicesCatalog = []) {
    if (!appointment) return 120;

    const explicit = Number(appointment.durationMinutes);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

    if (Array.isArray(appointment.serviceIds) && appointment.serviceIds.length > 0) {
        const fromIds = appointment.serviceIds.reduce((sum, serviceId) => {
            const match = servicesCatalog.find((s) => s.id === serviceId);
            const minutes = Math.round((Number(match?.durationHours) || 0) * 60);
            return sum + (minutes > 0 ? minutes : 0);
        }, 0);
        if (fromIds > 0) return fromIds;
    }

    const summary = appointment.serviceSummary || appointment.service || '';
    return getServiceDurationFromSummary(summary, servicesCatalog);
}

/**
 * Hora de fin de una cita, en formato visible.
 * Devuelve cadena vacía si la hora de inicio no se entiende.
 */
export function computeEndTime(startTime, durationMinutes) {
    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes === null) return '';
    return formatMinutesToTimeString(startMinutes + (Number(durationMinutes) || 0));
}
