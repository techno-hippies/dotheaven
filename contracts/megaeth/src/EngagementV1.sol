// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EngagementV1 — Likes, comments, translations, flags
/// @notice References Story Protocol ipIds (bytes32) as content targets.
///         All mutations are sponsor-gated (gasless for users via Lit Actions).
///         Comments and translations are event-only (no storage for text).
contract EngagementV1 {
    // ── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroIpId();
    error ZeroLangCode();
    error EmptyText();
    error TooLong();
    error BadBatchSize();

    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isSponsor;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlySponsor() {
        if (!isSponsor[msg.sender]) revert Unauthorized();
        _;
    }

    event OwnerUpdated(address indexed newOwner);
    event SponsorUpdated(address indexed sponsor, bool active);

    constructor(address _sponsor) {
        if (_sponsor == address(0)) revert ZeroAddress();
        owner = msg.sender;
        isSponsor[msg.sender] = true;
        isSponsor[_sponsor] = true;
        emit OwnerUpdated(msg.sender);
        emit SponsorUpdated(msg.sender, true);
        emit SponsorUpdated(_sponsor, true);
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

    // ── Limits ───────────────────────────────────────────────────────────

    uint256 public constant MAX_COMMENT = 1000;      // max comment text bytes
    uint256 public constant MAX_TRANSLATION = 5000;   // max translation text bytes
    uint256 public constant MAX_BATCH = 50;            // max batch like/unlike

    // ── Likes ────────────────────────────────────────────────────────────
    // Idempotent: retries are no-ops (important for gasless sponsor/Lit flows).

    mapping(bytes32 => mapping(address => bool)) public liked;
    mapping(bytes32 => uint256) public likeCount;

    event Liked(bytes32 indexed ipId, address indexed liker);
    event Unliked(bytes32 indexed ipId, address indexed unliker);

    function likeFor(address liker, bytes32 ipId) external onlySponsor {
        if (liker == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();
        if (liked[ipId][liker]) return;

        liked[ipId][liker] = true;
        unchecked { ++likeCount[ipId]; }

        emit Liked(ipId, liker);
    }

    function unlikeFor(address unliker, bytes32 ipId) external onlySponsor {
        if (unliker == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();
        if (!liked[ipId][unliker]) return;

        liked[ipId][unliker] = false;
        unchecked { --likeCount[ipId]; }

        emit Unliked(ipId, unliker);
    }

    function likeBatchFor(address liker, bytes32[] calldata ipIds) external onlySponsor {
        if (liker == address(0)) revert ZeroAddress();
        uint256 n = ipIds.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatchSize();
        for (uint256 i; i < n; ) {
            bytes32 ipId = ipIds[i];
            if (ipId == bytes32(0)) revert ZeroIpId();
            if (!liked[ipId][liker]) {
                liked[ipId][liker] = true;
                unchecked { ++likeCount[ipId]; }
                emit Liked(ipId, liker);
            }
            unchecked { ++i; }
        }
    }

    function unlikeBatchFor(address unliker, bytes32[] calldata ipIds) external onlySponsor {
        if (unliker == address(0)) revert ZeroAddress();
        uint256 n = ipIds.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatchSize();
        for (uint256 i; i < n; ) {
            bytes32 ipId = ipIds[i];
            if (ipId == bytes32(0)) revert ZeroIpId();
            if (liked[ipId][unliker]) {
                liked[ipId][unliker] = false;
                unchecked { --likeCount[ipId]; }
                emit Unliked(ipId, unliker);
            }
            unchecked { ++i; }
        }
    }

    // ── Comments ─────────────────────────────────────────────────────────
    // Text stored in events only. Contract tracks count + global commentId.

    mapping(bytes32 => uint256) public commentCount;
    uint256 public nextCommentId;

    event CommentAdded(
        bytes32 indexed ipId,
        address indexed author,
        uint256 indexed commentId,
        string text
    );

    function commentFor(
        address author,
        bytes32 ipId,
        string calldata text
    ) external onlySponsor returns (uint256 commentId) {
        if (author == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_COMMENT) revert TooLong();

        commentId = nextCommentId;
        unchecked {
            ++nextCommentId;
            ++commentCount[ipId];
        }

        emit CommentAdded(ipId, author, commentId, text);
    }

    // ── Translations ─────────────────────────────────────────────────────
    // Community-contributed i18n. Event-only, subgraph indexes per ipId per lang.

    event TranslationAdded(
        bytes32 indexed ipId,
        bytes2 indexed langCode,
        address indexed translator,
        string text
    );

    function translateFor(
        address translator,
        bytes32 ipId,
        bytes2 langCode,
        string calldata text
    ) external onlySponsor {
        if (translator == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();
        if (langCode == bytes2(0)) revert ZeroLangCode();
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_TRANSLATION) revert TooLong();

        emit TranslationAdded(ipId, langCode, translator, text);
    }

    // ── Flags (Moderation) ───────────────────────────────────────────────
    // Idempotent: double-flag is a no-op. Reason code for moderation workflows.

    mapping(bytes32 => mapping(address => bool)) public flagged;
    mapping(bytes32 => uint256) public flagCount;

    event Flagged(bytes32 indexed ipId, address indexed flagger, uint8 reason);

    function flagFor(address flagger, bytes32 ipId, uint8 reason) external onlySponsor {
        if (flagger == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();
        if (flagged[ipId][flagger]) return;

        flagged[ipId][flagger] = true;
        unchecked { ++flagCount[ipId]; }

        emit Flagged(ipId, flagger, reason);
    }

    // ── Photo Reveals ─────────────────────────────────────────────────────
    // Audit trail for per-viewer watermarked original photo reveals.

    event PhotoRevealed(
        bytes32 indexed ipId,
        address indexed viewer,
        bytes32 watermarkCode
    );

    function logRevealFor(
        address viewer,
        bytes32 ipId,
        bytes32 watermarkCode
    ) external onlySponsor {
        if (viewer == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();

        emit PhotoRevealed(ipId, viewer, watermarkCode);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getEngagement(bytes32 ipId)
        external
        view
        returns (uint256 likes, uint256 comments, uint256 flags)
    {
        return (likeCount[ipId], commentCount[ipId], flagCount[ipId]);
    }

    function hasLiked(address user, bytes32 ipId) external view returns (bool) {
        return liked[ipId][user];
    }

    function hasFlagged(address user, bytes32 ipId) external view returns (bool) {
        return flagged[ipId][user];
    }
}
