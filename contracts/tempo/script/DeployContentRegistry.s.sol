// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";

contract DeployContentRegistryScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address sponsor = vm.envOr("CONTENT_SPONSOR", deployer);

        console2.log("=== Deploying ContentRegistry (Tempo) ===");
        console2.log("Deployer:", deployer);
        console2.log("Sponsor:", sponsor);

        vm.startBroadcast(deployerPrivateKey);
        ContentRegistry registry = new ContentRegistry(sponsor);
        vm.stopBroadcast();

        console2.log("ContentRegistry deployed at:", address(registry));
        console2.log(string.concat("CONTENT_REGISTRY=", vm.toString(address(registry))));
    }
}
