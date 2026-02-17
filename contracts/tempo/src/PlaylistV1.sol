// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title PlaylistV1 — Event-sourced playlists with onchain integrity checkpoint
/// @notice Stores only playlist header + (tracksHash, trackCount, version) in storage.
///         Full track lists + name/coverCid are emitted in events for the subgraph/frontend.
///
///         tracksHash = keccak256(abi.encode(TRACKS_SEED, playlistId, trackIds))
///         NOTE: name/coverCid are intentionally event-only (not stored in contract state).
///         coverCid is an IPFS CID for the playlist cover image ("" = deterministic/none).
contract PlaylistV1 {
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

    // ── Constants ─────────────────────────────────────────────────────────

    uint8 public constant VIS_PUBLIC   = 0;
    uint8 public constant VIS_UNLISTED = 1;
    uint8 public constant VIS_PRIVATE  = 2;

    uint256 public constant MAX_NAME   = 64;
    uint256 public constant MAX_CID    = 128;
    uint256 public constant MAX_TRACKS = 500;

    bytes32 internal constant TRACKS_SEED = keccak256("dotheaven.playlist.v1.tracks");

    // ── Storage ──────────────────────────────────────────────────────────

    struct Playlist {
        address owner;      // 20 bytes
        uint8  visibility;  // 1 byte
        bool   exists;      // 1 byte (tombstone on delete)
        uint32 version;     // increments on any change
        uint32 trackCount;  // current list length
        uint64 createdAt;
        uint64 updatedAt;
        bytes32 tracksHash; // integrity checkpoint for current list
    }

    mapping(bytes32 => Playlist) public playlists;
    mapping(address => uint64) public ownerNonces;

    /// @notice Replay protection — monotonic nonce per user, consumed by Lit Action
    mapping(address => uint256) public userNonces;

    // ── Events ───────────────────────────────────────────────────────────

    event PlaylistCreated(
        bytes32 indexed playlistId,
        address indexed playlistOwner,
        uint32 version,
        uint8  visibility,
        uint32 trackCount,
        bytes32 tracksHash,
        uint64 createdAt,
        string name,
        string coverCid
    );

    event PlaylistMetaUpdated(
        bytes32 indexed playlistId,
        uint32 version,
        uint8  visibility,
        uint64 updatedAt,
        string name,
        string coverCid
    );

    event PlaylistTracksSet(
        bytes32 indexed playlistId,
        uint32 version,
        uint32 trackCount,
        bytes32 tracksHash,
        uint64 updatedAt,
        bytes32[] trackIds
    );

    event PlaylistDeleted(
        bytes32 indexed playlistId,
        uint32 version,
        uint64 updatedAt
    );

    // ── Replay Protection ──────────────────────────────────────────────

    /// @notice Consume a nonce for replay protection. Must be called with the expected nonce.
    ///         The Lit Action includes userNonce in the signed message; this ensures each
    ///         signature can only be used once.
    function consumeNonce(address user, uint256 expectedNonce) external onlySponsor {
        require(userNonces[user] == expectedNonce, "bad nonce");
        userNonces[user] = expectedNonce + 1;
    }

    // ── Core API ─────────────────────────────────────────────────────────

    function createPlaylistFor(
        address playlistOwner,
        string calldata name,
        string calldata coverCid,
        uint8 visibility,
        bytes32[] calldata trackIds
    ) external onlySponsor returns (bytes32 playlistId) {
        require(playlistOwner != address(0), "zero playlistOwner");
        _validateMeta(name, coverCid, visibility);
        _validateTracks(trackIds);

        uint64 createdAt = uint64(block.timestamp);
        uint64 nonce = ownerNonces[playlistOwner]++;
        playlistId = keccak256(abi.encode(playlistOwner, createdAt, nonce));

        require(!playlists[playlistId].exists, "already exists");

        bytes32 h = _hashTracks(playlistId, trackIds);

        playlists[playlistId] = Playlist({
            owner: playlistOwner,
            visibility: visibility,
            exists: true,
            version: 1,
            trackCount: uint32(trackIds.length),
            createdAt: createdAt,
            updatedAt: createdAt,
            tracksHash: h
        });

        emit PlaylistCreated(
            playlistId,
            playlistOwner,
            1,
            visibility,
            uint32(trackIds.length),
            h,
            createdAt,
            name,
            coverCid
        );

        emit PlaylistTracksSet(
            playlistId,
            1,
            uint32(trackIds.length),
            h,
            createdAt,
            trackIds
        );
    }

    function setTracks(bytes32 playlistId, bytes32[] calldata trackIds) external onlySponsor {
        Playlist storage p = playlists[playlistId];
        require(p.exists, "not found");
        _validateTracks(trackIds);

        uint64 nowTs = uint64(block.timestamp);
        uint32 newVersion = p.version + 1;

        bytes32 h = _hashTracks(playlistId, trackIds);

        p.version = newVersion;
        p.trackCount = uint32(trackIds.length);
        p.updatedAt = nowTs;
        p.tracksHash = h;

        emit PlaylistTracksSet(playlistId, newVersion, uint32(trackIds.length), h, nowTs, trackIds);
    }

    function updateMeta(
        bytes32 playlistId,
        string calldata name,
        string calldata coverCid,
        uint8 visibility
    ) external onlySponsor {
        Playlist storage p = playlists[playlistId];
        require(p.exists, "not found");
        _validateMeta(name, coverCid, visibility);

        uint64 nowTs = uint64(block.timestamp);
        uint32 newVersion = p.version + 1;

        p.visibility = visibility;
        p.version = newVersion;
        p.updatedAt = nowTs;

        emit PlaylistMetaUpdated(playlistId, newVersion, visibility, nowTs, name, coverCid);
    }

    function deletePlaylist(bytes32 playlistId) external onlySponsor {
        Playlist storage p = playlists[playlistId];
        require(p.exists, "not found");

        uint64 nowTs = uint64(block.timestamp);
        uint32 newVersion = p.version + 1;

        p.exists = false;
        p.version = newVersion;
        p.updatedAt = nowTs;

        emit PlaylistDeleted(playlistId, newVersion, nowTs);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getPlaylist(bytes32 playlistId)
        external
        view
        returns (
            address playlistOwner,
            uint8 visibility,
            bool exists,
            uint32 version,
            uint32 trackCount,
            uint64 createdAt,
            uint64 updatedAt,
            bytes32 tracksHash
        )
    {
        Playlist storage p = playlists[playlistId];
        return (p.owner, p.visibility, p.exists, p.version, p.trackCount, p.createdAt, p.updatedAt, p.tracksHash);
    }

    // ── Internals ─────────────────────────────────────────────────────────

    function _validateMeta(string calldata name, string calldata coverCid, uint8 visibility) internal pure {
        require(bytes(name).length <= MAX_NAME, "name too long");
        require(bytes(coverCid).length <= MAX_CID, "coverCid too long");
        require(visibility <= VIS_PRIVATE, "bad visibility");
    }

    function _validateTracks(bytes32[] calldata trackIds) internal pure {
        uint256 n = trackIds.length;
        require(n <= MAX_TRACKS, "too many tracks");
        for (uint256 i; i < n; ) {
            require(trackIds[i] != bytes32(0), "zero trackId");
            unchecked { ++i; }
        }
    }

    function _hashTracks(bytes32 playlistId, bytes32[] calldata trackIds) internal pure returns (bytes32) {
        return keccak256(abi.encode(TRACKS_SEED, playlistId, trackIds));
    }
}
