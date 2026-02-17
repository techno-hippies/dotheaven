// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";

contract ContentRegistryTest is Test {
    ContentRegistry cr;

    address deployer = address(0xA11CE);
    address sponsor = address(0xB0B);
    address user = address(0xC0FFEE);
    address grantee = address(0xBEEF);
    address datasetOwner = address(0xDADA);

    function setUp() public {
        vm.prank(deployer);
        cr = new ContentRegistry(sponsor);
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(cr.owner(), deployer);
        assertEq(cr.sponsor(), sponsor);
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);
        vm.prank(deployer);
        cr.transferOwnership(newOwner);
        assertEq(cr.owner(), newOwner);
    }

    function test_transferOwnership_reverts_nonOwner() public {
        vm.prank(user);
        vm.expectRevert("not owner");
        cr.transferOwnership(user);
    }

    function test_setSponsor() public {
        address newSponsor = address(0xABCD);
        vm.prank(deployer);
        cr.setSponsor(newSponsor);
        assertEq(cr.sponsor(), newSponsor);
    }

    function test_onlySponsor_guarded() public {
        bytes32 trackId = _track("t1");
        bytes32 contentId = cr.computeContentId(trackId, user);

        vm.expectRevert("unauthorized");
        cr.registerContentFor(user, trackId, datasetOwner, bytes("baga"), 1);

        vm.expectRevert("unauthorized");
        cr.grantAccessFor(user, contentId, grantee);

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = contentId;

        vm.expectRevert("unauthorized");
        cr.grantAccessBatchFor(user, ids, grantee);

        vm.expectRevert("unauthorized");
        cr.revokeAccessFor(user, contentId, grantee);

        vm.expectRevert("unauthorized");
        cr.revokeAccessBatchFor(user, ids, grantee);

        vm.expectRevert("unauthorized");
        cr.deactivateFor(user, contentId);
    }

    // ── Registration ─────────────────────────────────────────────────────

    function test_registerContentFor_setsEntry_and_ownerCanAccess() public {
        bytes32 trackId = _track("song-a");
        bytes memory piece = bytes("baga6ea4seaqsonga");

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 contentId = cr.registerContentFor(user, trackId, datasetOwner, piece, 1);

        assertEq(contentId, cr.computeContentId(trackId, user));

        (address owner_, address datasetOwner_, bytes memory pieceCid, uint8 algo, uint64 createdAt, bool active) =
            cr.getContent(contentId);
        assertEq(owner_, user);
        assertEq(datasetOwner_, datasetOwner);
        assertEq(pieceCid, piece);
        assertEq(algo, 1);
        assertEq(createdAt, 1_700_000_000);
        assertTrue(active);

        assertTrue(cr.canAccess(user, contentId));
        assertFalse(cr.canAccess(grantee, contentId));
    }

    function test_registerContentFor_reverts_invalidInputs() public {
        bytes32 trackId = _track("song-a");
        bytes memory piece = bytes("baga6ea4seaqsonga");

        vm.prank(sponsor);
        vm.expectRevert("zero owner");
        cr.registerContentFor(address(0), trackId, datasetOwner, piece, 1);

        vm.prank(sponsor);
        vm.expectRevert("zero trackId");
        cr.registerContentFor(user, bytes32(0), datasetOwner, piece, 1);

        vm.prank(sponsor);
        vm.expectRevert("zero datasetOwner");
        cr.registerContentFor(user, trackId, address(0), piece, 1);

        vm.prank(sponsor);
        vm.expectRevert("zero algo");
        cr.registerContentFor(user, trackId, datasetOwner, piece, 0);

        vm.prank(sponsor);
        vm.expectRevert("empty pieceCid");
        cr.registerContentFor(user, trackId, datasetOwner, bytes(""), 1);
    }

    function test_registerContentFor_reverts_pieceCidTooLong() public {
        bytes32 trackId = _track("song-a");
        bytes memory longCid = new bytes(129);
        for (uint256 i; i < 129; i++) longCid[i] = "Q";

        vm.prank(sponsor);
        vm.expectRevert("pieceCid too long");
        cr.registerContentFor(user, trackId, datasetOwner, longCid, 1);
    }

    function test_registerContentFor_reverts_alreadyActive() public {
        bytes32 trackId = _track("song-a");

        vm.prank(sponsor);
        cr.registerContentFor(user, trackId, datasetOwner, bytes("baga"), 1);

        vm.prank(sponsor);
        vm.expectRevert("already active");
        cr.registerContentFor(user, trackId, datasetOwner, bytes("baga2"), 1);
    }

    function test_registerContentFor_afterDeactivate_sameOwner_reactivates() public {
        bytes32 trackId = _track("song-a");

        vm.prank(sponsor);
        bytes32 contentId = cr.registerContentFor(user, trackId, datasetOwner, bytes("baga"), 1);

        vm.prank(sponsor);
        cr.deactivateFor(user, contentId);
        assertFalse(cr.canAccess(user, contentId));

        vm.prank(sponsor);
        cr.registerContentFor(user, trackId, datasetOwner, bytes("baga-new"), 2);

        (, , bytes memory pieceCid, uint8 algo, , bool active) = cr.getContent(contentId);
        assertEq(pieceCid, bytes("baga-new"));
        assertEq(algo, 2);
        assertTrue(active);
        assertTrue(cr.canAccess(user, contentId));
    }

    function test_registerContentFor_afterDeactivate_otherOwner_createsDifferentContentId() public {
        bytes32 trackId = _track("song-a");

        vm.prank(sponsor);
        bytes32 contentIdA = cr.registerContentFor(user, trackId, datasetOwner, bytes("baga"), 1);

        vm.prank(sponsor);
        cr.deactivateFor(user, contentIdA);

        address otherOwner = address(0xCAFE);
        vm.prank(sponsor);
        bytes32 contentIdB = cr.registerContentFor(otherOwner, trackId, datasetOwner, bytes("baga2"), 1);

        assertTrue(contentIdA != contentIdB);
        assertTrue(cr.canAccess(otherOwner, contentIdB));
    }

    // ── Access control ───────────────────────────────────────────────────

    function test_grantAccessFor_and_revokeAccessFor() public {
        bytes32 contentId = _register("song-g");
        assertFalse(cr.canAccess(grantee, contentId));

        vm.prank(sponsor);
        cr.grantAccessFor(user, contentId, grantee);
        assertTrue(cr.canAccess(grantee, contentId));

        vm.prank(sponsor);
        cr.revokeAccessFor(user, contentId, grantee);
        assertFalse(cr.canAccess(grantee, contentId));
    }

    function test_grantAccessFor_reverts_invalidState() public {
        bytes32 contentId = _register("song-g");

        vm.prank(sponsor);
        vm.expectRevert("zero user");
        cr.grantAccessFor(user, contentId, address(0));

        vm.prank(sponsor);
        vm.expectRevert("not owner");
        cr.grantAccessFor(address(0x9999), contentId, grantee);

        vm.prank(sponsor);
        cr.deactivateFor(user, contentId);

        vm.prank(sponsor);
        vm.expectRevert("inactive");
        cr.grantAccessFor(user, contentId, grantee);
    }

    function test_grantAccessBatchFor_and_revokeAccessBatchFor() public {
        bytes32 c1 = _register("song-1");
        bytes32 c2 = _register("song-2");

        bytes32[] memory ids = new bytes32[](2);
        ids[0] = c1;
        ids[1] = c2;

        vm.prank(sponsor);
        cr.grantAccessBatchFor(user, ids, grantee);
        assertTrue(cr.canAccess(grantee, c1));
        assertTrue(cr.canAccess(grantee, c2));

        vm.prank(sponsor);
        cr.revokeAccessBatchFor(user, ids, grantee);
        assertFalse(cr.canAccess(grantee, c1));
        assertFalse(cr.canAccess(grantee, c2));
    }

    function test_grantAccessBatchFor_reverts_tooMany() public {
        bytes32[] memory ids = new bytes32[](501);
        for (uint256 i; i < 501; i++) {
            ids[i] = bytes32(uint256(i + 1));
        }

        vm.prank(sponsor);
        vm.expectRevert("too many");
        cr.grantAccessBatchFor(user, ids, grantee);
    }

    function test_revokeAccessBatchFor_reverts_tooMany() public {
        bytes32[] memory ids = new bytes32[](501);
        for (uint256 i; i < 501; i++) {
            ids[i] = bytes32(uint256(i + 1));
        }

        vm.prank(sponsor);
        vm.expectRevert("too many");
        cr.revokeAccessBatchFor(user, ids, grantee);
    }

    function test_batchOps_revert_on_mixedOwner_or_inactive() public {
        bytes32 c1 = _register("song-1");
        bytes32 c2 = _register("song-2");
        address otherOwner = address(0xCAFE);

        vm.prank(sponsor);
        bytes32 cOther = cr.registerContentFor(otherOwner, _track("song-3"), datasetOwner, bytes("baga3"), 1);

        bytes32[] memory mixed = new bytes32[](2);
        mixed[0] = c1;
        mixed[1] = cOther;

        vm.prank(sponsor);
        vm.expectRevert("not owner");
        cr.grantAccessBatchFor(user, mixed, grantee);

        vm.prank(sponsor);
        cr.deactivateFor(user, c2);

        bytes32[] memory includesInactive = new bytes32[](2);
        includesInactive[0] = c1;
        includesInactive[1] = c2;

        vm.prank(sponsor);
        vm.expectRevert("inactive");
        cr.revokeAccessBatchFor(user, includesInactive, grantee);
    }

    // ── Deactivation ─────────────────────────────────────────────────────

    function test_deactivateFor_reverts_notOwner_or_inactive() public {
        bytes32 contentId = _register("song-x");

        vm.prank(sponsor);
        vm.expectRevert("not owner");
        cr.deactivateFor(address(0x9999), contentId);

        vm.prank(sponsor);
        cr.deactivateFor(user, contentId);

        vm.prank(sponsor);
        vm.expectRevert("inactive");
        cr.deactivateFor(user, contentId);
    }

    function test_canAccess_false_when_inactive_evenForOwnerOrGrantee() public {
        bytes32 contentId = _register("song-z");

        vm.prank(sponsor);
        cr.grantAccessFor(user, contentId, grantee);
        assertTrue(cr.canAccess(user, contentId));
        assertTrue(cr.canAccess(grantee, contentId));

        vm.prank(sponsor);
        cr.deactivateFor(user, contentId);

        assertFalse(cr.canAccess(user, contentId));
        assertFalse(cr.canAccess(grantee, contentId));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _track(string memory s) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(s));
    }

    function _register(string memory s) internal returns (bytes32) {
        vm.prank(sponsor);
        return cr.registerContentFor(user, _track(s), datasetOwner, bytes("baga-test"), 1);
    }
}
