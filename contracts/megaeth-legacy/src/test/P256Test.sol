// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {P256} from "openzeppelin-contracts/contracts/utils/cryptography/P256.sol";

/// @notice Minimal contract to verify P256 works on MegaETH.
contract P256Test {
    /// @return solidityOk   verifySolidity() result
    /// @return hasPrecompile whether RIP-7212 precompile is available
    /// @return autoOk        verify() result (tries precompile, falls back)
    function verify()
        external
        view
        returns (bool solidityOk, bool hasPrecompile, bool autoOk)
    {
        // Generated with openssl/python — SHA-256("hello megaeth p256"), low-s normalized
        bytes32 h  = 0x4d620a2ee96cc87941f133796e855a1f840647eccd3c8ff707b37c18d024a1b3;
        bytes32 r  = 0xab8b4dac0b2b1ee217c02ef0b3a2d109c04052f8411e3b220f878011ae198d72;
        bytes32 s  = 0x51f8d227bcc4753dd67618215471b9e391217f199004e9011e2b0aa9f86aa1bc;
        bytes32 qx = 0x4348fe50df3ead433ba9082998cc87c38018255f4840a91744033a1ad41bcfef;
        bytes32 qy = 0x76ea812e93d49248bd32b879c444ff052f425a2f275172aa763106d9036218fb;

        solidityOk = P256.verifySolidity(h, r, s, qx, qy);

        // Probe for RIP-7212 precompile using OZ's internal technique
        bytes32 probeH  = 0xbb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023;
        bytes32 probeR  = 0x0000000000000000000000000000000000000000000000000000000000000005;
        bytes32 probeS  = 0x0000000000000000000000000000000000000000000000000000000000000001;
        bytes32 probeQx = 0xa71af64de5126a4a4e02b7922d66ce9415ce88a4c9d25514d91082c8725ac957;
        bytes32 probeQy = 0x5d47723c8fbe580bb369fec9c2665d8e30a435b9932645482e7c9f11e872296b;

        assembly {
            let ptr := mload(0x40)
            mstore(ptr, probeH)
            mstore(add(ptr, 0x20), probeR)
            mstore(add(ptr, 0x40), probeS)
            mstore(add(ptr, 0x60), probeQx)
            mstore(add(ptr, 0x80), probeQy)
            mstore(0x00, 0)
            let ok := staticcall(gas(), 0x100, ptr, 0xa0, 0x00, 0x20)
            hasPrecompile := and(ok, mload(0x00))
        }

        autoOk = P256.verify(h, r, s, qx, qy);
    }

    /// @notice Measure gas for verifySolidity.
    function benchmarkSolidity() external view returns (bool ok, uint256 gasUsed) {
        bytes32 h  = 0x4d620a2ee96cc87941f133796e855a1f840647eccd3c8ff707b37c18d024a1b3;
        bytes32 r  = 0xab8b4dac0b2b1ee217c02ef0b3a2d109c04052f8411e3b220f878011ae198d72;
        bytes32 s  = 0x51f8d227bcc4753dd67618215471b9e391217f199004e9011e2b0aa9f86aa1bc;
        bytes32 qx = 0x4348fe50df3ead433ba9082998cc87c38018255f4840a91744033a1ad41bcfef;
        bytes32 qy = 0x76ea812e93d49248bd32b879c444ff052f425a2f275172aa763106d9036218fb;

        uint256 gasBefore = gasleft();
        ok = P256.verifySolidity(h, r, s, qx, qy);
        gasUsed = gasBefore - gasleft();
    }
}
