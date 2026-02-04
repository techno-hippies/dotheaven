// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHeavenAccountFactory} from "./IHeavenAccountFactory.sol";

/// @title AccountBinding — Shared modifier for factory-deterministic authorization
/// @notice Inherit this in app contracts that need to verify msg.sender is a user's
///         SimpleAccount. Uses CREATE2 address derivation via the factory — not spoofable.
///
/// @dev Security-critical invariants:
///      - FACTORY is immutable (set once in constructor, cannot change)
///      - SALT is a constant (0) — never varied per user
///      - The factory itself must be immutable (no admin, no upgrade, no selfdestruct)
///      - If the factory address changes, this contract must be redeployed
abstract contract AccountBinding {
    IHeavenAccountFactory public immutable FACTORY;
    uint256 public constant ACCOUNT_SALT = 0;

    error NotUsersAccount();

    constructor(address factory_) {
        require(factory_ != address(0), "zero factory");
        FACTORY = IHeavenAccountFactory(factory_);
    }

    /// @dev Verifies msg.sender is the SimpleAccount that FACTORY would deploy for `user`.
    ///      Not spoofable — CREATE2 addresses are deterministic from (factory, salt, user).
    modifier onlyAccountOf(address user) {
        if (msg.sender != FACTORY.getAddress(user, ACCOUNT_SALT)) revert NotUsersAccount();
        _;
    }
}
