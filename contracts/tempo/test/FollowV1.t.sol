// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/FollowV1.sol";

contract FollowV1Test is Test {
    FollowV1 f;

    address alice = address(0xC0FFEE);
    address bob = address(0xBEEF);
    address carol = address(0xCAFE);

    function setUp() public {
        f = new FollowV1();
    }

    // ── Follow ───────────────────────────────────────────────────────────

    function test_follow() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit FollowV1.Followed(alice, bob);
        f.follow(bob);

        assertTrue(f.follows(alice, bob));
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);
    }

    function test_followFor() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit FollowV1.Followed(alice, bob);
        f.followFor(alice, bob);

        assertTrue(f.follows(alice, bob));
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);
    }

    function test_followFor_revertUnauthorized() public {
        vm.prank(carol);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.followFor(alice, bob);
    }

    function test_follow_idempotent() public {
        vm.startPrank(alice);
        f.follow(bob);
        f.follow(bob);
        vm.stopPrank();

        assertEq(f.followerCount(bob), 1);
        assertEq(f.followingCount(alice), 1);
    }

    function test_follow_selfFollowNoOp() public {
        vm.prank(alice);
        f.follow(alice);

        assertFalse(f.follows(alice, alice));
        assertEq(f.followerCount(alice), 0);
        assertEq(f.followingCount(alice), 0);
    }

    function test_follow_revertZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(FollowV1.ZeroAddress.selector);
        f.follow(address(0));
    }

    // ── Unfollow ─────────────────────────────────────────────────────────

    function test_unfollow() public {
        vm.startPrank(alice);
        f.follow(bob);

        vm.expectEmit(true, true, false, false);
        emit FollowV1.Unfollowed(alice, bob);
        f.unfollow(bob);
        vm.stopPrank();

        assertFalse(f.follows(alice, bob));
        assertEq(f.followerCount(bob), 0);
        assertEq(f.followingCount(alice), 0);
    }

    function test_unfollowFor() public {
        vm.startPrank(alice);
        f.follow(bob);

        vm.expectEmit(true, true, false, false);
        emit FollowV1.Unfollowed(alice, bob);
        f.unfollowFor(alice, bob);
        vm.stopPrank();

        assertFalse(f.follows(alice, bob));
        assertEq(f.followerCount(bob), 0);
        assertEq(f.followingCount(alice), 0);
    }

    function test_unfollowFor_revertUnauthorized() public {
        vm.prank(carol);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.unfollowFor(alice, bob);
    }

    function test_unfollow_idempotent() public {
        vm.prank(alice);
        f.unfollow(bob);

        assertEq(f.followerCount(bob), 0);
        assertEq(f.followingCount(alice), 0);
    }

    // ── Batch Follow ─────────────────────────────────────────────────────

    function test_followBatch() public {
        address[] memory targets = new address[](3);
        targets[0] = bob;
        targets[1] = carol;
        targets[2] = address(0xDAD);

        vm.prank(alice);
        f.followBatch(targets);

        assertTrue(f.follows(alice, bob));
        assertTrue(f.follows(alice, carol));
        assertTrue(f.follows(alice, address(0xDAD)));
        assertEq(f.followingCount(alice), 3);
        assertEq(f.followerCount(bob), 1);
        assertEq(f.followerCount(carol), 1);
    }

    function test_followBatchFor_revertUnauthorized() public {
        address[] memory targets = new address[](1);
        targets[0] = bob;

        vm.prank(carol);
        vm.expectRevert(FollowV1.Unauthorized.selector);
        f.followBatchFor(alice, targets);
    }

    function test_followBatch_revertEmptyBatch() public {
        address[] memory targets = new address[](0);

        vm.prank(alice);
        vm.expectRevert(FollowV1.BadBatchSize.selector);
        f.followBatch(targets);
    }

    function test_followBatch_revertTooLarge() public {
        address[] memory targets = new address[](51);
        for (uint256 i; i < 51; i++) {
            targets[i] = address(uint160(i + 100));
        }

        vm.prank(alice);
        vm.expectRevert(FollowV1.BadBatchSize.selector);
        f.followBatch(targets);
    }

    // ── Counts ───────────────────────────────────────────────────────────

    function test_getFollowCounts() public {
        vm.startPrank(alice);
        f.follow(bob);
        f.follow(carol);
        vm.stopPrank();

        vm.prank(carol);
        f.follow(bob);

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
}
