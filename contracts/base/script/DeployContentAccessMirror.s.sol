// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {ContentAccessMirror} from "../src/ContentAccessMirror.sol";

contract DeployContentAccessMirrorScript is Script {
    // Default to current MegaETH sponsor PKP; override via SPONSOR env var if needed.
    address constant DEFAULT_SPONSOR = 0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address sponsor = vm.envOr("SPONSOR", DEFAULT_SPONSOR);

        console2.log("=== Deploying ContentAccessMirror ===");
        console2.log("Sponsor:", sponsor);

        vm.startBroadcast(deployerPrivateKey);

        ContentAccessMirror mirror = new ContentAccessMirror(sponsor);
        console2.log("ContentAccessMirror deployed at:", address(mirror));

        vm.stopBroadcast();
    }
}
