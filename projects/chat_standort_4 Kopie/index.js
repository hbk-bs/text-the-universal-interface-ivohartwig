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

// NEUE FUNKTION: Direkter Aufruf der OpenStreetMap Nominatim API
async function getDetailedLocationFromNominatim(latitude, longitude) {
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

const messageHistory = {
  messages: [],
};

const llmApiEndpoint = 'https://ivo_hartwig--c31fb78c96d14585a9e4e335972a3732.web.val.run';

document.addEventListener('DOMContentLoaded', async () => {
  const chatHistoryElement = document.querySelector('.chat-history');
  const inputElement = document.querySelector('input[name="content"]');
  const formElement = document.querySelector('form');

  if (!chatHistoryElement || !inputElement || !formElement) {
    console.error("Wichtige DOM-Elemente nicht gefunden!");
    if (chatHistoryElement) {
      chatHistoryElement.innerHTML = "<div class='message error-message'>Fehler: Chat-Interface konnte nicht initialisiert werden.</div>";
    }
    return;
  }

  function displayMessage(role, content, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (isError) {
      messageDiv.classList.add('error-message');
    } else {
      messageDiv.classList.add(role); // 'user', 'assistant', 'system-info'
    }
    messageDiv.textContent = content;
    chatHistoryElement.appendChild(messageDiv);
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  }

  function renderChatHistory() {
    chatHistoryElement.innerHTML = '';
    messageHistory.messages.forEach((msg) => {
      if (msg.role !== 'system') {
        displayMessage(msg.role, msg.content);
      }
    });
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  }

  try {
    const position = await getCurrentPosition();
    // ÄNDERUNG: Aufruf der neuen Funktion
    const detailedPlaceName = await getDetailedLocationFromNominatim(position.latitude, position.longitude);

    const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent. Meine aktuelle Position ist: ${detailedPlaceName} (Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}). Antworte auf Fragen zu meinem Standort, zu Orten in der Nähe oder zu Wegbeschreibungen. Sei hilfsbereit und gib klare Informationen.`;

    messageHistory.messages.unshift({ role: 'system', content: systemPromptContent });

    const greetingMessage = {
      role: 'assistant',
      content: 'Hallo! Ich bin dein Navigationsassistent. Wie kann ich dir heute helfen?',
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

  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = inputElement.value.trim();
    if (!content) return;

    inputElement.value = '';
    messageHistory.messages.push({ role: 'user', content: content });
    renderChatHistory();

    try {
      const response = await fetch(llmApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageHistory),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API Fehler: ${response.status} - ${errorText}`);
      }

      const json = await response.json();
      if (
        json.completion &&
        json.completion.choices &&
        json.completion.choices[0] &&
        json.completion.choices[0].message
      ) {
        const assistantMessage = json.completion.choices[0].message;
        messageHistory.messages.push(assistantMessage);
      } else {
        console.error("Unerwartete Antwortstruktur vom LLM:", json);
        messageHistory.messages.push({
          role: 'assistant',
          content: 'Entschuldigung, ich habe ein Problem mit der Verarbeitung der Antwort.',
        });
      }
    } catch (error) {
      console.error("Fehler bei der Kommunikation mit dem LLM:", error);
      messageHistory.messages.push({
        role: 'assistant',
        content: `Ein Fehler ist aufgetreten: ${error.message}`,
      });
    }
    renderChatHistory();
  });
});



















