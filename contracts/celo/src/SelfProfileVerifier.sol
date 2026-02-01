// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SelfVerificationRoot} from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import {SelfStructs} from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";
import {SelfUtils} from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";
import {IIdentityVerificationHubV2} from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";

/// @title SelfProfileVerifier
/// @notice Minimal Self.xyz passport verification for Heaven profiles.
///         Deployed on Celo; frontend reads `verifiedAt(user)` for badge display.
contract SelfProfileVerifier is SelfVerificationRoot {
    /// @notice Timestamp when user was last verified (0 = never)
    mapping(address => uint64) public verifiedAt;

    /// @notice Maps nullifier → wallet that used it (allows re-verify by same wallet)
    mapping(uint256 => address) public nullifierOwner;

    SelfStructs.VerificationConfigV2 public verificationConfig;
    bytes32 public verificationConfigId;

    event Verified(address indexed user, uint64 timestamp, uint256 nullifier);

    error NullifierAlreadyUsed();
    error UserIdentifierNotAddress();

    constructor(
        address hubV2,
        string memory scopeSeed,
        SelfUtils.UnformattedVerificationConfigV2 memory rawCfg
    ) SelfVerificationRoot(hubV2, scopeSeed) {
        verificationConfig = SelfUtils.formatVerificationConfigV2(rawCfg);
        verificationConfigId = IIdentityVerificationHubV2(hubV2)
            .setVerificationConfigV2(verificationConfig);
    }

    function getConfigId(
        bytes32,
        bytes32,
        bytes memory
    ) public view override returns (bytes32) {
        return verificationConfigId;
    }

    function customVerificationHook(
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
        bytes memory
    ) internal override {
        if (output.userIdentifier >> 160 != 0) revert UserIdentifierNotAddress();

        address user = address(uint160(output.userIdentifier));

        // One passport per wallet, but same wallet can re-verify
        address prev = nullifierOwner[output.nullifier];
        if (prev != address(0) && prev != user) revert NullifierAlreadyUsed();

        nullifierOwner[output.nullifier] = user;
        uint64 ts = uint64(block.timestamp);
        verifiedAt[user] = ts;

        emit Verified(user, ts, output.nullifier);
    }
}
