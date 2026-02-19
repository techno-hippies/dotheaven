// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {CanonicalLyricsRegistryV1} from "../src/CanonicalLyricsRegistryV1.sol";

contract CanonicalLyricsRegistryV1Test is Test {
    CanonicalLyricsRegistryV1 reg;

    address deployer = address(0xA11CE);
    address operator = address(0xB0B);
    address user = address(0xC0FFEE);

    function setUp() public {
        vm.prank(deployer);
        reg = new CanonicalLyricsRegistryV1(operator);
    }

    function test_constructor() public view {
        assertEq(reg.owner(), deployer);
        assertTrue(reg.isOperator(operator));
    }

    function test_setLyrics_operator_firstWriteWins() public {
        bytes32 trackId = keccak256("track-1");
        string memory lyricsRef = "ar://lyrics-dataitem-id";
        bytes32 lyricsHash = keccak256("lyrics-bytes");

        vm.prank(operator);
        reg.setLyrics(trackId, lyricsRef, lyricsHash);

        (string memory storedRef, bytes32 storedHash, uint32 version, address submitter, uint64 timestamp) = reg.getLyrics(trackId);
        assertEq(storedRef, lyricsRef);
        assertEq(storedHash, lyricsHash);
        assertEq(version, 1);
        assertEq(submitter, operator);
        assertEq(timestamp, uint64(block.timestamp));
        assertTrue(reg.hasLyrics(trackId));

        vm.prank(operator);
        vm.expectRevert("lyrics already set");
        reg.setLyrics(trackId, "ar://other", keccak256("other"));
    }

    function test_setLyrics_notOperator_reverts() public {
        vm.prank(user);
        vm.expectRevert(CanonicalLyricsRegistryV1.Unauthorized.selector);
        reg.setLyrics(keccak256("track"), "ar://x", keccak256("h"));
    }

    function test_setLyrics_validation_reverts() public {
        vm.prank(operator);
        vm.expectRevert("zero trackId");
        reg.setLyrics(bytes32(0), "ar://x", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("empty ref");
        reg.setLyrics(keccak256("track"), "", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("ref must ar://");
        reg.setLyrics(keccak256("track"), "ipfs://cid", keccak256("h"));

        vm.prank(operator);
        vm.expectRevert("zero hash");
        reg.setLyrics(keccak256("track"), "ar://x", bytes32(0));
    }

    function test_overwriteLyrics_operator_bumpsVersion() public {
        bytes32 trackId = keccak256("track-2");

        vm.prank(operator);
        reg.setLyrics(trackId, "ar://old", keccak256("old"));

        vm.prank(operator);
        reg.overwriteLyrics(trackId, "ar://new", keccak256("new"));

        (string memory storedRef, bytes32 storedHash, uint32 version, address submitter, uint64 timestamp) = reg.getLyrics(trackId);
        assertEq(storedRef, "ar://new");
        assertEq(storedHash, keccak256("new"));
        assertEq(version, 2);
        assertEq(submitter, operator);
        assertEq(timestamp, uint64(block.timestamp));
    }

    function test_overwriteLyrics_notOperator_reverts() public {
        bytes32 trackId = keccak256("track-3");

        vm.prank(operator);
        reg.setLyrics(trackId, "ar://old", keccak256("old"));

        vm.prank(user);
        vm.expectRevert(CanonicalLyricsRegistryV1.Unauthorized.selector);
        reg.overwriteLyrics(trackId, "ar://new", keccak256("new"));
    }

    function test_overwriteLyrics_whenNotSet_reverts() public {
        vm.prank(operator);
        vm.expectRevert("lyrics not set");
        reg.overwriteLyrics(keccak256("missing"), "ar://new", keccak256("new"));
    }

    function test_transferOwnership_and_setOperator() public {
        address newOwner = address(0xDEAD);
        address newOperator = address(0xBEEF);

        vm.prank(deployer);
        reg.transferOwnership(newOwner);
        assertEq(reg.owner(), newOwner);

        vm.prank(newOwner);
        reg.setOperator(newOperator, true);
        assertTrue(reg.isOperator(newOperator));
    }

    function test_onlyOwner_guards() public {
        vm.expectRevert(CanonicalLyricsRegistryV1.Unauthorized.selector);
        reg.transferOwnership(user);

        vm.expectRevert(CanonicalLyricsRegistryV1.Unauthorized.selector);
        reg.setOperator(user, true);
    }
}
