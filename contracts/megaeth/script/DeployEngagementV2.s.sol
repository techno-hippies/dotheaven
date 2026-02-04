// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EngagementV2} from "../src/EngagementV2.sol";

/// @title DeployEngagementV2 - Likes, comments, reveals, bans
/// @notice Deploys EngagementV2 with sponsor PKP and charity wallet
contract DeployEngagementV2Script is Script {
    address constant SPONSOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // For testnet: use deployer as charity wallet (no real funds)
        // For mainnet: use immutable charity Gnosis Safe
        address charityWallet = vm.envOr("CHARITY_WALLET", deployer);

        console2.log("========================================");
        console2.log("Deploying EngagementV2 on MegaETH");
        console2.log("========================================");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Deployer:", deployer);
        console2.log("Sponsor PKP:", SPONSOR);
        console2.log("Charity Wallet:", charityWallet);
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        EngagementV2 engagement = new EngagementV2(SPONSOR, charityWallet);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("EngagementV2:", address(engagement));
        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("ENGAGEMENT_V2=", vm.toString(address(engagement))));
    }
}
