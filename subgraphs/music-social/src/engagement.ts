import { Bytes } from "@graphprotocol/graph-ts";
import {
  TranslationAdded as TranslationAddedEvent,
  Liked as LikedEvent,
  Unliked as UnlikedEvent,
  CommentAdded as CommentAddedEvent,
  Flagged as FlaggedEvent,
} from "../generated/EngagementV2/EngagementV2";
import { Post, Translation, Comment } from "../generated/schema";

/**
 * Convert bytes2 langCode to a readable string, e.g. 0x6a61 -> "ja"
 */
function langCodeToString(langCode: Bytes): string {
  let hex = langCode.toHexString(); // "0x6a61"
  let result = "";
  // Skip "0x", decode each byte pair
  for (let i = 2; i < hex.length; i += 2) {
    let charCode = parseInt(hex.substr(i, 2), 16) as i32;
    if (charCode == 0) break; // stop at null byte
    result += String.fromCharCode(charCode);
  }
  return result;
}

export function handleTranslationAdded(event: TranslationAddedEvent): void {
  let postId = event.params.postId.toHexString();
  let langCode = langCodeToString(event.params.langCode);

  // Use postId-langCode as ID — overwrites previous translations for same language
  let id = postId + "-" + langCode;
  let translation = new Translation(id);
  translation.post = postId;
  translation.postId = event.params.postId;
  translation.langCode = langCode;
  translation.translator = event.params.translator;
  translation.text = event.params.text;
  translation.blockNumber = event.block.number;
  translation.blockTimestamp = event.block.timestamp;
  translation.transactionHash = event.transaction.hash;
  translation.save();
}

export function handleLiked(event: LikedEvent): void {
  let postId = event.params.postId.toHexString();
  let post = Post.load(postId);
  if (post != null) {
    post.likeCount = post.likeCount + 1;
    post.save();
  }
}

export function handleUnliked(event: UnlikedEvent): void {
  let postId = event.params.postId.toHexString();
  let post = Post.load(postId);
  if (post != null) {
    post.likeCount = post.likeCount > 0 ? post.likeCount - 1 : 0;
    post.save();
  }
}

export function handleCommentAdded(event: CommentAddedEvent): void {
  let postId = event.params.postId.toHexString();

  // Create Comment entity
  let commentId = event.params.commentId.toString();
  let comment = new Comment(commentId);
  comment.post = postId;
  comment.postId = event.params.postId;
  comment.author = event.params.author;
  comment.text = event.params.text;
  comment.blockNumber = event.block.number;
  comment.blockTimestamp = event.block.timestamp;
  comment.transactionHash = event.transaction.hash;
  comment.save();

  // Increment post comment count
  let post = Post.load(postId);
  if (post != null) {
    post.commentCount = post.commentCount + 1;
    post.save();
  }
}

export function handleFlagged(event: FlaggedEvent): void {
  let postId = event.params.postId.toHexString();
  let post = Post.load(postId);
  if (post != null) {
    post.flagCount = post.flagCount + 1;
    post.save();
  }
}
