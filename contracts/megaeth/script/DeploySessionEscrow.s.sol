// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {SessionEscrowV1} from "../src/SessionEscrowV1.sol";

/// @title DeploySessionEscrow — Deploy SessionEscrowV1 for scheduled voice sessions
///
/// @dev Configuration:
///   - Oracle: Voice worker that attests session outcomes (Completed, NoShowHost, NoShowGuest)
///   - Treasury: Receives platform fees and late-cancel penalties
///   - Fee: 3% (300 bps)
///   - Challenge window: 24 hours
///   - Challenge bond: 0.01 ETH
///   - Late cancel penalty: 20% (goes to treasury)
///   - No-attest buffer: 24 hours (guest can claim refund if oracle never attests)
///   - Dispute timeout: 7 days (bond goes to counterparty if admin doesn't resolve)
///
/// Usage:
///   source .env
///   forge script script/DeploySessionEscrow.s.sol \
///     --rpc-url megaeth_testnet \
///     --broadcast --legacy --gas-price 1000000 \
///     --skip-simulation --gas-limit 10000000
contract DeploySessionEscrowScript is Script {
    /// @dev Oracle address — the voice worker backend that attests session outcomes.
    ///      For testnet, can be the deployer initially. Should be a dedicated service key in production.
    address constant ORACLE = 0xc77Ad4de7d179FFFBa417cA24c055d86Af69F4BB;

    /// @dev Treasury address — receives platform fees and penalties.
    ///      Using sponsor PKP for testnet; should be a multisig in production.
    address constant TREASURY = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    /// @dev Platform fee: 3% (300 basis points)
    uint16 constant FEE_BPS = 300;

    /// @dev Challenge window: 24 hours
    uint48 constant CHALLENGE_WINDOW = 24 hours;

    /// @dev Challenge bond: 0.01 ETH (disincentivizes frivolous disputes)
    uint256 constant CHALLENGE_BOND = 0.01 ether;

    /// @dev Late cancel penalty: 20% (2000 basis points)
    uint16 constant LATE_CANCEL_PENALTY_BPS = 2000;

    /// @dev No-attest buffer: 24 hours after session end, guest can claim refund
    uint48 constant NO_ATTEST_BUFFER = 24 hours;

    /// @dev Dispute timeout: 7 days (if admin doesn't resolve, bond goes to counterparty)
    uint48 constant DISPUTE_TIMEOUT = 7 days;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Deploying SessionEscrowV1 ===");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Deployer:", deployer);
        console2.log("");
        console2.log("Configuration:");
        console2.log("  Oracle:", ORACLE);
        console2.log("  Treasury:", TREASURY);
        console2.log("  Fee:", FEE_BPS, "bps (3%)");
        console2.log("  Challenge window:", CHALLENGE_WINDOW / 1 hours, "hours");
        console2.log("  Challenge bond:", CHALLENGE_BOND / 1e15, "finney (0.01 ETH)");
        console2.log("  Late cancel penalty:", LATE_CANCEL_PENALTY_BPS, "bps (20%)");
        console2.log("  No-attest buffer:", NO_ATTEST_BUFFER / 1 hours, "hours");
        console2.log("  Dispute timeout:", DISPUTE_TIMEOUT / 1 days, "days");

        vm.startBroadcast(deployerPrivateKey);

        SessionEscrowV1 escrow = new SessionEscrowV1(
            ORACLE,
            TREASURY,
            FEE_BPS,
            CHALLENGE_WINDOW,
            CHALLENGE_BOND,
            LATE_CANCEL_PENALTY_BPS,
            NO_ATTEST_BUFFER,
            DISPUTE_TIMEOUT
        );

        console2.log("");
        console2.log("SessionEscrowV1:", address(escrow));
        console2.log("  owner:", escrow.owner());

        vm.stopBroadcast();

        console2.log("");
        console2.log("Update in apps/frontend/src/lib/heaven/escrow.ts:");
        console2.log(string.concat("  SESSION_ESCROW_V1 = '", vm.toString(address(escrow)), "'"));
        console2.log("");
        console2.log("Update in contracts/megaeth/CLAUDE.md:");
        console2.log(string.concat("  | SessionEscrowV1 | `", vm.toString(address(escrow)), "` |"));
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update frontend escrow.ts with deployed address");
        console2.log("  2. Set up voice worker /session/join endpoint");
        console2.log("  3. Create subgraph for session indexing");
    }
}
