// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/RegistryV1.sol";

contract RegistryV1Test is Test {
    RegistryV1 registry;

    address owner = address(0xBEEF);
    address treasury = address(0xFEE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 heavenNode;
    uint256 oneYear = 365 days;

    function setUp() public {
        vm.prank(owner);
        registry = new RegistryV1("hnsbridge.eth", treasury, owner);

        // Configure .heaven TLD
        heavenNode = _namehash("heaven", _namehash("hnsbridge", _namehash("eth", bytes32(0))));

        vm.prank(owner);
        registry.configureTld(
            heavenNode,
            "heaven",        // parentName
            0,               // pricePerYear (free)
            1,               // minLabelLength
            0,               // maxDuration (unlimited)
            true,            // registrationsOpen
            false,           // lengthPricingEnabled
            1, 1, 1, 1,     // length multipliers (unused)
            1,               // freeMinLength (all free)
            address(0)       // no admin
        );
    }

    function _namehash(string memory label, bytes32 parent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }

    function _node(string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(heavenNode, keccak256(bytes(label))));
    }

    function _register(address to, string memory label) internal returns (uint256) {
        vm.prank(owner);
        return registry.adminRegister(heavenNode, label, to, oneYear);
    }

    // ── Auto-set primary on first registration ──

    function test_autoSetPrimary_onFirstRegister() public {
        uint256 tokenId = _register(alice, "alice");

        assertEq(registry.primaryTokenId(alice), tokenId);

        (string memory label, bytes32 parentNode) = registry.primaryName(alice);
        assertEq(label, "alice");
        assertEq(parentNode, heavenNode);
    }

    function test_autoSetPrimary_doesNotOverwriteValid() public {
        uint256 firstId = _register(alice, "alice");
        _register(alice, "alice2");

        // Should still be the first one
        assertEq(registry.primaryTokenId(alice), firstId);
    }

    // ── Stale primary replaced on new registration ──

    function test_autoSetPrimary_replacesExpired() public {
        uint256 firstId = _register(alice, "alice");
        assertEq(registry.primaryTokenId(alice), firstId);

        // Expire the first name
        vm.warp(block.timestamp + oneYear + 1);

        // Register a new name — should replace the expired primary
        uint256 secondId = _register(alice, "alice2");
        assertEq(registry.primaryTokenId(alice), secondId);
    }

    function test_autoSetPrimary_replacesTransferred() public {
        uint256 tokenId = _register(alice, "alice");
        assertEq(registry.primaryTokenId(alice), tokenId);

        // Transfer away — clears primary
        vm.prank(alice);
        registry.transferFrom(alice, bob, tokenId);
        assertEq(registry.primaryTokenId(alice), 0);

        // Register new name — should auto-set
        uint256 secondId = _register(alice, "newname");
        assertEq(registry.primaryTokenId(alice), secondId);
    }

    // ── Transfer clears sender's primary ──

    function test_transfer_clearsSenderPrimary() public {
        uint256 tokenId = _register(alice, "alice");
        assertEq(registry.primaryTokenId(alice), tokenId);

        vm.prank(alice);
        registry.transferFrom(alice, bob, tokenId);

        assertEq(registry.primaryTokenId(alice), 0);
    }

    function test_transfer_doesNotClearIfNotPrimary() public {
        uint256 firstId = _register(alice, "alice");
        uint256 secondId = _register(alice, "alice2");

        // Primary is still the first
        assertEq(registry.primaryTokenId(alice), firstId);

        // Transfer the second (non-primary) — should not affect primary
        vm.prank(alice);
        registry.transferFrom(alice, bob, secondId);

        assertEq(registry.primaryTokenId(alice), firstId);
    }

    // ── setPrimaryName / clearPrimaryName ──

    function test_setPrimaryName() public {
        _register(alice, "alice");
        uint256 secondId = _register(alice, "alice2");

        vm.prank(alice);
        registry.setPrimaryName(secondId);

        assertEq(registry.primaryTokenId(alice), secondId);
    }

    function test_setPrimaryName_revertsIfNotOwner() public {
        uint256 tokenId = _register(alice, "alice");

        vm.prank(bob);
        vm.expectRevert(RegistryV1.NotAuthorized.selector);
        registry.setPrimaryName(tokenId);
    }

    function test_setPrimaryName_revertsIfExpired() public {
        uint256 tokenId = _register(alice, "alice");
        vm.warp(block.timestamp + oneYear + 1);

        vm.prank(alice);
        vm.expectRevert(RegistryV1.Expired.selector);
        registry.setPrimaryName(tokenId);
    }

    function test_clearPrimaryName() public {
        _register(alice, "alice");

        vm.prank(alice);
        registry.clearPrimaryName();

        assertEq(registry.primaryTokenId(alice), 0);
    }

    // ── primaryNode view validates expiry/ownership ──

    function test_primaryNode_returnsZeroWhenExpired() public {
        _register(alice, "alice");

        // Valid
        assertTrue(registry.primaryNode(alice) != bytes32(0));

        // Expire
        vm.warp(block.timestamp + oneYear + 1);

        // Should return zero now
        assertEq(registry.primaryNode(alice), bytes32(0));
    }

    function test_primaryNode_returnsZeroAfterTransfer() public {
        uint256 tokenId = _register(alice, "alice");

        vm.prank(alice);
        registry.transferFrom(alice, bob, tokenId);

        assertEq(registry.primaryNode(alice), bytes32(0));
    }

    function test_primaryName_returnsEmptyWhenNone() public {
        (string memory label, bytes32 parentNode) = registry.primaryName(alice);
        assertEq(bytes(label).length, 0);
        assertEq(parentNode, bytes32(0));
    }

    // ── Burn/re-register clears primary ──

    function test_reRegister_clearsPreviousOwnerPrimary() public {
        uint256 tokenId = _register(alice, "alice");
        assertEq(registry.primaryTokenId(alice), tokenId);

        // Expire + grace period
        vm.warp(block.timestamp + oneYear + registry.GRACE_PERIOD() + 1);

        // Bob re-registers the same name
        uint256 newId = _register(bob, "alice");

        // Alice's primary should be cleared (by _clearToken during burn)
        assertEq(registry.primaryTokenId(alice), 0);
        // Bob should have it as primary
        assertEq(registry.primaryTokenId(bob), newId);
    }
}
