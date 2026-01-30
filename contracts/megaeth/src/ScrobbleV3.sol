// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ScrobbleV3 — Track Registry + Scrobble Events
/// @notice Tracks are registered once (title/artist/album stored on-chain).
///         Scrobbles are cheap event-only references to a trackId.
///         trackId = keccak256(abi.encode(uint8(kind), payload))
///           kind 1 (MBID):  payload = bytes16(mbid)
///           kind 2 (ipId):  payload = address(ipId)
///           kind 3 (meta):  payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
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
        uint64 registeredAt;
        bool exists;
    }

    mapping(bytes32 => Track) public tracks;

    event TrackRegistered(
        bytes32 indexed trackId,
        bytes32 indexed metaHash,
        uint64 registeredAt
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

    function registerTracksBatch(
        bytes32[] calldata trackIds,
        uint8[] calldata kinds,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums
    ) external onlySponsor {
        uint256 len = trackIds.length;
        require(len == kinds.length && len == titles.length && len == artists.length && len == albums.length, "length mismatch");
        require(len <= MAX_TRACK_REG, "batch too large");

        for (uint256 i; i < len; ) {
            _registerOne(trackIds[i], kinds[i], titles[i], artists[i], albums[i]);
            unchecked { ++i; }
        }
    }

    // ── Combined: register + scrobble in one tx ──────────────────────────

    function registerAndScrobbleBatch(
        address user,
        bytes32[] calldata newTrackIds,
        uint8[] calldata kinds,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums,
        bytes32[] calldata trackIds,
        uint64[] calldata timestamps
    ) external onlySponsor {
        // Register phase
        uint256 regLen = newTrackIds.length;
        if (regLen > 0) {
            require(regLen == kinds.length && regLen == titles.length && regLen == artists.length && regLen == albums.length, "reg length mismatch");
            require(regLen <= MAX_TRACK_REG, "reg batch too large");
            for (uint256 i; i < regLen; ) {
                _registerOne(newTrackIds[i], kinds[i], titles[i], artists[i], albums[i]);
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

    // ── View helpers ─────────────────────────────────────────────────────

    function isRegistered(bytes32 trackId) external view returns (bool) {
        return tracks[trackId].exists;
    }

    function getTrack(bytes32 trackId) external view returns (
        string memory title,
        string memory artist,
        string memory album,
        uint64 registeredAt
    ) {
        Track storage t = tracks[trackId];
        require(t.exists, "not registered");
        return (t.title, t.artist, t.album, t.registeredAt);
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _registerOne(
        bytes32 trackId,
        uint8 kind,
        string calldata title,
        string calldata artist,
        string calldata album
    ) internal {
        require(trackId != bytes32(0), "zero trackId");
        require(kind >= 1 && kind <= 3, "invalid kind");
        require(!tracks[trackId].exists, "already registered");
        require(bytes(title).length <= MAX_STR, "title too long");
        require(bytes(artist).length <= MAX_STR, "artist too long");
        require(bytes(album).length <= MAX_STR, "album too long");

        // Enforce trackId derivation for meta kind
        if (kind == 3) {
            bytes32 metaPayloadHash = keccak256(abi.encode(title, artist, album));
            bytes32 expected = keccak256(abi.encode(uint8(3), metaPayloadHash));
            require(trackId == expected, "bad meta trackId");
        }

        uint64 nowTs = uint64(block.timestamp);
        tracks[trackId] = Track({
            title: title,
            artist: artist,
            album: album,
            registeredAt: nowTs,
            exists: true
        });

        bytes32 metaHash = keccak256(abi.encode(title, artist, album));
        emit TrackRegistered(trackId, metaHash, nowTs);
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
