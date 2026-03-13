/**
 * Audio File Validator
 * 
 * Validates audio files by checking:
 * - Magic bytes (file signature)
 * - File size
 * - Audio format
 * - Extension matches detected format
 */

// Audio format magic bytes (file signatures)
const AUDIO_MAGIC_BYTES: Record<string, Uint8Array> = {
  // WAV: RIFF....WAVE
  wav: new Uint8Array([0x52, 0x49, 0x46, 0x46]), // "RIFF"
  
  // MP3: ID3 or FF FB/FA/F3/F2
  mp3_id3: new Uint8Array([0x49, 0x44, 0x33]), // "ID3"
  mp3_frame: new Uint8Array([0xff, 0xfb]), // MPEG Frame sync
  
  // M4A/AAC: ftyp (MP4 format)
  m4a: new Uint8Array([0x66, 0x74, 0x79, 0x70]), // "ftyp"
  
  // OGG: OggS
  ogg: new Uint8Array([0x4f, 0x67, 0x67, 0x53]), // "OggS"
  
  // WebM: 1A 45 DF A3
  webm: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
};

// Map detected format to allowed file extensions
const FORMAT_TO_EXTENSIONS: Record<string, string[]> = {
  wav: ["wav"],
  mp3: ["mp3"],
  m4a: ["m4a", "mp4"],
  ogg: ["ogg"],
  webm: ["webm"],
};

interface AudioValidationResult {
  valid: boolean;
  format?: string;
  error?: string;
  details?: {
    fileSize: number;
    detectedFormat?: string;
    providedExtension?: string;
  };
}

/**
 * Check if buffer starts with magic bytes
 */
function bufferStartsWith(buffer: Buffer, magicBytes: Uint8Array): boolean {
  if (buffer.length < magicBytes.length) return false;
  for (let i = 0; i < magicBytes.length; i++) {
    if (buffer[i] !== magicBytes[i]) return false;
  }
  return true;
}

/**
 * Detect audio format from magic bytes
 */
export function detectAudioFormat(buffer: Buffer): string | null {
  // Check WAV
  if (bufferStartsWith(buffer, AUDIO_MAGIC_BYTES.wav)) {
    // Verify WAVE signature at offset 8
    if (buffer.length >= 12) {
      const waveSignature = buffer.toString("ascii", 8, 12);
      if (waveSignature === "WAVE") return "wav";
    }
  }

  // Check MP3 (ID3 tag)
  if (bufferStartsWith(buffer, AUDIO_MAGIC_BYTES.mp3_id3)) {
    return "mp3";
  }

  // Check MP3 (Frame sync)
  if (buffer.length >= 2 && bufferStartsWith(buffer, AUDIO_MAGIC_BYTES.mp3_frame)) {
    return "mp3";
  }

  // Check M4A/MP4 (ftyp at offset 4)
  // Note: This detects MP4 family containers, which could be audio or video
  // Common audio brands: isom, iso2, mp42, M4A, M4B
  if (buffer.length >= 8) {
    if (bufferStartsWith(buffer.slice(4), AUDIO_MAGIC_BYTES.m4a)) {
      return "m4a";
    }
  }

  // Check OGG
  if (bufferStartsWith(buffer, AUDIO_MAGIC_BYTES.ogg)) {
    return "ogg";
  }

  // Check WebM
  if (bufferStartsWith(buffer, AUDIO_MAGIC_BYTES.webm)) {
    return "webm";
  }

  return null;
}

/**
 * Validate audio file
 * 
 * @param buffer - Audio file buffer
 * @param filename - Original filename (for extension check)
 * @param maxSize - Maximum allowed file size in bytes (default: 10MB)
 * @returns Validation result
 */
export function validateAudioFile(
  buffer: Buffer,
  filename?: string,
  maxSize: number = 10 * 1024 * 1024
): AudioValidationResult {
  // Check file size
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

  // Detect format from magic bytes
  const detectedFormat = detectAudioFormat(buffer);

  if (!detectedFormat) {
    return {
      valid: false,
      error: "Unrecognized audio format. Supported formats: WAV, MP3, M4A, OGG, WebM",
      details: { fileSize: buffer.length },
    };
  }

  // If filename provided, verify extension is supported and matches detected format
  if (filename) {
    const ext = filename.toLowerCase().split(".").pop();
    const supportedExtensions = ["wav", "mp3", "m4a", "mp4", "ogg", "webm"];

    // Check if extension is in supported list
    if (!supportedExtensions.includes(ext || "")) {
      return {
        valid: false,
        error: `Invalid file extension. Supported formats: ${supportedExtensions.join(", ")}`,
        details: { fileSize: buffer.length, detectedFormat, providedExtension: ext },
      };
    }

    // Check if extension matches detected format
    const allowedExts = FORMAT_TO_EXTENSIONS[detectedFormat] || [];
    if (ext && !allowedExts.includes(ext)) {
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

/**
 * Get audio format from filename extension
 */
export function getFormatFromFilename(filename: string): string | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext && ["wav", "mp3", "m4a", "mp4", "ogg", "webm"].includes(ext)) {
    return ext;
  }
  return null;
}

/**
 * Estimate audio duration from buffer (approximate)
 * This is a rough estimate based on file size and typical bitrates
 * 
 * @param buffer - Audio file buffer
 * @param format - Audio format
 * @returns Estimated duration in seconds (or null if cannot estimate)
 */
export function estimateAudioDuration(
  buffer: Buffer,
  format: string
): number | null {
  // These are approximate bitrates for different formats
  const typicalBitrates: Record<string, number> = {
    wav: 1411, // 16-bit, 44.1kHz stereo = 1411 kbps
    mp3: 128, // Typical MP3 bitrate
    m4a: 128, // Typical AAC bitrate
    ogg: 128, // Typical Vorbis bitrate
    webm: 128, // Typical WebM bitrate
  };

  const bitrate = typicalBitrates[format.toLowerCase()] || 128;
  const bytes = buffer.length;
  const kilobytes = bytes / 1024;
  const duration = (kilobytes * 8) / bitrate; // Convert to seconds

  // Sanity check: audio should be between 1 second and 30 minutes
  if (duration < 1 || duration > 1800) {
    return null;
  }

  return duration;
}
