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
    // THIS IS IMPORTANT
    // the content is not a string anymore
    // we send a specific object that contains the image data url
    content: [
      {
        type: 'image_url',
        image_url: {
          url: '' // this will be filled with the base64 data URL of the image,
        },
      },
    ],
  },
]
}

//imageApiPrompt.messages.at(-1).content.at(0).image_url.url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8//8/AwAI/wH+9Q4AAAAASUVORK5CYII='; // Example base64 image data URL

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

  // Globale Variable für die Position des Nutzers hinzufügen
  let userPosition = null;
  // Global variable for the selected animal
  let selectedAnimal = null;
  
  // Animal speeds in km/h
  const animalSpeeds = {
    ant: 0.3,     // 0.3 km/h
    bird: 80,     // 80 km/h (average flying speed)
    lion: 80,     // 80 km/h (max running speed)
    mensch: 4,    // 4 km/h (walking speed)
    default: 60   // default car speed
  };

  // Animal travel descriptions
  const animalTravelDescriptions = {
    ant: "krabbelt",
    bird: "fliegt",
    lion: "rennt",
    mensch: "geht",
    default: "fährt"
  };

  // Toggle animal selector visibility
  animalButton.addEventListener('click', () => {
    const isVisible = animalSelector.style.display !== 'none';
    animalSelector.style.display = isVisible ? 'none' : 'flex';
  });

  // Handle animal selection
  animalOptions.forEach(option => {
    option.addEventListener('click', () => {
      const animal = option.getAttribute('data-animal');
      
      // Remove selected class from all options
      animalOptions.forEach(opt => opt.classList.remove('selected'));
      
      // Add selected class to clicked option
      option.classList.add('selected');
      
      // Set the selected animal
      selectedAnimal = animal;
      
      // Hide the selector after selection
      animalSelector.style.display = 'none';
      
      // Display a message about the selected animal
      const animalEmojis = {
        ant: '🐜',
        bird: '🐦',
        lion: '🦁',
        mensch: '🚶',
      };
      
      const emoji = animalEmojis[animal] || '🚶';
      const animalName = option.textContent;
      
      // Show a system message about the selected animal
      displayMessage('system-info', `${emoji} Du berechnest jetzt Routen als ${animalName}!`);
      
      // Update the animal button to show the current selection
      animalButton.textContent = `${emoji} ${animalName}`;
      
      // Add a message to inform the AI about the animal selection
      messageHistory.messages.push({
        role: 'system',
        content: `Der Benutzer hat jetzt das Tier "${animalName}" (${emoji}) ausgewählt. Bitte berücksichtige in deinen Antworten, dass Entfernungen nun aus der Perspektive ${animalName === 'Mensch' ? 'eines Menschen' : `einer ${animalName}`} betrachtet werden.`
      });
      
      // Provide feedback to the user via assistant message
      const animalSelectionMessage = {
        role: 'assistant',
        content: `Ich werde jetzt Routen und Entfernungen für ${animalName === 'Mensch' ? 'einen' : 'eine'} ${animalName} berechnen! ${emoji}`
      };
      messageHistory.messages.push(animalSelectionMessage);
      displayMessage('assistant', animalSelectionMessage.content);
    });
  });

  async function processImageDataURL(dataURL) {
    // Create an image element for display
    const imageElement = document.createElement('img');
    imageElement.src = dataURL;
    imageElement.alt = "Captured image";
    imageElement.style.maxWidth = '100%';
    imageElement.style.maxHeight = '250px';
    
    // Create a user message div
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');
    messageDiv.appendChild(imageElement);
    chatHistoryElement.appendChild(messageDiv);
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
    
    // Update the image URL in the prompt
    imageApiPrompt.messages.at(-1).content.at(0).image_url.url = dataURL;

    try {
      const imageResponse = await fetch(llmImageApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageApiPrompt),
      });

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        console.error("Fehler beim Abrufen der Bildantwort:", imageResponse.status, errorText);
        throw new Error(`LLM API Fehler: ${imageResponse.status} - ${errorText.substring(0, 100)}...`);
      }

      console.log("Bildantwort erfolgreich empfangen");
      const imageJson = await imageResponse.json();
      console.log("Bildantwort JSON:", imageJson);

      const resultString = imageJson.completion.choices[0].message.content;
      const resultObject = JSON.parse(resultString);
      console.log("Ergebnisobjekt:", resultObject);
      
      // Instead of pushing the image description to messageHistory and displaying it,
      // we'll use it as context for a combined response
      const imageDescription = resultObject.result;
      
      // Add a user message requesting both image description and location in one response
      messageHistory.messages.push({
        role: 'user',
        content: 'Beschreibe dieses Bild und sage mir gleichzeitig, wo ich bin. Ich möchte eine einzige zusammenhängende Antwort mit der Bildbeschreibung und den Standortinformationen (Straße, Hausnummer, Stadt und PLZ).'
      });
      
      // Add image description as system context
      messageHistory.messages.push({
        role: 'system',
        content: `Bildbeschreibung zur Verwendung in deiner Antwort: "${imageDescription}". Bitte erstelle eine einzige, zusammenhängende Antwort, die sowohl die Beschreibung des Bildes als auch die Standortinformation enthält.`
      });

      console.log("Aktualisierte messageHistory:", messageHistory.messages);
      
      // Get LLM response that will combine both pieces of information
      await getLLMResponse();
      
      // Try to extract location from the assistant's last message for saving to history
      const lastAssistantMsg = messageHistory.messages.filter(msg => msg.role === 'assistant').pop();
      if (lastAssistantMsg && lastAssistantMsg.content) {
        // Extract location using regex patterns (looking for "Du befindest dich in/an/bei...")
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

  // Trigger file input when img button is clicked
  imgButton.addEventListener('click', () => {
    imageUpload.click();
  });

  // Handle image upload
  imageUpload.addEventListener('change', async (event) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      try {
        // Convert file to base64
        const base64Image =  await fileToDataURL(file)
        processImageDataURL(base64Image);
        
        // Clear the file input for future uploads
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
    messageDiv.classList.add('message', role); // e.g. 'user', 'assistant'
    if (isError) {
      messageDiv.classList.add('error-message');
    }
  
    if (Array.isArray(messageContent)) { // Multi-part content (e.g., text and image)
      messageContent.forEach(part => {
        if (part.type === "text") {
          const p = document.createElement('p');
          p.textContent = part.text;
          messageDiv.appendChild(p);
        } else if (part.type === "image_url" && part.image_url && part.image_url.url) {
          const img = document.createElement('img');
          img.src = part.image_url.url; // This will be the base64 data URI
          img.alt = (role === 'user') ? "Hochgeladenes Bild" : "Bild vom Assistenten";
          // Optional: Add styling for the image, e.g., max-width
          img.style.maxWidth = '100%';
          img.style.maxHeight = '300px'; // Adjust as needed
          img.style.borderRadius = '5px';
          img.style.marginTop = '5px';
          messageDiv.appendChild(img);
        }
      });
    } else if (typeof messageContent === 'string') { // Simple text content
      messageDiv.textContent = messageContent;
    } else if (messageContent === null || messageContent === undefined) {
      // Handle cases where content might be unexpectedly null/undefined to prevent errors
      messageDiv.textContent = isError ? "Fehler: Inhalt nicht verfügbar" : "";
    }
  
    chatHistoryElement.appendChild(messageDiv);
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  }

  async function getLLMResponse() {
    try {
      // Add the current animal context to each request if an animal is selected
      let apiRequestBody = {
        messages: [...messageHistory.messages]
      };
      
      // If an animal is selected, ensure the AI knows about it by adding context
      if (selectedAnimal) {
        const animalName = document.querySelector(`.animal-option[data-animal="${selectedAnimal}"]`).textContent;
        const animalVerb = animalTravelDescriptions[selectedAnimal];
        
        // Add temporary context message at the end to ensure the AI has the latest animal info
        const tempAnimalContext = {
          role: 'system',
          content: `WICHTIG: Aktuelle Tierauswahl ist ${animalName}. Bei Fragen nach Entfernungen oder Fahrtzeiten berücksichtige, dass eine ${animalName} ${animalVerb} und nicht fährt.`
        };
        apiRequestBody.messages = [...apiRequestBody.messages, tempAnimalContext];
      }
  
      const response = await fetch(llmImageApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiRequestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        // It's good to display the error in the chat
        const errorForChat = `LLM API Fehler: ${response.status} - ${errorText.substring(0,100)}...`;
        displayMessage('assistant', errorForChat, true);
        throw new Error(errorForChat);
      }
  
      const json = await response.json();
      if (
        json.completion &&
        json.completion.choices &&
        json.completion.choices[0] &&
        json.completion.choices[0].message
      ) {
        const assistantMessage = json.completion.choices[0].message;
        
        // Check if user is asking about location history
        const lastUserMessage = messageHistory.messages.find(msg => 
          msg.role === 'user' && typeof msg.content === 'string');
          
        if (lastUserMessage) {
          const userQuery = lastUserMessage.content.toLowerCase();
          const historyKeywords = [
            'wo war ich', 'frühere standorte', 'standortverlauf', 'meine orte', 
            'bisherige orte', 'letzte orte', 'standorthistorie', 'wo ich war',
            'standort historie', 'besuchte orte', 'vorherige standorte', 'orte',
            'letzte tage', 'letzte wochen', 'letzte stunde'
          ];
          
          if (historyKeywords.some(keyword => userQuery.includes(keyword))) {
            // Get location history and add it to the message
            const formattedHistory = locationHistory.getFormattedHistory();
            assistantMessage.content += `\n\n${formattedHistory}`;
          }
        }
        
        // Prüfen auf Routenanfragen und Entfernungsfragen
        if (userPosition) {
          try {
            const lastUserMessage = messageHistory.messages.find(msg => 
              msg.role === 'user' && typeof msg.content === 'string');

            if (lastUserMessage) {
              const userQuery = lastUserMessage.content.toLowerCase();
              console.log("Prüfe Anfrage auf Routeninformationen:", userQuery);
              
              // Verbesserte Erkennung von Routenanfragen
              const routeKeywords = ['wie weit', 'wie lange', 'entfernung', 'distanz', 'route', 
                                  'weg', 'fahrt', 'fahren', 'komme ich'];
              const hasRouteKeyword = routeKeywords.some(keyword => userQuery.includes(keyword));
                            
              const prepositions = ['nach', 'zu', 'bis', 'in'];
              const hasPreposition = prepositions.some(prep => userQuery.includes(prep + ' '));
              
              if (hasRouteKeyword && hasPreposition) {
                console.log("Routenanfrage erkannt!");
                
                // Verbesserte Destination-Extraktion
                let destination = '';
                
                // Suche erst nach der Präposition und nehme den Rest des Satzes
                for (const prep of prepositions) {
                  if (userQuery.includes(' ' + prep + ' ')) {
                    const parts = userQuery.split(' ' + prep + ' ');
                    if (parts.length > 1) {
                      // Nehme alles nach der Präposition bis zum nächsten Satzende oder Fragezeichen
                      let rawDestination = parts[1].split(/[?.!]|von|und|oder/)[0].trim();
                      
                      // Bereinige häufige Füllwörter am Ende
                      rawDestination = rawDestination.replace(/\s+(jetzt|dann|heute|morgen|schnell|bald)$/i, '');
                      
                      destination = rawDestination;
                      console.log(`Extrahiertes Ziel nach "${prep}":`, destination);
                      break;
                    }
                  }
                }
                
                // Wenn keine Extraktion funktioniert hat, versuche es mit dem KI-Output
                if (!destination) {
                  // Extrahiere mögliche Orte aus der KI-Antwort
                  const possiblePlaces = assistantMessage.content.match(/(?:nach|zu|in|bis)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)/g);
                  if (possiblePlaces && possiblePlaces.length > 0) {
                    // Entferne die Präposition
                    destination = possiblePlaces[0].replace(/^(?:nach|zu|in|bis)\s+/, '').trim();
                    console.log("Aus KI-Antwort extrahiertes Ziel:", destination);
                  }
                }
                
                if (destination) {
                  console.log("Berechne Route nach:", destination);
                  try {
                    // Berechne die Route
                    const routeInfo = await calculateRouteToDestination(
                      userPosition.latitude, 
                      userPosition.longitude,
                      destination
                    );
                    
                    console.log("Routeninformation erhalten:", routeInfo);
                    
                    // Modifiziere die Routeninformation basierend auf dem ausgewählten Tier
                    let modifiedRouteInfo = routeInfo;
                    
                    if (selectedAnimal) {
                      // Parse die Routeninformation
                      const distanceMatch = routeInfo.match(/Die Entfernung beträgt ([\d,\.]+) km/);
                      if (distanceMatch && distanceMatch[1]) {
                        const distance = parseFloat(distanceMatch[1].replace(',', '.'));
                        const animalSpeed = animalSpeeds[selectedAnimal] || animalSpeeds.default;
                        const animalVerb = animalTravelDescriptions[selectedAnimal] || animalTravelDescriptions.default;
                        
                        // Berechne die Zeit basierend auf der Tiergeschwindigkeit
                        const timeInHours = distance / animalSpeed;
                        let timeDescription;
                        
                        if (timeInHours < 1) {
                          const timeInMinutes = Math.round(timeInHours * 60);
                          timeDescription = `etwa ${timeInMinutes} Minute${timeInMinutes !== 1 ? 'n' : ''}`;
                        } else if (timeInHours < 24) {
                          const hours = Math.floor(timeInHours);
                          const minutes = Math.round((timeInHours - hours) * 60);
                          timeDescription = `etwa ${hours} Stunde${hours !== 1 ? 'n' : ''}`;
                          if (minutes > 0) {
                            timeDescription += ` und ${minutes} Minute${minutes !== 1 ? 'n' : ''}`;
                          }
                        } else {
                          const days = Math.floor(timeInHours / 24);
                          const remainingHours = Math.floor(timeInHours % 24);
                          timeDescription = `etwa ${days} Tag${days !== 1 ? 'e' : ''}`;
                          if (remainingHours > 0) {
                            timeDescription += ` und ${remainingHours} Stunde${remainingHours !== 1 ? 'n' : ''}`;
                          }
                        }
                        
                        // Emoji für das Tier
                        const animalEmojis = {
                          ant: '🐜',
                          bird: '🐦',
                          lion: '🦁',
                          default: '🚗'
                        };
                        
                        modifiedRouteInfo = `${emoji} Route als ${document.querySelector(`.animal-option[data-animal="${selectedAnimal}"]`).textContent} nach ${destination}:\n` +
                                        `Die Entfernung beträgt ${distance.toFixed(1)} km.\n` +
                                        `Eine ${document.querySelector(`.animal-option[data-animal="${selectedAnimal}"]`).textContent} ${animalVerb} diese Strecke in ${timeDescription}.`;
                      }
                    }
                    
                    // Füge die Routeninformation zur Antwort hinzu
                    assistantMessage.content += `\n\n${modifiedRouteInfo}`;
                  } catch (routeError) {
                    console.error("Fehler bei Routenberechnung:", routeError);
                    assistantMessage.content += `\n\nEntschuldigung, ich konnte keine genaue Route berechnen. Fehler: ${routeError.message}`;
                  }
                } else {
                  console.log("Kein Ziel extrahiert");
                  assistantMessage.content += "\n\nIch konnte leider keinen genauen Zielort aus deiner Anfrage erkennen. Kannst du bitte den Ortsnamen deutlicher angeben?";
                }
              }
            }
          } catch (error) {
            console.error("Fehler bei der Routenverarbeitung:", error);
            // Kein Abbruch des gesamten Prozesses bei Fehlern in der Routenberechnung
          }
        }
        
        messageHistory.messages.push(assistantMessage);
        displayMessage(assistantMessage.role, assistantMessage.content);
      } else {
        console.error("Unerwartete Antwortstruktur vom LLM:", json);
        const errorMessageContent = 'Entschuldigung, ich habe ein Problem mit der Verarbeitung der Antwort.';
        messageHistory.messages.push({ role: 'assistant', content: errorMessageContent });
        displayMessage('assistant', errorMessageContent, true);
      }
    } catch (error) {
      console.error("Fehler bei der Kommunikation mit dem LLM:", error);
      // Ensure this error is also displayed in the chat
      if (!error.message.startsWith("LLM API Fehler")) { // Avoid double display if already handled
        const errorMessageContent = `Ein Fehler ist aufgetreten: ${error.message}`;
        messageHistory.messages.push({ role: 'assistant', content: errorMessageContent });
        displayMessage('assistant', errorMessageContent, true);
      }
    }
  }

  // Update form submission to not re-render everything
  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = inputElement.value.trim();
    if (!content) return;

    inputElement.value = '';
    messageHistory.messages.push({ role: 'user', content: content });
    
    // Just append the new user message
    displayMessage('user', content);
    
    await getLLMResponse();
  });

  try {
    const position = await getCurrentPosition();
    userPosition = position; // Position für später speichern
    
    console.log("Aktuelle Position erhalten:", userPosition);
    
    const detailedPlaceName = await getDetailedLocationFromNominatim(position.latitude, position.longitude);
    console.log("Detaillierter Standort:", detailedPlaceName);
    
    // Save the current location to history
    locationHistory.saveLocation(detailedPlaceName, {
      latitude: position.latitude,
      longitude: position.longitude
    });

    const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent. 
    
    WICHTIG - NUTZERDATEN VON OPENSTREETMAP/OSMR:
    - Aktueller Standort: ${detailedPlaceName}
    - Genaue Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}
    
    Diese OSMR-Daten sind präzise und aktuell. Nutze sie als Grundlage für deine Antworten.
    
    WICHTIG - STANDORTHISTORIE:
    Ich speichere alle Standorte, an denen ich mich befinde, in einer Historie. Diese Historie kann ich abrufen, wenn der Nutzer mich danach fragt (z.B. "Wo war ich in letzter Zeit?"). Wenn er danach fragt, füge ich eine Liste der letzten Standorte hinzu.
    
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






















