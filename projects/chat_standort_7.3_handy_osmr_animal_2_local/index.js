import { getDetailedLocationFromNominatim, calculateRouteToDestination } from './osmr-api.js';
import { fileToDataURL } from './generate-data-uri.js';

// Add location history management
// This is a separate module that doesn't modify any existing code
const locationHistory = {
  storageKey: 'nIVOgation_location_history',
  
  saveLocation(place, coordinates) {
    try {
      const history = this.getLocationHistory();
      const timestamp = new Date().toISOString();
      
      history.push({
        place: place,
        coordinates: coordinates,
        timestamp: timestamp,
        readableTime: new Date().toLocaleString('de-DE')
      });
      
      // Keep only last 50 entries
      if (history.length > 50) {
        history.shift();
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(history));
      console.log('Location saved to history:', place);
      // Hinzugefügt, um den Verlauf in der Konsole zu sehen
      console.log('Aktueller Verlauf im Local Storage:', localStorage.getItem(this.storageKey));
    } catch (error) {
      console.error('Error saving location history:', error);
    }
  },
  
  getLocationHistory() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading location history:', error);
      return [];
    }
  },
  
  getFormattedHistory() {
    const history = this.getLocationHistory();
    if (!history.length) {
      return "Du hast noch keine gespeicherten Standortdaten.";
    }
    
    let result = "Deine letzten Standorte:\n\n";
    // Show most recent locations first
    const recentHistory = [...history].reverse().slice(0, 10);
    
    recentHistory.forEach((item, index) => {
      result += `${index + 1}. ${item.place} (${item.readableTime})\n`;
    });
    
    return result;
  }
};

const llmImageApiEndpoint = 'https://ivo-openai-api-images.val.run/';
const apiEndpoint = 'https://ivo-openai-api.val.run/';

const imageApiPrompt = {
  response_format: {type: 'json_object'},
  messages:[{
    role: 'system',
    content: 'Du bist ein freundlicher und präziser Navigationsassistent. only respond in JSON {result: string}. Antworte immer auf deutsch.'
  },
  {
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: {
          url: ''
        },
      },
    ],
  },
]
}

const messageHistory = {
  messages: [],
};

