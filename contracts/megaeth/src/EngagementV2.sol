// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EngagementV2 — Likes, comments, reveals, bans
/// @notice Uses postIdBytes32 as universal content key (not Story ipId).
///         Includes permissionless reveal payments with 24h viewing windows.
///         Sponsor-gated social actions. Moderator-gated nullifier bans.
contract EngagementV2 is ReentrancyGuard {
    // ── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroPostId();
    error ZeroLangCode();
    error EmptyText();
    error TooLong();
    error BadBatchSize();
    error NoPayment();
    error TransferFailed();
    error BelowMinimum();
    error PriceAlreadySet();

    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isSponsor;
    mapping(address => bool) public isModerator;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlySponsor() {
        if (!isSponsor[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyModerator() {
        if (!isModerator[msg.sender]) revert Unauthorized();
        _;
    }

    event OwnerUpdated(address indexed newOwner);
    event SponsorUpdated(address indexed sponsor, bool active);
    event ModeratorUpdated(address indexed moderator, bool active);

    // ── Charity wallet (immutable) ───────────────────────────────────────

    address public immutable charityWallet;
    uint256 public constant MIN_REVEAL_PRICE = 0.0001 ether;

    constructor(address _sponsor, address _charityWallet) {
        if (_sponsor == address(0)) revert ZeroAddress();
        if (_charityWallet == address(0)) revert ZeroAddress();

        owner = msg.sender;
        charityWallet = _charityWallet;

        isSponsor[msg.sender] = true;
        isSponsor[_sponsor] = true;
        isModerator[msg.sender] = true;

        emit OwnerUpdated(msg.sender);
        emit SponsorUpdated(msg.sender, true);
        emit SponsorUpdated(_sponsor, true);
        emit ModeratorUpdated(msg.sender, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setSponsor(address sponsor, bool active) external onlyOwner {
        if (sponsor == address(0)) revert ZeroAddress();
        isSponsor[sponsor] = active;
        emit SponsorUpdated(sponsor, active);
    }

    function setModerator(address moderator, bool active) external onlyOwner {
        if (moderator == address(0)) revert ZeroAddress();
        isModerator[moderator] = active;
        emit ModeratorUpdated(moderator, active);
    }

    // ── Limits ───────────────────────────────────────────────────────────

    uint256 public constant MAX_COMMENT = 1000;
    uint256 public constant MAX_TRANSLATION = 5000;
    uint256 public constant MAX_BATCH = 50;

    // ── Reveal Pricing (immutable after first set) ───────────────────────

    mapping(bytes32 => uint256) public revealPriceWei;

    event RevealPriceSet(bytes32 indexed postId, uint256 priceWei);

    function setRevealPriceFor(bytes32 postId, uint256 priceWei) external onlySponsor {
        if (postId == bytes32(0)) revert ZeroPostId();
        if (revealPriceWei[postId] != 0) revert PriceAlreadySet();
        if (priceWei < MIN_REVEAL_PRICE) revert BelowMinimum();

        revealPriceWei[postId] = priceWei;
        emit RevealPriceSet(postId, priceWei);
    }

    // ── Reveal Payments (permissionless) ─────────────────────────────────
    // Viewer pays directly. 24h viewing window per payment.

    mapping(bytes32 => mapping(address => uint64)) public revealPaidAt;
    mapping(bytes32 => mapping(address => uint32)) public revealNonce;

    event RevealPaid(
        bytes32 indexed postId,
        address indexed viewer,
        uint256 amount,
        uint64 paidAt,
        uint32 nonce
    );

    function payReveal(bytes32 postId) external payable nonReentrant {
        if (postId == bytes32(0)) revert ZeroPostId();
        if (msg.value == 0) revert NoPayment();

        uint256 price = revealPriceWei[postId];
        if (price == 0) price = MIN_REVEAL_PRICE;
        if (msg.value < price) revert BelowMinimum();

        // Update state before external call (CEI pattern)
        uint64 paidAt = uint64(block.timestamp);
        uint32 newNonce;
        unchecked {
            newNonce = revealNonce[postId][msg.sender] + 1;
        }
        revealPaidAt[postId][msg.sender] = paidAt;
        revealNonce[postId][msg.sender] = newNonce;

        // Forward funds to charity
        (bool ok,) = charityWallet.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit RevealPaid(postId, msg.sender, msg.value, paidAt, newNonce);
    }

    // ── Nullifier Bans (moderator-gated) ─────────────────────────────────
    // nullifierHash is NOT logged in PhotoRevealed (privacy).
    // Backend stores (watermarkCode -> nullifierHash) offchain.
    // On leak: moderator calls banNullifierFor().

    mapping(bytes32 => bool) public bannedNullifiers;

    event NullifierBanned(
        bytes32 indexed nullifierHash,
        bytes32 indexed relatedPostId,
        address indexed moderator,
        string reason
    );

    function banNullifierFor(
        bytes32 nullifierHash,
        bytes32 relatedPostId,
        string calldata reason
    ) external onlyModerator {
        bannedNullifiers[nullifierHash] = true;
        emit NullifierBanned(nullifierHash, relatedPostId, msg.sender, reason);
    }

    function isBanned(bytes32 nullifierHash) external view returns (bool) {
        return bannedNullifiers[nullifierHash];
    }

    // ── Likes ────────────────────────────────────────────────────────────
    // Idempotent: retries are no-ops.

    mapping(bytes32 => mapping(address => bool)) public liked;
    mapping(bytes32 => uint256) public likeCount;

    event Liked(bytes32 indexed postId, address indexed liker);
    event Unliked(bytes32 indexed postId, address indexed unliker);

    function likeFor(address liker, bytes32 postId) external onlySponsor {
        if (liker == address(0)) revert ZeroAddress();
        if (postId == bytes32(0)) revert ZeroPostId();
        if (liked[postId][liker]) return;

        liked[postId][liker] = true;
        unchecked { ++likeCount[postId]; }

        emit Liked(postId, liker);
    }

    function unlikeFor(address unliker, bytes32 postId) external onlySponsor {
        if (unliker == address(0)) revert ZeroAddress();
        if (postId == bytes32(0)) revert ZeroPostId();
        if (!liked[postId][unliker]) return;

        liked[postId][unliker] = false;
        unchecked { --likeCount[postId]; }

        emit Unliked(postId, unliker);
    }

    function likeBatchFor(address liker, bytes32[] calldata postIds) external onlySponsor {
        if (liker == address(0)) revert ZeroAddress();
        uint256 n = postIds.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatchSize();
        for (uint256 i; i < n; ) {
            bytes32 postId = postIds[i];
            if (postId == bytes32(0)) revert ZeroPostId();
            if (!liked[postId][liker]) {
                liked[postId][liker] = true;
                unchecked { ++likeCount[postId]; }
                emit Liked(postId, liker);
            }
            unchecked { ++i; }
        }
    }

    // ── Comments ─────────────────────────────────────────────────────────
    // Text stored in events only.

    mapping(bytes32 => uint256) public commentCount;
    uint256 public nextCommentId;

    event CommentAdded(
        bytes32 indexed postId,
        address indexed author,
        uint256 indexed commentId,
        string text
    );

    function commentFor(
        address author,
        bytes32 postId,
        string calldata text
    ) external onlySponsor returns (uint256 commentId) {
        if (author == address(0)) revert ZeroAddress();
        if (postId == bytes32(0)) revert ZeroPostId();
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_COMMENT) revert TooLong();

        commentId = nextCommentId;
        unchecked {
            ++nextCommentId;
            ++commentCount[postId];
        }

        emit CommentAdded(postId, author, commentId, text);
    }

    // ── Translations ─────────────────────────────────────────────────────

    event TranslationAdded(
        bytes32 indexed postId,
        bytes2 indexed langCode,
        address indexed translator,
        string text
    );

    function translateFor(
        address translator,
        bytes32 postId,
        bytes2 langCode,
        string calldata text
    ) external onlySponsor {
        if (translator == address(0)) revert ZeroAddress();
        if (postId == bytes32(0)) revert ZeroPostId();
        if (langCode == bytes2(0)) revert ZeroLangCode();
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_TRANSLATION) revert TooLong();

        emit TranslationAdded(postId, langCode, translator, text);
    }

    // ── Photo Reveals (sponsor-gated logging) ────────────────────────────
    // NOTE: nullifierHash is NOT emitted (privacy).
    // Backend stores (watermarkCode -> nullifierHash) offchain.

    event PhotoRevealed(
        bytes32 indexed postId,
        address indexed viewer,
        bytes32 watermarkCode,
        uint32 nonce
    );

    function logRevealFor(
        address viewer,
        bytes32 postId,
        bytes32 watermarkCode,
        uint32 nonce
    ) external onlySponsor {
        if (viewer == address(0)) revert ZeroAddress();
        if (postId == bytes32(0)) revert ZeroPostId();

        emit PhotoRevealed(postId, viewer, watermarkCode, nonce);
    }

    // ── Flags (Moderation) ───────────────────────────────────────────────

    mapping(bytes32 => mapping(address => bool)) public flagged;
    mapping(bytes32 => uint256) public flagCount;

    event Flagged(bytes32 indexed postId, address indexed flagger, uint8 reason);

    function flagFor(address flagger, bytes32 postId, uint8 reason) external onlySponsor {
        if (flagger == address(0)) revert ZeroAddress();
        if (postId == bytes32(0)) revert ZeroPostId();
        if (flagged[postId][flagger]) return;

        flagged[postId][flagger] = true;
        unchecked { ++flagCount[postId]; }

        emit Flagged(postId, flagger, reason);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getEngagement(bytes32 postId)
        external
        view
        returns (uint256 likes, uint256 comments, uint256 flags)
    {
        return (likeCount[postId], commentCount[postId], flagCount[postId]);
    }

    function hasLiked(address user, bytes32 postId) external view returns (bool) {
        return liked[postId][user];
    }

    function hasFlagged(address user, bytes32 postId) external view returns (bool) {
        return flagged[postId][user];
    }

    function getRevealStatus(bytes32 postId, address viewer)
        external
        view
        returns (uint64 paidAt, uint32 nonce, uint256 price)
    {
        paidAt = revealPaidAt[postId][viewer];
        nonce = revealNonce[postId][viewer];
        price = revealPriceWei[postId];
        if (price == 0) price = MIN_REVEAL_PRICE;
    }

    function isRevealValid(bytes32 postId, address viewer) external view returns (bool) {
        uint64 paidAt = revealPaidAt[postId][viewer];
        if (paidAt == 0) return false;
        return block.timestamp <= paidAt + 24 hours;
    }
}
