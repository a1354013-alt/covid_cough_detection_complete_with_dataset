/**
 * Audio Format Converter
 * 
 * Converts various audio formats to WAV for consistent Python backend processing.
 * This ensures:
 * - Frontend can record in any supported format (WebM, MP4, etc.)
 * - Backend always receives WAV for stable processing
 * - No format compatibility issues between Node and Python
 * 
 * Note: This is a stub implementation. For production, use ffmpeg or similar.
 */

/**
 * Check if audio is already in WAV format
 */
export function isWavFormat(mimeType: string): boolean {
  return mimeType.toLowerCase().includes("wav");
}

/**
 * Get target MIME type for backend processing
 * Currently returns WAV as the standard format
 */
export function getTargetMimeType(): string {
  return "audio/wav";
}

/**
 * Determine if format conversion is needed
 */
export function needsConversion(mimeType: string): boolean {
  // If already WAV, no conversion needed
  if (isWavFormat(mimeType)) {
    return false;
  }

  // For other formats, conversion would be needed
  // In production, this would trigger ffmpeg or similar
  return true;
}

/**
 * Convert audio buffer to WAV format
 * 
 * This is a stub implementation. In production, you would:
 * 1. Use ffmpeg subprocess
 * 2. Use a library like wav-encoder
 * 3. Use a cloud service like AWS Transcoder
 * 
 * For now, we document the requirement and return the original buffer
 * with a note that format conversion should be implemented.
 */
export async function convertToWav(
  buffer: Buffer,
  sourceMimeType: string
): Promise<Buffer> {
  // If already WAV, return as-is
  if (isWavFormat(sourceMimeType)) {
    return buffer;
  }

  // TODO: Implement actual format conversion
  // This would require:
  // 1. ffmpeg binary in Docker image
  // 2. Subprocess call to convert format
  // 3. Error handling for conversion failures
  
  // For now, log warning and return original
  console.warn(
    `[AUDIO-CONVERTER] Format conversion not implemented for ${sourceMimeType}. ` +
    `Passing to Python backend as-is. This may cause compatibility issues.`
  );

  return buffer;
}

/**
 * Get conversion status for logging
 */
export function getConversionStatus(
  sourceMimeType: string,
  targetMimeType: string
): string {
  if (sourceMimeType === targetMimeType) {
    return "no-conversion-needed";
  }
  return `convert-${sourceMimeType}-to-${targetMimeType}`;
}
