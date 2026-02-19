// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {CanonicalLyricsRegistryV1} from "../src/CanonicalLyricsRegistryV1.sol";

/// @title DeployCanonicalLyricsRegistryV1 — Deploy canonical lyrics registry on Tempo
contract DeployCanonicalLyricsRegistryV1Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address operator = vm.envOr("CANONICAL_LYRICS_OPERATOR", deployer);

        console2.log("=== Deploying CanonicalLyricsRegistryV1 (Tempo) ===");
        console2.log("Deployer:", deployer);
        console2.log("Operator:", operator);

        vm.startBroadcast(deployerPrivateKey);
        CanonicalLyricsRegistryV1 registry = new CanonicalLyricsRegistryV1(operator);
        vm.stopBroadcast();

        console2.log("CanonicalLyricsRegistryV1 deployed at:", address(registry));
        console2.log(string.concat("TEMPO_CANONICAL_LYRICS_REGISTRY=", vm.toString(address(registry))));
    }
}
