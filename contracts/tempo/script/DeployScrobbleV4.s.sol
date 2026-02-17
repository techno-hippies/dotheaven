// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {ScrobbleV4} from "../src/ScrobbleV4.sol";

/// @title DeployScrobbleV4 — Deploy ScrobbleV4 on Tempo
contract DeployScrobbleV4Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address operator = vm.envOr("SCROBBLE_OPERATOR", deployer);

        console2.log("=== Deploying ScrobbleV4 (Tempo) ===");
        console2.log("Deployer:", deployer);
        console2.log("Operator:", operator);

        vm.startBroadcast(deployerPrivateKey);
        ScrobbleV4 scrobble = new ScrobbleV4(operator);
        vm.stopBroadcast();

        console2.log("ScrobbleV4 deployed at:", address(scrobble));
        console2.log(string.concat("SCROBBLE_V4=", vm.toString(address(scrobble))));
    }
}
