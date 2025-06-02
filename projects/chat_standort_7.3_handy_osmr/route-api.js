
/**
 * Berechnet eine Route zwischen dem Standort des Nutzers und einem Ziel
 * und gibt Informationen zur Entfernung und geschätzten Fahrtzeit zurück.
 * 
 * @param {number} startLat - Breitengrad des Startpunkts
 * @param {number} startLon - Längengrad des Startpunkts
 * @param {string} targetLocation - Beschreibung des Zielpunkts (z.B. "Berlin Hauptbahnhof")
 * @returns {Promise<string>} - Informationen zur Route
 */
export async function calculateRoute(startLat, startLon, targetLocation) {
  try {
    // 1. Konvertiere den Zielnamen zu Koordinaten mittels Nominatim
    const targetCoords = await getCoordinatesFromName(targetLocation);
    if (!targetCoords) {
      return "Ich konnte das Ziel nicht auf der Karte finden.";
    }

    // 2. Benutze OSRM für die eigentliche Routenberechnung
    const routeData = await getRouteFromOSRM(
      startLat, startLon, 
      targetCoords.lat, targetCoords.lon
    );

    if (!routeData) {
      return "Ich konnte keine Route zu diesem Ziel berechnen.";
    }

    // 3. Formatiere die Antwort schön für den Nutzer
    const { distance, duration } = routeData;
    
    // Konvertiere Meter in km
    const distanceKm = (distance / 1000).toFixed(1);
    
    // Konvertiere Sekunden in Stunden und Minuten
    const durationMinutes = Math.round(duration / 60);
    let durationText = "";
    
    if (durationMinutes < 60) {
      durationText = `${durationMinutes} Minuten`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      durationText = `${hours} Stunde${hours > 1 ? 'n' : ''}`;
      if (minutes > 0) {
        durationText += ` und ${minutes} Minute${minutes > 1 ? 'n' : ''}`;
      }
    }

    return `🧭 **Routeninfo:**\nEntfernung: ${distanceKm} km\nDauer: ${durationText}`;