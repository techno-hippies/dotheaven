// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PostsV1} from "../src/PostsV1.sol";

contract DeployPostsV1Script is Script {
    // Sponsor PKP address (same as used for ScrobbleV3, PlaylistV1, etc.)
    address constant SPONSOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying PostsV1 ===");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Sponsor:", SPONSOR);

        vm.startBroadcast(deployerPrivateKey);

        PostsV1 posts = new PostsV1(SPONSOR);
        console2.log("PostsV1 deployed at:", address(posts));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("POSTS_V1=", vm.toString(address(posts))));
    }
}
