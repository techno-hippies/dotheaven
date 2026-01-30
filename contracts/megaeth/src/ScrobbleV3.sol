// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ScrobbleV3 — Track Registry + Scrobble Events
/// @notice Tracks are registered once (title/artist/album stored on-chain).
///         Scrobbles are cheap event-only references to a trackId.
///         trackId = keccak256(abi.encode(uint8(kind), payload))
///           kind 1 (MBID):  payload = bytes32(bytes16(mbid))  — low 16 bytes must be zero
///           kind 2 (ipId):  payload = bytes32(uint256(uint160(ipId))) — high 12 bytes must be zero
///           kind 3 (meta):  payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
///         For kind 3, the caller supplies metaPayloadHash (from normalized strings).
///         The on-chain title/artist/album are pretty display strings, not the normalized form.
contract ScrobbleV3 {
    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    address public sponsor;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlySponsor() {
        require(msg.sender == sponsor, "unauthorized");
        _;
    }

    event OwnerUpdated(address indexed newOwner);
    event SponsorUpdated(address indexed newSponsor);

    constructor(address _sponsor) {
        require(_sponsor != address(0), "zero sponsor");
        owner = msg.sender;
        sponsor = _sponsor;
        emit OwnerUpdated(msg.sender);
        emit SponsorUpdated(_sponsor);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setSponsor(address newSponsor) external onlyOwner {
        require(newSponsor != address(0), "zero sponsor");
        sponsor = newSponsor;
        emit SponsorUpdated(newSponsor);
    }

    // ── Track registry ───────────────────────────────────────────────────

    struct Track {
        string title;
        string artist;
        string album;
        bytes32 payload;
        uint8 kind;
        uint64 registeredAt;
        bool exists;
    }

    mapping(bytes32 => Track) public tracks;

    event TrackRegistered(
        bytes32 indexed trackId,
        uint8 indexed kind,
        bytes32 payload,
        bytes32 indexed metaHash,
        uint64 registeredAt
    );

    event TrackUpdated(
        bytes32 indexed trackId,
        bytes32 indexed metaHash
    );

    event Scrobbled(
        address indexed user,
        bytes32 indexed trackId,
        uint64 timestamp
    );

    // ── Limits ───────────────────────────────────────────────────────────

    uint256 public constant MAX_TRACK_REG = 50;
    uint256 public constant MAX_SCROBBLES = 200;
    uint256 public constant MAX_STR = 128;

    // ── Track registration ───────────────────────────────────────────────

    /// @notice Register tracks. `payloads[i]` is the raw derivation input:
    ///         kind 1: bytes32(bytes16(mbid))  (left-aligned, low 16 bytes zero)
    ///         kind 2: bytes32(uint256(uint160(ipId)))  (right-aligned, high 12 bytes zero)
    ///         kind 3: keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
    function registerTracksBatch(
        uint8[] calldata kinds,
        bytes32[] calldata payloads,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums
    ) external onlySponsor {
        uint256 len = kinds.length;
        require(
            len == payloads.length &&
            len == titles.length &&
            len == artists.length &&
            len == albums.length,
            "length mismatch"
        );
        require(len <= MAX_TRACK_REG, "batch too large");

        for (uint256 i; i < len; ) {
            _registerOne(kinds[i], payloads[i], titles[i], artists[i], albums[i]);
            unchecked { ++i; }
        }
    }

    /// @notice Register (optional) + scrobble in one tx.
    function registerAndScrobbleBatch(
        address user,
        uint8[] calldata regKinds,
        bytes32[] calldata regPayloads,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums,
        bytes32[] calldata trackIds,
        uint64[] calldata timestamps
    ) external onlySponsor {
        // Register phase
        uint256 regLen = regKinds.length;
        if (regLen > 0) {
            require(
                regLen == regPayloads.length &&
                regLen == titles.length &&
                regLen == artists.length &&
                regLen == albums.length,
                "reg length mismatch"
            );
            require(regLen <= MAX_TRACK_REG, "reg batch too large");
            for (uint256 i; i < regLen; ) {
                _registerOne(regKinds[i], regPayloads[i], titles[i], artists[i], albums[i]);
                unchecked { ++i; }
            }
        }

        // Scrobble phase
        _scrobbleBatch(user, trackIds, timestamps);
    }

    // ── Scrobbling ───────────────────────────────────────────────────────

    function scrobbleBatch(
        address user,
        bytes32[] calldata trackIds,
        uint64[] calldata timestamps
    ) external onlySponsor {
        _scrobbleBatch(user, trackIds, timestamps);
    }

    // ── Track metadata update ────────────────────────────────────────────

    /// @notice Update display metadata for an existing track (typo/casing fixes).
    ///         Does not change trackId or payload — only the pretty strings.
    function updateTrack(
        bytes32 trackId,
        string calldata title,
        string calldata artist,
        string calldata album
    ) external onlySponsor {
        Track storage t = tracks[trackId];
        require(t.exists, "not registered");
        require(bytes(title).length <= MAX_STR, "title too long");
        require(bytes(artist).length <= MAX_STR, "artist too long");
        require(bytes(album).length <= MAX_STR, "album too long");

        t.title = title;
        t.artist = artist;
        t.album = album;

        emit TrackUpdated(trackId, keccak256(abi.encode(title, artist, album)));
    }

    // ── View helpers ─────────────────────────────────────────────────────

    function isRegistered(bytes32 trackId) external view returns (bool) {
        return tracks[trackId].exists;
    }

    function getTrack(bytes32 trackId) external view returns (
        string memory title,
        string memory artist,
        string memory album,
        uint8 kind,
        bytes32 payload,
        uint64 registeredAt
    ) {
        Track storage t = tracks[trackId];
        require(t.exists, "not registered");
        return (t.title, t.artist, t.album, t.kind, t.payload, t.registeredAt);
    }

    // ── Internal ─────────────────────────────────────────────────────────

    /// @dev Validates payload canonicality, computes trackId = keccak256(abi.encode(kind, payload)),
    ///      stores metadata + payload, and emits TrackRegistered.
    function _registerOne(
        uint8 kind,
        bytes32 payload,
        string calldata title,
        string calldata artist,
        string calldata album
    ) internal {
        require(kind >= 1 && kind <= 3, "invalid kind");
        require(payload != bytes32(0), "zero payload");

        // Canonical payload checks
        if (kind == 1) {
            // bytes16 mbid left-aligned: low 16 bytes must be zero
            require(uint128(uint256(payload)) == 0, "bad mbid payload");
        } else if (kind == 2) {
            // address right-aligned: high 12 bytes must be zero
            require(uint256(payload) >> 160 == 0, "bad ipid payload");
        }

        require(bytes(title).length <= MAX_STR, "title too long");
        require(bytes(artist).length <= MAX_STR, "artist too long");
        require(bytes(album).length <= MAX_STR, "album too long");

        // Derive trackId deterministically
        bytes32 trackId = keccak256(abi.encode(kind, payload));
        require(!tracks[trackId].exists, "already registered");

        uint64 nowTs = uint64(block.timestamp);
        tracks[trackId] = Track({
            title: title,
            artist: artist,
            album: album,
            payload: payload,
            kind: kind,
            registeredAt: nowTs,
            exists: true
        });

        bytes32 metaHash = keccak256(abi.encode(title, artist, album));
        emit TrackRegistered(trackId, kind, payload, metaHash, nowTs);
    }

    function _scrobbleBatch(
        address user,
        bytes32[] calldata trackIds,
        uint64[] calldata timestamps
    ) internal {
        require(user != address(0), "zero user");
        uint256 len = trackIds.length;
        require(len == timestamps.length, "length mismatch");
        require(len <= MAX_SCROBBLES, "batch too large");

        for (uint256 i; i < len; ) {
            bytes32 trackId = trackIds[i];
            require(trackId != bytes32(0), "zero trackId");
            require(tracks[trackId].exists, "unknown track");

            emit Scrobbled(user, trackId, timestamps[i]);
            unchecked { ++i; }
        }
    }
}
