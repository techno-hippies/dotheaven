// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ContentAccessMirror — Lit access condition mirror on Base
/// @notice Mirrors canAccess(user, contentId) from MegaETH ContentRegistry.
///         Lit nodes evaluate this contract for content decryption access conditions.
///         State is written by the sponsor PKP (via Lit Actions that dual-broadcast).
///
/// Design:
///   - Content owner always has access (no explicit grant needed).
///   - Grantees are tracked via access mapping.
///   - PKP addresses linked to an EOA inherit that EOA's ownership + grants.
///   - Only the sponsor can write state (same PKP as MegaETH actions).
///   - No content metadata stored here — just ownership + access booleans.
///   - Deactivation zeroes the owner but does NOT clear grants. contentId is
///     deterministic (keccak256(trackId, owner)) and not reused across owners.
///     Re-registering the same contentId by the same owner restores old grants.
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

    /// @notice Linked EOA for PKP addresses.
    ///         When an EOA user signs up, their PKP is linked to their EOA.
    ///         The PKP inherits the EOA's ownership and grants in canAccess().
    mapping(address => address) public linkedEoa;

    // ── Events ────────────────────────────────────────────────────────────

    event ContentRegistered(bytes32 indexed contentId, address indexed contentOwnerAddr);
    event AccessGranted(bytes32 indexed contentId, address indexed user);
    event AccessRevoked(bytes32 indexed contentId, address indexed user);
    event EoaLinked(address indexed pkp, address indexed eoa);
    event ContentDeactivated(bytes32 indexed contentId);

    // ── Views ────────────────────────────────────────────────────────────

    /// @notice Check if a user can access content (content owner, grantee,
    ///         or via linked EOA inheriting ownership/grants).
    ///         This is the function Lit access conditions evaluate.
    function canAccess(address user, bytes32 contentId) external view returns (bool) {
        address co = contentOwner[contentId];
        if (co == address(0)) return false; // not registered
        if (user == co) return true;
        if (access[contentId][user]) return true;
        // Check if user's linked EOA is the content owner or has a grant
        address eoa = linkedEoa[user];
        if (eoa == address(0)) return false;
        if (eoa == co) return true;
        if (access[contentId][eoa]) return true;
        return false;
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
        emit ContentRegistered(contentId, _owner);
    }

    /// @notice Grant access to a user
    function grantAccess(bytes32 contentId, address user) external onlySponsor {
        require(contentOwner[contentId] != address(0), "not registered");
        require(user != address(0), "zero user");
        access[contentId][user] = true;
        emit AccessGranted(contentId, user);
    }

    /// @notice Grant access to a user for multiple content IDs
    function grantAccessBatch(bytes32[] calldata contentIds, address user) external onlySponsor {
        require(user != address(0), "zero user");
        uint256 n = contentIds.length;
        require(n <= MAX_BATCH, "too many");
        for (uint256 i; i < n; ) {
            require(contentOwner[contentIds[i]] != address(0), "not registered");
            access[contentIds[i]][user] = true;
            emit AccessGranted(contentIds[i], user);
            unchecked { ++i; }
        }
    }

    /// @notice Revoke access from a user
    function revokeAccess(bytes32 contentId, address user) external onlySponsor {
        require(user != address(0), "zero user");
        access[contentId][user] = false;
        emit AccessRevoked(contentId, user);
    }

    /// @notice Revoke access from a user for multiple content IDs
    function revokeAccessBatch(bytes32[] calldata contentIds, address user) external onlySponsor {
        require(user != address(0), "zero user");
        uint256 n = contentIds.length;
        require(n <= MAX_BATCH, "too many");
        for (uint256 i; i < n; ) {
            access[contentIds[i]][user] = false;
            emit AccessRevoked(contentIds[i], user);
            unchecked { ++i; }
        }
    }

    /// @notice Link a PKP address to its originating EOA.
    ///         The PKP inherits the EOA's ownership and grants in canAccess().
    ///         Cannot overwrite an existing link to a different EOA.
    function linkEoa(address pkp, address eoa) external onlySponsor {
        require(pkp != address(0), "zero pkp");
        require(eoa != address(0), "zero eoa");
        address existing = linkedEoa[pkp];
        require(existing == address(0) || existing == eoa, "already linked");
        linkedEoa[pkp] = eoa;
        emit EoaLinked(pkp, eoa);
    }

    /// @notice Deactivate content (zero the owner so canAccess returns false).
    ///         Note: existing grants are NOT cleared. If the same contentId is
    ///         re-registered by the same owner, old grants will apply again.
    function deactivate(bytes32 contentId) external onlySponsor {
        require(contentOwner[contentId] != address(0), "not registered");
        contentOwner[contentId] = address(0);
        emit ContentDeactivated(contentId);
    }
}
