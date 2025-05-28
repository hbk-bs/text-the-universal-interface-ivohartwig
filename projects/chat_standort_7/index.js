import {getDetailedLocationFromNominatim } from './osm-api.js';
import { fileToDataURL } from './generate-data-uri.js';

const llmImageApiEndpoint = 'https://ivo-openai-api-images.val.run/';
const apiEndpoint = 'https://ivo-openai-api.val.run/';



const imageApiPrompt = {
  response_format: {type: 'json_object'},
  messages:[{
    role: 'system',
    content: 'Du bist ein freundlicher und präziser Navigationsassistent. Du bekommst ein Bild von mir, beschreibe was du auf diesem bild siehst. Sage mir anhand deiner Beschreibung wo sich dieses Bild aufgenommen wurde. only respond in JSON {result: string}'
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



// // Function to convert image file to base64
// function fileToBase64(file) {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.readAsDataURL(file);
//     reader.onload = () => resolve(reader.result);
//     reader.onerror = error => reject(error);
//   });
// }




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
        // Convert file to base64
        const base64Image =  await fileToDataURL(file)
        
        // Create an image element for display
        const imageElement = document.createElement('img');
        imageElement.src = base64Image;
        imageElement.alt = "Uploaded image";
        imageElement.style.maxWidth = '100%';
        imageElement.style.maxHeight = '250px';
        
        // Create a user message div
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'user');
        messageDiv.appendChild(imageElement);
        chatHistoryElement.appendChild(messageDiv);
        chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
        

        imageApiPrompt.messages.at(-1).content.at(0).image_url.url = base64Image; // Update the image URL in the prompt

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

        displayMessage('assistant', resultObject.result);  // <--- NEU


        messageHistory.messages.push({
          role: 'user',
          content: 'tell me where I am'
        });

        console.log("Aktualisierte messageHistory:", messageHistory.messages);
        
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

  // Helper function to display message with image
  // function displayMessageWithImage(role, imageUrl) {
  //   const messageDiv = document.createElement('div');
  //   messageDiv.classList.add('message', role);
    
  //   // Create and add the image
  //   const img = document.createElement('img');
  //   img.src = imageUrl;
  //   img.alt = "Bild";
  //   img.style.maxWidth = '100%';
  //   img.style.maxHeight = '250px';
    
  //   messageDiv.appendChild(img);
  //   chatHistoryElement.appendChild(messageDiv);
  //   chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  // }

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

  // function renderChatHistory() {
  //   chatHistoryElement.innerHTML = ''; // Clear existing messages
  //   messageHistory.messages.forEach((msg) => {
  //     if (msg.role !== 'system' && !msg.hidden) {
  //       displayMessage(msg.role, msg.content); // msg.content is now string or array
  //     }
  //   });
  //   chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  // }

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
        messageHistory.messages.push(assistantMessage);
        displayMessage(assistantMessage.role, assistantMessage.content); // Display assistant's response
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
    // ÄNDERUNG: Aufruf der neuen Funktion
    const detailedPlaceName = await getDetailedLocationFromNominatim(position.latitude, position.longitude);

    // Verbesserter System-Prompt mit ausführlichen OpenStreetMap-Daten
    const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent. 
    
    WICHTIG - NUTZERDATEN VON OPENSTREETMAP:
    - Aktueller Standort: ${detailedPlaceName}
    - Genaue Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}
    
    Nutze diese OpenStreetMap-Daten für sämtliche Standortanfragen. Antworte auf Fragen zu meinem Standort, zu Orten in der Nähe oder zu Wegbeschreibungen. Sei hilfsbereit und gib klare Informationen. Wenn ich dir ausserdem ein bild schicke möchte ich das du vermutungen anstellst wo das sein könnte. Beschreibe zudem was du in diesem bild siehst`;

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



















