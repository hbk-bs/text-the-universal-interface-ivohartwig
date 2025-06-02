// osmr/osm-api.js

export async function getDetailedLocationFromNominatim(latitude, longitude) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

  try {
    const response = await fetch(nominatimUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'nIVOgation-App/1.0',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Fehler bei OSMR:", response.status, errorText);
      return `Koordinaten: Lat ${latitude}, Lon ${longitude} (OSMR Fehler: ${response.status} - ${errorText.substring(0, 50)}...)`;
    }

    const data = await response.json();
    return data.display_name || `Koordinaten: Lat ${latitude}, Lon ${longitude} (OSMR: Kein Name empfangen)`;
  } catch (error) {
    console.error("Client-Fehler bei OSMR:", error);
    return `Koordinaten: Lat ${latitude}, Lon ${longitude} (OSMR Client-Fehler: ${error.message})`;
  }
}

/**
 * Berechnet die Route und Entfernung zu einem bestimmten Ort
 * @param {number} startLat - Breitengrad des Startpunkts
 * @param {number} startLon - Längengrad des Startpunkts
 * @param {string} destination - Name oder Beschreibung des Ziels
 * @returns {Promise<string>} Formatierte Routeninformation
 */
export async function calculateRouteToDestination(startLat, startLon, destination) {
  try {
    console.log("Starte Routenberechnung nach:", destination);
    
    if (!destination || destination.trim() === '') {
      console.error("Leerer Zielort!");
      return "Ich konnte keinen Zielort identifizieren. Bitte gib einen klaren Ortsnamen an.";
    }

    // Entferne überflüssige Wörter und Interpunktion vom Zielnamen für bessere Suchergebnisse
    const cleanDestination = destination
      .replace(/(\?|!|\.|\,|;)/g, '')
      .trim();
      
    console.log("Bereinigter Zielort:", cleanDestination);

    // 1. Konvertiere den Zielnamen zu Koordinaten
    const destinationCoords = await getCoordinatesFromName(cleanDestination);
    if (!destinationCoords) {
      console.error("Keine Koordinaten gefunden für:", cleanDestination);
      return `Ich konnte "${destination}" leider nicht auf der Karte finden. Bitte versuche es mit einem bekannteren Ortsnamen.`;
    }
    
    console.log("Zielkoordinaten gefunden:", destinationCoords);

    // 2. Berechne die Route
    const routeInfo = await getRouteInfo(
      startLat, startLon,
      destinationCoords.lat, destinationCoords.lon
    );

    if (!routeInfo) {
      console.error("Keine Route berechnet für:", cleanDestination);
      return `Ich konnte leider keine Route nach ${destination} berechnen. Die Strecke ist möglicherweise zu lang oder nicht mit dem Auto erreichbar.`;
    }

    // Formatiere schöne Ausgabe
    const { distance, duration, destination_name } = routeInfo;
    const distanceKm = (distance / 1000).toFixed(1);
    
    let durationText;
    if (duration < 60) {
      durationText = `etwa ${Math.round(duration)} Minuten`;
    } else {
      const hours = Math.floor(duration / 60);
      const minutes = Math.round(duration % 60);
      durationText = `etwa ${hours} Stunde${hours > 1 ? 'n' : ''}`;
      if (minutes > 0) {
        durationText += ` und ${minutes} Minute${minutes > 1 ? 'n' : ''}`;
      }
    }

    const displayName = destination_name || destinationCoords.name || destination;
    
    console.log("Route erfolgreich berechnet:", { distance: distanceKm, duration: durationText });

    return `🧭 Route nach ${displayName}:\n` +
           `Die Entfernung beträgt ${distanceKm} km.\n` +
           `Die geschätzte Fahrzeit beträgt ${durationText}.`;
  } catch (error) {
    console.error("Fehler bei Routenberechnung:", error);
    return `Bei der Berechnung der Route nach "${destination}" ist ein Fehler aufgetreten. Details: ${error.message}`;
  }
}

/**
 * Konvertiert einen Ortsnamen zu geografischen Koordinaten
 */
async function getCoordinatesFromName(placeName) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;

  try {
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'nIVOgation-App/1.0'
      }
    });

    if (!response.ok) {
      console.error("Nominatim API Fehler:", response.status);
      return null;
    }

    const data = await response.json();
    console.log("Nominatim Antwort:", data);
    
    if (!data || data.length === 0) {
      return null;
    }

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      name: data[0].display_name
    };
  } catch (error) {
    console.error("Fehler bei Namensauflösung:", error);
    return null;
  }
}

/**
 * Berechnet Routeninformationen zwischen zwei Punkten
 */
async function getRouteInfo(startLat, startLon, endLat, endLon) {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;

  try {
    const response = await fetch(osrmUrl);
    
    if (!response.ok) {
      console.error("OSRM API Fehler:", response.status);
      return null;
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error("Keine Route gefunden:", data);
      return null;
    }

    // Hole den Namen des Ziels
    const destName = await getDetailedLocationFromNominatim(endLat, endLon);

    return {
      distance: data.routes[0].distance, // in meters
      duration: data.routes[0].duration / 60,  // convert seconds to minutes
      destination_name: destName.split(',')[0] // Nur den ersten Teil für eine kürzere Darstellung
    };
  } catch (error) {
    console.error("Fehler bei OSRM-Anfrage:", error);
    return null;
  }
}
