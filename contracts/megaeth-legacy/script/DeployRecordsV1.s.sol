// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {RecordsV1} from "../src/RecordsV1.sol";

/// @title Deploy new RecordsV1 with setTextFor meta-tx support
contract DeployRecordsV1Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("OWNER", msg.sender);
        address registry = vm.envAddress("REGISTRY");
        address sponsorPkp = vm.envAddress("SPONSOR_PKP");

        console2.log("Deploying RecordsV1 with meta-tx support");
        console2.log("  Registry:", registry);
        console2.log("  Owner:", owner);
        console2.log("  Sponsor PKP:", sponsorPkp);

        vm.startBroadcast(deployerPrivateKey);

        RecordsV1 records = new RecordsV1(registry, owner, sponsorPkp);
        console2.log("RecordsV1 deployed at:", address(records));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Point registry to new records:");
        console2.log("     cast send --legacy --gas-price 1000000 --gas-limit 2000000 \\");
        console2.log("       --rpc-url https://carrot.megaeth.com/rpc --private-key $PRIVATE_KEY \\");
        console2.log(string.concat("       ", vm.toString(registry), " 'setRecords(address)' ", vm.toString(address(records))));
        console2.log("  2. Update RECORDS in .env");
    }
}
