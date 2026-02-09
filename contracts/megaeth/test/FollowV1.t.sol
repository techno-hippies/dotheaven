// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FollowV1.sol";

contract FollowV1Test is Test {
    FollowV1 f;

    address owner = address(0xA11CE);
    address sponsor = address(0xB0B);
    address alice = address(0xC0FFEE);
    address bob = address(0xBEEF);
    address carol = address(0xCAFE);

    function setUp() public {
        vm.prank(owner);
        f = new FollowV1(sponsor);
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(f.owner(), owner);
        assertTrue(f.isSponsor(owner));
        assertTrue(f.isSponsor(sponsor));
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);
        vm.prank(owner);
        f.transferOwnership(newOwner);
        assertEq(f.owner(), newOwner);
    }

    function test_transferOwnership_revertNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.transferOwnership(alice);
    }

    function test_setSponsor() public {
        vm.prank(owner);
        f.setSponsor(alice, true);
        assertTrue(f.isSponsor(alice));

        vm.prank(owner);
        f.setSponsor(alice, false);
        assertFalse(f.isSponsor(alice));
    }

    function test_setSponsor_revertNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.setSponsor(alice, true);
    }

    // ── Follow ───────────────────────────────────────────────────────────

    function test_followFor() public {
        vm.prank(sponsor);
        vm.expectEmit(true, true, false, false);
        emit FollowV1.Followed(alice, bob);
        f.followFor(alice, bob);

        assertTrue(f.follows(alice, bob));
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);
    }

    function test_followFor_idempotent() public {
        vm.startPrank(sponsor);
        f.followFor(alice, bob);
        f.followFor(alice, bob);
        vm.stopPrank();

        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);
    }

    function test_followFor_selfFollowNoOp() public {
        vm.prank(sponsor);
        f.followFor(alice, alice); // silent no-op

        assertFalse(f.follows(alice, alice));
        assertEq(f.followerCount(alice), 0);
        assertEq(f.followingCount(alice), 0);
    }

    function test_followFor_revertZeroAddress() public {
        vm.prank(sponsor);
        vm.expectRevert(FollowV1.ZeroAddress.selector);
        f.followFor(address(0), bob);

        vm.prank(sponsor);
        vm.expectRevert(FollowV1.ZeroAddress.selector);
        f.followFor(alice, address(0));
    }

    function test_followFor_revertUnauthorized() public {
        vm.prank(alice);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.followFor(alice, bob);
    }

    // ── Unfollow ─────────────────────────────────────────────────────────

    function test_unfollowFor() public {
        vm.startPrank(sponsor);
        f.followFor(alice, bob);

        vm.expectEmit(true, true, false, false);
        emit FollowV1.Unfollowed(alice, bob);
        f.unfollowFor(alice, bob);
        vm.stopPrank();

        assertFalse(f.follows(alice, bob));
        assertEq(f.followerCount(bob), 0);
        assertEq(f.followingCount(alice), 0);
    }

    function test_unfollowFor_idempotent() public {
        vm.startPrank(sponsor);
        f.unfollowFor(alice, bob); // no-op, not following
        vm.stopPrank();

        assertEq(f.followerCount(bob), 0);
        assertEq(f.followingCount(alice), 0);
    }

    function test_unfollowFor_revertUnauthorized() public {
        vm.prank(alice);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.unfollowFor(alice, bob);
    }

    // ── Batch Follow ─────────────────────────────────────────────────────

    function test_followBatchFor() public {
        address[] memory targets = new address[](3);
        targets[0] = bob;
        targets[1] = carol;
        targets[2] = address(0xDAD);

        vm.prank(sponsor);
        f.followBatchFor(alice, targets);

        assertTrue(f.follows(alice, bob));
        assertTrue(f.follows(alice, carol));
        assertTrue(f.follows(alice, address(0xDAD)));
        assertEq(f.followingCount(alice), 3);
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followerCount(carol), 1);
    }

    function test_followBatchFor_skipsDuplicates() public {
        vm.startPrank(sponsor);
        f.followFor(alice, bob); // pre-follow

        address[] memory targets = new address[](2);
        targets[0] = bob;   // already following
        targets[1] = carol; // new

        f.followBatchFor(alice, targets);
        vm.stopPrank();

        assertEq(f.followingCount(alice), 2);
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followerCount(carol), 1);
    }

    function test_followBatchFor_skipsSelfFollow() public {
        address[] memory targets = new address[](2);
        targets[0] = alice; // self — skipped
        targets[1] = bob;

        vm.prank(sponsor);
        f.followBatchFor(alice, targets);

        assertFalse(f.follows(alice, alice));
        assertTrue(f.follows(alice, bob));
        assertEq(f.followingCount(alice), 1);
    }

    function test_followBatchFor_revertEmptyBatch() public {
        address[] memory targets = new address[](0);

        vm.prank(sponsor);
        vm.expectRevert(FollowV1.BadBatchSize.selector);
        f.followBatchFor(alice, targets);
    }

    function test_followBatchFor_revertTooLarge() public {
        address[] memory targets = new address[](51);
        for (uint256 i; i < 51; i++) {
            targets[i] = address(uint160(i + 100));
        }

        vm.prank(sponsor);
        vm.expectRevert(FollowV1.BadBatchSize.selector);
        f.followBatchFor(alice, targets);
    }

    // ── Counts ───────────────────────────────────────────────────────────

    function test_getFollowCounts() public {
        vm.startPrank(sponsor);
        f.followFor(alice, bob);
        f.followFor(carol, bob);
        f.followFor(alice, carol);
        vm.stopPrank();

        (uint256 bobFollowers, uint256 bobFollowing) = f.getFollowCounts(bob);
        assertEq(bobFollowers, 2);
        assertEq(bobFollowing, 0);

        (uint256 aliceFollowers, uint256 aliceFollowing) = f.getFollowCounts(alice);
        assertEq(aliceFollowers, 0);
        assertEq(aliceFollowing, 2);

        (uint256 carolFollowers, uint256 carolFollowing) = f.getFollowCounts(carol);
        assertEq(carolFollowers, 1);
        assertEq(carolFollowing, 1);
    }

    function test_countsAfterFollowUnfollow() public {
        vm.startPrank(sponsor);
        f.followFor(alice, bob);
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);

        f.unfollowFor(alice, bob);
        assertEq(f.followerCount(bob), 0);
        assertEq(f.followingCount(alice), 0);

        f.followFor(alice, bob);
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);
        vm.stopPrank();
    }
}
