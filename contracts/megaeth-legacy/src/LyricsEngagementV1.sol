// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LyricsEngagementV1 — Song lyrics translation persistence
/// @notice Stores lyrics translation metadata on-chain (event-only).
///         Full translated text lives on IPFS; only CID + hash + size emitted.
///         Sponsor-gated — only authorized PKPs can broadcast.
contract LyricsEngagementV1 {
    // ── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroIpId();
    error ZeroLangCode();
    error EmptyCid();
    error TooLong();

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

    // ── Limits ───────────────────────────────────────────────────────────

    uint256 public constant MAX_CID = 128;

    // ── Events ───────────────────────────────────────────────────────────

    /// @notice Emitted when a lyrics translation is added for a song
    /// @param ipId Story Protocol IP Asset address (the song)
    /// @param langCode ISO 639-1 language code as bytes2 (e.g. 0x7a68 = "zh")
    /// @param translator Address that requested the translation
    /// @param cid IPFS CID of the full translation JSON
    /// @param textHash SHA-256 hash of the translated text
    /// @param byteLen UTF-8 byte length of the translated text
    event LyricsTranslationAdded(
        address indexed ipId,
        bytes2 indexed langCode,
        address indexed translator,
        string cid,
        bytes32 textHash,
        uint32 byteLen
    );

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address _sponsor) {
        if (_sponsor == address(0)) revert ZeroAddress();

        owner = msg.sender;
        isSponsor[msg.sender] = true;
        isSponsor[_sponsor] = true;

        emit OwnerUpdated(msg.sender);
        emit SponsorUpdated(msg.sender, true);
        emit SponsorUpdated(_sponsor, true);
    }

    // ── Admin ────────────────────────────────────────────────────────────

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

    // ── Lyrics Translation ───────────────────────────────────────────────

    /// @notice Record a lyrics translation for a published song
    /// @param translator User who triggered the translation
    /// @param ipId Story Protocol IP Asset ID (address)
    /// @param langCode ISO 639-1 code as bytes2 (e.g. "zh" = 0x7a68)
    /// @param cid IPFS CID of the translation JSON
    /// @param textHash SHA-256 of the translated text bytes
    /// @param byteLen UTF-8 byte length of the translated text
    function translateLyricsFor(
        address translator,
        address ipId,
        bytes2 langCode,
        string calldata cid,
        bytes32 textHash,
        uint32 byteLen
    ) external onlySponsor {
        if (translator == address(0)) revert ZeroAddress();
        if (ipId == address(0)) revert ZeroIpId();
        if (langCode == bytes2(0)) revert ZeroLangCode();
        uint256 len = bytes(cid).length;
        if (len == 0) revert EmptyCid();
        if (len > MAX_CID) revert TooLong();

        emit LyricsTranslationAdded(ipId, langCode, translator, cid, textHash, byteLen);
    }
}
