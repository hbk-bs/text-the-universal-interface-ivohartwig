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

// Function to convert image file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

const messageHistory = {
  messages: [],
};

const llmApiEndpoint = 'https://ivo_hartwig--c31fb78c96d14585a9e4e335972a3732.web.val.run';

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

  // Trigger file input when img button is clicked
  imgButton.addEventListener('click', () => {
    imageUpload.click();
  });

  // Handle image upload
  imageUpload.addEventListener('change', async (event) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      try {
        const base64Image = await fileToBase64(file);
        
        // Store the image URL for display purposes
        const imageUrl = base64Image;
        
        // Display the image in the chat without sending to AI
        displayMessageWithImage('user', imageUrl);
        
        // Add the "Wo bin ich?" question to message history for the AI
        // but don't display it in the chat
        const locationQuestion = "Wo bin ich?";
        messageHistory.messages.push({ 
          role: 'user', 
          content: locationQuestion,
          hidden: true // Mark as hidden for rendering logic
        });
        
        // Get LLM response
        await getLLMResponse();
      } catch (error) {
        console.error("Fehler beim Verarbeiten des Bildes:", error);
        displayMessage('system-info', `Bildfehler: ${error.message}`, true);
      }
      
      // Clear the file input for future uploads
      event.target.value = '';
    }
  });

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
  
  function displayMessageWithImage(role, imageUrl) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    
    // Create and add the image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = "Uploaded image";
    messageDiv.appendChild(img);
    
    chatHistoryElement.appendChild(messageDiv);
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
    
    // For existing messages where we're displaying an image, we might want to 
    // store the imageUrl to help with re-rendering later
    const latestMsg = messageHistory.messages[messageHistory.messages.length - 1];
    if (latestMsg && latestMsg.role === role && !latestMsg.imageUrl) {
      latestMsg.imageUrl = imageUrl; // Store the URL to help with re-rendering
    }
  }

  function renderChatHistory() {
    chatHistoryElement.innerHTML = '';
    messageHistory.messages.forEach((msg) => {
      if (msg.role !== 'system' && !msg.hidden) {
        // Only render messages that aren't hidden
        // Check if this is an image message (based on imageUrl property)
        if (msg.imageUrl) {
          // If we have stored an imageUrl property, display as image
          displayMessageWithImage(msg.role, msg.imageUrl);
        } else {
          // Otherwise just display as text
          displayMessage(msg.role, msg.content);
        }
      }
    });
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  }

  async function getLLMResponse() {
    try {
      // Create a filtered copy of message history that excludes any message with imageUrl
      // This prevents API errors from messages without content property
      const apiMessageHistory = {
        messages: messageHistory.messages.filter(msg => !msg.imageUrl)
      };
      
      const response = await fetch(llmApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiMessageHistory),
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
        
        // Just append the new message directly instead of re-rendering everything
        displayMessage(assistantMessage.role, assistantMessage.content);
      } else {
        console.error("Unerwartete Antwortstruktur vom LLM:", json);
        const errorMessage = {
          role: 'assistant',
          content: 'Entschuldigung, ich habe ein Problem mit der Verarbeitung der Antwort.'
        };
        messageHistory.messages.push(errorMessage);
        
        // Just append the error message
        displayMessage(errorMessage.role, errorMessage.content);
      }
    } catch (error) {
      console.error("Fehler bei der Kommunikation mit dem LLM:", error);
      const errorMessage = {
        role: 'assistant',
        content: `Ein Fehler ist aufgetreten: ${error.message}`
      };
      messageHistory.messages.push(errorMessage);
      
      // Just append the error message
      displayMessage(errorMessage.role, errorMessage.content);
    }
    // Remove the renderChatHistory call
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
    // ÄNDERUNG: Aufruf der neuen Funktion
    const detailedPlaceName = await getDetailedLocationFromNominatim(position.latitude, position.longitude);

    const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent. Meine aktuelle Position ist: ${detailedPlaceName} (Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}). Antworte auf Fragen zu meinem Standort, zu Orten in der Nähe oder zu Wegbeschreibungen. Sei hilfsbereit und gib klare Informationen. Du kannst auch hochgeladene Bilder analysieren und bei Erkennungsaufgaben helfen.`;

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



















