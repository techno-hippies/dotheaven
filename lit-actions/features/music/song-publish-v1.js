/**
 * Song Publish v1
 *
 * Combined action: upload song files to IPFS + lyrics alignment + lyrics translation.
 * Replaces separate song-upload, lyrics-alignment, and translate-lyrics actions.
 *
 * Flow:
 * 1. Validate EIP-191 signature over content hashes
 * 2. Decrypt 3 API keys (Filebase, ElevenLabs, OpenRouter)
 * 3. Fetch audio/preview/cover/instrumental content
 * 4. Upload 7 files to Filebase IPFS (audio, preview, cover, instrumental, 3x metadata)
 * 5. Call ElevenLabs forced alignment API (word-level timestamps)
 * 6. Call OpenRouter translation API (lyrics translation)
 * 7. Upload alignment + translation JSON to IPFS (2 more files)
 * 8. Return all 9 CIDs + alignment + translation data
 *
 * Required jsParams:
 * - userPkpPublicKey: User's PKP public key
 * - audioUrl: URL or inline {base64, contentType} for audio
 * - coverUrl: URL or inline for cover image
 * - songMetadataJson: SongMetadata JSON string
 * - ipaMetadataJson: IPA Metadata JSON string
 * - nftMetadataJson: NFT Metadata JSON string
 * - signature: User's EIP-191 signature over content hash digest
 * - timestamp: Request timestamp (ms)
 * - nonce: Unique nonce for replay protection
 * - lyricsText: Plain text lyrics (\n separated lines)
 * - sourceLanguage: e.g. "English"
 * - targetLanguage: e.g. "es", "ja", "ko"
 * - filebaseEncryptedKey: Lit-encrypted Filebase credentials
 * - elevenlabsEncryptedKey: Lit-encrypted ElevenLabs API key
 * - openrouterEncryptedKey: Lit-encrypted OpenRouter API key
 *
 * - instrumentalUrl: URL or inline {base64, contentType} for instrumental/karaoke track
 * - vocalsUrl: URL or inline {base64, contentType} for isolated vocals stem (used for FA alignment)
 *
 * Optional jsParams:
 * - canvasUrl: URL or inline {base64, contentType} for 9:16 looping canvas video (MP4/WebM)
 * - filebasePlaintextKey: Dev override
 * - elevenlabsPlaintextKey: Dev override
 * - openrouterPlaintextKey: Dev override
 * - translationModel: Override LLM model (default: google/gemini-2.5-flash-lite-preview-09-2025)
 *
 * Returns: { success, version, user, audioCID, coverCID,
 *            instrumentalCID, songMetadataCID, ipaMetadataCID, nftMetadataCID,
 *            alignmentCID, translationCID, alignment, translation, hashes }
 */

let ethersLib = globalThis.ethers;
if (!ethersLib) ethersLib = require("ethers");
const ethers = ethersLib;

// ============================================================
// HELPERS
// ============================================================

const must = (v, label) => {
  if (v === undefined || v === null) throw new Error(`${label} is required`);
  return v;
};

// ============================================================
// SHA-256 + FILEBASE S3 (AWS Sig V4)
// ============================================================

async function sha256Bytes(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const hash = await sha256Bytes(encoder.encode(message));
  return bytesToHex(hash);
}

async function sha256HexFromBuffer(buffer) {
  const hash = await sha256Bytes(buffer);
  return bytesToHex(hash);
}

async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function hmacHex(key, message) {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(secretKey, dateStamp, region, service) {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function uploadToFilebase(filebaseApiKey, content, contentType, fileName) {
  const decoded = atob(filebaseApiKey);
  const [accessKey, secretKey, bucket] = decoded.split(":");
  if (!accessKey || !secretKey || !bucket) {
    throw new Error("Invalid Filebase API key format");
  }

  const endpoint = "s3.filebase.com";
  const region = "us-east-1";
  const service = "s3";

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${fileName}`;

  let payloadHash;
  if (typeof content === "string") {
    payloadHash = await sha256Hex(content);
  } else {
    payloadHash = await sha256HexFromBuffer(content);
  }

  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Content-Type": contentType,
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Filebase upload failed: ${response.status} ${text}`);
  }

  const cid = response.headers.get("x-amz-meta-cid");
  if (!cid) {
    throw new Error("No CID returned from Filebase");
  }

  return cid;
}

