export async function getCurrentPosition() {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(
				new Error('Geolocation wird von diesem Browser nicht unterstützt.'),
			);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve(pos.coords),
			(err) => reject(err),
		);
	});
}
