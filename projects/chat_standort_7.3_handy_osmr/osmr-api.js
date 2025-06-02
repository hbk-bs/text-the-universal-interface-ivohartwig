export async function getDetailedLocationFromNominatim(latitude, longitude) {
    // Die öffentliche Nominatim Reverse Geocoding API
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    
    try {
      const response = await fetch(nominatimUrl, {
        method: 'GET', // Nominatim verwendet GET für Reverse Geocoding
        headers: {
          // Es ist gut, einen User-Agent anzugeben, wie von Nominatim empfohlen
          'User-Agent': 'YourAppName/1.0 (your_email@example.com)' 
        }
      });
  
      if (!response.ok) {
        // Nominatim gibt oft sinnvolle Fehlercodes zurück
        const errorText = await response.text();
        console.error("Fehler beim Abrufen des detaillierten Standorts von Nominatim:", response.status, errorText);
        return `Koordinaten: Lat ${latitude}, Lon ${longitude} (Detailabruf fehlgeschlagen: ${response.status} - ${errorText.substring(0, 50)}...)`;
      }
  
      const data = await response.json();
      // 'display_name' ist das Feld, das den vollen Adressstring enthält
      return data.display_name || `Koordinaten: Lat ${latitude}, Lon ${longitude} (Kein Name von Nominatim empfangen)`;
    } catch (error) {
      console.error("Client-Fehler beim Abrufen des detaillierten Standorts von Nominatim:", error);
      return `Koordinaten: Lat ${latitude}, Lon ${longitude} (Client-Fehler bei Detailabruf: ${error.message})`;
    }
  }