// ============================================================
// FETCH + VALIDATE
// ============================================================

const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm"];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];

async function fetchAndValidate(urlOrInline, maxBytes, allowedTypes) {
  if (typeof urlOrInline === "object" && urlOrInline.base64 && urlOrInline.contentType) {
    const binaryStr = atob(urlOrInline.base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.byteLength > maxBytes) {
      throw new Error(`File too large: ${bytes.byteLength} bytes (max: ${maxBytes})`);
    }

    const mimeBase = urlOrInline.contentType.split(";")[0].trim().toLowerCase();
    if (allowedTypes.length > 0 && !allowedTypes.includes(mimeBase)) {
      throw new Error(`Invalid content type: ${mimeBase} (expected: ${allowedTypes.join(", ")})`);
    }

    return { data: bytes, contentType: mimeBase, byteLength: bytes.byteLength };
  }

  const url = urlOrInline;
  if (!url.startsWith("https://")) {
    throw new Error(`Disallowed URL scheme (use https:// or inline base64): ${String(url).slice(0, 30)}...`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url.slice(0, 60)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const mimeBase = contentType.split(";")[0].trim().toLowerCase();

  if (allowedTypes.length > 0 && !allowedTypes.includes(mimeBase)) {
    throw new Error(`Invalid content type: ${mimeBase} (expected: ${allowedTypes.join(", ")})`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`File too large: ${buffer.byteLength} bytes (max: ${maxBytes})`);
  }

  return { data: new Uint8Array(buffer), contentType: mimeBase, byteLength: buffer.byteLength };
}

// ============================================================
// DECRYPT HELPER
// ============================================================

async function decryptKey(encryptedKey, plaintextKey) {
  if (plaintextKey) return plaintextKey;
  if (!encryptedKey) return null;
  return Lit.Actions.decryptAndCombine({
    accessControlConditions: encryptedKey.accessControlConditions,
    ciphertext: encryptedKey.ciphertext,
    dataToEncryptHash: encryptedKey.dataToEncryptHash,
    authSig: null,
    chain: "ethereum",
  });
}

// ============================================================
// LYRICS PROCESSING
// ============================================================

const SECTION_MARKER_RE = /^\[([^\]]+)\]$/;

/**
 * Strip section markers ([Verse 1], [Chorus], etc.) and empty lines.
 * Returns only singable lyric lines joined by \n for alignment.
 * Also returns the original line indices for mapping back.
 */
function prepareLyricsForAlignment(rawText) {
  const rawLines = rawText.split(/\r?\n/);
  const lyricLines = [];
  const lineMap = []; // index in lyricLines → original line text

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SECTION_MARKER_RE.test(trimmed)) continue;
    lyricLines.push(trimmed);
    lineMap.push(trimmed);
  }

  return { alignmentText: lyricLines.join("\n"), lyricLines: lineMap };
}

/**
 * Fix intro-stretched words.
 * ElevenLabs anchors the first word at 0s even with instrumental intros,
 * stretching short words to 10+ seconds.
 */
function fixIntroStretchedWords(words) {
  const MAX_DURATION = 3;
  const TYPICAL_DURATION = 0.4;
  const GAP = 0.15;

  const fixed = words.map((w) => ({ ...w }));
  let lineStart = 0;

  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i].text === "\n") {
      lineStart = i + 1;
      continue;
    }
    if (i !== lineStart) continue;

    // Find first content word
    let firstIdx = i;
    while (firstIdx < fixed.length && fixed[firstIdx].text.trim() === "") firstIdx++;
    if (firstIdx >= fixed.length || fixed[firstIdx].text === "\n") continue;

    const first = fixed[firstIdx];
    const duration = first.end - first.start;
    if (duration <= MAX_DURATION) continue;

    // Find next content word
    let nextIdx = firstIdx + 1;
    while (nextIdx < fixed.length && fixed[nextIdx].text.trim() === "" && fixed[nextIdx].text !== "\n") nextIdx++;

    let adjustedStart;
    if (nextIdx < fixed.length && fixed[nextIdx].text !== "\n") {
      adjustedStart = Math.max(0, fixed[nextIdx].start - TYPICAL_DURATION - GAP);
    } else {
      adjustedStart = Math.max(0, first.end - TYPICAL_DURATION);
    }

    if (first.start < adjustedStart - 1) {
      const newEnd = Math.max(first.end, adjustedStart + TYPICAL_DURATION);
      fixed[firstIdx] = { ...first, start: adjustedStart, end: newEnd };
    }
  }

  return fixed;
}

