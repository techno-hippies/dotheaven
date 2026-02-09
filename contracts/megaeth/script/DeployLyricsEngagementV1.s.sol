// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LyricsEngagementV1} from "../src/LyricsEngagementV1.sol";

/// @title DeployLyricsEngagementV1 - Song lyrics translation persistence
/// @notice Deploys LyricsEngagementV1 with sponsor PKP
contract DeployLyricsEngagementV1Script is Script {
    address constant SPONSOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========================================");
        console2.log("Deploying LyricsEngagementV1 on MegaETH");
        console2.log("========================================");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Deployer:", deployer);
        console2.log("Sponsor PKP:", SPONSOR);
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        LyricsEngagementV1 lyrics = new LyricsEngagementV1(SPONSOR);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("LyricsEngagementV1:", address(lyrics));
        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("LYRICS_ENGAGEMENT_V1=", vm.toString(address(lyrics))));
    }
}
