// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VerificationMirror} from "../src/VerificationMirror.sol";

contract DeployVerificationMirrorScript is Script {
    // Sponsor PKP address (same as other Heaven actions)
    address constant SPONSOR_PKP = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("========================================");
        console2.log("Deploying VerificationMirror on MegaETH");
        console2.log("========================================");
        console2.log("Sponsor PKP:", SPONSOR_PKP);
        console2.log("Owner:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        VerificationMirror mirror = new VerificationMirror(SPONSOR_PKP, deployer);

        vm.stopBroadcast();

        console2.log("VerificationMirror deployed at:", address(mirror));
        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("VERIFICATION_MIRROR=", vm.toString(address(mirror))));
    }
}
