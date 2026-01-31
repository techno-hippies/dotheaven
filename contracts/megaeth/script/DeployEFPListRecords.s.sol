// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {EFPListRecords} from "../src/efp/EFPListRecords.sol";

/// @title DeployEFPListRecords — EFP List Records on MegaETH
/// @notice Deploys unmodified EFP ListRecords contract for follow/social graph
contract DeployEFPListRecordsScript is Script {
    function run() external {
        address owner = vm.envOr("OWNER", msg.sender);
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("========================================");
        console2.log("Deploying EFP List Records on MegaETH");
        console2.log("========================================");
        console2.log("Owner:", owner);

        vm.startBroadcast(deployerPrivateKey);

        EFPListRecords listRecords = new EFPListRecords(owner);
        console2.log("EFPListRecords deployed at:", address(listRecords));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Add to .env:");
        console2.log(string.concat("EFP_LIST_RECORDS=", vm.toString(address(listRecords))));
    }
}
