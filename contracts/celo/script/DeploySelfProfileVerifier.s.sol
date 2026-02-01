// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SelfProfileVerifier} from "../src/SelfProfileVerifier.sol";
import {SelfUtils} from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";

contract DeploySelfProfileVerifierScript is Script {
    // Celo Sepolia (Alfajores) IdentityVerificationHub V2
    address constant HUB_V2_SEPOLIA = 0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74;

    // Celo Mainnet IdentityVerificationHub V2
    address constant HUB_V2_MAINNET = 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Default to testnet hub
        address hub = vm.envOr("SELF_HUB", HUB_V2_SEPOLIA);

        console2.log("========================================");
        console2.log("Deploying SelfProfileVerifier on Celo");
        console2.log("========================================");
        console2.log("Hub:", hub);

        // Config: age >= 18, no country restrictions, no OFAC
        string[] memory forbiddenCountries = new string[](0);
        SelfUtils.UnformattedVerificationConfigV2 memory rawCfg = SelfUtils
            .UnformattedVerificationConfigV2({
                olderThan: 18,
                forbiddenCountries: forbiddenCountries,
                ofacEnabled: false
            });

        vm.startBroadcast(deployerPrivateKey);

        SelfProfileVerifier verifier = new SelfProfileVerifier(
            hub,
            "heaven-profile-verify",
            rawCfg
        );

        console2.log("SelfProfileVerifier deployed at:", address(verifier));
        console2.log("Scope:", vm.toString(verifier.scope()));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Add to .env:");
        console2.log(string.concat("SELF_VERIFIER=", vm.toString(address(verifier))));
    }
}
