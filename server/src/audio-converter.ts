/**
 * Audio Format Converter
 * 
 * Converts various audio formats to WAV for consistent Python backend processing.
 * This ensures:
 * - Frontend can record in any supported format (WebM, OGG, etc.)
 * - Backend receives WAV when conversion succeeds
 * - No format compatibility issues between Node and Python
 * 
 * BEST-EFFORT MODE: Conversion is attempted but fallback to original format if fails.
 * - If ffmpeg unavailable: throws error (caller handles)
 * - If conversion fails: throws error (caller handles)
 * - Caller decides to fallback to original format or reject
 * 
 * This module provides the conversion capability.
 * The calling code (server/src/index.ts) implements the best-effort strategy:
 * - Try to convert to WAV
 * - If conversion fails: fallback to original format and send to Python
 * - Python backend accepts both WAV and original formats
 */

import { exec } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Check if audio is already in WAV format
 */
export function isWavFormat(mimeType: string): boolean {
  return mimeType.toLowerCase().includes("wav");
}

/**
 * Get target MIME type for backend processing
 * 
 * Returns the actual format that will be sent to Python:
 * - If source is WAV: returns audio/wav
 * - If source is not WAV but conversion succeeded: returns audio/wav
 * - If source is not WAV and conversion failed: returns original MIME type
 * 
 * This ensures Content-Type header matches actual audio format.
 * 
 * NOTE: This function is for reference. The actual logic is implemented
 * in server/src/index.ts forwardToPythonBackend() function.
 */
export function getTargetMimeType(sourceMimeType: string, conversionSucceeded: boolean = true): string {
  // If source is already WAV, target is WAV
  if (isWavFormat(sourceMimeType)) {
    return "audio/wav";
  }
  
  // If conversion succeeded, target is WAV
  if (conversionSucceeded) {
    return "audio/wav";
  }
  
  // If conversion failed or not attempted, keep original MIME type
  // This prevents lying about format in Content-Type header
  return sourceMimeType;
}

/**
 * Determine if format conversion is needed
 */
export function needsConversion(mimeType: string): boolean {
  // If already WAV, no conversion needed
  if (isWavFormat(mimeType)) {
    return false;
  }

  // For other formats, conversion is needed
  return true;
}

/**
 * Check if ffmpeg is available in the system
 */
async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version", { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert audio buffer to WAV format using ffmpeg
 * 
 * This implementation:
 * 1. Checks if ffmpeg is available
 * 2. Writes the input buffer to a temporary file
 * 3. Uses ffmpeg to convert to WAV format (async)
 * 4. Reads the converted WAV file
 * 5. Cleans up temporary files
 * 6. Throws error if ffmpeg unavailable or conversion fails
 * 
 * NOTE: Caller is responsible for handling conversion failures.
 * The best-effort strategy (fallback to original format) is implemented in server/src/index.ts
 * 
 * @param buffer - Input audio buffer
 * @param sourceMimeType - Source audio MIME type
 * @returns Promise<Buffer> - WAV format audio buffer
 * @throws Error if conversion not available or fails (caller should handle)
 */
export async function convertToWav(
  buffer: Buffer,
  sourceMimeType: string
): Promise<Buffer> {
  // If already WAV, return as-is
  if (isWavFormat(sourceMimeType)) {
    return buffer;
  }

  // Check if ffmpeg is available
  const ffmpegAvailable = await isFfmpegAvailable();
  if (!ffmpegAvailable) {
    // ffmpeg not available - throw error and let caller handle
    throw new Error(
      `Audio format conversion unavailable. ` +
      `Source format: ${sourceMimeType}. ` +
      `ffmpeg is not installed in the system.`
    );
  }

  // Generate temporary file paths
  const tempDir = os.tmpdir();
  const tempId = randomBytes(8).toString("hex");
  const inputFile = path.join(tempDir, `audio-input-${tempId}.tmp`);
  const outputFile = path.join(tempDir, `audio-output-${tempId}.wav`);

  try {
    // Write input buffer to temporary file
    await writeFile(inputFile, buffer);

    // Convert to WAV using ffmpeg (async)
    // -i: input file
    // -acodec pcm_s16le: PCM 16-bit little-endian (standard WAV)
    // -ar 16000: 16kHz sample rate (common for speech)
    // -ac 1: mono (single channel)
    // -y: overwrite output file
    const ffmpegCmd = `ffmpeg -i "${inputFile}" -acodec pcm_s16le -ar 16000 -ac 1 -y "${outputFile}" 2>/dev/null`;

    await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 });

    // Read converted WAV file
    const wavBuffer = await readFile(outputFile);

    // Log successful conversion
    // Note: Caller (server/src/index.ts) will also log this event

    return wavBuffer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Conversion failed - throw error and let caller handle
    throw new Error(
      `Failed to convert audio format from ${sourceMimeType}: ${errorMsg}`
    );
  } finally {
    // Clean up temporary files
    try {
      await unlink(inputFile);
    } catch {
      // Ignore cleanup errors
    }
    try {
      await unlink(outputFile);
    } catch {
      // Ignore cleanup errors
    }
  }
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
