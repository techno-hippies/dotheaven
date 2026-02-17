// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {PlaylistV1} from "../src/PlaylistV1.sol";
import {PlaylistShareV1} from "../src/PlaylistShareV1.sol";

contract PlaylistShareV1Test is Test {
    PlaylistV1 playlist;
    PlaylistShareV1 share;

    address deployer = address(0xA11CE);
    address sponsor = address(0xB0B);
    address user = address(0xC0FFEE);
    address grantee = address(0xBEEF);

    function setUp() public {
        vm.prank(deployer);
        playlist = new PlaylistV1(sponsor);

        vm.prank(deployer);
        share = new PlaylistShareV1(sponsor, address(playlist));
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(share.owner(), deployer);
        assertEq(share.sponsor(), sponsor);
        assertEq(address(share.playlistV1()), address(playlist));
    }

    function test_constructor_reverts_zeroSponsor() public {
        vm.prank(deployer);
        vm.expectRevert("zero sponsor");
        new PlaylistShareV1(address(0), address(playlist));
    }

    function test_constructor_reverts_zeroPlaylistV1() public {
        vm.prank(deployer);
        vm.expectRevert("zero playlistV1");
        new PlaylistShareV1(sponsor, address(0));
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);
        vm.prank(deployer);
        share.transferOwnership(newOwner);
        assertEq(share.owner(), newOwner);
    }

    function test_transferOwnership_reverts_nonOwner() public {
        vm.prank(user);
        vm.expectRevert("not owner");
        share.transferOwnership(user);
    }

    function test_setSponsor() public {
        address newSponsor = address(0xABCD);
        vm.prank(deployer);
        share.setSponsor(newSponsor);
        assertEq(share.sponsor(), newSponsor);
    }

    function test_setSponsor_reverts_nonOwner() public {
        vm.prank(user);
        vm.expectRevert("not owner");
        share.setSponsor(user);
    }

    function test_onlySponsor_guarded() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(user);
        vm.expectRevert("unauthorized");
        share.sharePlaylistFor(user, playlistId, grantee);

        vm.prank(user);
        vm.expectRevert("unauthorized");
        share.unsharePlaylistFor(user, playlistId, grantee);
    }

    // ── Share ────────────────────────────────────────────────────────────

    function test_sharePlaylistFor_setsSnapshot() public {
        bytes32 playlistId = _createPlaylist(user);

        (, , , uint32 version, uint32 trackCount, , , bytes32 tracksHash) = playlist.getPlaylist(playlistId);

        vm.warp(1_700_000_123);
        vm.prank(sponsor);
        share.sharePlaylistFor(user, playlistId, grantee);

        (uint32 snapVersion, uint32 snapTrackCount, bytes32 snapTracksHash, uint64 sharedAt, bool granted) =
            share.shares(playlistId, grantee);

        assertEq(snapVersion, version);
        assertEq(snapTrackCount, trackCount);
        assertEq(snapTracksHash, tracksHash);
        assertEq(sharedAt, 1_700_000_123);
        assertTrue(granted);
    }

    function test_sharePlaylistFor_overwritesExistingSnapshot() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.warp(1_700_000_100);
        vm.prank(sponsor);
        share.sharePlaylistFor(user, playlistId, grantee);

        bytes32[] memory newTracks = _tracks(3);
        vm.prank(sponsor);
        playlist.setTracks(playlistId, newTracks);

        (, , , uint32 version, uint32 trackCount, , , bytes32 tracksHash) = playlist.getPlaylist(playlistId);

        vm.warp(1_700_000_200);
        vm.prank(sponsor);
        share.sharePlaylistFor(user, playlistId, grantee);

        (uint32 snapVersion, uint32 snapTrackCount, bytes32 snapTracksHash, uint64 sharedAt, bool granted) =
            share.shares(playlistId, grantee);

        assertEq(snapVersion, version);
        assertEq(snapTrackCount, trackCount);
        assertEq(snapTracksHash, tracksHash);
        assertEq(sharedAt, 1_700_000_200);
        assertTrue(granted);
    }

    function test_sharePlaylistFor_reverts_invalidInputs() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(sponsor);
        vm.expectRevert("zero playlistOwner");
        share.sharePlaylistFor(address(0), playlistId, grantee);

        vm.prank(sponsor);
        vm.expectRevert("zero playlistId");
        share.sharePlaylistFor(user, bytes32(0), grantee);

        vm.prank(sponsor);
        vm.expectRevert("zero grantee");
        share.sharePlaylistFor(user, playlistId, address(0));
    }

    function test_sharePlaylistFor_reverts_notFound() public {
        vm.prank(sponsor);
        vm.expectRevert("not found");
        share.sharePlaylistFor(user, bytes32(uint256(12345)), grantee);
    }

    function test_sharePlaylistFor_reverts_notOwner() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(sponsor);
        vm.expectRevert("not owner");
        share.sharePlaylistFor(address(0xCAFE), playlistId, grantee);
    }

    // ── Unshare ──────────────────────────────────────────────────────────

    function test_unsharePlaylistFor_clearsShareState() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(sponsor);
        share.sharePlaylistFor(user, playlistId, grantee);

        vm.warp(1_700_000_200);
        vm.prank(sponsor);
        share.unsharePlaylistFor(user, playlistId, grantee);

        (uint32 snapVersion, uint32 snapTrackCount, bytes32 snapTracksHash, uint64 sharedAt, bool granted) =
            share.shares(playlistId, grantee);

        assertEq(snapVersion, 0);
        assertEq(snapTrackCount, 0);
        assertEq(snapTracksHash, bytes32(0));
        assertEq(sharedAt, 0);
        assertFalse(granted);
    }

    function test_unsharePlaylistFor_allowsDeletedPlaylists_whenOwnerMatches() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(sponsor);
        share.sharePlaylistFor(user, playlistId, grantee);

        vm.prank(sponsor);
        playlist.deletePlaylist(playlistId);

        vm.prank(sponsor);
        share.unsharePlaylistFor(user, playlistId, grantee);

        (, , , , bool granted) = share.shares(playlistId, grantee);
        assertFalse(granted);
    }

    function test_unsharePlaylistFor_reverts_invalidInputs() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(sponsor);
        vm.expectRevert("zero playlistOwner");
        share.unsharePlaylistFor(address(0), playlistId, grantee);

        vm.prank(sponsor);
        vm.expectRevert("zero playlistId");
        share.unsharePlaylistFor(user, bytes32(0), grantee);

        vm.prank(sponsor);
        vm.expectRevert("zero grantee");
        share.unsharePlaylistFor(user, playlistId, address(0));
    }

    function test_unsharePlaylistFor_reverts_notOwner() public {
        bytes32 playlistId = _createPlaylist(user);

        vm.prank(sponsor);
        vm.expectRevert("not owner");
        share.unsharePlaylistFor(address(0xCAFE), playlistId, grantee);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _createPlaylist(address playlistOwner) internal returns (bytes32 playlistId) {
        bytes32[] memory tracks = _tracks(2);
        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        playlistId = playlist.createPlaylistFor(playlistOwner, "Tempo Playlist", "", 1, tracks);
    }

    function _tracks(uint256 n) internal pure returns (bytes32[] memory t) {
        t = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            t[i] = keccak256(abi.encodePacked("track-", i + 1));
        }
    }
}
