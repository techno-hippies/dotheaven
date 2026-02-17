// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ScrobbleV4 — Track Registry + Scrobble Events (Tempo)
/// @notice Tracks are registered once (title/artist/album stored on-chain).
///         Scrobbles are cheap event-only references to a trackId.
///         trackId = keccak256(abi.encode(uint8(kind), payload))
///           kind 1 (MBID):  payload = bytes32(bytes16(mbid))  — low 16 bytes must be zero
///           kind 2 (ipId):  payload = bytes32(uint256(uint160(ipId))) — high 12 bytes must be zero
///           kind 3 (meta):  payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
///
/// @dev Permission model on Tempo:
///      - User-facing functions (scrobble, registerAndScrobble): onlyUser(user)
///        Verifies msg.sender == user.
///      - Global track operations (registerTracksBatch, cover, update): onlyOperator
///        Admin/maintenance only. NOT in the per-scrobble hot path.
contract ScrobbleV4 {
    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isOperator;

    error Unauthorized();
    error ZeroAddress();
    error NotUserSender();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyUser(address user) {
        if (user == address(0)) revert ZeroAddress();
        if (msg.sender != user) revert NotUserSender();
        _;
    }

    event OwnerUpdated(address indexed newOwner);
    event OperatorUpdated(address indexed operator, bool active);

    /// @param operator_ Initial operator address (for global track ops)
    constructor(address operator_) {
        if (operator_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        isOperator[operator_] = true;
        emit OwnerUpdated(msg.sender);
        emit OperatorUpdated(operator_, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setOperator(address operator_, bool active) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        isOperator[operator_] = active;
        emit OperatorUpdated(operator_, active);
    }

    // ── Track registry ───────────────────────────────────────────────────

    struct Track {
        string title;
        string artist;
        string album;
        string coverCid;
        bytes32 payload;
        uint8 kind;
        uint32 durationSec;
        uint64 registeredAt;
        bool exists;
    }

    mapping(bytes32 => Track) public tracks;

    event TrackRegistered(
        bytes32 indexed trackId,
        uint8 indexed kind,
        bytes32 payload,
        bytes32 indexed metaHash,
        uint64 registeredAt,
        uint32 durationSec
    );

    event TrackUpdated(
        bytes32 indexed trackId,
        bytes32 indexed metaHash
    );

    event TrackCoverSet(
        bytes32 indexed trackId,
        string coverCid
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
    uint256 public constant MAX_CID = 128;

    // ── Track registration (operator-only, global ops) ───────────────────

    /// @notice Register tracks (admin/maintenance). NOT in per-scrobble hot path.
    ///         Normal user flow goes through registerAndScrobbleBatch() instead.
    function registerTracksBatch(
        uint8[] calldata kinds,
        bytes32[] calldata payloads,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums,
        uint32[] calldata durations
    ) external onlyOperator {
        uint256 len = kinds.length;
        require(
            len == payloads.length &&
            len == titles.length &&
            len == artists.length &&
            len == albums.length &&
            len == durations.length,
            "length mismatch"
        );
        require(len <= MAX_TRACK_REG, "batch too large");

        for (uint256 i; i < len; ) {
            _registerOne(kinds[i], payloads[i], titles[i], artists[i], albums[i], durations[i]);
            unchecked { ++i; }
        }
    }

    // ── User-facing: register + scrobble (Tempo direct-user auth) ──────

    /// @notice Register (optional) + scrobble in one tx.
    ///         msg.sender must equal `user`.
    function registerAndScrobbleBatch(
        address user,
        uint8[] calldata regKinds,
        bytes32[] calldata regPayloads,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums,
        uint32[] calldata durations,
        bytes32[] calldata trackIds,
        uint64[] calldata timestamps
    ) external onlyUser(user) {
        // Register phase
        uint256 regLen = regKinds.length;
        if (regLen > 0) {
            require(
                regLen == regPayloads.length &&
                regLen == titles.length &&
                regLen == artists.length &&
                regLen == albums.length &&
                regLen == durations.length,
                "reg length mismatch"
            );
            require(regLen <= MAX_TRACK_REG, "reg batch too large");
            for (uint256 i; i < regLen; ) {
                _registerOne(regKinds[i], regPayloads[i], titles[i], artists[i], albums[i], durations[i]);
                unchecked { ++i; }
            }
        }

        // Scrobble phase
        _scrobbleBatch(user, trackIds, timestamps);
    }

    // ── User-facing: scrobble only (Tempo direct-user auth) ────────────

    /// @notice Scrobble existing tracks. msg.sender must equal `user`.
    function scrobbleBatch(
        address user,
        bytes32[] calldata trackIds,
        uint64[] calldata timestamps
    ) external onlyUser(user) {
        _scrobbleBatch(user, trackIds, timestamps);
    }

    // ── Track metadata update (operator-only) ────────────────────────────

    /// @notice Update display metadata for an existing track (typo/casing fixes).
    function updateTrack(
        bytes32 trackId,
        string calldata title,
        string calldata artist,
        string calldata album
    ) external onlyOperator {
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

    // ── Track cover (operator-only) ──────────────────────────────────────

    /// @notice Set cover art CID for a track. Only sets if currently empty.
    function setTrackCover(
        bytes32 trackId,
        string calldata coverCid
    ) external onlyOperator {
        Track storage t = tracks[trackId];
        require(t.exists, "not registered");
        require(bytes(coverCid).length > 0, "empty cid");
        require(bytes(coverCid).length <= MAX_CID, "cid too long");
        require(bytes(t.coverCid).length == 0, "cover already set");

        t.coverCid = coverCid;
        emit TrackCoverSet(trackId, coverCid);
    }

    /// @notice Batch set cover art CIDs. Idempotent: skips if already set.
    function setTrackCoverBatch(
        bytes32[] calldata trackIds,
        string[] calldata coverCids
    ) external onlyOperator {
        uint256 len = trackIds.length;
        require(len == coverCids.length, "length mismatch");
        require(len <= MAX_TRACK_REG, "batch too large");

        for (uint256 i; i < len; ) {
            Track storage t = tracks[trackIds[i]];
            if (t.exists && bytes(coverCids[i]).length > 0 && bytes(coverCids[i]).length <= MAX_CID && bytes(t.coverCid).length == 0) {
                t.coverCid = coverCids[i];
                emit TrackCoverSet(trackIds[i], coverCids[i]);
            }
            unchecked { ++i; }
        }
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
        uint64 registeredAt,
        string memory coverCid,
        uint32 durationSec
    ) {
        Track storage t = tracks[trackId];
        require(t.exists, "not registered");
        return (t.title, t.artist, t.album, t.kind, t.payload, t.registeredAt, t.coverCid, t.durationSec);
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _registerOne(
        uint8 kind,
        bytes32 payload,
        string calldata title,
        string calldata artist,
        string calldata album,
        uint32 durationSec
    ) internal {
        require(kind >= 1 && kind <= 3, "invalid kind");
        require(payload != bytes32(0), "zero payload");

        if (kind == 1) {
            require(uint128(uint256(payload)) == 0, "bad mbid payload");
        } else if (kind == 2) {
            require(uint256(payload) >> 160 == 0, "bad ipid payload");
        }

        require(bytes(title).length <= MAX_STR, "title too long");
        require(bytes(artist).length <= MAX_STR, "artist too long");
        require(bytes(album).length <= MAX_STR, "album too long");

        bytes32 trackId = keccak256(abi.encode(kind, payload));
        require(!tracks[trackId].exists, "already registered");

        uint64 nowTs = uint64(block.timestamp);
        tracks[trackId] = Track({
            title: title,
            artist: artist,
            album: album,
            coverCid: "",
            payload: payload,
            kind: kind,
            durationSec: durationSec,
            registeredAt: nowTs,
            exists: true
        });

        bytes32 metaHash = keccak256(abi.encode(title, artist, album));
        emit TrackRegistered(trackId, kind, payload, metaHash, nowTs, durationSec);
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
