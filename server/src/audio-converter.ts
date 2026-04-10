/**
 * Audio format conversion utilities.
 *
 * Conversion is best-effort:
 * - If source is already WAV, payload is returned unchanged.
 * - If ffmpeg conversion succeeds, WAV payload is returned.
 * - If conversion fails, caller can fallback to original payload.
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

export function isWavFormat(mimeType: string): boolean {
  return mimeType.toLowerCase().includes("wav");
}

export function getTargetMimeType(sourceMimeType: string, conversionSucceeded = true): string {
  if (isWavFormat(sourceMimeType)) {
    return "audio/wav";
  }
  return conversionSucceeded ? "audio/wav" : sourceMimeType;
}

export function needsConversion(mimeType: string): boolean {
  return !isWavFormat(mimeType);
}

async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await runProcess("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function convertToWav(buffer: Buffer, sourceMimeType: string): Promise<Buffer> {
  if (isWavFormat(sourceMimeType)) {
    return buffer;
  }

  if (!(await isFfmpegAvailable())) {
    throw new Error(
      `Audio format conversion unavailable for ${sourceMimeType}: ffmpeg is not installed`
    );
  }

  const tempId = randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `audio-input-${tempId}.bin`);
  const outputPath = path.join(os.tmpdir(), `audio-output-${tempId}.wav`);

  try {
    await fs.writeFile(inputPath, buffer);

    await runProcess("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-y",
      outputPath,
    ]);

    return await fs.readFile(outputPath);
  } catch (err) {
    throw new Error(
      `Failed to convert audio format from ${sourceMimeType}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
  }
}

export function getConversionStatus(sourceMimeType: string, targetMimeType: string): string {
  if (sourceMimeType === targetMimeType) {
    return "no-conversion-needed";
  }
  return `convert-${sourceMimeType}-to-${targetMimeType}`;
}
