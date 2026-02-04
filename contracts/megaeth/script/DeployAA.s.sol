// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {HeavenAccountFactory} from "../src/aa/HeavenAccountFactory.sol";
import {HeavenPaymaster} from "../src/aa/HeavenPaymaster.sol";
import {ScrobbleV4} from "../src/ScrobbleV4.sol";

/// @title DeployAA — Deploy Account Abstraction infrastructure + ScrobbleV4
/// @notice Deploys: HeavenAccountFactory, HeavenPaymaster, ScrobbleV4
///
/// @dev EntryPoint v0.7 canonical address: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
///      Must be deployed on MegaETH before running this script.
///
/// Usage:
///   source .env
///   forge script script/DeployAA.s.sol \
///     --rpc-url megaeth_testnet \
///     --broadcast --legacy --gas-price 1000000 \
///     --skip-simulation --gas-limit 10000000
contract DeployAAScript is Script {
    /// @dev EntryPoint v0.7 canonical address (same on all EVM chains)
    address constant ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    /// @dev Gateway signer for paymaster (signs UserOp approvals off-chain)
    ///      Set this to the gateway service's signing key before deploying.
    ///      For testnet, can be the deployer key initially.
    address constant PAYMASTER_SIGNER = 0xc77Ad4de7d179FFFBa417cA24c055d86Af69F4BB;

    /// @dev Operator address for ScrobbleV4 (global track ops: registerTracksBatch, cover, update)
    ///      This is the sponsor PKP that currently handles operator-level tasks.
    address constant OPERATOR = 0x089fc7801D8f7D487765343a7946b1b97A7d29D4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console2.log("=== Deploying AA Infrastructure ===");
        console2.log("Chain ID: 6343 (MegaETH Testnet)");
        console2.log("EntryPoint v0.7:", ENTRYPOINT_V07);
        console2.log("Paymaster signer:", PAYMASTER_SIGNER);
        console2.log("Operator:", OPERATOR);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy HeavenAccountFactory (wraps SimpleAccountFactory)
        HeavenAccountFactory factory = new HeavenAccountFactory(IEntryPoint(ENTRYPOINT_V07));
        console2.log("HeavenAccountFactory:", address(factory));
        console2.log("  inner SimpleAccountFactory:", address(factory.inner()));
        console2.log("  accountImplementation:", factory.accountImplementation());

        // 2. Deploy HeavenPaymaster (wraps VerifyingPaymaster)
        HeavenPaymaster paymaster = new HeavenPaymaster(IEntryPoint(ENTRYPOINT_V07), PAYMASTER_SIGNER);
        console2.log("HeavenPaymaster:", address(paymaster));

        // 3. Deploy ScrobbleV4 (AA-enabled, factory-bound)
        ScrobbleV4 scrobble = new ScrobbleV4(address(factory), OPERATOR);
        console2.log("ScrobbleV4:", address(scrobble));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Add to .env:");
        console2.log(string.concat("HEAVEN_FACTORY=", vm.toString(address(factory))));
        console2.log(string.concat("HEAVEN_PAYMASTER=", vm.toString(address(paymaster))));
        console2.log(string.concat("SCROBBLE_V4=", vm.toString(address(scrobble))));
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Fund paymaster: cast send --legacy --gas-price 1000000 <PAYMASTER> 'deposit()' --value 0.1ether");
        console2.log("  2. Deploy & configure Alto bundler");
        console2.log("  3. Set up gateway service with PAYMASTER_SIGNER key");
    }
}
