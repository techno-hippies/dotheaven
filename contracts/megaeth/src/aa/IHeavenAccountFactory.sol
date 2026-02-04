// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IHeavenAccountFactory — Minimal interface for factory-deterministic auth
/// @notice App contracts use this to verify msg.sender is a user's SimpleAccount
///         via CREATE2 address derivation. Not spoofable — only the factory's CREATE2
///         can produce an account at a given deterministic address.
interface IHeavenAccountFactory {
    /// @dev Returns the deterministic CREATE2 address for the given owner + salt.
    ///      Works whether or not the account has been deployed yet.
    ///      Used by app contracts in `onlyAccountOf(user)` modifiers.
    function getAddress(address owner, uint256 salt) external view returns (address);

    /// @dev Creates an account for the given owner + salt. Returns the address
    ///      even if the account is already deployed (idempotent).
    function createAccount(address owner, uint256 salt) external returns (address);
}
