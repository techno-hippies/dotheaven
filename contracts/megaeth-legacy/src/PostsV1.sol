// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PostsV1 — Post existence + metadata pointer on MegaETH
/// @notice Cross-chain mirror of Story Protocol IP Asset registrations.
///         Emits PostCreated events for subgraph indexing. Stores minimal
///         state (creator mapping) for idempotency + existence checks.
///         All mutations are sponsor-gated (gasless for users via Lit Actions).
contract PostsV1 {
    // ── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroIpId();
    error EmptyUri();
    error AlreadyExists();

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

    // ── Content types ────────────────────────────────────────────────────

    uint8 public constant TYPE_TEXT = 0;
    uint8 public constant TYPE_PHOTO = 1;

    // ── State (minimal — existence + creator only) ───────────────────────

    mapping(bytes32 => address) public creatorOf;

    // ── Events ───────────────────────────────────────────────────────────

    event PostCreated(
        bytes32 indexed ipId,
        address indexed creator,
        uint8 contentType,
        string metadataUri,
        bool isAdult
    );

    // ── Mutations ────────────────────────────────────────────────────────

    /// @notice Register a post on MegaETH. Called by sponsor PKP after Story registration.
    /// @dev Idempotent: reverts if ipId already registered (no silent no-ops for posts).
    function postFor(
        address creator,
        bytes32 ipId,
        uint8 contentType,
        string calldata metadataUri,
        bool isAdult
    ) external onlySponsor {
        if (creator == address(0)) revert ZeroAddress();
        if (ipId == bytes32(0)) revert ZeroIpId();
        if (bytes(metadataUri).length == 0) revert EmptyUri();
        if (creatorOf[ipId] != address(0)) revert AlreadyExists();

        creatorOf[ipId] = creator;

        emit PostCreated(ipId, creator, contentType, metadataUri, isAdult);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function exists(bytes32 ipId) external view returns (bool) {
        return creatorOf[ipId] != address(0);
    }
}
