// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

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

/// @title PlaylistShareV1 — Playlist share registry (discovery + snapshot pointer)
/// @notice This contract does not grant decrypt access.
///         It records that a playlist was shared with a grantee and captures
///         playlist snapshot metadata at share time.
contract PlaylistShareV1 {
    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    event OwnerUpdated(address indexed newOwner);

    // ── Storage ──────────────────────────────────────────────────────────

    IPlaylistV1 public immutable playlistV1;

    struct Share {
        uint32 playlistVersion;
        uint32 trackCount;
        bytes32 tracksHash;
        uint64 sharedAt;
        bool granted;
    }

    /// @notice playlistId => grantee => share state
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

    constructor(address _playlistV1) {
        require(_playlistV1 != address(0), "zero playlistV1");
        owner = msg.sender;
        playlistV1 = IPlaylistV1(_playlistV1);
        emit OwnerUpdated(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function sharePlaylist(bytes32 playlistId, address grantee) external {
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
        require(owner_ == msg.sender, "not owner");

        uint64 nowTs = uint64(block.timestamp);
        Share storage s = shares[playlistId][grantee];
        s.playlistVersion = version;
        s.trackCount = trackCount;
        s.tracksHash = tracksHash;
        s.sharedAt = nowTs;
        s.granted = true;

        emit PlaylistShared(playlistId, msg.sender, grantee, version, trackCount, tracksHash, nowTs);
    }

    function unsharePlaylist(bytes32 playlistId, address grantee) external {
        require(playlistId != bytes32(0), "zero playlistId");
        require(grantee != address(0), "zero grantee");

        (address owner_, , , , , , , ) = playlistV1.getPlaylist(playlistId);
        require(owner_ == msg.sender, "not owner");

        Share memory prev = shares[playlistId][grantee];
        uint64 nowTs = uint64(block.timestamp);

        emit PlaylistUnshared(
            playlistId,
            msg.sender,
            grantee,
            prev.playlistVersion,
            prev.trackCount,
            prev.tracksHash,
            nowTs
        );

        delete shares[playlistId][grantee];
    }
}
