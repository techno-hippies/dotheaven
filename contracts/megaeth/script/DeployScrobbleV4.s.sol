// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {ScrobbleV4} from "../src/ScrobbleV4.sol";

/// @title DeployScrobbleV4 — Redeploy ScrobbleV4 with existing factory
contract DeployScrobbleV4Script is Script {
    /// @dev Existing HeavenAccountFactory address
    address constant FACTORY = 0xB66BF4066F40b36Da0da34916799a069CBc79408;

    /// @dev Operator address for ScrobbleV4 (sponsor PKP)
    address constant OPERATOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying ScrobbleV4 ===");
        console2.log("Factory:", FACTORY);
        console2.log("Operator:", OPERATOR);

        vm.startBroadcast(deployerPrivateKey);

        ScrobbleV4 scrobble = new ScrobbleV4(FACTORY, OPERATOR);
        console2.log("ScrobbleV4:", address(scrobble));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Update CLAUDE.md and subgraph.yaml with new address");
    }
}
