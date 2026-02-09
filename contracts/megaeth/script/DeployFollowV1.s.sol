// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FollowV1} from "../src/FollowV1.sol";

/// @title DeployFollowV1 — Follow graph on MegaETH
contract DeployFollowV1Script is Script {
    function run() external {
        address sponsor = vm.envAddress("SPONSOR");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("========================================");
        console2.log("Deploying FollowV1 on MegaETH");
        console2.log("========================================");
        console2.log("Sponsor:", sponsor);

        vm.startBroadcast(deployerPrivateKey);

        FollowV1 follow = new FollowV1(sponsor);
        console2.log("FollowV1 deployed at:", address(follow));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Add to .env:");
        console2.log(string.concat("FOLLOW_V1=", vm.toString(address(follow))));
    }
}
