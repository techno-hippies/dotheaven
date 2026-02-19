// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {PlaylistShareV1} from "../src/PlaylistShareV1.sol";

contract DeployPlaylistShareV1Script is Script {
    // Sponsor PKP address used by Lit Actions to broadcast sponsor-gated txs.
    // See: lit-actions/output/pkp-naga-dev.json
    address constant SPONSOR = 0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455;

    // PlaylistV1 contract (MegaETH Testnet)
    address constant PLAYLIST_V1 = 0xF0337C4A335cbB3B31c981945d3bE5B914F7B329;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying PlaylistShareV1 ===");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Sponsor:", SPONSOR);
        console2.log("PlaylistV1:", PLAYLIST_V1);

        vm.startBroadcast(deployerPrivateKey);

        PlaylistShareV1 share = new PlaylistShareV1(SPONSOR, PLAYLIST_V1);
        console2.log("PlaylistShareV1 deployed at:", address(share));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("PLAYLIST_SHARE_V1=", vm.toString(address(share))));
    }
}
