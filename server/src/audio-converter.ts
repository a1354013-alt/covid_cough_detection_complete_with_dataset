/**
 * Audio Format Converter
 * 
 * Converts various audio formats to WAV for consistent Python backend processing.
 * This ensures:
 * - Frontend can record in any supported format (WebM, MP4, etc.)
 * - Backend always receives WAV for stable processing
 * - No format compatibility issues between Node and Python
 * 
 * STRICT MODE: Uses async APIs and fails fast if conversion unavailable.
 * No fallback to unconverted formats - ensures system contract is maintained.
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
 * Always returns WAV as the standard format
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

  // For other formats, conversion is needed
  return true;
}

/**
 * Check if ffmpeg is available in the system
 */
async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version", { stdio: "ignore" });
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

    await execAsync(ffmpegCmd, { stdio: "ignore" });

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
