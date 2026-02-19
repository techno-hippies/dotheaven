// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {RegistryV2} from "../src/RegistryV2.sol";
import {RecordsV1} from "../src/RecordsV1.sol";
import {PremiumNameStoreV2} from "../src/PremiumNameStoreV2.sol";

/// @title DeployNamesV3
/// @notice Deploy RegistryV2 + RecordsV1 + PremiumNameStoreV2 (permit-gated) on Tempo.
contract DeployNamesV3Script is Script {
    string constant TLD_HEAVEN = "heaven";
    string constant TLD_PIRATE = "pirate";
    string constant ROOT_TLD = "hnsbridge.eth";

    // Example default: 1 unit in 6-decimal terms. Override via BASE_PRICE_PER_YEAR env var.
    uint256 constant DEFAULT_BASE_PRICE_PER_YEAR = 1_000_000;
    address constant DEFAULT_ALPHA_USD = 0x20C0000000000000000000000000000000000001;

    string[] internal defaultReserved = [
        "heaven", "hnsbridge", "handshake", "hns", "admin", "support", "official", "team", "staff", "root", "system",
        "security"
    ];

    function run() external {
        address owner = vm.envOr("OWNER", msg.sender);
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envOr("TREASURY", owner);
        address alphaUsd = vm.envOr("ALPHA_USD", DEFAULT_ALPHA_USD);
        address policySigner = vm.envAddress("POLICY_SIGNER");
        uint256 basePricePerYear = vm.envOr("BASE_PRICE_PER_YEAR", DEFAULT_BASE_PRICE_PER_YEAR);
        uint256 freeMinLengthRaw = vm.envOr("FREE_MIN_LENGTH", uint256(5));
        require(freeMinLengthRaw <= type(uint8).max, "FREE_MIN_LENGTH too large");
        uint8 freeMinLength = uint8(freeMinLengthRaw);

        bytes32 nodeHeaven = _namehash(TLD_HEAVEN, ROOT_TLD);
        bytes32 nodePirate = _namehash(TLD_PIRATE, ROOT_TLD);

        console2.log("========================================");
        console2.log("Deploying Name Stack V3 on Tempo");
        console2.log("========================================");
        console2.log("Chain: Tempo Moderato (testnet)");
        console2.log("Root TLD:", ROOT_TLD);
        console2.log("Owner:", owner);
        console2.log("Treasury:", treasury);
        console2.log("AlphaUSD:", alphaUsd);
        console2.log("Policy signer:", policySigner);
        console2.log("Base price / year:", basePricePerYear);
        console2.log("Free min length:", freeMinLength);
        console2.log("  heaven.hnsbridge.eth");
        console2.log("    parentNode:", vm.toString(nodeHeaven));
        console2.log("  pirate.hnsbridge.eth");
        console2.log("    parentNode:", vm.toString(nodePirate));
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        RegistryV2 registry = new RegistryV2(treasury, owner);
        console2.log("RegistryV2 deployed at:", address(registry));

        RecordsV1 records = new RecordsV1(address(registry), owner, address(0));
        console2.log("RecordsV1 deployed at:", address(records));

        registry.setRecords(address(records));

        bytes32[] memory reservedHashes = new bytes32[](defaultReserved.length);
        for (uint256 i = 0; i < defaultReserved.length; i++) {
            reservedHashes[i] = keccak256(bytes(defaultReserved[i]));
        }

        registry.configureTld(nodeHeaven, basePricePerYear, 3, 365 days, true);
        registry.setReservedHashes(nodeHeaven, reservedHashes, true);
        registry.setLengthPricing(nodeHeaven, true, 100, 50, 10, 2, freeMinLength);
        console2.log("Configured TLD: .heaven");

        registry.configureTld(nodePirate, basePricePerYear, 3, 365 days, true);
        registry.setReservedHashes(nodePirate, reservedHashes, true);
        registry.setLengthPricing(nodePirate, true, 100, 50, 10, 2, freeMinLength);
        console2.log("Configured TLD: .pirate with length multipliers");

        PremiumNameStoreV2 store = new PremiumNameStoreV2(address(registry), alphaUsd, treasury, owner, policySigner);
        registry.setOperator(nodeHeaven, address(store), true);
        registry.setOperator(nodePirate, address(store), true);
        console2.log("PremiumNameStoreV2 deployed at:", address(store));
        console2.log("Operator granted on .heaven and .pirate");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("  RegistryV2:        ", address(registry));
        console2.log("  RecordsV1:         ", address(records));
        console2.log("  PremiumNameStoreV2:", address(store));
        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("REGISTRY_V2=", vm.toString(address(registry))));
        console2.log(string.concat("RECORDS=", vm.toString(address(records))));
        console2.log(string.concat("PREMIUM_NAME_STORE_V2=", vm.toString(address(store))));
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
