// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {RegistryV1} from "../src/RegistryV1.sol";
import {RecordsV1} from "../src/RecordsV1.sol";
import {OnchainProfilesV2} from "../src/ProfileV2.sol";

/// @title DeployCore - Heaven core contracts on Tempo
/// @notice Deploys Registry + Records + Profile (no AA — Tempo handles that natively)
contract DeployCoreScript is Script {
    string constant TLD_HEAVEN = "heaven";
    string constant TLD_PIRATE = "pirate";
    string constant ROOT_TLD = "hnsbridge.eth";

    // Testnet: all names free
    uint256 constant PRICE_PER_YEAR = 0;

    string[] internal defaultReserved = [
        "heaven", "hnsbridge", "handshake", "hns",
        "admin", "support", "official", "team", "staff",
        "root", "system", "security"
    ];

    function run() external {
        address owner = vm.envOr("OWNER", msg.sender);
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envOr("TREASURY", owner);

        bytes32 nodeHeaven = _namehash(TLD_HEAVEN, ROOT_TLD);
        bytes32 nodePirate = _namehash(TLD_PIRATE, ROOT_TLD);

        console2.log("========================================");
        console2.log("Deploying Heaven Core on Tempo");
        console2.log("========================================");
        console2.log("Chain: Tempo Moderato (testnet)");
        console2.log("Root TLD:", ROOT_TLD);
        console2.log("Owner:", owner);
        console2.log("Treasury:", treasury);
        console2.log("  heaven.hnsbridge.eth");
        console2.log("    parentNode:", vm.toString(nodeHeaven));
        console2.log("  pirate.hnsbridge.eth");
        console2.log("    parentNode:", vm.toString(nodePirate));
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy RegistryV1
        RegistryV1 registry = new RegistryV1(treasury, owner);
        console2.log("RegistryV1 deployed at:", address(registry));

        // 2. Deploy RecordsV1 (sponsor = address(0) for now, Tempo fee sponsorship replaces PKP sponsor)
        RecordsV1 records = new RecordsV1(address(registry), owner, address(0));
        console2.log("RecordsV1 deployed at:", address(records));

        // Link Records to Registry
        registry.setRecords(address(records));

        // 3. Deploy ProfileV2
        OnchainProfilesV2 profileV2 = new OnchainProfilesV2();
        console2.log("ProfileV2 deployed at:", address(profileV2));

        // 4. Configure TLDs: .heaven and .pirate (all free on testnet)
        bytes32[] memory reservedHashes = new bytes32[](defaultReserved.length);
        for (uint256 i = 0; i < defaultReserved.length; i++) {
            reservedHashes[i] = keccak256(bytes(defaultReserved[i]));
        }

        registry.configureTld(
            nodeHeaven,
            PRICE_PER_YEAR,
            3,              // minLabelLength
            365 days,       // maxDuration
            true            // registrationsOpen
        );
        registry.setReservedHashes(nodeHeaven, reservedHashes, true);
        console2.log("Configured TLD: .heaven");

        registry.configureTld(
            nodePirate,
            PRICE_PER_YEAR,
            3,              // minLabelLength
            365 days,       // maxDuration
            true            // registrationsOpen
        );
        registry.setReservedHashes(nodePirate, reservedHashes, true);
        console2.log("Configured TLD: .pirate");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("  RegistryV1:  ", address(registry));
        console2.log("  RecordsV1:   ", address(records));
        console2.log("  ProfileV2:   ", address(profileV2));
        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("REGISTRY=", vm.toString(address(registry))));
        console2.log(string.concat("RECORDS=", vm.toString(address(records))));
        console2.log(string.concat("PROFILE_V2=", vm.toString(address(profileV2))));
        console2.log(string.concat("HEAVEN_NODE=", vm.toString(nodeHeaven)));
        console2.log(string.concat("PIRATE_NODE=", vm.toString(nodePirate)));
    }

    function _namehash(string memory parentName, string memory rootTld) internal pure returns (bytes32) {
        bytes32 node = bytes32(0);
        bytes memory tldBytes = bytes(rootTld);
        uint256[] memory dots = new uint256[](10);
        uint256 dotCount = 0;

        for (uint256 i = 0; i < tldBytes.length; i++) {
            if (tldBytes[i] == 0x2e) {
                dots[dotCount++] = i;
            }
        }

        if (dotCount == 0) {
            node = keccak256(abi.encodePacked(node, keccak256(tldBytes)));
        } else {
            uint256 end = tldBytes.length;
            for (uint256 i = dotCount; i > 0; i--) {
                uint256 start = dots[i - 1] + 1;
                bytes memory label = _slice(tldBytes, start, end);
                node = keccak256(abi.encodePacked(node, keccak256(label)));
                end = dots[i - 1];
            }
            bytes memory firstLabel = _slice(tldBytes, 0, end);
            node = keccak256(abi.encodePacked(node, keccak256(firstLabel)));
        }

        node = keccak256(abi.encodePacked(node, keccak256(bytes(parentName))));
        return node;
    }

    function _slice(bytes memory data, uint256 start, uint256 end) internal pure returns (bytes memory) {
        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = data[i];
        }
        return result;
    }
}