async function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation wird von diesem Browser nicht unterstützt."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err)
    );
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const chatHistoryElement = document.querySelector('.chat-history');
  const inputElement = document.querySelector('input[name="content"]');
  const formElement = document.querySelector('form');
  const imgButton = document.getElementById('img-button');
  const imageUpload = document.getElementById('image-upload');
  const animalButton = document.getElementById('animal-button');
  const animalSelector = document.querySelector('.animal-selector');
  const animalOptions = document.querySelectorAll('.animal-option');

  if (!chatHistoryElement || !inputElement || !formElement || !imgButton || !imageUpload) {
    console.error("Wichtige DOM-Elemente nicht gefunden!");
    if (chatHistoryElement) {
      chatHistoryElement.innerHTML = "<div class='message error-message'>Fehler: Chat-Interface konnte nicht initialisiert werden.</div>";
    }
    return;
  }

  let userPosition = null;
  let selectedAnimal = null;
  
  const animalSpeeds = {
    ant: 0.3,
    bird: 80,
    lion: 80,
    mensch: 4,
    default: 60
  };

  const animalTravelDescriptions = {
    ant: "krabbelt",
    bird: "fliegt",
    lion: "rennt",
    mensch: "geht",
    default: "fährt"
  };

  animalButton.addEventListener('click', () => {
    const isVisible = animalSelector.style.display !== 'none';
    animalSelector.style.display = isVisible ? 'none' : 'flex';
  });

  animalOptions.forEach(option => {
    option.addEventListener('click', () => {
      const animal = option.getAttribute('data-animal');
      animalOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedAnimal = animal;
      animalSelector.style.display = 'none';
      const animalEmojis = { ant: '🐜', bird: '🐦', lion: '🦁', mensch: '🚶' };
      const emoji = animalEmojis[animal] || '🚶';
      const animalName = option.textContent;
      displayMessage('system-info', `${emoji} Du berechnest jetzt Routen als ${animalName}!`);
      animalButton.textContent = `${emoji} ${animalName}`;
      messageHistory.messages.push({
        role: 'system',
        content: `Der Benutzer hat jetzt das Tier "${animalName}" (${emoji}) ausgewählt. Bitte berücksichtige in deinen Antworten, dass Entfernungen nun aus der Perspektive ${animalName === 'Mensch' ? 'eines Menschen' : `einer ${animalName}`} betrachtet werden.`
      });
      const animalSelectionMessage = {
        role: 'assistant',
        content: `Ich werde jetzt Routen und Entfernungen für ${animalName === 'Mensch' ? 'einen' : 'eine'} ${animalName} berechnen! ${emoji}`
      };
      messageHistory.messages.push(animalSelectionMessage);
      displayMessage('assistant', animalSelectionMessage.content);
    });
  });

  async function processImageDataURL(dataURL) {
    const imageElement = document.createElement('img');
    imageElement.src = dataURL;
    imageElement.alt = "Captured image";
    imageElement.style.maxWidth = '100%';
    imageElement.style.maxHeight = '250px';
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');
    messageDiv.appendChild(imageElement);
    chatHistoryElement.appendChild(messageDiv);
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
    
    imageApiPrompt.messages.at(-1).content.at(0).image_url.url = dataURL;

    try {
      const imageResponse = await fetch(llmImageApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageApiPrompt),
      });

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        throw new Error(`LLM API Fehler: ${imageResponse.status} - ${errorText.substring(0, 100)}...`);
      }

      const imageJson = await imageResponse.json();
      const resultString = imageJson.completion.choices[0].message.content;
      const resultObject = JSON.parse(resultString);
      const imageDescription = resultObject.result;
      
      messageHistory.messages.push({
        role: 'user',
        content: 'Beschreibe dieses Bild und sage mir gleichzeitig, wo ich bin. Ich möchte eine einzige zusammenhängende Antwort mit der Bildbeschreibung und den Standortinformationen (Straße, Hausnummer, Stadt und PLZ).'
      });
      
      messageHistory.messages.push({
        role: 'system',
        content: `Bildbeschreibung zur Verwendung in deiner Antwort: "${imageDescription}". Bitte erstelle eine einzige, zusammenhängende Antwort, die sowohl die Beschreibung des Bildes als auch die Standortinformation enthält.`
      });

      await getLLMResponse();
      
      const lastAssistantMsg = messageHistory.messages.filter(msg => msg.role === 'assistant').pop();
      if (lastAssistantMsg && lastAssistantMsg.content) {
        const locationMatches = lastAssistantMsg.content.match(/befindest dich (?:in|an|bei|auf) ([^\.]+)/i);
        if (locationMatches && locationMatches[1]) {
          const extractedLocation = locationMatches[1].trim();
          locationHistory.saveLocation(extractedLocation, userPosition);
        }
      }
    } catch (error) {
      console.error("Fehler beim Verarbeiten des Bildes:", error);
      displayMessage('system-info', `Bildfehler: ${error.message}`, true);
    }
  }

  imgButton.addEventListener('click', () => imageUpload.click());

  imageUpload.addEventListener('change', async (event) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      try {
        const base64Image = await fileToDataURL(file);
        processImageDataURL(base64Image);
        event.target.value = '';
      } catch (error) {
        console.error("Fehler beim Verarbeiten des Bildes:", error);
        displayMessage('system-info', `Bildfehler: ${error.message}`, true);
        event.target.value = '';
      }
    }
  });

  function displayMessage(role, messageContent, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    if (isError) messageDiv.classList.add('error-message');
  
    if (typeof messageContent === 'string') {
      messageDiv.textContent = messageContent;
    } else {
        messageDiv.textContent = isError ? "Fehler: Inhalt nicht verfügbar" : "";
    }
  
    chatHistoryElement.appendChild(messageDiv);
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  }

  async function getLLMResponse() {
    try {
      let apiRequestBody = { messages: [...messageHistory.messages] };
      
      if (selectedAnimal) {
        const animalName = document.querySelector(`.animal-option[data-animal="${selectedAnimal}"]`).textContent;
        const animalVerb = animalTravelDescriptions[selectedAnimal];
        const tempAnimalContext = {
          role: 'system',
          content: `WICHTIG: Aktuelle Tierauswahl ist ${animalName}. Bei Fragen nach Entfernungen oder Fahrtzeiten berücksichtige, dass eine ${animalName} ${animalVerb} und nicht fährt.`
        };
        apiRequestBody.messages.push(tempAnimalContext);
      }
  
      const response = await fetch(llmImageApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiRequestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorForChat = `LLM API Fehler: ${response.status} - ${errorText.substring(0,100)}...`;
        displayMessage('assistant', errorForChat, true);
        throw new Error(errorForChat);
      }
  
      const json = await response.json();
      if (json.completion?.choices?.[0]?.message) {
        const assistantMessage = json.completion.choices[0].message;
        
        // --- ÄNDERUNG ---
        // Die alte Logik zum Anhängen des Verlaufs wurde entfernt.
        // Die korrekte Logik befindet sich jetzt im 'submit'-Event Listener.

        if (userPosition) {
          try {
            const lastUserMessage = messageHistory.messages.filter(msg => msg.role === 'user' && typeof msg.content === 'string').pop();

            if (lastUserMessage) {
              const userQuery = lastUserMessage.content.toLowerCase();
              const routeKeywords = ['wie weit', 'wie lange', 'entfernung', 'distanz', 'route', 'weg', 'fahrt', 'fahren', 'komme ich'];
              const hasRouteKeyword = routeKeywords.some(keyword => userQuery.includes(keyword));
              const prepositions = ['nach', 'zu', 'bis', 'in'];
              const hasPreposition = prepositions.some(prep => userQuery.includes(prep + ' '));
              
              if (hasRouteKeyword && hasPreposition) {
                let destination = '';
                for (const prep of prepositions) {
                  if (userQuery.includes(' ' + prep + ' ')) {
                    const parts = userQuery.split(' ' + prep + ' ');
                    if (parts.length > 1) {
                      let rawDestination = parts[1].split(/[?.!]|von|und|oder/)[0].trim();
                      rawDestination = rawDestination.replace(/\s+(jetzt|dann|heute|morgen|schnell|bald)$/i, '');
                      destination = rawDestination;
                      break;
                    }
                  }
                }
                
                if (!destination) {
                  const possiblePlaces = assistantMessage.content.match(/(?:nach|zu|in|bis)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)/g);
                  if (possiblePlaces?.length > 0) {
                    destination = possiblePlaces[0].replace(/^(?:nach|zu|in|bis)\s+/, '').trim();
                  }
                }
                
                if (destination) {
                  try {
                    const routeInfo = await calculateRouteToDestination(userPosition.latitude, userPosition.longitude, destination);
                    let modifiedRouteInfo = routeInfo;
                    
                    if (selectedAnimal) {
                      const distanceMatch = routeInfo.match(/Die Entfernung beträgt ([\d,\.]+) km/);
                      if (distanceMatch?.[1]) {
                        const distance = parseFloat(distanceMatch[1].replace(',', '.'));
                        const animalSpeed = animalSpeeds[selectedAnimal] || animalSpeeds.default;
                        const animalVerb = animalTravelDescriptions[selectedAnimal] || animalTravelDescriptions.default;
                        const timeInHours = distance / animalSpeed;
                        let timeDescription;
                        
                        if (timeInHours < 1) {
                          timeDescription = `etwa ${Math.round(timeInHours * 60)} Minute(n)`;
                        } else if (timeInHours < 24) {
                          const hours = Math.floor(timeInHours);
                          const minutes = Math.round((timeInHours - hours) * 60);
                          timeDescription = `etwa ${hours} Stunde(n)${minutes > 0 ? ` und ${minutes} Minute(n)` : ''}`;
                        } else {
                          const days = Math.floor(timeInHours / 24);
                          const remainingHours = Math.floor(timeInHours % 24);
                          timeDescription = `etwa ${days} Tag(e)${remainingHours > 0 ? ` und ${remainingHours} Stunde(n)` : ''}`;
                        }
                        
                        const animalName = document.querySelector(`.animal-option[data-animal="${selectedAnimal}"]`).textContent;
                        modifiedRouteInfo = `Route als ${animalName} nach ${destination}:\n` +
                                        `Die Entfernung beträgt ${distance.toFixed(1)} km.\n` +
                                        `Eine ${animalName} ${animalVerb} diese Strecke in ${timeDescription}.`;
                      }
                    }
                    assistantMessage.content += `\n\n${modifiedRouteInfo}`;
                  } catch (routeError) {
                    assistantMessage.content += `\n\nEntschuldigung, ich konnte keine genaue Route berechnen. Fehler: ${routeError.message}`;
                  }
                }
              }
            }
          } catch (error) {
            console.error("Fehler bei der Routenverarbeitung:", error);
          }
        }
        
        messageHistory.messages.push(assistantMessage);
        displayMessage(assistantMessage.role, assistantMessage.content);
      } else {
        const errorMessageContent = 'Entschuldigung, ich habe ein Problem mit der Verarbeitung der Antwort.';
        messageHistory.messages.push({ role: 'assistant', content: errorMessageContent });
        displayMessage('assistant', errorMessageContent, true);
      }
    } catch (error) {
      if (!error.message.startsWith("LLM API Fehler")) {
        const errorMessageContent = `Ein Fehler ist aufgetreten: ${error.message}`;
        messageHistory.messages.push({ role: 'assistant', content: errorMessageContent });
        displayMessage('assistant', errorMessageContent, true);
      }
    }
  }

  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = inputElement.value.trim();
    if (!content) return;

    inputElement.value = '';
    messageHistory.messages.push({ role: 'user', content: content });
    displayMessage('user', content);
    
    // --- ÄNDERUNG START ---
    // Prüfe die Nutzeranfrage, BEVOR die LLM-Funktion aufgerufen wird.
    const userQuery = content.toLowerCase();
    const historyKeywords = [
        'wo war ich', 'frühere standorte', 'standortverlauf', 'meine orte', 
        'bisherige orte', 'letzte orte', 'standorthistorie', 'wo ich war',
        'standort historie', 'besuchte orte', 'vorherige standorte', 'orte',
        'letzte tage', 'letzte wochen', 'letzte stunde'
    ];

    if (historyKeywords.some(keyword => userQuery.includes(keyword))) {
        // Wenn der Nutzer nach dem Verlauf fragt, fügen wir die Daten zum Kontext hinzu.
        const formattedHistory = locationHistory.getFormattedHistory();
        messageHistory.messages.push({
            role: 'system',
            content: `Hier ist die vom Nutzer gespeicherte Standorthistorie. Deine Aufgabe ist es, diese Liste für den Nutzer freundlich aufzubereiten und als Antwort auszugeben:\n\n${formattedHistory}`
        });
    }
    // --- ÄNDERUNG ENDE ---
    
    await getLLMResponse();
  });

  try {
    const position = await getCurrentPosition();
    userPosition = position;
    
    const detailedPlaceName = await getDetailedLocationFromNominatim(position.latitude, position.longitude);
    
    locationHistory.saveLocation(detailedPlaceName, {
      latitude: position.latitude,
      longitude: position.longitude
    });

    // --- ÄNDERUNG START ---
    // Der System-Prompt wurde angepasst, um die neue Logik zu reflektieren.
    const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent. 
    
    WICHTIG - NUTZERDATEN VON OPENSTREETMAP/OSMR:
    - Aktueller Standort: ${detailedPlaceName}
    - Genaue Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}
    Diese OSMR-Daten sind präzise und aktuell. Nutze sie als Grundlage für deine Antworten.
    
    WICHTIG - STANDORTHISTORIE:
    Wenn der Nutzer nach seinem Standortverlauf fragt (z.B. "Wo war ich?", "Zeig mir meine letzten Orte"), erhältst du von mir eine zusätzliche Systemnachricht, die seine gespeicherte Standorthistorie enthält. Deine Aufgabe ist es, diese Liste für den Nutzer freundlich und übersichtlich in deiner Antwort aufzubereiten.
    
    Zur Information: Du hast Zugriff auf OSMR-Routing-Funktionen! Bei Fragen nach Entfernungen oder Fahrtzeiten ergänze ich deine Antwort automatisch mit den genauen OSMR-Daten.
    
    WICHTIG - TIERAUSWAHL-FUNKTION:
    Der Benutzer kann ein Tier auswählen (Ameise, Vogel oder Löwe oder Mensch). 
    - Wenn eine Ameise ausgewählt wurde: Antworte als ob du eine Ameise wärst. Ameisen krabbeln mit 0,3 km/h.
    - Wenn ein Vogel ausgewählt wurde: Antworte als ob du ein Vogel wärst. Vögel fliegen mit 80 km/h.
    - Wenn ein Löwe ausgewählt wurde: Antworte als ob du ein Löwe wärst. Löwen rennen mit 80 km/h.
    - Wenn ein mensch asugewählt wurde: antworte als ob du ein mensch wärst. menschen gehen mit 3 bis 4 km/h.
    
    WICHTIG - BILDANALYSE:
    Wenn der Benutzer ein Bild sendet, beschreibe das Bild UND sage wo er sich befindet in EINER zusammenhängenden Antwort.
    Ziehe schlussfolgerungen aud dem bild und den osmr daten. wenn das bild zum beispiel einen Bahnhof zeigt und du anhand der osmr daten weisst in welcher Stadt ich bin. so kombiniere diese informationen zu einer logischen schlussfolgerung.
    Format etwa: "Auf dem Bild sehe ich [Beschreibung]. Du befindest dich in/an [präziser Standort mit Straße und Hausnummer wenn möglich]."
    
    Antworte immer auf Deutsch.`;
    // --- ÄNDERUNG ENDE ---

    messageHistory.messages.unshift({ role: 'system', content: systemPromptContent });

    const greetingMessage = {
      role: 'assistant',
      content: 'Hallo! Ich bin dein Navigationsassistent. Du kannst mir gerne ein aktuelles Bild von deiner Umgebung schicken, ich sage dir wo du bist. Mit dem "Animal"-Button kannst du auswählen, ob du Entfernungen für eine Ameise, einen Vogel, einen Löwen oder einem Menschen berechnen möchtest. Ich speichere außerdem deine Standorte - frag mich einfach, wo du in letzter Zeit warst.',
    };
    messageHistory.messages.push(greetingMessage);
    displayMessage(greetingMessage.role, greetingMessage.content);
    
  } catch (error) {
    console.error("Fehler bei der Standortinitialisierung:", error);
    messageHistory.messages.unshift({
      role: 'system',
      content: "Standort konnte nicht ermittelt werden. Assistent hat keine Standortinformationen.",
    });

    displayMessage('assistant', 'Hallo! Ich bin dein Navigationsassistent, konnte deinen Standort aber leider nicht bestimmen. Wie kann ich dir trotzdem helfen?');
    displayMessage('system-info', `Standortfehler: ${error.message}`, true);
  }
});

















