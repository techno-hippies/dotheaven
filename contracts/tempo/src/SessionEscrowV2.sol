// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {SessionEscrowV1} from "./SessionEscrowV1.sol";

/// @title SessionEscrowV2
/// @notice Session escrow with explicit per-slot pricing at creation time.
contract SessionEscrowV2 is SessionEscrowV1 {
    constructor(
        address paymentToken_,
        address oracle_,
        address treasury_,
        uint16  feeBps_,
        uint48  challengeWindowSeconds_,
        uint256 challengeBond_,
        uint16  lateCancelPenaltyBps_,
        uint48  noAttestBufferSeconds_,
        uint48  disputeTimeoutSeconds_
    )
        SessionEscrowV1(
            paymentToken_,
            oracle_,
            treasury_,
            feeBps_,
            challengeWindowSeconds_,
            challengeBond_,
            lateCancelPenaltyBps_,
            noAttestBufferSeconds_,
            disputeTimeoutSeconds_
        )
    {}

    /// @notice Create a single slot with explicit price.
    function createSlotWithPrice(
        uint48  startTime,
        uint32  durationMins,
        uint32  graceMins,
        uint32  minOverlapMins,
        uint32  cancelCutoffMins,
        uint256 price
    ) external returns (uint256 slotId) {
        slotId = _createSlot(
            msg.sender,
            startTime,
            durationMins,
            price,
            graceMins,
            minOverlapMins,
            cancelCutoffMins
        );
    }
}
