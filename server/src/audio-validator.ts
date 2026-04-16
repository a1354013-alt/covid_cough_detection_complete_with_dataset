/**
 * Audio file validator with stable error contract.
 *
 * Supported formats:
 * - WAV
 * - MP3
 * - OGG
 * - WebM
 */

const AUDIO_MAGIC_BYTES = {
  wav: new Uint8Array([0x52, 0x49, 0x46, 0x46]), // RIFF
  mp3Id3: new Uint8Array([0x49, 0x44, 0x33]), // ID3
  ogg: new Uint8Array([0x4f, 0x67, 0x67, 0x53]), // OggS
  webm: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
} as const;

const FORMAT_TO_EXTENSIONS: Record<string, string[]> = {
  wav: ["wav"],
  mp3: ["mp3"],
  ogg: ["ogg"],
  webm: ["webm"],
};

const SUPPORTED_EXTENSIONS = Object.values(FORMAT_TO_EXTENSIONS).flat();

interface AudioValidationDetails {
  fileSize: number;
  detectedFormat?: string;
  providedExtension?: string;
}

export interface AudioValidationResult {
  valid: boolean;
  format?: string;
  error?: string;
  details?: AudioValidationDetails;
}

function startsWithMagic(buffer: Buffer, magicBytes: Uint8Array): boolean {
  if (buffer.length < magicBytes.length) return false;
  for (let i = 0; i < magicBytes.length; i += 1) {
    if (buffer[i] !== magicBytes[i]) return false;
  }
  return true;
}

function isMp3FrameSync(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  if (buffer[0] !== 0xff) return false;
  return [0xfb, 0xfa, 0xf3, 0xf2].includes(buffer[1]);
}

export function detectAudioFormat(buffer: Buffer): string | null {
  if (startsWithMagic(buffer, AUDIO_MAGIC_BYTES.wav)) {
    if (buffer.length >= 12 && buffer.toString("ascii", 8, 12) === "WAVE") {
      return "wav";
    }
  }

  if (startsWithMagic(buffer, AUDIO_MAGIC_BYTES.mp3Id3) || isMp3FrameSync(buffer)) {
    return "mp3";
  }

  if (startsWithMagic(buffer, AUDIO_MAGIC_BYTES.ogg)) {
    return "ogg";
  }

  if (startsWithMagic(buffer, AUDIO_MAGIC_BYTES.webm)) {
    return "webm";
  }

  return null;
}

export function validateAudioFile(
  buffer: Buffer,
  filename?: string,
  maxSize: number = 10 * 1024 * 1024
): AudioValidationResult {
  if (buffer.length === 0) {
    return {
      valid: false,
      error: "Audio file is empty",
      details: { fileSize: 0 },
    };
  }

  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
      details: { fileSize: buffer.length },
    };
  }

  const detectedFormat = detectAudioFormat(buffer);
  if (!detectedFormat) {
    return {
      valid: false,
      error: "Unsupported audio format. Supported formats: WAV, MP3, OGG, WebM",
      details: { fileSize: buffer.length },
    };
  }

  if (filename) {
    const ext = filename.toLowerCase().split(".").pop();
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Invalid file extension. Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`,
        details: { fileSize: buffer.length, detectedFormat, providedExtension: ext },
      };
    }

    // Validate that extension matches detected format
    const allowedExts = FORMAT_TO_EXTENSIONS[detectedFormat] || [];
    if (!allowedExts.includes(ext)) {
      return {
        valid: false,
        error: `File extension '.${ext}' does not match detected format '${detectedFormat}'. Expected: ${allowedExts.join(", ")}`,
        details: { fileSize: buffer.length, detectedFormat, providedExtension: ext },
      };
    }
  }

  return {
    valid: true,
    format: detectedFormat,
    details: { fileSize: buffer.length, detectedFormat },
  };
}

export function getFormatFromFilename(filename: string): string | null {
  const ext = filename.toLowerCase().split(".").pop();
  return ext && SUPPORTED_EXTENSIONS.includes(ext) ? ext : null;
}

export function estimateAudioDuration(buffer: Buffer, format: string): number | null {
  const typicalBitrates: Record<string, number> = {
    wav: 1411,
    mp3: 128,
    ogg: 128,
    webm: 128,
  };

  const bitrate = typicalBitrates[format.toLowerCase()] || 128;
  const duration = ((buffer.length / 1024) * 8) / bitrate;
  if (duration < 1 || duration > 1800) {
    return null;
  }
  return duration;
}
