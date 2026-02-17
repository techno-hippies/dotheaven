// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ContentRegistry — Filecoin content pointers + access control
/// @notice contentId = keccak256(abi.encode(trackId, owner))
///         Tracks (metadata) live in ScrobbleV4; this contract stores encrypted file references.
contract ContentRegistry {
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

    // ── Limits ───────────────────────────────────────────────────────────

    uint256 public constant MAX_CID = 128;
    uint256 public constant MAX_BATCH = 500;

    // ── Storage ──────────────────────────────────────────────────────────

    struct ContentEntry {
        address owner;
        address datasetOwner; // Beam host address (may differ from owner)
        bytes pieceCid;       // Filecoin piece CID (CIDv1, raw bytes)
        uint8  algo;          // encryption algorithm enum (app-defined)
        uint64 createdAt;
        bool   active;
    }

    mapping(bytes32 => ContentEntry) public content;
    mapping(bytes32 => mapping(address => bool)) public access;

    // ── Events ───────────────────────────────────────────────────────────

    event ContentRegistered(
        bytes32 indexed trackId,
        bytes32 indexed contentId,
        address indexed owner,
        address datasetOwner,
        bytes pieceCid
    );

    event AccessGranted(bytes32 indexed contentId, address indexed grantee);
    event AccessRevoked(bytes32 indexed contentId, address indexed grantee);
    event ContentDeactivated(bytes32 indexed contentId);

    // ── Views ────────────────────────────────────────────────────────────

    function computeContentId(bytes32 trackId, address owner_) public pure returns (bytes32) {
        return keccak256(abi.encode(trackId, owner_));
    }

    function canAccess(address user, bytes32 contentId) external view returns (bool) {
        ContentEntry storage c = content[contentId];
        if (!c.active) return false;
        return (user == c.owner) || access[contentId][user];
    }

    function getContent(bytes32 contentId)
        external
        view
        returns (
            address owner_,
            address datasetOwner,
            bytes memory pieceCid,
            uint8 algo,
            uint64 createdAt,
            bool active
        )
    {
        ContentEntry storage c = content[contentId];
        return (c.owner, c.datasetOwner, c.pieceCid, c.algo, c.createdAt, c.active);
    }

    // ── Core API ─────────────────────────────────────────────────────────

    function registerContentFor(
        address contentOwner,
        bytes32 trackId,
        address datasetOwner,
        bytes calldata pieceCid,
        uint8 algo
    ) external onlySponsor returns (bytes32 contentId) {
        require(contentOwner != address(0), "zero owner");
        require(trackId != bytes32(0), "zero trackId");
        require(datasetOwner != address(0), "zero datasetOwner");
        require(algo != 0, "zero algo");
        require(pieceCid.length > 0, "empty pieceCid");
        require(pieceCid.length <= MAX_CID, "pieceCid too long");

        contentId = computeContentId(trackId, contentOwner);
        ContentEntry storage c = content[contentId];
        require(!c.active, "already active");

        if (c.owner != address(0)) {
            require(c.owner == contentOwner, "not owner");
        }

        c.owner = contentOwner;
        c.datasetOwner = datasetOwner;
        c.pieceCid = pieceCid;
        c.algo = algo;
        c.createdAt = uint64(block.timestamp);
        c.active = true;

        emit ContentRegistered(trackId, contentId, contentOwner, datasetOwner, pieceCid);
    }

    function grantAccessFor(address contentOwner, bytes32 contentId, address user) external onlySponsor {
        ContentEntry storage c = content[contentId];
        require(c.active, "inactive");
        require(c.owner == contentOwner, "not owner");
        require(user != address(0), "zero user");

        access[contentId][user] = true;
        emit AccessGranted(contentId, user);
    }

    function grantAccessBatchFor(
        address contentOwner,
        bytes32[] calldata contentIds,
        address user
    ) external onlySponsor {
        require(user != address(0), "zero user");
        uint256 n = contentIds.length;
        require(n <= MAX_BATCH, "too many");
        for (uint256 i; i < n; ) {
            bytes32 contentId = contentIds[i];
            ContentEntry storage c = content[contentId];
            require(c.active, "inactive");
            require(c.owner == contentOwner, "not owner");
            access[contentId][user] = true;
            emit AccessGranted(contentId, user);
            unchecked { ++i; }
        }
    }

    function revokeAccessFor(address contentOwner, bytes32 contentId, address user) external onlySponsor {
        ContentEntry storage c = content[contentId];
        require(c.active, "inactive");
        require(c.owner == contentOwner, "not owner");
        require(user != address(0), "zero user");

        access[contentId][user] = false;
        emit AccessRevoked(contentId, user);
    }

    function revokeAccessBatchFor(
        address contentOwner,
        bytes32[] calldata contentIds,
        address user
    ) external onlySponsor {
        require(user != address(0), "zero user");
        uint256 n = contentIds.length;
        require(n <= MAX_BATCH, "too many");
        for (uint256 i; i < n; ) {
            bytes32 contentId = contentIds[i];
            ContentEntry storage c = content[contentId];
            require(c.active, "inactive");
            require(c.owner == contentOwner, "not owner");
            access[contentId][user] = false;
            emit AccessRevoked(contentId, user);
            unchecked { ++i; }
        }
    }

    function deactivateFor(address contentOwner, bytes32 contentId) external onlySponsor {
        ContentEntry storage c = content[contentId];
        require(c.active, "inactive");
        require(c.owner == contentOwner, "not owner");

        c.active = false;
        emit ContentDeactivated(contentId);
    }
}
