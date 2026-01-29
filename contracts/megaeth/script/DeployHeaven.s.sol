// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {RegistryV1} from "../src/RegistryV1.sol";
import {RecordsV1} from "../src/RecordsV1.sol";

/// @title DeployHeaven - .heaven names on MegaETH
/// @notice Deploys registry with native ETH payments and tiered pricing
contract DeployHeavenScript is Script {
    string constant TLD_HEAVEN = "heaven";
    string constant ROOT_TLD = "hnsbridge.eth";

    // Pricing in ETH (18 decimals):
    //   - 5+ chars: FREE (pricePerYear = 0, mult = 1 → 0)
    //   - 4 chars:  0.005 ETH/yr
    //   - 3 chars:  0.01 ETH/yr
    //   - 2 chars:  0.04 ETH/yr
    //
    // NOTE: To make 5+ chars truly free while charging for short names,
    // we set pricePerYear = 0 during testnet. For mainnet with paid short names,
    // either add a freeMinLength to the contract or use adminRegister for short names.
    uint256 constant PRICE_PER_YEAR = 0; // FREE for testnet

    // Reserved labels
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

        console2.log("========================================");
        console2.log("Deploying Heaven Contracts on MegaETH");
        console2.log("========================================");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("RPC: https://carrot.megaeth.com/rpc");
        console2.log("Root TLD:", ROOT_TLD);
        console2.log("Owner:", owner);
        console2.log("Treasury:", treasury);
        console2.log("");
        console2.log("Pricing (.heaven):");
        console2.log("  - All names: FREE (testnet)");
        console2.log("");
        console2.log("  heaven.hnsbridge.eth");
        console2.log("    parentNode:", vm.toString(nodeHeaven));
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy RegistryV1
        RegistryV1 registry = new RegistryV1(
            ROOT_TLD,
            treasury,
            owner
        );
        console2.log("RegistryV1 deployed at:", address(registry));

        // 2. Deploy RecordsV1
        RecordsV1 records = new RecordsV1(address(registry), owner);
        console2.log("RecordsV1 deployed at:", address(records));

        // Link Records to Registry
        registry.setRecords(address(records));
        console2.log("Records linked to Registry");

        // Pre-compute reserved hashes
        bytes32[] memory reservedHashes = new bytes32[](defaultReserved.length);
        for (uint256 i = 0; i < defaultReserved.length; i++) {
            reservedHashes[i] = keccak256(bytes(defaultReserved[i]));
        }

        // Configure TLD: .heaven
        // 5+ chars = FREE, 2-4 chars = paid (ETH)
        // Testnet: pricePerYear = 0 so everything is free regardless.
        // Mainnet: set pricePerYear to ETH amount, freeMinLength = 5.
        registry.configureTld(
            nodeHeaven,
            TLD_HEAVEN,
            PRICE_PER_YEAR,  // 0 = free for testnet
            3,               // minLabelLength = 3
            365 days,        // maxDuration = 1 year
            true,            // registrationsOpen = true
            false,           // lengthPricingEnabled = false (all free on testnet)
            1, 1, 1, 1,     // multipliers (unused when pricing disabled)
            5,               // freeMinLength = 5 (names >= 5 chars always free)
            address(0)       // no TLD admin
        );
        registry.setReservedHashes(nodeHeaven, reservedHashes, true);
        console2.log("Configured TLD: .heaven");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("");
        console2.log("Deployed contracts:");
        console2.log("  RegistryV1:  ", address(registry));
        console2.log("  RecordsV1:   ", address(records));
        console2.log("");
        console2.log("TLD Parent Node:");
        console2.log("  HEAVEN:", vm.toString(nodeHeaven));
        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("REGISTRY=", vm.toString(address(registry))));
        console2.log(string.concat("RECORDS=", vm.toString(address(records))));
        console2.log(string.concat("HEAVEN_NODE=", vm.toString(nodeHeaven)));
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
