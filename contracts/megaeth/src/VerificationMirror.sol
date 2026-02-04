// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VerificationMirror
/// @notice Mirrors Self.xyz verification state from Celo onto MegaETH.
///         Written by sponsor PKP via Lit Action that reads Celo verifier.
///         MegaETH contracts can gate on `verifiedAt(user) != 0`.
contract VerificationMirror {
    address public sponsor;
    address public owner;

    /// @notice Timestamp when user was last verified (0 = never)
    mapping(address => uint64) public verifiedAt;

    /// @notice 3-letter ISO nationality code from passport
    mapping(address => string) public nationality;

    /// @notice Nonce per user to prevent replay of mirror txs
    mapping(address => uint256) public nonces;

    event Mirrored(address indexed user, uint64 verifiedAt, string nationality, uint256 nonce);
    event SponsorUpdated(address indexed oldSponsor, address indexed newSponsor);

    error OnlySponsor();
    error OnlyOwner();
    error NonceMismatch();
    error Expired();

    modifier onlySponsor() {
        if (msg.sender != sponsor) revert OnlySponsor();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _sponsor, address _owner) {
        sponsor = _sponsor;
        owner = _owner;
    }

    /// @notice Rotate the sponsor PKP address.
    function setSponsor(address newSponsor) external onlyOwner {
        emit SponsorUpdated(sponsor, newSponsor);
        sponsor = newSponsor;
    }

    /// @notice Mirror a user's verification state from Celo.
    ///         Called by sponsor PKP after Lit Action reads Celo verifier.
    /// @param user The user address that was verified on Celo
    /// @param celoVerifiedAt The timestamp from Celo's verifiedAt(user)
    /// @param nonce Expected nonce (must match nonces[user])
    /// @param deadline Block timestamp after which this mirror tx is invalid
    function mirror(
        address user,
        uint64 celoVerifiedAt,
        string calldata celoNationality,
        uint256 nonce,
        uint256 deadline
    ) external onlySponsor {
        if (block.timestamp > deadline) revert Expired();
        if (nonces[user] != nonce) revert NonceMismatch();

        // Only allow setting to a newer verification
        if (celoVerifiedAt > verifiedAt[user]) {
            verifiedAt[user] = celoVerifiedAt;
            nationality[user] = celoNationality;
        }

        nonces[user] = nonce + 1;
        emit Mirrored(user, verifiedAt[user], celoNationality, nonce);
    }
}
