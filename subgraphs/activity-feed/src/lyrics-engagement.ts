import { Bytes } from "@graphprotocol/graph-ts";
import { LyricsTranslationAdded as LyricsTranslationAddedEvent } from "../generated/LyricsEngagementV1/LyricsEngagementV1";
import { SongTranslation } from "../generated/schema";

/**
 * Convert bytes2 langCode to a readable string, e.g. 0x7a68 -> "zh"
 */
function langCodeToString(langCode: Bytes): string {
  let hex = langCode.toHexString(); // "0x7a68"
  let result = "";
  for (let i = 2; i < hex.length; i += 2) {
    let charCode = parseInt(hex.substr(i, 2), 16) as i32;
    if (charCode == 0) break;
    result += String.fromCharCode(charCode);
  }
  return result;
}

export function handleLyricsTranslationAdded(event: LyricsTranslationAddedEvent): void {
  let ipId = event.params.ipId.toHexString();
  let langCode = langCodeToString(event.params.langCode);

  // Unique ID per event — query latest by ipId+lang with orderBy: blockTimestamp, first: 1
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let translation = new SongTranslation(id);
  translation.ipId = event.params.ipId;
  translation.langCode = langCode;
  translation.translator = event.params.translator;
  translation.cid = event.params.cid;
  translation.textHash = event.params.textHash;
  translation.byteLen = event.params.byteLen.toI32();
  translation.blockNumber = event.block.number;
  translation.blockTimestamp = event.block.timestamp;
  translation.transactionHash = event.transaction.hash;
  translation.save();
}
