// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {RegistryV2} from "../src/RegistryV2.sol";
import {PremiumNameStoreV2} from "../src/PremiumNameStoreV2.sol";

/// @title DeployPremiumNameStoreV2Only
/// @notice Deploys PremiumNameStoreV2 for an existing RegistryV2 and grants operator rights.
contract DeployPremiumNameStoreV2OnlyScript is Script {
    address constant DEFAULT_ALPHA_USD = 0x20C0000000000000000000000000000000000001;
    bytes32 constant DEFAULT_HEAVEN_NODE =
        0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27;
    bytes32 constant DEFAULT_PIRATE_NODE =
        0xace9c9c435cf933be3564cdbcf7b7e2faee63e4f39034849eacb82d13f32f02a;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address owner = vm.envOr("OWNER", deployer);
        address treasury = vm.envOr("TREASURY", owner);
        address alphaUsd = vm.envOr("ALPHA_USD", DEFAULT_ALPHA_USD);
        address policySigner = vm.envOr("POLICY_SIGNER", owner);
        address registryAddress = vm.envOr("REGISTRY_V2", vm.envAddress("REGISTRY"));
        bytes32 nodeHeaven = vm.envOr("HEAVEN_NODE", DEFAULT_HEAVEN_NODE);
        bytes32 nodePirate = vm.envOr("PIRATE_NODE", DEFAULT_PIRATE_NODE);

        RegistryV2 registry = RegistryV2(payable(registryAddress));

        console2.log("========================================");
        console2.log("Deploying PremiumNameStoreV2 (Only)");
        console2.log("========================================");
        console2.log("Registry:", registryAddress);
        console2.log("Owner:", owner);
        console2.log("Treasury:", treasury);
        console2.log("Policy signer:", policySigner);
        console2.log("AlphaUSD:", alphaUsd);
        console2.log("Heaven node:", vm.toString(nodeHeaven));
        console2.log("Pirate node:", vm.toString(nodePirate));
        console2.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        PremiumNameStoreV2 store = new PremiumNameStoreV2(registryAddress, alphaUsd, treasury, owner, policySigner);
        registry.setOperator(nodeHeaven, address(store), true);
        registry.setOperator(nodePirate, address(store), true);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("PremiumNameStoreV2:", address(store));
        console2.log("REGISTRY_V2:", registryAddress);
        console2.log("POLICY_SIGNER:", policySigner);
        console2.log(string.concat("PREMIUM_NAME_STORE_V2=", vm.toString(address(store))));
    }
}
