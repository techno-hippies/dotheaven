// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {PlaylistShareV1} from "../src/PlaylistShareV1.sol";

contract DeployPlaylistShareV1Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address playlistV1 = vm.envAddress("PLAYLIST_V1");

        console2.log("=== Deploying PlaylistShareV1 (Tempo) ===");
        console2.log("Deployer:", deployer);
        console2.log("PlaylistV1:", playlistV1);

        vm.startBroadcast(deployerPrivateKey);
        PlaylistShareV1 playlistShare = new PlaylistShareV1(playlistV1);
        vm.stopBroadcast();

        console2.log("PlaylistShareV1 deployed at:", address(playlistShare));
        console2.log(string.concat("PLAYLIST_SHARE_V1=", vm.toString(address(playlistShare))));
    }
}
