// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VerifyingPaymaster} from "account-abstraction/samples/VerifyingPaymaster.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";

/// @title HeavenPaymaster — Gas sponsorship for Heaven user operations
/// @notice Thin wrapper around eth-infinitism VerifyingPaymaster v0.7.
///         Off-chain gateway signer validates policy (target/selector allowlists,
///         sender<->user binding, rate limits) then signs the UserOp approval.
///         On-chain: _validatePaymasterUserOp() verifies the signature.
///
/// @dev Paymaster signature binds to the exact UserOp via getHash() which covers:
///      - sender, nonce, initCode hash, callData hash, gas params
///      - chainId, paymaster address, validUntil, validAfter
///      This prevents paymasterAndData replay onto different UserOps or chains.
///
///      Fund this paymaster by calling deposit() to add ETH to EntryPoint.
///      Owner can withdraw via withdrawTo().
contract HeavenPaymaster is VerifyingPaymaster {
    /// @param _entryPoint EntryPoint v0.7 address (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
    /// @param _verifyingSigner Gateway service signing key (off-chain policy enforcement)
    constructor(IEntryPoint _entryPoint, address _verifyingSigner)
        VerifyingPaymaster(_entryPoint, _verifyingSigner)
    {}
}
