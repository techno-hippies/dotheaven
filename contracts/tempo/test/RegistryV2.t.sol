// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {RegistryV2} from "../src/RegistryV2.sol";

contract RegistryV2Test is Test {
    RegistryV2 registry;

    address owner = address(0xBEEF);
    address treasury = address(0xFEE);
    address alice = address(0xA11CE);
    address operator = address(0xCAFE);

    bytes32 pirateNode;
    uint256 oneYear = 365 days;

    function setUp() public {
        vm.prank(owner);
        registry = new RegistryV2(treasury, owner);

        pirateNode = _namehash("pirate", _namehash("hnsbridge", _namehash("eth", bytes32(0))));

        vm.prank(owner);
        registry.configureTld(
            pirateNode,
            1 ether, // base annual price
            3, // public min label len
            0, // maxDuration unlimited
            true
        );
    }

    function _namehash(string memory label, bytes32 parent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }

    function _hash(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    function test_lengthPricing_appliesToShortNames() public {
        vm.prank(owner);
        registry.setLengthPricing(pirateNode, true, 100, 50, 10, 2, 0);

        uint256 p1 = registry.price(pirateNode, "a", oneYear);
        uint256 p2 = registry.price(pirateNode, "ab", oneYear);
        uint256 p3 = registry.price(pirateNode, "abc", oneYear);
        uint256 p4 = registry.price(pirateNode, "abcd", oneYear);
        uint256 p5 = registry.price(pirateNode, "abcde", oneYear);

        assertEq(p1, 100 ether);
        assertEq(p2, 50 ether);
        assertEq(p3, 10 ether);
        assertEq(p4, 2 ether);
        assertEq(p5, 1 ether);
    }

    function test_premiumOverridesLengthQuote() public {
        vm.prank(owner);
        registry.setLengthPricing(pirateNode, true, 100, 50, 10, 2, 0);

        vm.prank(owner);
        registry.setPremiumPrice(pirateNode, _hash("king"), 777 ether);

        uint256 quoted = registry.price(pirateNode, "king", oneYear);
        assertEq(quoted, 777 ether);
    }

    function test_publicRegister_revertsForPremiumOnly() public {
        vm.prank(owner);
        registry.setPremiumPrice(pirateNode, _hash("king"), 5 ether);

        vm.prank(alice);
        vm.expectRevert(RegistryV2.PremiumOnly.selector);
        registry.register(pirateNode, "king", oneYear);
    }

    function test_freeMinLength_makesFivePlusNamesFree() public {
        vm.prank(owner);
        registry.setLengthPricing(pirateNode, true, 100, 50, 10, 2, 5);

        uint256 shortQuote = registry.price(pirateNode, "ruby", oneYear);
        uint256 freeQuote = registry.price(pirateNode, "sailor", oneYear);

        assertEq(shortQuote, 2 ether);
        assertEq(freeQuote, 0);
    }

    function test_available_falseForPremiumOrReserved() public {
        vm.prank(owner);
        registry.setPremiumPrice(pirateNode, _hash("king"), 5 ether);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = _hash("admin");
        vm.prank(owner);
        registry.setReservedHashes(pirateNode, hashes, true);

        assertFalse(registry.available(pirateNode, "king"));
        assertFalse(registry.available(pirateNode, "admin"));
    }

    function test_operatorRegister_canMintReservedAndShort() public {
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = _hash("king");
        vm.prank(owner);
        registry.setReservedHashes(pirateNode, hashes, true);

        vm.prank(owner);
        registry.setPremiumPrice(pirateNode, _hash("king"), 42 ether);

        vm.prank(owner);
        registry.setOperator(pirateNode, operator, true);

        vm.prank(operator);
        uint256 kingId = registry.operatorRegister(pirateNode, "king", alice, oneYear);
        assertEq(registry.ownerOf(kingId), alice);

        vm.prank(operator);
        uint256 shortId = registry.operatorRegister(pirateNode, "xy", alice, oneYear);
        assertEq(registry.ownerOf(shortId), alice);
    }

    function test_operatorRegister_doesNotRequireNativePayment() public {
        vm.prank(owner);
        registry.setOperator(pirateNode, operator, true);

        vm.prank(operator);
        uint256 tokenId = registry.operatorRegister(pirateNode, "queen", alice, oneYear);
        assertEq(registry.ownerOf(tokenId), alice);
    }

    function test_publicRegister_requiresConfiguredPricePayment() public {
        vm.deal(alice, 2 ether);

        vm.prank(alice);
        vm.expectRevert(RegistryV2.InsufficientPayment.selector);
        registry.register(pirateNode, "sailor", oneYear);

        vm.prank(alice);
        uint256 tokenId = registry.register{value: 1 ether}(pirateNode, "sailor", oneYear);
        assertEq(registry.ownerOf(tokenId), alice);
    }
}
