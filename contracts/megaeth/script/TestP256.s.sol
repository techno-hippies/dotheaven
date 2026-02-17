// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {P256Test} from "../src/test/P256Test.sol";

contract TestP256Script is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        P256Test t = new P256Test();
        vm.stopBroadcast();

        console.log("P256Test deployed at:", address(t));

        // Call verify() as a static call (no tx needed)
        (bool solidityOk, bool hasPrecompile, bool autoOk) = t.verify();
        console.log("--- P256 Verification Results ---");
        console.log("Solidity verify:", solidityOk);
        console.log("RIP-7212 precompile available:", hasPrecompile);
        console.log("Auto verify (precompile+fallback):", autoOk);

        // Benchmark
        (bool benchOk, uint256 gasUsed) = t.benchmarkSolidity();
        console.log("--- Gas Benchmark ---");
        console.log("Benchmark OK:", benchOk);
        console.log("Gas used (Solidity P256 verify):", gasUsed);
    }
}