/**
 * Parse ElevenLabs word array into clean line+word structure.
 * Uses \n tokens as line delimiters.
 *
 * Each non-whitespace token from ElevenLabs becomes its own entry in the
 * `characters` array (individual character timing for karaoke highlighting).
 * For Japanese this means each kana/kanji; for English each "word" token
 * from ElevenLabs is already a full word.
 */
function parseAlignmentLines(words) {
  const lines = [];
  let currentTokens = [];

  const flushLine = () => {
    if (currentTokens.length === 0) return;
    const content = currentTokens.filter((w) => w.text.trim().length > 0);
    if (content.length === 0) { currentTokens = []; return; }

    // Each non-whitespace token gets its own character entry
    const characters = content.map((c) => ({
      text: c.text,
      startMs: Math.round(c.start * 1000),
      endMs: Math.round(c.end * 1000),
    }));

    // Reconstruct line text from all tokens (preserve spaces)
    const lineText = currentTokens
      .map((t) => t.text)
      .join("")
      .trim();

    if (characters.length > 0) {
      lines.push({
        index: lines.length,
        text: lineText,
        startMs: characters[0].startMs,
        endMs: characters[characters.length - 1].endMs,
        characters,
      });
    }
    currentTokens = [];
  };

  for (const word of words) {
    if (word.text === "\n" || word.text === "\r") {
      flushLine();
      continue;
    }
    currentTokens.push(word);
  }
  flushLine();

  return lines;
}

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  try {
    const {
      userPkpPublicKey,
      audioUrl,
      coverUrl,
      instrumentalUrl,
      vocalsUrl,
      canvasUrl,
      songMetadataJson,
      ipaMetadataJson,
      nftMetadataJson,
      signature,
      timestamp,
      nonce,
      lyricsText,
      sourceLanguage,
      targetLanguage,
      filebaseEncryptedKey,
      filebasePlaintextKey,
      elevenlabsEncryptedKey,
      elevenlabsPlaintextKey,
      openrouterEncryptedKey,
      openrouterPlaintextKey,
      translationModel,
    } = jsParams || {};

    must(userPkpPublicKey, "userPkpPublicKey");
    must(audioUrl, "audioUrl");
    must(coverUrl, "coverUrl");
    must(instrumentalUrl, "instrumentalUrl");
    must(vocalsUrl, "vocalsUrl");
    must(songMetadataJson, "songMetadataJson");
    must(ipaMetadataJson, "ipaMetadataJson");
    must(nftMetadataJson, "nftMetadataJson");
    must(signature, "signature");
    must(timestamp, "timestamp");
    must(nonce, "nonce");
    must(lyricsText, "lyricsText");
    must(sourceLanguage, "sourceLanguage");
    must(targetLanguage, "targetLanguage");

    const userAddress = ethers.utils.computeAddress(userPkpPublicKey);
    const model = translationModel || "google/gemini-2.5-flash-lite-preview-09-2025";

    // ========================================
    // STEP 1: Validate request freshness
    // ========================================
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      throw new Error("Request expired (timestamp older than 5 minutes)");
    }

    // ========================================
    // STEP 2: Fetch content + compute hashes
    // ========================================
    const audio = await fetchAndValidate(audioUrl, 50 * 1024 * 1024, ALLOWED_AUDIO_TYPES);
    const cover = await fetchAndValidate(coverUrl, 5 * 1024 * 1024, ALLOWED_IMAGE_TYPES);
    const instrumental = await fetchAndValidate(instrumentalUrl, 50 * 1024 * 1024, ALLOWED_AUDIO_TYPES);
    const vocals = await fetchAndValidate(vocalsUrl, 50 * 1024 * 1024, ALLOWED_AUDIO_TYPES);
    const canvas = canvasUrl ? await fetchAndValidate(canvasUrl, 30 * 1024 * 1024, ALLOWED_VIDEO_TYPES) : null;

    const audioHash = await sha256HexFromBuffer(audio.data);
    const coverHash = await sha256HexFromBuffer(cover.data);
    const instrumentalHash = await sha256HexFromBuffer(instrumental.data);
    const vocalsHash = await sha256HexFromBuffer(vocals.data);
    const canvasHash = canvas ? await sha256HexFromBuffer(canvas.data) : null;
    const songMetadataHash = await sha256Hex(songMetadataJson);
    const ipaMetadataHash = await sha256Hex(ipaMetadataJson);
    const nftMetadataHash = await sha256Hex(nftMetadataJson);
    const lyricsHash = await sha256Hex(lyricsText);

    // ========================================
    // STEP 3: Verify signature binds all content
    // ========================================
    const message = `heaven:publish:${audioHash}:${coverHash}:${instrumentalHash}:${vocalsHash}:${canvasHash || ''}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguage}:${targetLanguage}:${timestamp}:${nonce}`;
    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Invalid signature: recovered address does not match user PKP");
    }

    // ========================================
    // STEP 4: Decrypt all 3 keys
    // ========================================
    const isInstrumental = lyricsText === "(instrumental)";

    const filebaseKey = await decryptKey(filebaseEncryptedKey, filebasePlaintextKey);
    if (!filebaseKey) throw new Error("filebaseEncryptedKey or filebasePlaintextKey is required");

    // ElevenLabs + OpenRouter only needed when there are lyrics to align/translate
    const elevenLabsKey = isInstrumental ? null : await decryptKey(elevenlabsEncryptedKey, elevenlabsPlaintextKey);
    if (!isInstrumental && !elevenLabsKey) throw new Error("elevenlabsEncryptedKey or elevenlabsPlaintextKey is required");

    const openRouterKey = isInstrumental ? null : await decryptKey(openrouterEncryptedKey, openrouterPlaintextKey);
    if (!isInstrumental && !openRouterKey) throw new Error("openrouterEncryptedKey or openrouterPlaintextKey is required");

    // ========================================
    // STEP 5-8: All external IO in runOnce
    // ========================================
    const prefix = `${userAddress.slice(2, 10)}-${timestamp}`;

    const resultJson = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "songPublish" },
      async () => {
        try {
          // --- STEP 5: Upload files to Filebase IPFS ---
          const extMap = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a", "audio/webm": "webm" };
          const audioExt = extMap[audio.contentType] || "mp3";

          const audioCID = await uploadToFilebase(
            filebaseKey, audio.data, audio.contentType,
            `audio-${prefix}.${audioExt}`
          );
          const coverCID = await uploadToFilebase(
            filebaseKey, cover.data, cover.contentType,
            `cover-${prefix}.${cover.contentType.split("/")[1]}`
          );
          const instrExt = extMap[instrumental.contentType] || "mp3";
          const instrumentalCID = await uploadToFilebase(
            filebaseKey, instrumental.data, instrumental.contentType,
            `instrumental-${prefix}.${instrExt}`
          );
          const vocalExt = extMap[vocals.contentType] || "mp3";
          const vocalsCID = await uploadToFilebase(
            filebaseKey, vocals.data, vocals.contentType,
            `vocals-${prefix}.${vocalExt}`
          );
          const songMetadataCID = await uploadToFilebase(
            filebaseKey, songMetadataJson, "application/json",
            `song-meta-${prefix}.json`
          );
          const ipaMetadataCID = await uploadToFilebase(
            filebaseKey, ipaMetadataJson, "application/json",
            `ipa-meta-${prefix}.json`
          );
          const nftMetadataCID = await uploadToFilebase(
            filebaseKey, nftMetadataJson, "application/json",
            `nft-meta-${prefix}.json`
          );
          const canvasCID = canvas ? await uploadToFilebase(
            filebaseKey, canvas.data, canvas.contentType,
            `canvas-${prefix}.${canvas.contentType.split("/")[1]}`
          ) : null;

          // --- STEP 6-8: Lyrics alignment + translation (skip for instrumentals) ---
          let alignment = null;
          let translation = null;
          let alignmentCID = null;
          let translationCID = null;

          if (!isInstrumental) {
            // --- STEP 6: Lyrics alignment (ElevenLabs) ---
            // Use vocals stem for alignment (cleaner signal = better FA results)
            // Strip section markers and empty lines before alignment
            const { alignmentText } = prepareLyricsForAlignment(lyricsText);

            const vocalsExt = extMap[vocals.contentType] || "mp3";
            const vocalsBlob = new Blob([vocals.data], { type: vocals.contentType });
            const formData = new FormData();
            formData.append("file", vocalsBlob, `vocals.${vocalsExt}`);
            formData.append("text", alignmentText);

            const alignResponse = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
              method: "POST",
              headers: { "xi-api-key": elevenLabsKey },
              body: formData,
            });

            if (!alignResponse.ok) {
              const errText = await alignResponse.text();
              return JSON.stringify({ _error: `ElevenLabs alignment error: ${alignResponse.status} ${errText}` });
            }

            const alignResult = await alignResponse.json();
            const rawWords = alignResult.words || [];

            // Fix intro-stretched words (ElevenLabs anchors first word at 0s)
            const fixedWords = fixIntroStretchedWords(rawWords);

            // Parse into clean line+word structure
            const alignmentLines = parseAlignmentLines(fixedWords);

            alignment = {
              lines: alignmentLines,
              loss: alignResult.loss || 0,
              rawWordCount: rawWords.length,
            };

            // --- STEP 7: Lyrics translation (OpenRouter) ---
            const translateResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openRouterKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [
                  {
                    role: "user",
                    content: `Translate these song lyrics from ${sourceLanguage} to ${targetLanguage}.\nMaintain line breaks. Output only the translation, nothing else.\n\n${lyricsText}`,
                  },
                ],
              }),
            });

            if (!translateResponse.ok) {
              const errText = await translateResponse.text();
              return JSON.stringify({ _error: `OpenRouter translation error: ${translateResponse.status} ${errText}` });
            }

            const translateResult = await translateResponse.json();
            const translatedText = translateResult.choices?.[0]?.message?.content;
            if (!translatedText) {
              return JSON.stringify({ _error: "No translation returned from LLM" });
            }

            translation = {
              languageCode: targetLanguage,
              text: translatedText,
              model,
            };

            // --- STEP 8: Upload alignment + translation to IPFS ---
            alignmentCID = await uploadToFilebase(
              filebaseKey,
              JSON.stringify(alignment),
              "application/json",
              `alignment-${prefix}.json`
            );
            translationCID = await uploadToFilebase(
              filebaseKey,
              JSON.stringify(translation),
              "application/json",
              `translation-${prefix}.json`
            );
          }

          return JSON.stringify({
            audioCID, coverCID, instrumentalCID, vocalsCID, canvasCID,
            songMetadataCID, ipaMetadataCID, nftMetadataCID,
            alignmentCID, translationCID,
            alignment,
            translation,
          });
        } catch (innerErr) {
          return JSON.stringify({ _error: innerErr?.message || String(innerErr) });
        }
      }
    );

    const result = JSON.parse(resultJson);
    if (result._error) throw new Error(result._error);

    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        version: "song-publish-v1",
        user: userAddress,
        ...result,
        hashes: {
          audio: `0x${audioHash}`,
          cover: `0x${coverHash}`,
          instrumental: `0x${instrumentalHash}`,
          vocals: `0x${vocalsHash}`,
          canvas: canvasHash ? `0x${canvasHash}` : null,
          songMetadata: `0x${songMetadataHash}`,
        },
      }),
    });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        version: "song-publish-v1",
        error: e?.message || String(e),
      }),
    });
  }
};

main();
