// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {SessionEscrowV1} from "../src/SessionEscrowV1.sol";

/// @title DeploySessionEscrowV1
/// @notice Deploy SessionEscrowV1 (TIP-20 token escrow) on Tempo Moderato testnet.
contract DeploySessionEscrowV1Script is Script {
    uint16 constant DEFAULT_FEE_BPS = 300; // 3%
    uint48 constant DEFAULT_CHALLENGE_WINDOW = 24 hours;
    uint256 constant DEFAULT_CHALLENGE_BOND = 10_000_000; // 10 aUSD (6 decimals)
    uint16 constant DEFAULT_LATE_CANCEL_PENALTY_BPS = 2000; // 20%
    uint48 constant DEFAULT_NO_ATTEST_BUFFER = 24 hours;
    uint48 constant DEFAULT_DISPUTE_TIMEOUT = 7 days;

    // AlphaUSD on Tempo Moderato
    address constant DEFAULT_PAYMENT_TOKEN = 0x20C0000000000000000000000000000000000001;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address owner = vm.envOr("OWNER", deployer);
        address defaultTreasury = vm.envOr("TREASURY", owner);
        address oracle = vm.envOr("SESSION_ESCROW_ORACLE", owner);
        address treasury = vm.envOr("SESSION_ESCROW_TREASURY", defaultTreasury);
        address paymentToken = vm.envOr("SESSION_ESCROW_PAYMENT_TOKEN", DEFAULT_PAYMENT_TOKEN);
        uint16 feeBps = uint16(vm.envOr("SESSION_ESCROW_FEE_BPS", uint256(DEFAULT_FEE_BPS)));
        uint48 challengeWindow = uint48(vm.envOr("SESSION_ESCROW_CHALLENGE_WINDOW", uint256(DEFAULT_CHALLENGE_WINDOW)));
        uint256 challengeBond = vm.envOr("SESSION_ESCROW_CHALLENGE_BOND", DEFAULT_CHALLENGE_BOND);
        uint16 lateCancelPenaltyBps =
            uint16(vm.envOr("SESSION_ESCROW_LATE_CANCEL_PENALTY_BPS", uint256(DEFAULT_LATE_CANCEL_PENALTY_BPS)));
        uint48 noAttestBuffer = uint48(vm.envOr("SESSION_ESCROW_NO_ATTEST_BUFFER", uint256(DEFAULT_NO_ATTEST_BUFFER)));
        uint48 disputeTimeout = uint48(vm.envOr("SESSION_ESCROW_DISPUTE_TIMEOUT", uint256(DEFAULT_DISPUTE_TIMEOUT)));

        console2.log("=== Deploying SessionEscrowV1 (TIP-20, Tempo Moderato) ===");
        console2.log("Deployer:", deployer);
        console2.log("Owner:", owner);
        console2.log("Oracle:", oracle);
        console2.log("Treasury:", treasury);
        console2.log("Payment token:", paymentToken);
        console2.log("Fee bps:", feeBps);
        console2.log("Challenge window (seconds):", challengeWindow);
        console2.log("Challenge bond (token units):", challengeBond);
        console2.log("Late cancel penalty bps:", lateCancelPenaltyBps);
        console2.log("No-attest buffer (seconds):", noAttestBuffer);
        console2.log("Dispute timeout (seconds):", disputeTimeout);

        vm.startBroadcast(deployerPrivateKey);

        SessionEscrowV1 escrow = new SessionEscrowV1(
            paymentToken,
            oracle,
            treasury,
            feeBps,
            challengeWindow,
            challengeBond,
            lateCancelPenaltyBps,
            noAttestBuffer,
            disputeTimeout
        );

        if (owner != deployer) {
            escrow.transferOwnership(owner);
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("SessionEscrowV1:", address(escrow));
        console2.log("Final owner:", escrow.owner());
        console2.log("");
        console2.log("Export:");
        console2.log(string.concat("SESSION_ESCROW_V1=", vm.toString(address(escrow))));
        console2.log(string.concat("SESSION_ESCROW_CHAIN_ID=", vm.toString(block.chainid)));
    }
}
