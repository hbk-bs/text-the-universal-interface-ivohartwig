# THE UNIVERSAL INTERFACE




## *TASK*
This project explores the creation of a speculative, beautiful, and meaningful web-based experience that interacts with users through a Large Language Model (LLM). Users provide inputs—text, images, location, or other data—which the model transforms into unexpected and poetic responses. In the first phase, different LLMs are explored, small prototypes are built, and prompt engineering techniques are practiced. The second phase focuses on developing the core concept and interaction flow. Finally, the project is refined visually, tested with real users, and polished into a playful, thoughtful digital experience.


## *WHAT IS A LLM?*
An LLM (Large Language Model) is an advanced AI system trained on large-scale text data using the Transformer architecture, which allows it to process and generate human-like language. It works by analyzing the context of a given input and predicting the most likely next word or sequence of words. Through this process, it can generate coherent text, answer questions, translate languages, and more. While it captures complex patterns and relationships in language, it does not possess real understanding or consciousness.

## *WHAT IS AN API?*
An API (Application Programming Interface) is a standardized interface that allows different software systems to communicate with each other. In my case, the API is used to retrieve information from OpenStreetMap and present it in a format that the LLM can understand — such as address data or geographical distances.


## *IDEA* 
My original idea was to develop a chat interface with a Large Language Model (LLM) that could assist me with location and navigation questions. To make this possible, I needed to transmit my current location to the model. However, I quickly realized that an LLM can't do much with raw coordinates, like those retrieved from a browser. It lacks direct access to external maps or geodata services that would allow it to translate this information into understandable text.
To solve this, I integrated an interface to the OpenStreetMap API for what is known as "reverse geocoding." In this process, the coordinates are sent to OpenStreetMap, and the API converts them into readable addresses or location descriptions. These details are then provided to the LLM in advance.
Additionally, I implemented another API that gives the model access to map data. This allows the chat interface to answer questions about distances and directions — for example, "How do I get to a specific place?"
To make the project more engaging and entertaining, I also added a feature that lets users choose their mode of transportation — for instance, as a human, a bird, or even an ant. This way, users can playfully explore how long a route would take depending on their form of movement.



### [NAVIGATION CHAT](https://hbk-bs.github.io/text-the-universal-interface-ivohartwig/projects/chat_standort_7.3_handy_osmr_animal_2_loca.2/)

