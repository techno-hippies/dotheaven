// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {ContentAccessMirror} from "../src/ContentAccessMirror.sol";

contract DeployContentAccessMirrorScript is Script {
    // Sponsor PKP address (same as MegaETH contracts)
    address constant SPONSOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying ContentAccessMirror ===");
        console2.log("Sponsor:", SPONSOR);

        vm.startBroadcast(deployerPrivateKey);

        ContentAccessMirror mirror = new ContentAccessMirror(SPONSOR);
        console2.log("ContentAccessMirror deployed at:", address(mirror));

        vm.stopBroadcast();
    }
}
