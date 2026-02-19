// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {OnchainProfilesV2} from "../src/ProfileV2.sol";

contract DeployProfileV2Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("========================================");
        console2.log("Deploying ProfileV2 on MegaETH");
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        OnchainProfilesV2 profileV2 = new OnchainProfilesV2();
        console2.log("OnchainProfilesV2 deployed at:", address(profileV2));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("  ProfileV2:", address(profileV2));
    }
}
