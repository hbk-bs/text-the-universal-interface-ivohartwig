/**
 * Converts a File object to a base64-encoded Data URL string.
 * @param {File} file - The file to convert.
 * @returns {Promise<string>} A promise that resolves to a Data URL (e.g., "data:image/png;base64,...").
 */
export async function fileToDataURL(file) {
	const base64String = await fileToBase64(file);

	// Determine the MIME type
	const mimeType = file.type || 'application/octet-stream';

	// Create the Base64 encoded Data URL
	return `data:${mimeType};base64,${base64String}`;
}

/**
 * Converts a File object to a base64-encoded string.
 * @param {File} file - The file to convert.
 * @returns {Promise<string>} A promise that resolves to a base64-encoded string.
 */
async function fileToBase64(file) {
	// Read the file as an ArrayBuffer
	const arrayBuffer = await file.arrayBuffer();

	// Convert ArrayBuffer to a typed array (Uint8Array)
	const uintArray = new Uint8Array(arrayBuffer);

	// Convert typed array to binary string
	const binaryString = uintArray.reduce(
		(acc, byte) => acc + String.fromCharCode(byte),
		'',
	);

	// Encode binary string to base64
	return btoa(binaryString);
}