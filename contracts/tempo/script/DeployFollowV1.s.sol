// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {FollowV1} from "../src/FollowV1.sol";

/// @title DeployFollowV1 — Follow graph on Tempo
contract DeployFollowV1Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("========================================");
        console2.log("Deploying FollowV1 on Tempo");
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        FollowV1 follow = new FollowV1();
        console2.log("FollowV1 deployed at:", address(follow));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Add to app config:");
        console2.log(string.concat("TEMPO_FOLLOW_V1=", vm.toString(address(follow))));
    }
}
