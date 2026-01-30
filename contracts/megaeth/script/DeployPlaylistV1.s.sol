// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {PlaylistV1} from "../src/PlaylistV1.sol";

contract DeployPlaylistV1Script is Script {
    // Sponsor PKP address (same as used for ScrobbleV3, claim-name, set-profile)
    address constant SPONSOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying PlaylistV1 ===");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Sponsor:", SPONSOR);

        vm.startBroadcast(deployerPrivateKey);

        PlaylistV1 playlist = new PlaylistV1(SPONSOR);
        console2.log("PlaylistV1 deployed at:", address(playlist));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("PLAYLIST_V1=", vm.toString(address(playlist))));
    }
}
