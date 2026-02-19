// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {RegistryV2} from "../src/RegistryV2.sol";
import {PremiumNameStore} from "../src/PremiumNameStore.sol";

/// @title SeedPremiumNames
/// @notice Seeds premium pricing + store listings for curated labels on Tempo.
/// @dev Idempotent: only updates entries when values differ from on-chain state.
contract SeedPremiumNamesScript is Script {
    bytes32 constant HEAVEN_NODE = 0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27;
    bytes32 constant PIRATE_NODE = 0xace9c9c435cf933be3564cdbcf7b7e2faee63e4f39034849eacb82d13f32f02a;

    address constant DEFAULT_REGISTRY_V2 = 0xA111c5cA16752B09fF16B3B8B24BA55a8486aB23;
    address constant DEFAULT_PREMIUM_NAME_STORE = 0x5efE75a72EAE3178A7a4F310e841b1D3fF980D3D;

    uint256 constant ONE_YEAR = 365 days;

    uint256 constant TIER1_AUSD_PRICE = 100_000_000; // 100 AlphaUSD (6 decimals)
    uint256 constant TIER3_AUSD_PRICE = 25_000_000; // 25 AlphaUSD (6 decimals)

    // Premium registry quotes are used as a PremiumOnly gate and should not imply public native payment.
    uint256 constant GATE_ONLY_NATIVE_QUOTE = 1;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address broadcaster = vm.addr(deployerPrivateKey);

        address registryAddress = vm.envOr("REGISTRY_V2", DEFAULT_REGISTRY_V2);
        address storeAddress = vm.envOr("PREMIUM_NAME_STORE", DEFAULT_PREMIUM_NAME_STORE);

        bool seedHeaven = vm.envOr("SEED_HEAVEN", true);
        bool seedPirate = vm.envOr("SEED_PIRATE", true);
        bool seedTier1 = vm.envOr("SEED_TIER1", true);
        bool seedTier3 = vm.envOr("SEED_TIER3", true);
        uint256 duration = vm.envOr("SEED_DURATION", ONE_YEAR);

        require(seedHeaven || seedPirate, "no TLD selected");
        require(seedTier1 || seedTier3, "no tier selected");
        require(duration > 0, "duration must be > 0");

        RegistryV2 registry = RegistryV2(payable(registryAddress));
        PremiumNameStore store = PremiumNameStore(storeAddress);

        _assertPreconditions(broadcaster, registry, store, seedHeaven, seedPirate);
        _logPlan(broadcaster, registryAddress, storeAddress, seedHeaven, seedPirate, seedTier1, seedTier3, duration);

        vm.startBroadcast(deployerPrivateKey);

        if (seedHeaven) {
            _seedTld(registry, store, HEAVEN_NODE, "heaven", seedTier1, seedTier3, duration);
        }
        if (seedPirate) {
            _seedTld(registry, store, PIRATE_NODE, "pirate", seedTier1, seedTier3, duration);
        }

        vm.stopBroadcast();
        console2.log("Premium seeding complete.");
    }

    function _assertPreconditions(
        address broadcaster,
        RegistryV2 registry,
        PremiumNameStore store,
        bool seedHeaven,
        bool seedPirate
    ) internal view {
        require(registry.owner() == broadcaster, "broadcaster must own registry");
        require(store.owner() == broadcaster, "broadcaster must own store");

        if (seedHeaven) {
            require(registry.tldExists(HEAVEN_NODE), "heaven TLD missing");
            require(registry.operators(HEAVEN_NODE, address(store)), "store not operator for heaven");
        }
        if (seedPirate) {
            require(registry.tldExists(PIRATE_NODE), "pirate TLD missing");
            require(registry.operators(PIRATE_NODE, address(store)), "store not operator for pirate");
        }
    }

    function _logPlan(
        address broadcaster,
        address registry,
        address store,
        bool seedHeaven,
        bool seedPirate,
        bool seedTier1,
        bool seedTier3,
        uint256 duration
    ) internal view {
        console2.log("========================================");
        console2.log("Seed Premium Names");
        console2.log("========================================");
        console2.log("Broadcaster:", broadcaster);
        console2.log("RegistryV2:", registry);
        console2.log("PremiumNameStore:", store);
        console2.log("Seed .heaven:", seedHeaven);
        console2.log("Seed .pirate:", seedPirate);
        console2.log("Seed Tier1:", seedTier1);
        console2.log("Seed Tier3:", seedTier3);
        console2.log("Duration:", duration);
        console2.log("Tier1 price (AlphaUSD):", TIER1_AUSD_PRICE);
        console2.log("Tier3 price (AlphaUSD):", TIER3_AUSD_PRICE);
        console2.log("========================================");
    }

    function _seedTld(
        RegistryV2 registry,
        PremiumNameStore store,
        bytes32 parentNode,
        string memory tld,
        bool seedTier1,
        bool seedTier3,
        uint256 duration
    ) internal {
        console2.log("");
        console2.log(string.concat("Seeding .", tld));

        if (seedTier1) {
            _seedTier(
                registry, store, parentNode, _tier1Labels(), GATE_ONLY_NATIVE_QUOTE, TIER1_AUSD_PRICE, duration, "tier1"
            );
        }
        if (seedTier3) {
            _seedTier(
                registry, store, parentNode, _tier3Labels(), GATE_ONLY_NATIVE_QUOTE, TIER3_AUSD_PRICE, duration, "tier3"
            );
        }
    }

    function _seedTier(
        RegistryV2 registry,
        PremiumNameStore store,
        bytes32 parentNode,
        string[] memory labels,
        uint256 nativeQuote,
        uint256 storePrice,
        uint256 duration,
        string memory tierName
    ) internal {
        console2.log(string.concat("  ", tierName, ": ", vm.toString(labels.length), " labels"));

        for (uint256 i = 0; i < labels.length; i++) {
            string memory label = labels[i];
            bytes32 labelHash = keccak256(bytes(label));

            uint256 currentPremiumQuote = registry.premiumPrice(parentNode, labelHash);
            (uint256 listingPrice, uint256 listingDuration, bool listingEnabled) = store.listings(parentNode, labelHash);

            bool updatePremiumQuote = currentPremiumQuote != nativeQuote;
            bool updateListing = listingPrice != storePrice || listingDuration != duration || !listingEnabled;

            if (updatePremiumQuote) {
                registry.setPremiumPrice(parentNode, labelHash, nativeQuote);
            }
            if (updateListing) {
                store.setListing(parentNode, label, storePrice, duration, true);
            }

            if (updatePremiumQuote || updateListing) {
                console2.log(string.concat("    updated: ", label));
            } else {
                console2.log(string.concat("    unchanged: ", label));
            }
        }
    }

    function _tier1Labels() internal pure returns (string[] memory labels) {
        labels = new string[](10);
        labels[0] = "king";
        labels[1] = "queen";
        labels[2] = "god";
        labels[3] = "devil";
        labels[4] = "pirate";
        labels[5] = "heaven";
        labels[6] = "love";
        labels[7] = "moon";
        labels[8] = "star";
        labels[9] = "angel";
    }

    function _tier3Labels() internal pure returns (string[] memory labels) {
        labels = new string[](10);
        labels[0] = "ace";
        labels[1] = "zen";
        labels[2] = "nova";
        labels[3] = "wolf";
        labels[4] = "punk";
        labels[5] = "dope";
        labels[6] = "fire";
        labels[7] = "gold";
        labels[8] = "jade";
        labels[9] = "ruby";
    }
}
