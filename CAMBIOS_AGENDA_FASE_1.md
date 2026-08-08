# Cambios de agenda - Fase 1

## Funciones modificadas
- `window.prepareWhatsAppBooking`
- `window.renderTimeSlots`
- `computeClientAvailability`
- `getServiceDurationFromSummary`
- `getSelectedServicesDurationMinutes`  (nuevo helper)
- `getAppointmentDurationMinutes`  (nuevo helper)
- `formatMinutesToTimeString`  (nuevo helper)

## Campos nuevos en `pendingAppointmentData`
- `appointmentDateIso`
- `serviceIds`
- `serviceSummary`
- `durationMinutes`
- `startTime`
- `endTime`
- `salonId`

## Compatibilidad mantenida
- Se conserva `dateKey` con el formato actual.
- Se conserva `time` como alias de `startTime`.
- Se conserva `service` para las lecturas existentes de la UI.
- Se mantiene `localStorage` y la escritura opcional a Firestore.
- No se tocó autenticacion ni panel admin.

## Escenarios probados
- Una cita de `14:00-16:00` bloquea `14:00`, `14:30`, `15:00` y `15:30`.
- Un servicio que requiere `13:30-14:30` no queda disponible si existe `14:00-16:00`.
- `16:00` si queda disponible cuando la cita anterior termina exactamente a esa hora.
- Varios servicios suman su duracion real para calcular `durationMinutes`.
- Una cita de `3 horas` bloquea todo su intervalo completo.

## Riesgos encontrados
- Las citas antiguas sin `durationMinutes` siguen dependiendo de compatibilidad para no romper datos ya guardados.
- Mientras sigan coexistiendo `localStorage` y Firestore, puede haber divergencias temporales si el navegador queda desincronizado.
- El solapamiento ya se calcula por intervalos, pero la integridad real aun depende de reglas y validacion de backend en una fase posterior.

