// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {ScrobbleV2} from "../src/ScrobbleV2.sol";

contract DeployScrobbleV2Script is Script {
    // Sponsor PKP address (same as used for ScrobbleV1, claim-name, set-profile)
    address constant SPONSOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying ScrobbleV2 ===");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("Sponsor:", SPONSOR);

        vm.startBroadcast(deployerPrivateKey);

        ScrobbleV2 scrobble = new ScrobbleV2(SPONSOR);
        console2.log("ScrobbleV2 deployed at:", address(scrobble));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("SCROBBLE_V2=", vm.toString(address(scrobble))));
    }
}
