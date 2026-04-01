/**
 * Audio Format Converter
 * 
 * Converts various audio formats to WAV for consistent Python backend processing.
 * This ensures:
 * - Frontend can record in any supported format (WebM, OGG, etc.)
 * - Backend always receives WAV for stable processing
 * - No format compatibility issues between Node and Python
 * 
 * STRICT MODE: Conversion is mandatory for non-WAV formats.
 * - If ffmpeg unavailable: rejects request (no fallback)
 * - If conversion fails: rejects request (no fallback)
 * - Only WAV format accepted by backend
 * 
 * This maintains strict system contract: non-WAV formats must convert or fail.
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
 * - If source is not WAV and conversion would fail: returns original MIME type
 * 
 * This ensures Content-Type header matches actual audio format.
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
 * 6. STRICT MODE: Fails if ffmpeg unavailable or conversion fails
 * 
 * @param buffer - Input audio buffer
 * @param sourceMimeType - Source audio MIME type
 * @returns Promise<Buffer> - WAV format audio buffer
 * @throws Error if conversion not available or fails
 */
export async function convertToWav(
  buffer: Buffer,
  sourceMimeType: string
): Promise<Buffer> {
  // If already WAV, return as-is
  if (isWavFormat(sourceMimeType)) {
    return buffer;
  }

  // ✅ 嚴格模式：檢查 ffmpeg 可用性
  const ffmpegAvailable = await isFfmpegAvailable();
  if (!ffmpegAvailable) {
    // ✅ 嚴格模式：ffmpeg 不可用且格式不是 WAV，直接拒絕
    throw new Error(
      `Audio format conversion unavailable. ` +
      `Source format: ${sourceMimeType}. ` +
      `ffmpeg is not installed in the system. ` +
      `Please install ffmpeg or send WAV format audio.`
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

    console.info(
      `[AUDIO-CONVERTER] Successfully converted ${sourceMimeType} to WAV ` +
      `(${buffer.length} bytes → ${wavBuffer.length} bytes)`
    );

    return wavBuffer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[AUDIO-CONVERTER] Conversion failed for ${sourceMimeType}: ${errorMsg}`
    );
    // ✅ 嚴格模式：轉換失敗直接拒絕，不要 fallback
    throw new Error(
      `Failed to convert audio format. ` +
      `Source: ${sourceMimeType}. ` +
      `Error: ${errorMsg}`
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
