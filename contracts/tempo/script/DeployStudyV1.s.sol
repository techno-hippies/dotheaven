// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {StudySetRegistryV1} from "../src/StudySetRegistryV1.sol";
import {StudyAttemptsV1} from "../src/StudyAttemptsV1.sol";

/// @title DeployStudyV1
/// @notice Deploy StudySetRegistryV1 + StudyAttemptsV1 on Tempo Moderato.
contract DeployStudyV1Script is Script {
    // AlphaUSD (6 decimals) on Tempo Moderato.
    address constant DEFAULT_PAYMENT_TOKEN = 0x20C0000000000000000000000000000000000001;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address owner = vm.envOr("STUDY_OWNER", deployer);
        address operator = vm.envOr("STUDY_SET_OPERATOR", deployer);
        address treasury = vm.envOr("STUDY_SET_TREASURY", owner);
        address paymentToken = vm.envOr("STUDY_SET_PAYMENT_TOKEN", DEFAULT_PAYMENT_TOKEN);

        console2.log("=== Deploying Study V1 Contracts (Tempo Moderato) ===");
        console2.log("Deployer:", deployer);
        console2.log("Owner:", owner);
        console2.log("Study set operator:", operator);
        console2.log("Treasury:", treasury);
        console2.log("Payment token:", paymentToken);

        vm.startBroadcast(deployerPrivateKey);

        StudySetRegistryV1 studySetRegistry = new StudySetRegistryV1(operator, paymentToken, treasury);
        StudyAttemptsV1 studyAttempts = new StudyAttemptsV1();

        if (owner != deployer) {
            studySetRegistry.transferOwnership(owner);
            studyAttempts.transferOwnership(owner);
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("StudySetRegistryV1:", address(studySetRegistry));
        console2.log("StudyAttemptsV1:", address(studyAttempts));
        console2.log("");
        console2.log("Export:");
        console2.log(string.concat("TEMPO_STUDY_SET_REGISTRY=", vm.toString(address(studySetRegistry))));
        console2.log(string.concat("TEMPO_STUDY_ATTEMPTS=", vm.toString(address(studyAttempts))));
        console2.log(string.concat("TEMPO_CHAIN_ID=", vm.toString(block.chainid)));
    }
}

