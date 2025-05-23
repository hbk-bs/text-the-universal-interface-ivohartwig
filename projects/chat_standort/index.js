//@ts-check
// [x]. get the content from the input element
// [x]. send the content to the val town endpoint using fetch POST request
// [x]. await the response
// [x]. get the json from the response
// [x]. Add the user message to the .chat-history

// How to control the behaviour of the chat bot?

// Bonus:
// What happens if the context gets to long?
// What happens if the chat-history window get s to full (scolling)

async function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err)
    );
  });
}

const messageHistory = {
    // messages: [{role: user | assistant | system; content: string}]
    messages: [
      {
        role: 'system',
        content:
          '', // This is the initial empty content
      },
    ],
  };
  
  const apiEndpoint = 'https://ivo_hartwig--c31fb78c96d14585a9e4e335972a3732.web.val.run';
  
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const position = await getCurrentPosition();
      const locationString = `Current location: Latitude ${position.latitude}, Longitude ${position.longitude}.`;
      // This is where the content is updated:
      if (messageHistory.messages[0] && messageHistory.messages[0].role === 'system') {
        messageHistory.messages[0].content = locationString; 
      } else {
        // Fallback if the system message isn't the first one or doesn't exist
        messageHistory.messages.unshift({ role: 'system', content: locationString });
      }
    } catch (error) {
      console.error("Error getting location:", error);
      // Optionally inform the user or set a default system message
      if (messageHistory.messages[0] && messageHistory.messages[0].role === 'system') {
        messageHistory.messages[0].content = "Could not retrieve location.";
      } else {
        messageHistory.messages.unshift({ role: 'system', content: "Could not retrieve location." });
      }
    }

    // get the history element
    const chatHistoryElement = document.querySelector('.chat-history');
    const inputElement = document.querySelector('input');
    const formElement = document.querySelector('form');
    // check if the elements exists in the DOM
    if (!chatHistoryElement) {
      throw new Error('Could not find element .chat-history');
    }
    if (!formElement) {
      throw new Error('Form element does not exists');
    }
    if (!inputElement) {
      throw new Error('Could not find input element');
    }
    // run a function when the user hits send
    formElement.addEventListener('submit', async (event) => {
      event.preventDefault(); // dont reload the page
  
      const formData = new FormData(formElement);
      const content = formData.get('content');
      if (!content) {
        throw new Error("Could not get 'content' from form");
      }
      //@ts-ignore
      messageHistory.messages.push({ role: 'user', content: content });
      chatHistoryElement.innerHTML = addToChatHistoryElement(messageHistory);
      inputElement.value = '';
  
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(messageHistory),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
  
      const json = await response.json();
      console.log(json);
      // @ts-ignore
      messageHistory.messages.push(json.completion.choices[0].message);
      chatHistoryElement.innerHTML = addToChatHistoryElement(messageHistory);
    });
  });
  
  function addToChatHistoryElement(mhistory) {
    const htmlStrings = mhistory.messages.map((message) => {
      return message.role === 'system'
        ? ''
        : `<div class="message ${message.role}">${message.content}</div>`;
    });
    return htmlStrings.join('');
  }



























