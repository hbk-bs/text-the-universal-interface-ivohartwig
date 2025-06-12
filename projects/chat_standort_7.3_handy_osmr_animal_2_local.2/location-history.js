export const locationHistory = {
	storageKey: 'nIVOgation_location_history',

	saveLocation(place, coordinates) {
		try {
			const history = this.getLocationHistory();
			const timestamp = new Date().toISOString();

			history.push({
				place: place,
				coordinates: coordinates,
				timestamp: timestamp,
				readableTime: new Date().toLocaleString('de-DE'),
			});

			// Keep only last 50 entries
			if (history.length > 50) {
				history.shift();
			}

			localStorage.setItem(this.storageKey, JSON.stringify(history));
			console.log('Location saved to history:', place);
			// Hinzugefügt, um den Verlauf in der Konsole zu sehen
			console.log(
				'Aktueller Verlauf im Local Storage:',
				localStorage.getItem(this.storageKey),
			);
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
			return 'Du hast noch keine gespeicherten Standortdaten.';
		}

		let result = 'Deine letzten Standorte:\n\n';
		// Show most recent locations first
		const recentHistory = [...history].reverse().slice(0, 10);

		recentHistory.forEach((item, index) => {
			result += `${index + 1}. ${item.place} (${item.readableTime})\n`;
		});

		return result;
	},

	// Add clearHistory method
	clearHistory() {
		try {
			localStorage.removeItem(this.storageKey);
			console.log('Location history cleared');
			return true;
		} catch (error) {
			console.error('Error clearing location history:', error);
			return false;
		}
	},
};
