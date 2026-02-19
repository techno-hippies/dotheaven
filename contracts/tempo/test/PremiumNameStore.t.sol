// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {RegistryV2} from "../src/RegistryV2.sol";
import {PremiumNameStore} from "../src/PremiumNameStore.sol";

contract MockTip20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PremiumNameStoreTest is Test {
    RegistryV2 registry;
    PremiumNameStore store;
    MockTip20 alphaUsd;

    address owner = address(0xBEEF);
    address treasury = address(0xFEE);
    address buyer = address(0xA11CE);
    address recipient = address(0xBABE);

    bytes32 pirateNode;
    uint256 oneYear = 365 days;
    uint256 kingPrice = 50_000_000; // 50 AlphaUSD (6 decimals)

    function setUp() public {
        alphaUsd = new MockTip20();
        alphaUsd.mint(buyer, 1_000_000_000);

        vm.prank(owner);
        registry = new RegistryV2(treasury, owner);

        pirateNode = _namehash("pirate", _namehash("hnsbridge", _namehash("eth", bytes32(0))));

        vm.prank(owner);
        registry.configureTld(
            pirateNode,
            1 ether, // base price for public path (not used by store purchases)
            3,
            0,
            true
        );

        vm.prank(owner);
        store = new PremiumNameStore(address(registry), address(alphaUsd), treasury, owner);

        vm.prank(owner);
        registry.setOperator(pirateNode, address(store), true);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = keccak256(bytes("king"));
        vm.prank(owner);
        registry.setReservedHashes(pirateNode, hashes, true);

        vm.prank(owner);
        store.setListing(pirateNode, "king", kingPrice, oneYear, true);
    }

    function _namehash(string memory label, bytes32 parent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }

    function test_buy_usesFixedTokenPriceAndMintsReservedName() public {
        vm.prank(buyer);
        alphaUsd.approve(address(store), kingPrice);

        vm.prank(buyer);
        uint256 tokenId = store.buy(pirateNode, "king", address(0));

        assertEq(alphaUsd.balanceOf(buyer), 1_000_000_000 - kingPrice);
        assertEq(alphaUsd.balanceOf(treasury), kingPrice);
        assertEq(registry.ownerOf(tokenId), buyer);
    }

    function test_buy_canMintToRecipient() public {
        vm.prank(buyer);
        alphaUsd.approve(address(store), kingPrice);

        vm.prank(buyer);
        uint256 tokenId = store.buy(pirateNode, "king", recipient);

        assertEq(registry.ownerOf(tokenId), recipient);
    }

    function test_buy_revertsWhenListingMissing() public {
        vm.prank(buyer);
        alphaUsd.approve(address(store), 1_000_000);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStore.ListingNotActive.selector);
        store.buy(pirateNode, "queen", address(0));
    }

    function test_buy_revertsWhenListingDisabled() public {
        vm.prank(owner);
        store.setListing(pirateNode, "king", kingPrice, oneYear, false);

        vm.prank(buyer);
        alphaUsd.approve(address(store), kingPrice);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStore.ListingNotActive.selector);
        store.buy(pirateNode, "king", address(0));
    }

    function test_storePriceIndependentFromLengthPricing() public {
        vm.prank(owner);
        registry.setLengthPricing(pirateNode, true, 100, 50, 10, 2, 0);
        vm.prank(owner);
        store.setListing(pirateNode, "ruby", 7_000_000, oneYear, true);

        uint256 quoted = registry.price(pirateNode, "ruby", oneYear);
        assertEq(quoted, 2 ether); // 4-char names use the 2x multiplier in registry

        vm.prank(buyer);
        alphaUsd.approve(address(store), 7_000_000);

        vm.prank(buyer);
        uint256 tokenId = store.buy(pirateNode, "ruby", address(0));

        assertEq(alphaUsd.balanceOf(treasury), 7_000_000);
        assertEq(registry.ownerOf(tokenId), buyer);
    }
}
