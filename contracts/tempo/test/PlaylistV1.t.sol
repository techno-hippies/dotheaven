// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {PlaylistV1} from "../src/PlaylistV1.sol";

contract PlaylistV1Test is Test {
    PlaylistV1 pl;

    address deployer = address(0xA11CE);
    address sponsor  = address(0xB0B);
    address user     = address(0xC0FFEE);

    function setUp() public {
        vm.prank(deployer);
        pl = new PlaylistV1(sponsor);
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(pl.owner(), deployer);
        assertEq(pl.sponsor(), sponsor);
    }

    function test_transferOwnership() public {
        address newOwner = address(0xDEAD);
        vm.prank(deployer);
        pl.transferOwnership(newOwner);
        assertEq(pl.owner(), newOwner);
    }

    function test_transferOwnership_reverts_nonOwner() public {
        vm.prank(user);
        vm.expectRevert("not owner");
        pl.transferOwnership(user);
    }

    function test_setSponsor() public {
        address newSponsor = address(0xBEEF);
        vm.prank(deployer);
        pl.setSponsor(newSponsor);
        assertEq(pl.sponsor(), newSponsor);
    }

    function test_onlySponsor_guarded() public {
        bytes32[] memory tracks = _tracks(2);

        vm.expectRevert("unauthorized");
        pl.createPlaylistFor(user, "n", "", 0, tracks);

        vm.expectRevert("unauthorized");
        pl.setTracks(bytes32("x"), tracks);

        vm.expectRevert("unauthorized");
        pl.updateMeta(bytes32("x"), "n", "", 0);

        vm.expectRevert("unauthorized");
        pl.deletePlaylist(bytes32("x"));

        vm.expectRevert("unauthorized");
        pl.consumeNonce(user, 0);
    }

    // ── Nonce Replay Protection ───────────────────────────────────────

    function test_consumeNonce_increments() public {
        assertEq(pl.userNonces(user), 0);

        vm.prank(sponsor);
        pl.consumeNonce(user, 0);
        assertEq(pl.userNonces(user), 1);

        vm.prank(sponsor);
        pl.consumeNonce(user, 1);
        assertEq(pl.userNonces(user), 2);
    }

    function test_consumeNonce_reverts_wrongNonce() public {
        vm.prank(sponsor);
        vm.expectRevert("bad nonce");
        pl.consumeNonce(user, 1); // expected 0
    }

    function test_consumeNonce_prevents_replay() public {
        vm.prank(sponsor);
        pl.consumeNonce(user, 0);

        vm.prank(sponsor);
        vm.expectRevert("bad nonce");
        pl.consumeNonce(user, 0);
    }

    // ── Create ───────────────────────────────────────────────────────────

    function test_createPlaylist_setsCheckpoint_and_emits() public {
        bytes32[] memory tracks = _tracks(3);

        uint64 t0 = 1_700_000_000;
        vm.warp(t0);

        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "My Playlist", "QmTestCoverCid123", 0, tracks);

        (
            address owner_,
            uint8 vis,
            bool exists,
            uint32 version,
            uint32 trackCount,
            uint64 createdAt,
            uint64 updatedAt,
            bytes32 tracksHash
        ) = pl.getPlaylist(playlistId);

        assertEq(owner_, user);
        assertEq(vis, 0);
        assertTrue(exists);
        assertEq(version, 1);
        assertEq(trackCount, 3);
        assertEq(createdAt, t0);
        assertEq(updatedAt, t0);

        bytes32 expectedHash = keccak256(abi.encode(keccak256("dotheaven.playlist.v1.tracks"), playlistId, tracks));
        assertEq(tracksHash, expectedHash);
    }

    function test_createPlaylist_emptyTracks() public {
        bytes32[] memory tracks = new bytes32[](0);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "Empty", "", 0, tracks);

        (, , bool exists, , uint32 trackCount, , , ) = pl.getPlaylist(playlistId);
        assertTrue(exists);
        assertEq(trackCount, 0);
    }

    function test_createPlaylist_incrementsNonce() public {
        bytes32[] memory tracks = _tracks(1);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 id1 = pl.createPlaylistFor(user, "A", "", 0, tracks);

        vm.prank(sponsor);
        bytes32 id2 = pl.createPlaylistFor(user, "B", "", 0, tracks);

        assertTrue(id1 != id2);
        assertEq(pl.ownerNonces(user), 2);
    }

    function test_createPlaylist_reverts_zeroOwner() public {
        bytes32[] memory tracks = _tracks(1);
        vm.prank(sponsor);
        vm.expectRevert("zero playlistOwner");
        pl.createPlaylistFor(address(0), "n", "", 0, tracks);
    }

    function test_createPlaylist_reverts_badVisibility() public {
        bytes32[] memory tracks = _tracks(1);
        vm.prank(sponsor);
        vm.expectRevert("bad visibility");
        pl.createPlaylistFor(user, "n", "", 99, tracks);
    }

    function test_createPlaylist_reverts_zeroTrackId() public {
        bytes32[] memory tracks = new bytes32[](1);
        tracks[0] = bytes32(0);

        vm.prank(sponsor);
        vm.expectRevert("zero trackId");
        pl.createPlaylistFor(user, "n", "", 0, tracks);
    }

    function test_createPlaylist_reverts_nameTooLong() public {
        bytes32[] memory tracks = _tracks(1);
        bytes memory longName = new bytes(65);
        for (uint256 i; i < 65; i++) longName[i] = "a";

        vm.prank(sponsor);
        vm.expectRevert("name too long");
        pl.createPlaylistFor(user, string(longName), "", 0, tracks);
    }

    function test_createPlaylist_reverts_coverCidTooLong() public {
        bytes32[] memory tracks = _tracks(1);
        bytes memory longCid = new bytes(129);
        for (uint256 i; i < 129; i++) longCid[i] = "Q";

        vm.prank(sponsor);
        vm.expectRevert("coverCid too long");
        pl.createPlaylistFor(user, "n", string(longCid), 0, tracks);
    }

    function test_createPlaylist_emptyCoverCid() public {
        bytes32[] memory tracks = _tracks(1);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 0, tracks);

        (, , bool exists, , , , , ) = pl.getPlaylist(playlistId);
        assertTrue(exists);
    }

    // ── SetTracks ────────────────────────────────────────────────────────

    function test_setTracks_bumpsVersion_updatesHashCount() public {
        bytes32[] memory tracksA = _tracks(2);
        bytes32[] memory tracksB = _tracks(4);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 1, tracksA);

        vm.warp(1_700_000_100);
        vm.prank(sponsor);
        pl.setTracks(playlistId, tracksB);

        (, , bool exists, uint32 version, uint32 count, , uint64 updatedAt, bytes32 hash) = pl.getPlaylist(playlistId);
        assertTrue(exists);
        assertEq(version, 2);
        assertEq(count, 4);
        assertEq(updatedAt, 1_700_000_100);

        bytes32 expectedHash = keccak256(abi.encode(keccak256("dotheaven.playlist.v1.tracks"), playlistId, tracksB));
        assertEq(hash, expectedHash);
    }

    function test_setTracks_reverts_notFound() public {
        bytes32[] memory tracks = _tracks(1);
        vm.prank(sponsor);
        vm.expectRevert("not found");
        pl.setTracks(bytes32("nonexistent"), tracks);
    }

    function test_setTracks_toEmpty() public {
        bytes32[] memory tracks = _tracks(3);
        bytes32[] memory empty = new bytes32[](0);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 0, tracks);

        vm.prank(sponsor);
        pl.setTracks(playlistId, empty);

        (, , , , uint32 count, , , ) = pl.getPlaylist(playlistId);
        assertEq(count, 0);
    }

    // ── UpdateMeta ───────────────────────────────────────────────────────

    function test_updateMeta_bumpsVersion_updatesVisibility() public {
        bytes32[] memory tracks = _tracks(1);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 0, tracks);

        vm.warp(1_700_000_050);
        vm.prank(sponsor);
        pl.updateMeta(playlistId, "new name", "QmNewCover456", 2);

        (, uint8 vis, bool exists, uint32 version, , , uint64 updatedAt, ) = pl.getPlaylist(playlistId);
        assertTrue(exists);
        assertEq(vis, 2);
        assertEq(version, 2);
        assertEq(updatedAt, 1_700_000_050);
    }

    function test_updateMeta_reverts_notFound() public {
        vm.prank(sponsor);
        vm.expectRevert("not found");
        pl.updateMeta(bytes32("nonexistent"), "n", "", 0);
    }

    function test_updateMeta_reverts_coverCidTooLong() public {
        bytes32[] memory tracks = _tracks(1);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 0, tracks);

        bytes memory longCid = new bytes(129);
        for (uint256 i; i < 129; i++) longCid[i] = "Q";

        vm.prank(sponsor);
        vm.expectRevert("coverCid too long");
        pl.updateMeta(playlistId, "n", string(longCid), 0);
    }

    // ── Delete ───────────────────────────────────────────────────────────

    function test_deletePlaylist_tombstones_and_bumpsVersion() public {
        bytes32[] memory tracks = _tracks(1);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 0, tracks);

        vm.warp(1_700_000_010);
        vm.prank(sponsor);
        pl.deletePlaylist(playlistId);

        (, , bool exists, uint32 version, , , uint64 updatedAt, ) = pl.getPlaylist(playlistId);
        assertFalse(exists);
        assertEq(version, 2);
        assertEq(updatedAt, 1_700_000_010);
    }

    function test_deletePlaylist_reverts_notFound() public {
        vm.prank(sponsor);
        vm.expectRevert("not found");
        pl.deletePlaylist(bytes32("nonexistent"));
    }

    function test_deletePlaylist_prevents_further_ops() public {
        bytes32[] memory tracks = _tracks(1);

        vm.warp(1_700_000_000);
        vm.prank(sponsor);
        bytes32 playlistId = pl.createPlaylistFor(user, "n", "", 0, tracks);

        vm.prank(sponsor);
        pl.deletePlaylist(playlistId);

        vm.prank(sponsor);
        vm.expectRevert("not found");
        pl.setTracks(playlistId, tracks);

        vm.prank(sponsor);
        vm.expectRevert("not found");
        pl.updateMeta(playlistId, "n", "", 0);

        vm.prank(sponsor);
        vm.expectRevert("not found");
        pl.deletePlaylist(playlistId);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _tracks(uint256 n) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](n);
        for (uint256 i; i < n; ) {
            arr[i] = keccak256(abi.encodePacked("track", i));
            unchecked { ++i; }
        }
    }
}
