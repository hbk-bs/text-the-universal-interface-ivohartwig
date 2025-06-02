import { getDetailedLocationFromNominatim, calculateRouteToDestination } from './osmr-api.js';
import { fileToDataURL } from './generate-data-uri.js';

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

  if (!chatHistoryElement || !inputElement || !formElement || !imgButton || !imageUpload) {
    console.error("Wichtige DOM-Elemente nicht gefunden!");
    if (chatHistoryElement) {
      chatHistoryElement.innerHTML = "<div class='message error-message'>Fehler: Chat-Interface konnte nicht initialisiert werden.</div>";
    }
    return;
  }

  // Globale Variable für die Position des Nutzers hinzufügen
  let userPosition = null;

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
      
      // Add text question to message history without displaying it
      messageHistory.messages.push({
        role: 'assistant',
        content: resultObject.result
      });

      displayMessage('assistant', resultObject.result);

      messageHistory.messages.push({
        role: 'user',
        content: 'sage mir wo ich bin. Ich möchte das du mir die Straße, die Hausnummer und die Stadt mit genauer Postleitzahl sagst. gebe mir nicht meine Koodinaten.'
      });

      console.log("Aktualisierte messageHistory:", messageHistory.messages);
      
      // Get LLM response
      await getLLMResponse();
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
      // messageHistory.messages now contains the correct structure for API
      const apiRequestBody = {
        messages: messageHistory.messages,
        // temperature: 0.7, // You can add other parameters from your backend schema
        // seed: 12345,
      };
  
      const response = await fetch(llmImageApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiRequestBody), // Body now includes structured image messages
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
                    
                    // Füge die Routeninformation zur Antwort hinzu
                    assistantMessage.content += `\n\n${routeInfo}`;
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

    const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent. 
    
    WICHTIG - NUTZERDATEN VON OPENSTREETMAP/OSMR:
    - Aktueller Standort: ${detailedPlaceName}
    - Genaue Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}
    
    Diese OSMR-Daten sind präzise und aktuell. Nutze sie als Grundlage für deine Antworten.
    
    Zur Information: Du hast Zugriff auf OSMR-Routing-Funktionen! Bei Fragen nach Entfernungen oder Fahrtzeiten ergänze ich deine Antwort automatisch mit den genauen OSMR-Daten.
    
    Wenn du ein Bild von mir erhältst, beschreibe kurz was darauf zu sehen ist, und sage mir dann wo ich mich befinde. Antworte immer auf Deutsch.`;

    messageHistory.messages.unshift({ role: 'system', content: systemPromptContent });

    const greetingMessage = {
      role: 'assistant',
      content: 'Hallo! Ich bin dein Navigationsassistent. Du kannst mir gerne ein aktuelles Bild von deiner umgebung schicken, ich sage dir wo du bist :)) ',
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



















