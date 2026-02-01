// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ContentAccessMirror — Lit access condition mirror on Base
/// @notice Mirrors canAccess(user, contentId) from MegaETH ContentRegistry.
///         Lit nodes evaluate this contract for content decryption access conditions.
///         State is written by the sponsor PKP (via Lit Actions that dual-broadcast).
///
/// Design:
///   - Owner always has access (no explicit grant needed).
///   - Grantees are tracked via access mapping.
///   - Only the sponsor can write state (same PKP as MegaETH actions).
///   - No content metadata stored here — just ownership + access booleans.
contract ContentAccessMirror {
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

    // ── Storage ──────────────────────────────────────────────────────────

    uint256 public constant MAX_BATCH = 500;

    /// @notice Content owner for each contentId
    mapping(bytes32 => address) public contentOwner;

    /// @notice Access grants: contentId => grantee => bool
    mapping(bytes32 => mapping(address => bool)) public access;

    // ── Views ────────────────────────────────────────────────────────────

    /// @notice Check if a user can access content (owner or grantee).
    ///         This is the function Lit access conditions evaluate.
    function canAccess(address user, bytes32 contentId) external view returns (bool) {
        address co = contentOwner[contentId];
        if (co == address(0)) return false; // not registered
        return (user == co) || access[contentId][user];
    }

    // ── Writes (sponsor only) ────────────────────────────────────────────

    /// @notice Register content ownership (mirrors ContentRegistry.registerContentFor)
    function registerContent(address _owner, bytes32 contentId) external onlySponsor {
        require(_owner != address(0), "zero owner");
        require(contentId != bytes32(0), "zero contentId");
        // Allow re-register if same owner (idempotent) or if previously deactivated (owner zeroed)
        address existing = contentOwner[contentId];
        require(existing == address(0) || existing == _owner, "owner mismatch");
        contentOwner[contentId] = _owner;
    }

    /// @notice Grant access to a user
    function grantAccess(bytes32 contentId, address user) external onlySponsor {
        require(contentOwner[contentId] != address(0), "not registered");
        require(user != address(0), "zero user");
        access[contentId][user] = true;
    }

    /// @notice Grant access to a user for multiple content IDs
    function grantAccessBatch(bytes32[] calldata contentIds, address user) external onlySponsor {
        require(user != address(0), "zero user");
        uint256 n = contentIds.length;
        require(n <= MAX_BATCH, "too many");
        for (uint256 i; i < n; ) {
            require(contentOwner[contentIds[i]] != address(0), "not registered");
            access[contentIds[i]][user] = true;
            unchecked { ++i; }
        }
    }

    /// @notice Revoke access from a user
    function revokeAccess(bytes32 contentId, address user) external onlySponsor {
        require(user != address(0), "zero user");
        access[contentId][user] = false;
    }

    /// @notice Revoke access from a user for multiple content IDs
    function revokeAccessBatch(bytes32[] calldata contentIds, address user) external onlySponsor {
        require(user != address(0), "zero user");
        uint256 n = contentIds.length;
        require(n <= MAX_BATCH, "too many");
        for (uint256 i; i < n; ) {
            access[contentIds[i]][user] = false;
            unchecked { ++i; }
        }
    }

    /// @notice Deactivate content (zero the owner so canAccess returns false)
    function deactivate(bytes32 contentId) external onlySponsor {
        require(contentOwner[contentId] != address(0), "not registered");
        contentOwner[contentId] = address(0);
    }
}
