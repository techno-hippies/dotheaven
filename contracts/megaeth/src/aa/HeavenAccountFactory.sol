// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SimpleAccountFactory} from "account-abstraction/samples/SimpleAccountFactory.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {IHeavenAccountFactory} from "./IHeavenAccountFactory.sol";

/// @title HeavenAccountFactory — Thin wrapper around eth-infinitism SimpleAccountFactory v0.7
/// @notice IMMUTABLE: no admin functions, no upgrade path, no selfdestruct.
///         The address of this factory is embedded as `immutable` in every app contract.
///         If this factory changes, all app contracts must be redeployed.
///
/// @dev CREATE2 determinism inputs (all security-critical):
///      - This factory's address
///      - salt (always 0 for Heaven — documented constant)
///      - init code hash = keccak256(ERC1967Proxy.creationCode ++ abi.encode(implementation, abi.encodeCall(initialize, (owner))))
///        where implementation is the SimpleAccount deployed in the constructor (embeds EntryPoint v0.7)
contract HeavenAccountFactory is IHeavenAccountFactory {
    SimpleAccountFactory public immutable inner;

    /// @param _entryPoint EntryPoint v0.7 address (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
    constructor(IEntryPoint _entryPoint) {
        inner = new SimpleAccountFactory(_entryPoint);
    }

    /// @inheritdoc IHeavenAccountFactory
    function getAddress(address owner, uint256 salt) external view override returns (address) {
        return inner.getAddress(owner, salt);
    }

    /// @inheritdoc IHeavenAccountFactory
    function createAccount(address owner, uint256 salt) external override returns (address) {
        return address(inner.createAccount(owner, salt));
    }

    /// @dev Exposes the account implementation address for verification.
    ///      The implementation is deployed once in the constructor and never changes.
    function accountImplementation() external view returns (address) {
        return address(inner.accountImplementation());
    }
}
