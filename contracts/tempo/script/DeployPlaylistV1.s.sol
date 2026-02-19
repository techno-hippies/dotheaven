// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {PlaylistV1} from "../src/PlaylistV1.sol";

contract DeployPlaylistV1Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Deploying PlaylistV1 (Tempo) ===");
        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);
        PlaylistV1 playlist = new PlaylistV1();
        vm.stopBroadcast();

        console2.log("PlaylistV1 deployed at:", address(playlist));
        console2.log(string.concat("PLAYLIST_V1=", vm.toString(address(playlist))));
    }
}
