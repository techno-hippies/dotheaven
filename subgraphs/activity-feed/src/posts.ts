import { crypto, ByteArray, Bytes } from "@graphprotocol/graph-ts";
import {
  PostCreated as PostCreatedEvent,
} from "../generated/PostsV1/PostsV1";
import { Post } from "../generated/schema";

/**
 * Extract IPFS CID from metadata URI.
 * Handles: https://heaven.myfilebase.com/ipfs/{CID} or ipfs://{CID}
 */
function extractIpfsCid(uri: string): string | null {
  // Gateway URL: .../ipfs/{CID}
  let ipfsIndex = uri.indexOf("/ipfs/");
  if (ipfsIndex != -1) {
    return uri.slice(ipfsIndex + 6);
  }
  // ipfs:// protocol
  if (uri.startsWith("ipfs://")) {
    return uri.slice(7);
  }
  return null;
}

/**
 * Compute contentId for clustering/deduplication.
 * contentId = keccak256("heaven:content:" + cid)
 */
function computeContentId(cid: string): Bytes {
  let input = ByteArray.fromUTF8("heaven:content:" + cid);
  return Bytes.fromByteArray(crypto.keccak256(input));
}

export function handlePostCreated(event: PostCreatedEvent): void {
  let id = event.params.ipId.toHexString();

  let post = new Post(id);
  post.creator = event.params.creator;
  post.contentType = event.params.contentType;
  post.metadataUri = event.params.metadataUri;
  post.isAdult = event.params.isAdult;
  post.likeCount = 0;
  post.commentCount = 0;
  post.flagCount = 0;
  post.blockNumber = event.block.number;
  post.blockTimestamp = event.block.timestamp;
  post.transactionHash = event.transaction.hash;

  // Extract IPFS CID and compute contentId for clustering
  let cid = extractIpfsCid(event.params.metadataUri);
  if (cid !== null) {
    post.ipfsHash = cid;
    post.contentId = computeContentId(cid as string);
  }

  post.save();
}
