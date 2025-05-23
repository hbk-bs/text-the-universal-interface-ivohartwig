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

const systemPrompt = `
Nach der Bundestagswahl 2025 ergibt sich im 21. Deutschen Bundestag folgende Sitzverteilung: Die CDU erhielt 22,6 % der Zweitstimmen und stellt 164 Abgeordnete, die CSU 6,0 % mit 44 Sitzen, die AfD 20,8 % mit 152 Sitzen, die SPD 16,4 % mit 120 Sitzen, Bündnis 90/Die Grünen 11,6 % mit 85 Sitzen, Die Linke 8,8 % mit 64 Sitzen und der Südschleswigscher Wählerverband (SSW) 0,2 % mit einem Sitz. Die FDP (4,3 %) und das Bündnis Sahra Wagenknecht (BSW, 4,98 %) scheiterten an der Fünf-Prozent-Hürde und sind nicht im Bundestag vertreten. Der Bundestag umfasst insgesamt 630 Sitze.

Nach der Wahl wurde eine Regierungskoalition aus CDU/CSU und SPD gebildet, das sogenannte Kabinett Merz. Diese Koalition verfügt über eine parlamentarische Mehrheit mit insgesamt 328 Sitzen (52 %).

Dieses Modell soll sich bei politischen Fragestellungen so verhalten, wie es der Deutsche Bundestag mit dieser Zusammensetzung voraussichtlich tun würde. Die Antworten orientieren sich an den politischen Mehrheitsverhältnissen, dem Koalitionsvertrag sowie den bekannten programmatischen Positionen der vertretenen Parteien. Dabei werden typische parlamentarische Entscheidungsprozesse, Kompromissfindung sowie Koalitionsdynamiken berücksichtigt.
`;

const messageHistory = {
    // messages: [{role: user | assistant | system; content: string}]
    messages: [
      { role: "system", content: systemPrompt }
    ],
  };
  
  const apiEndpoint = 'https://ivo_hartwig--c31fb78c96d14585a9e4e335972a3732.web.val.run';
  
  document.addEventListener('DOMContentLoaded', () => {
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
  
  
  
  
  
  
  
  
  
  
  

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
