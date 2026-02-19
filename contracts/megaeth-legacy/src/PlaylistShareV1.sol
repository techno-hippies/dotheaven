// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PlaylistShareV1 — Playlist share registry (discovery + snapshot pointer)
/// @notice This contract does NOT grant decrypt access.
///         It only records that a playlist was shared with a grantee, capturing
///         the playlist's integrity checkpoint (tracksHash, trackCount) at the
///         moment of sharing.
///
///         Decrypt enforcement remains per-track on ContentRegistry (and its
///         Base mirror used by Lit ACC). A shared playlist is therefore:
///         - live metadata/tracks display (via PlaylistV1 subgraph)
///         - static decrypt access (grants are issued separately at share time)
interface IPlaylistV1 {
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
        );
}

contract PlaylistShareV1 {
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

    // ── Storage ──────────────────────────────────────────────────────────

    IPlaylistV1 public immutable playlistV1;

    struct Share {
        // PlaylistV1.version at share time (increments on any mutation).
        uint32 playlistVersion;
        // PlaylistV1.trackCount at share time.
        uint32 trackCount;
        // PlaylistV1.tracksHash at share time (only changes when tracks change).
        bytes32 tracksHash;
        // Unix seconds.
        uint64 sharedAt;
        bool granted;
    }

    /// @notice playlistId → grantee → share state
    mapping(bytes32 => mapping(address => Share)) public shares;

    // ── Events ───────────────────────────────────────────────────────────

    event PlaylistShared(
        bytes32 indexed playlistId,
        address indexed playlistOwner,
        address indexed grantee,
        uint32 playlistVersion,
        uint32 trackCount,
        bytes32 tracksHash,
        uint64 sharedAt
    );

    event PlaylistUnshared(
        bytes32 indexed playlistId,
        address indexed playlistOwner,
        address indexed grantee,
        uint32 playlistVersion,
        uint32 trackCount,
        bytes32 tracksHash,
        uint64 unsharedAt
    );

    constructor(address _sponsor, address _playlistV1) {
        require(_sponsor != address(0), "zero sponsor");
        require(_playlistV1 != address(0), "zero playlistV1");
        owner = msg.sender;
        sponsor = _sponsor;
        playlistV1 = IPlaylistV1(_playlistV1);
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

    // ── Core ────────────────────────────────────────────────────────────

    /// @notice Records that `playlistId` owned by `playlistOwner` was shared with `grantee`.
    ///         Captures playlistVersion + (trackCount, tracksHash) checkpoint.
    function sharePlaylistFor(address playlistOwner, bytes32 playlistId, address grantee)
        external
        onlySponsor
    {
        require(playlistOwner != address(0), "zero playlistOwner");
        require(playlistId != bytes32(0), "zero playlistId");
        require(grantee != address(0), "zero grantee");

        (
            address owner_,
            ,
            bool exists,
            uint32 version,
            uint32 trackCount,
            ,
            ,
            bytes32 tracksHash
        ) = playlistV1.getPlaylist(playlistId);

        require(exists, "not found");
        require(owner_ == playlistOwner, "not owner");

        uint64 nowTs = uint64(block.timestamp);

        Share storage s = shares[playlistId][grantee];
        s.playlistVersion = version;
        s.trackCount = trackCount;
        s.tracksHash = tracksHash;
        s.sharedAt = nowTs;
        s.granted = true;

        emit PlaylistShared(playlistId, playlistOwner, grantee, version, trackCount, tracksHash, nowTs);
    }

    /// @notice Removes a prior share record (discovery). Does NOT revoke per-track access.
    function unsharePlaylistFor(address playlistOwner, bytes32 playlistId, address grantee)
        external
        onlySponsor
    {
        require(playlistOwner != address(0), "zero playlistOwner");
        require(playlistId != bytes32(0), "zero playlistId");
        require(grantee != address(0), "zero grantee");

        // PlaylistV1 keeps owner even after delete (exists=false), so this is stable.
        (address owner_, , , , , , , ) = playlistV1.getPlaylist(playlistId);
        require(owner_ == playlistOwner, "not owner");

        Share memory prev = shares[playlistId][grantee];
        uint64 nowTs = uint64(block.timestamp);

        emit PlaylistUnshared(
            playlistId,
            playlistOwner,
            grantee,
            prev.playlistVersion,
            prev.trackCount,
            prev.tracksHash,
            nowTs
        );

        delete shares[playlistId][grantee];
    }
}
