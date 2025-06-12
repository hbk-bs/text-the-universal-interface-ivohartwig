//@ts-check
import {
	getDetailedLocationFromNominatim,
	calculateRouteToDestination,
} from './osmr-api.js';
import { fileToDataURL } from './generate-data-uri.js';
import { locationHistory } from './location-history.js';
import { getCurrentPosition } from './get-current-poistion.js';

// Add location history management
// This is a separate module that doesn't modify any existing code

const llmImageApiEndpoint = 'https://ivo-openai-api-images.val.run/';
const apiEndpoint = 'https://ivo-openai-api.val.run/';

const imageApiPrompt = {
	response_format: { type: 'json_object' },
	messages: [
		{
			role: 'system',
			content:
				'Du bist ein freundlicher und präziser Navigationsassistent. only respond in JSON {result: string}. Antworte immer auf deutsch.',
		},
		{
			role: 'user',
			content: [
				{
					type: 'image_url',
					image_url: {
						url: '',
					},
				},
			],
		},
	],
};

/** @type {{messages: {role: string, content: string}[]}} */
const messageHistory = {
	messages: [],
};

document.addEventListener('DOMContentLoaded', async () => {
	const chatHistoryElement = document.querySelector('.chat-history');
	const inputElement = document.querySelector('input[name="content"]');
	const formElement = document.querySelector('form');
	const imgButton = document.getElementById('img-button');
	const imageUpload = document.getElementById('image-upload');
	const animalButton = document.getElementById('animal-button');
	const animalSelector = document.querySelector('.animal-selector');
	const animalOptions = document.querySelectorAll('.animal-option');
	const clearHistoryButton = document.getElementById('clear-history-button');

	if (
		!chatHistoryElement ||
		!inputElement ||
		!formElement ||
		!imgButton ||
		!imageUpload ||
		!animalButton ||
		!animalSelector ||
		!animalOptions ||
		!clearHistoryButton
	) {
		console.error('Wichtige DOM-Elemente nicht gefunden!');
		if (chatHistoryElement) {
			chatHistoryElement.innerHTML =
				"<div class='message error-message'>Fehler: Chat-Interface konnte nicht initialisiert werden.</div>";
		}
		return;
	}

	if (!(animalSelector instanceof HTMLElement)) {
		console.error('animalSelector nicht gefunden!');
		return;
	}

	let userPosition = null;
	let selectedAnimal = null;

	const animalSpeeds = {
		ant: 0.3,
		bird: 80,
		lion: 80,
		mensch: 4,
		default: 60,
	};

	const animalTravelDescriptions = {
		ant: 'krabbelt',
		bird: 'fliegt',
		lion: 'rennt',
		mensch: 'geht',
		default: 'fährt',
	};

	animalButton.addEventListener('click', () => {
		const isVisible = animalSelector.style.display !== 'none';
		animalSelector.style.display = isVisible ? 'none' : 'flex';
	});

	animalOptions.forEach((option) => {
		option.addEventListener('click', () => {
			const animal = option.getAttribute('data-animal');
			animalOptions.forEach((opt) => opt.classList.remove('selected'));
			option.classList.add('selected');
			selectedAnimal = animal;
			animalSelector.style.display = 'none';
			const animalEmojis = { ant: '🐜', bird: '🐦', lion: '🦁', mensch: '🚶' };
			const emoji = animalEmojis[animal] || '🚶';
			const animalName = option.textContent;
			displayMessage(
				'system-info',
				`${emoji} Du berechnest jetzt Routen als ${animalName}!`,
				chatHistoryElement,
			);
			animalButton.textContent = `${emoji} ${animalName}`;
			messageHistory.messages.push({
				role: 'system',
				content: `Der Benutzer hat jetzt das Tier "${animalName}" (${emoji}) ausgewählt. Bitte berücksichtige in deinen Antworten, dass Entfernungen nun aus der Perspektive ${
					animalName === 'Mensch' ? 'eines Menschen' : `einer ${animalName}`
				} betrachtet werden.`,
			});
			const animalSelectionMessage = {
				role: 'assistant',
				content: `Ich werde jetzt Routen und Entfernungen für ${
					animalName === 'Mensch' ? 'einen' : 'eine'
				} ${animalName} berechnen! ${emoji}`,
			};
			messageHistory.messages.push(animalSelectionMessage);
			displayMessage(
				'assistant',
				animalSelectionMessage.content,
				chatHistoryElement,
			);
		});
	});

	async function processImageDataURL(
		dataURL,
		chatHistoryElement,
		imageApiPrompt,
	) {
		const imageElement = document.createElement('img');
		imageElement.src = dataURL;
		imageElement.alt = 'Captured image';
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
				throw new Error(
					`LLM API Fehler: ${imageResponse.status} - ${errorText.substring(
						0,
						100,
					)}...`,
				);
			}

			const imageJson = await imageResponse.json();
			const resultString = imageJson.completion.choices[0].message.content;
			const resultObject = JSON.parse(resultString);
			const imageDescription = resultObject.result;

			messageHistory.messages.push({
				role: 'user',
				content:
					'Beschreibe dieses Bild und sage mir gleichzeitig, wo ich bin. Ich möchte eine einzige zusammenhängende Antwort mit der Bildbeschreibung und den Standortinformationen (Straße, Hausnummer, Stadt und PLZ).',
			});

			messageHistory.messages.push({
				role: 'system',
				content: `Bildbeschreibung zur Verwendung in deiner Antwort: "${imageDescription}". Bitte erstelle eine einzige, zusammenhängende Antwort, die sowohl die Beschreibung des Bildes als auch die Standortinformation enthält.`,
			});

			await getLLMResponse();

			const lastAssistantMsg = messageHistory.messages
				.filter((msg) => msg.role === 'assistant')
				.pop();
			if (lastAssistantMsg && lastAssistantMsg.content) {
				const locationMatches = lastAssistantMsg.content.match(
					/befindest dich (?:in|an|bei|auf) ([^\.]+)/i,
				);
				if (locationMatches && locationMatches[1]) {
					const extractedLocation = locationMatches[1].trim();
					locationHistory.saveLocation(extractedLocation, userPosition);
				}
			}
		} catch (error) {
			console.error('Fehler beim Verarbeiten des Bildes:', error);
			displayMessage(
				'system-info',
				`Bildfehler: ${error.message}`,
				chatHistoryElement,
				true,
			);
		}
	}

	imgButton.addEventListener('click', () => imageUpload.click());

	imageUpload.addEventListener('change', async (event) => {
		if (
			event.target instanceof HTMLInputElement &&
			event.target.files &&
			event.target.files[0]
		) {
			const file = event.target.files[0];
			try {
				const base64Image = await fileToDataURL(file);
				processImageDataURL(base64Image, chatHistoryElement, imageApiPrompt);
				event.target.value = '';
			} catch (error) {
				console.error('Fehler beim Verarbeiten des Bildes:', error);
				displayMessage(
					'system-info',
					`Bildfehler: ${error.message}`,
					chatHistoryElement,
					true,
				);
				event.target.value = '';
			}
		}
	});

	clearHistoryButton.addEventListener('click', () => {
		if (
			confirm('Möchtest du wirklich deinen gesamten Standortverlauf löschen?')
		) {
			const success = locationHistory.clearHistory();

			if (success) {
				displayMessage(
					'system-info',
					'✓ Dein Standortverlauf wurde erfolgreich gelöscht!',
					chatHistoryElement,
					false,
					true,
				);

				messageHistory.messages.push({
					role: 'system',
					content:
						'Der Benutzer hat soeben seinen Standortverlauf gelöscht. Falls er nach seinem Verlauf fragt, informiere ihn, dass dieser gelöscht wurde und noch keine neuen Einträge vorhanden sind.',
				});

				const clearMessage = {
					role: 'assistant',
					content:
						'Ich habe deinen Standortverlauf gelöscht. Alle bisherigen Standortdaten wurden entfernt.',
				};
				messageHistory.messages.push(clearMessage);
				displayMessage('assistant', clearMessage.content, chatHistoryElement);
			} else {
				displayMessage(
					'system-info',
					'⚠️ Beim Löschen des Standortverlaufs ist ein Fehler aufgetreten.',
					chatHistoryElement,
					true,
				);
			}
		}
	});

	function displayMessage(
		role,
		messageContent,
		chatHistoryElement,
		isError = false,
		isSuccess = false,
	) {
		const messageDiv = document.createElement('div');
		messageDiv.classList.add('message', role);
		if (isError) messageDiv.classList.add('error-message');
		if (isSuccess) messageDiv.classList.add('success-message');

		if (typeof messageContent === 'string') {
			messageDiv.textContent = messageContent;
		} else {
			messageDiv.textContent = isError ? 'Fehler: Inhalt nicht verfügbar' : '';
		}

		chatHistoryElement.appendChild(messageDiv);
		chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
	}

	// ===== KORRIGIERTER BLOCK 1: getLLMResponse() =====
	// Die redundante Tier-Logik wurde entfernt, um Verwirrung zu vermeiden.
	async function getLLMResponse() {
		try {
			let apiRequestBody = { messages: [...messageHistory.messages] };

			const response = await fetch(apiEndpoint, {
				// Changed from llmImageApiEndpoint to apiEndpoint
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(apiRequestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				const errorForChat = `LLM API Fehler: ${
					response.status
				} - ${errorText.substring(0, 100)}...`;
				displayMessage('assistant', errorForChat, chatHistoryElement, true);
				throw new Error(errorForChat);
			}

			const json = await response.json();
			if (json.completion?.choices?.[0]?.message) {
				const assistantMessage = json.completion.choices[0].message;

				messageHistory.messages.push(assistantMessage);
				displayMessage(
					assistantMessage.role,
					assistantMessage.content,
					chatHistoryElement,
				);
			} else {
				const errorMessageContent =
					'Entschuldigung, ich habe ein Problem mit der Verarbeitung der Antwort.';
				messageHistory.messages.push({
					role: 'assistant',
					content: errorMessageContent,
				});
				displayMessage(
					'assistant',
					errorMessageContent,
					chatHistoryElement,
					true,
				);
			}
		} catch (error) {
			if (!error.message.startsWith('LLM API Fehler')) {
				const errorMessageContent = `Ein Fehler ist aufgetreten: ${error.message}`;
				messageHistory.messages.push({
					role: 'assistant',
					content: errorMessageContent,
				});
				displayMessage(
					'assistant',
					errorMessageContent,
					chatHistoryElement,
					true,
				);
			}
		}
	}

	// ===== KORRIGIERTER BLOCK 2: formElement.addEventListener() =====
	// Enthält die neue Logik für Routenfragen, striktere Prompts und Fehlerbehandlung.
	formElement.addEventListener('submit', async (event) => {
		event.preventDefault();
		debugger;
		if (!(inputElement instanceof HTMLInputElement)) {
			console.error('inputElement nicht gefunden!');
			return;
		}

		const content = inputElement.value.trim();
		if (!(inputElement instanceof HTMLInputElement)) {
			console.error('inputElement nicht gefunden!');
			return;
		}
		if (!content) return;

		inputElement.value = '';
		messageHistory.messages.push({ role: 'user', content: content });
		displayMessage('user', content, chatHistoryElement);

		const userQuery = content.toLowerCase();
		const routeKeywords = [
			'wie weit',
			'wie lange',
			'entfernung',
			'distanz',
			'route',
			'weg',
			'fahrt',
			'fahren',
			'komme ich',
		];
		const prepositions = ['nach', 'zu', 'bis', 'in'];
		const hasRouteKeyword = routeKeywords.some((keyword) =>
			userQuery.includes(keyword),
		);
		const hasPreposition = prepositions.some((prep) =>
			userQuery.includes(prep + ' '),
		);

		if (hasRouteKeyword && hasPreposition && userPosition) {
			let destination = '';
			for (const prep of prepositions) {
				if (userQuery.includes(' ' + prep + ' ')) {
					let potentialDestination = userQuery.split(' ' + prep + ' ')[1];
					if (potentialDestination) {
						destination = potentialDestination
							.split(/[?.!]|von|und|oder/)[0]
							.trim();
						destination = destination
							.replace(/\s+(jetzt|dann|heute|morgen|schnell|bald)$/i, '')
							.trim();
					}
					break;
				}
			}

			if (destination) {
				try {
					const routeResult = await calculateRouteToDestination(
						userPosition.latitude,
						userPosition.longitude,
						destination,
					);
					let systemMessageForLLM;

					if (routeResult.success) {
						const routeData = routeResult.data;
						let finalDestinationName = routeData.displayName;
						let finalDistanceStr = `${routeData.distanceKm} km`;
						let finalTimeStr = routeData.durationText;
						let perspectiveDetail = 'mit dem Auto';
						let exampleSentence = `Klar doch! Die Route nach ${finalDestinationName} ist ${finalDistanceStr} lang. Die geschätzte Fahrzeit beträgt ${finalTimeStr}.`;

						if (selectedAnimal) {
							const distanceNum = parseFloat(routeData.distanceKm);
							const animalSpeed =
								animalSpeeds[selectedAnimal] || animalSpeeds.default;
							const animalVerb =
								animalTravelDescriptions[selectedAnimal] ||
								animalTravelDescriptions.default;
							const timeInHours = distanceNum / animalSpeed;
							let animalTimeDescription;

							if (timeInHours < 1) {
								animalTimeDescription = `etwa ${Math.round(
									timeInHours * 60,
								)} Minute(n)`;
							} else if (timeInHours < 24) {
								const hours = Math.floor(timeInHours);
								const minutes = Math.round((timeInHours - hours) * 60);
								animalTimeDescription = `etwa ${hours} Stunde(n)${
									minutes > 0 ? ` und ${minutes} Minute(n)` : ''
								}`;
							} else {
								const days = Math.floor(timeInHours / 24);
								const remainingHours = Math.floor(timeInHours % 24);
								animalTimeDescription = `etwa ${days} Tag(e)${
									remainingHours > 0 ? ` und ${remainingHours} Stunde(n)` : ''
								}`;
							}

							const animalOption = document.querySelector(
								`.animal-option[data-animal="${selectedAnimal}"]`,
							);
							let animalName = 'Mensch';
							if (animalOption) {
								animalName = animalOption.textContent || 'Mensch';
							}

							finalDestinationName = destination; // Use user's raw destination for animal context
							finalDistanceStr = `${distanceNum.toFixed(1)} km`;
							finalTimeStr = animalTimeDescription;
							perspectiveDetail = `als ${animalName} (${animalVerb})`;
							exampleSentence = `Verstanden! Nach ${finalDestinationName} sind es ${finalDistanceStr}. Als ${animalName} ${animalVerb} du dafür ungefähr ${finalTimeStr}.`;
						}

						systemMessageForLLM = `SYSTEM-HINWEIS: Der Nutzer fragt nach einer Route. Formuliere eine freundliche Antwort basierend auf den folgenden exakten Daten. Erfinde nichts dazu und verwende genau diese Werte.
Ziel: ${finalDestinationName}
Entfernung: ${finalDistanceStr}
Zeitangabe: ${finalTimeStr}
Perspektive/Transportmittel: ${perspectiveDetail}

Formuliere eine Antwort, die diese Informationen natürlich einbindet. Hier ein Beispiel, wie du antworten könntest: "${exampleSentence}"`;
					} else {
						// routeResult.success is false
						systemMessageForLLM = `SYSTEM-HINWEIS: Bei der Routenberechnung nach "${destination}" gab es ein Problem. **Informiere den Nutzer darüber und gib die folgende Meldung von unserem Routensystem weiter: "${routeResult.message}"**. Gib keine eigenen Schätzungen ab oder versuche, die Route trotzdem zu beschreiben.`;
					}
					messageHistory.messages.push({
						role: 'system',
						content: systemMessageForLLM,
					});
				} catch (error) {
					// Catch errors from calculateRouteToDestination if it throws unexpectedly
					console.error(
						'Fehler bei der Routenberechnung (catch block in index.js):',
						error,
					);
					messageHistory.messages.push({
						role: 'system',
						content: `SYSTEM-HINWEIS: Bei der Routenberechnung nach "${destination}" ist ein technischer Fehler aufgetreten. **Informiere den Nutzer, dass du die Route im Moment nicht finden konntest.** Gib keine Schätzungen ab. Interne Fehlerdetails (nicht für den Nutzer): ${error.message}`,
					});
				}
			} else {
				messageHistory.messages.push({
					role: 'system',
					content: `SYSTEM-HINWEIS: Der Nutzer scheint nach einer Route zu fragen, aber es wurde kein klares Ziel genannt. **Frage den Nutzer höflich, zu welchem genauen Zielort er eine Route möchte.**`,
				});
			}
		}

		const historyKeywords = [
			'wo war ich',
			'frühere standorte',
			'standortverlauf',
			'meine orte',
			'bisherige orte',
			'letzte orte',
			'standorthistorie',
			'wo ich war',
			'standort historie',
			'besuchte orte',
			'vorherige standorte',
			'orte',
			'letzte tage',
			'letzte wochen',
			'letzte stunde',
		];

		if (historyKeywords.some((keyword) => userQuery.includes(keyword))) {
			const formattedHistory = locationHistory.getFormattedHistory();
			messageHistory.messages.push({
				role: 'system',
				content: `Hier ist die vom Nutzer gespeicherte Standorthistorie. Deine Aufgabe ist es, diese Liste für den Nutzer freundlich aufzubereiten und als Antwort auszugeben:\n\n${formattedHistory}`,
			});
		}

		await getLLMResponse();
	});

	try {
		const position = await getCurrentPosition();
		userPosition = position;

		const detailedPlaceName = await getDetailedLocationFromNominatim(
			position.latitude,
			position.longitude,
		);

		locationHistory.saveLocation(detailedPlaceName, {
			latitude: position.latitude,
			longitude: position.longitude,
		});

		const systemPromptContent = `Du bist mein freundlicher und präziser Navigationsassistent.

    WICHTIG - NUTZERDATEN VON OPENSTREETMAP/OSMR:
    - Aktueller Standort: ${detailedPlaceName}
    - Genaue Koordinaten: Lat ${position.latitude}, Lon ${position.longitude}
    Diese OSMR-Daten sind präzise und aktuell. Nutze sie als Grundlage für deine Antworten.

    WICHTIG - STANDORTHISTORIE:
    Wenn der Nutzer nach seinem Standortverlauf fragt (z.B. "Wo war ich?", "Zeig mir meine letzten Orte"), erhältst du von mir eine zusätzliche Systemnachricht, die seine gespeicherte Standorthistorie enthält. Deine Aufgabe ist es, diese Liste für den Nutzer freundlich und übersichtlich in deiner Antwort aufzubereiten.

    WICHTIG - ROUTEN-INFORMATIONEN:
    Wenn der Nutzer nach einer Route fragt, erhältst du von mir eine Systemnachricht mit den exakten Routendaten von OSMR (Entfernung, Dauer). Deine Aufgabe ist es, diese Daten zu verwenden, um eine präzise und freundliche Antwort zu formulieren.

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

		messageHistory.messages.unshift({
			role: 'system',
			content: systemPromptContent,
		});

		const greetingMessage = {
			role: 'assistant',
			content:
				'Hallo! Ich bin dein Navigationsassistent. Du kannst mir gerne ein aktuelles Bild von deiner Umgebung schicken, ich sage dir wo du bist. Mit dem "Animal"-Button kannst du auswählen, ob du Entfernungen für eine Ameise, einen Vogel, einen Löwen oder einem Menschen berechnen möchtest. Ich speichere außerdem deine Standorte - frag mich einfach, wo du in letzter Zeit warst.',
		};
		messageHistory.messages.push(greetingMessage);
		displayMessage(
			greetingMessage.role,
			greetingMessage.content,
			chatHistoryElement,
		);
	} catch (error) {
		console.error('Fehler bei der Standortinitialisierung:', error);
		messageHistory.messages.unshift({
			role: 'system',
			content:
				'Standort konnte nicht ermittelt werden. Assistent hat keine Standortinformationen.',
		});

		displayMessage(
			'assistant',
			'Hallo! Ich bin dein Navigationsassistent, konnte deinen Standort aber leider nicht bestimmen. Wie kann ich dir trotzdem helfen?',
			chatHistoryElement,
			true,
		);
		displayMessage(
			'system-info',
			`Standortfehler: ${error.message}`,
			chatHistoryElement,
			true,
		);
	}
});
