// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SessionEscrowV1.sol";

contract SessionEscrowV1Test is Test {
    SessionEscrowV1 escrow;

    address owner    = address(this);
    address oracle   = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address host     = makeAddr("host");
    address guest    = makeAddr("guest");

    uint16  feeBps = 300;
    uint48  challengeWindow = 6 hours;
    uint256 challengeBond = 0.01 ether;
    uint16  lateCancelPenaltyBps = 2000;
    uint48  noAttestBuffer = 24 hours;
    uint48  disputeTimeout = 7 days;

    function setUp() public {
        escrow = new SessionEscrowV1(
            oracle, treasury, feeBps, challengeWindow, challengeBond,
            lateCancelPenaltyBps, noAttestBuffer, disputeTimeout
        );
        vm.deal(guest, 100 ether);
        vm.deal(host, 10 ether);

        // Host sets base price (required before creating slots)
        vm.prank(host);
        escrow.setHostBasePrice(1 ether);
    }

    // ---- Helpers ----

    function _createDefaultSlot() internal returns (uint256 slotId) {
        vm.prank(host);
        slotId = escrow.createSlot(
            uint48(block.timestamp + 1 hours),
            30, 10, 25, 60
        );
    }

    function _bookSlot(uint256 slotId) internal returns (uint256 bookingId) {
        vm.prank(guest);
        bookingId = escrow.book{value: 1 ether}(slotId);
    }

    function _attestCompleted(uint256 bookingId) internal {
        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(b.slotId);
        vm.warp(uint256(s.startTime) + uint256(s.minOverlapMins) * 60);
        vm.prank(oracle);
        escrow.attest(bookingId, SessionEscrowV1.Outcome.Completed, bytes32(0));
    }

    // ================================================================
    // Slot creation
    // ================================================================

    function test_createSlot() public {
        uint256 slotId = _createDefaultSlot();
        assertEq(slotId, 1);
        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        assertEq(s.host, host);
        assertEq(s.price, 1 ether);
        assertEq(uint8(s.status), uint8(SessionEscrowV1.SessionSlotStatus.Open));
    }

    function test_createSlot_noBasePrice_reverts() public {
        address newHost = makeAddr("newHost");
        vm.prank(newHost);
        vm.expectRevert("NO_BASE_PRICE");
        escrow.createSlot(uint48(block.timestamp + 1 hours), 30, 10, 25, 60);
    }

    function test_createSlot_snapshotsPrice() public {
        // Create slot at 1 ETH
        uint256 slotId = _createDefaultSlot();
        assertEq(escrow.getSlot(slotId).price, 1 ether);

        // Change base price
        vm.prank(host);
        escrow.setHostBasePrice(2 ether);

        // Existing slot still has old price
        assertEq(escrow.getSlot(slotId).price, 1 ether);

        // New slot gets new price
        vm.prank(host);
        uint256 slotId2 = escrow.createSlot(uint48(block.timestamp + 2 hours), 30, 10, 25, 60);
        assertEq(escrow.getSlot(slotId2).price, 2 ether);
    }

    function test_createSlots_batch() public {
        SessionEscrowV1.SessionSlotInput[] memory inputs = new SessionEscrowV1.SessionSlotInput[](3);
        for (uint256 i; i < 3; i++) {
            inputs[i] = SessionEscrowV1.SessionSlotInput({
                startTime: uint48(block.timestamp + 1 hours + i * 1 hours),
                durationMins: 30,
                graceMins: 10,
                minOverlapMins: 25,
                cancelCutoffMins: 60
            });
        }
        vm.prank(host);
        uint256 firstId = escrow.createSlots(inputs);
        assertEq(firstId, 1);
        assertEq(escrow.nextSlotId(), 4);

        // All slots snapshot same price
        for (uint256 i; i < 3; i++) {
            assertEq(escrow.getSlot(firstId + i).price, 1 ether);
        }
    }

    function test_createSlot_badCutoff_reverts() public {
        vm.prank(host);
        vm.expectRevert("BAD_CUTOFF");
        escrow.createSlot(uint48(block.timestamp + 1 hours), 30, 10, 25, 10081);
    }

    function test_cancelSlot() public {
        uint256 slotId = _createDefaultSlot();
        vm.prank(host);
        escrow.cancelSlot(slotId);
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Cancelled));
    }

    // ================================================================
    // Booking
    // ================================================================

    function test_book() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        assertEq(bookingId, 1);
        assertEq(address(escrow).balance, 1 ether);
        assertEq(escrow.totalHeld(), 1 ether);
        assertEq(uint8(escrow.getBooking(bookingId).status), uint8(SessionEscrowV1.SessionBookingStatus.Booked));
    }

    function test_book_wrongAmount_reverts() public {
        uint256 slotId = _createDefaultSlot();
        vm.prank(guest);
        vm.expectRevert("WRONG_AMOUNT");
        escrow.book{value: 0.5 ether}(slotId);
    }

    function test_book_usesSnapshotPrice() public {
        uint256 slotId = _createDefaultSlot(); // price = 1 ETH

        // Host changes price after slot creation
        vm.prank(host);
        escrow.setHostBasePrice(2 ether);

        // Booking still requires snapshot price (1 ETH)
        vm.prank(guest);
        uint256 bookingId = escrow.book{value: 1 ether}(slotId);
        assertEq(escrow.getBooking(bookingId).amount, 1 ether);

        // 2 ETH would fail
        vm.prank(host);
        uint256 slotId2 = escrow.createSlot(uint48(block.timestamp + 3 hours), 30, 10, 25, 60);
        vm.prank(guest);
        vm.expectRevert("WRONG_AMOUNT");
        escrow.book{value: 1 ether}(slotId2); // slot2 snapshotted at 2 ETH
    }

    // ================================================================
    // Guest cancel — early
    // ================================================================

    function test_cancelBookingAsGuest_early() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        uint256 balBefore = guest.balance;
        vm.prank(guest);
        escrow.cancelBookingAsGuest(bookingId);

        assertEq(guest.balance, balBefore + 1 ether);
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Open));
        assertEq(escrow.slotToBooking(slotId), 0);
        assertEq(escrow.totalHeld(), 0);
    }

    function test_earlyCancelAllowsRebook() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        vm.prank(guest);
        escrow.cancelBookingAsGuest(bookingId);

        address guest2 = makeAddr("guest2");
        vm.deal(guest2, 10 ether);
        vm.prank(guest2);
        uint256 bookingId2 = escrow.book{value: 1 ether}(slotId);
        assertEq(bookingId2, 2);
        assertEq(escrow.slotToBooking(slotId), 2);
    }

    // ================================================================
    // Guest cancel — late
    // ================================================================

    function test_cancelBookingAsGuest_late() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 cutoff = uint256(s.startTime) - uint256(s.cancelCutoffMins) * 60;
        vm.warp(cutoff + 1);

        uint256 treasuryBefore = treasury.balance;
        uint256 hostBefore     = host.balance;

        vm.prank(guest);
        escrow.cancelBookingAsGuest(bookingId);

        uint256 penalty   = (1 ether * 2000) / 10000;
        uint256 hostGross = 1 ether - penalty;
        uint256 fee       = (hostGross * 300) / 10000;
        uint256 hostNet   = hostGross - fee;

        assertEq(treasury.balance, treasuryBefore + penalty + fee);
        assertEq(host.balance, hostBefore + hostNet);
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Settled));
        assertEq(escrow.totalHeld(), 0);
    }

    function test_lateCancelFeeAlwaysApplied() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 cutoff = uint256(s.startTime) - uint256(s.cancelCutoffMins) * 60;
        vm.warp(cutoff + 1);

        uint256 treasuryBefore = treasury.balance;
        vm.prank(guest);
        escrow.cancelBookingAsGuest(bookingId);

        assertTrue(treasury.balance > treasuryBefore);
    }

    // ================================================================
    // Host cancel
    // ================================================================

    function test_cancelBookingAsHost() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        uint256 balBefore = guest.balance;
        vm.prank(host);
        escrow.cancelBookingAsHost(bookingId);

        assertEq(guest.balance, balBefore + 1 ether);
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Cancelled));
        assertEq(escrow.slotToBooking(slotId), 0);
        assertEq(escrow.totalHeld(), 0);
    }

    // ================================================================
    // Happy path
    // ================================================================

    function test_happyPath_completed() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        _attestCompleted(bookingId);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        assertEq(uint8(b.status), uint8(SessionEscrowV1.SessionBookingStatus.Attested));

        vm.warp(b.finalizableAt);

        uint256 hostBefore     = host.balance;
        uint256 treasuryBefore = treasury.balance;

        escrow.finalize(bookingId);

        uint256 fee = (1 ether * 300) / 10000;
        assertEq(host.balance, hostBefore + 1 ether - fee);
        assertEq(treasury.balance, treasuryBefore + fee);
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Settled));
        assertEq(escrow.totalHeld(), 0);
    }

    // ================================================================
    // No-show host
    // ================================================================

    function test_noShowHost_refund() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        vm.warp(uint256(s.startTime) + uint256(s.graceMins) * 60);

        vm.prank(oracle);
        escrow.attest(bookingId, SessionEscrowV1.Outcome.NoShowHost, bytes32(0));

        vm.warp(escrow.getBooking(bookingId).finalizableAt);

        uint256 balBefore = guest.balance;
        escrow.finalize(bookingId);
        assertEq(guest.balance, balBefore + 1 ether);
        assertEq(escrow.totalHeld(), 0);
    }

    // ================================================================
    // Attestation timing guards
    // ================================================================

    function test_attest_noShow_tooEarly_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        vm.warp(uint256(s.startTime) + 1);

        vm.prank(oracle);
        vm.expectRevert("GRACE_NOT_OVER");
        escrow.attest(bookingId, SessionEscrowV1.Outcome.NoShowHost, bytes32(0));
    }

    function test_attest_noShow_tooLate_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 graceEnd = uint256(s.startTime) + uint256(s.graceMins) * 60;
        vm.warp(graceEnd + uint256(s.durationMins) * 60 + 1);

        vm.prank(oracle);
        vm.expectRevert("NO_SHOW_TOO_LATE");
        escrow.attest(bookingId, SessionEscrowV1.Outcome.NoShowHost, bytes32(0));
    }

    function test_attest_completed_tooEarly_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        vm.warp(uint256(s.startTime) + uint256(s.graceMins) * 60);

        vm.prank(oracle);
        vm.expectRevert("OVERLAP_NOT_MET");
        escrow.attest(bookingId, SessionEscrowV1.Outcome.Completed, bytes32(0));
    }

    function test_attest_completed_tooLate_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        vm.warp(end + 2 hours + 1);

        vm.prank(oracle);
        vm.expectRevert("TOO_LATE");
        escrow.attest(bookingId, SessionEscrowV1.Outcome.Completed, bytes32(0));
    }

    // ================================================================
    // Oracle deadlock
    // ================================================================

    function test_claimIfUnattested() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        vm.warp(end + uint256(noAttestBuffer));

        uint256 balBefore = guest.balance;
        vm.prank(guest);
        escrow.claimIfUnattested(bookingId);

        assertEq(guest.balance, balBefore + 1 ether);
        assertEq(uint8(escrow.getBooking(bookingId).status), uint8(SessionEscrowV1.SessionBookingStatus.Finalized));
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Cancelled));
        assertEq(escrow.totalHeld(), 0);
    }

    function test_claimIfUnattested_tooEarly_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        vm.warp(end + uint256(noAttestBuffer) - 1);

        vm.prank(guest);
        vm.expectRevert("TOO_EARLY");
        escrow.claimIfUnattested(bookingId);
    }

    function test_claimIfUnattested_hostCanCall() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        vm.warp(end + uint256(noAttestBuffer));

        uint256 guestBefore = guest.balance;
        vm.prank(host);
        escrow.claimIfUnattested(bookingId);
        assertEq(guest.balance, guestBefore + 1 ether);
    }

    function test_claimIfUnattested_nonParty_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        vm.warp(end + uint256(noAttestBuffer));

        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert("NOT_PARTY");
        escrow.claimIfUnattested(bookingId);
    }

    // ================================================================
    // Challenge + dispute
    // ================================================================

    function test_challenge_and_resolve_challengerWins() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        _attestCompleted(bookingId);

        vm.prank(guest);
        escrow.challenge{value: challengeBond}(bookingId);
        assertEq(uint8(escrow.getBooking(bookingId).status), uint8(SessionEscrowV1.SessionBookingStatus.Disputed));
        assertEq(escrow.totalHeld(), 1 ether + challengeBond);

        uint256 guestBefore = guest.balance;
        escrow.resolveDispute(bookingId, SessionEscrowV1.Outcome.NoShowHost);

        assertEq(guest.balance, guestBefore + challengeBond);
        assertEq(uint8(escrow.getBooking(bookingId).status), uint8(SessionEscrowV1.SessionBookingStatus.Resolved));

        uint256 guestBefore2 = guest.balance;
        escrow.finalize(bookingId);
        assertEq(guest.balance, guestBefore2 + 1 ether);
        assertEq(escrow.totalHeld(), 0);
    }

    function test_challenge_loserBondToCounterparty() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        _attestCompleted(bookingId);

        vm.prank(guest);
        escrow.challenge{value: challengeBond}(bookingId);

        uint256 hostBefore = host.balance;
        escrow.resolveDispute(bookingId, SessionEscrowV1.Outcome.Completed);
        assertEq(host.balance, hostBefore + challengeBond);
    }

    function test_challenge_nonParty_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        _attestCompleted(bookingId);

        address rando = makeAddr("rando");
        vm.deal(rando, 1 ether);
        vm.prank(rando);
        vm.expectRevert("NOT_PARTY");
        escrow.challenge{value: challengeBond}(bookingId);
    }

    // ================================================================
    // Dispute timeout
    // ================================================================

    function test_finalizeDisputeByTimeout() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        _attestCompleted(bookingId);

        vm.prank(guest);
        escrow.challenge{value: challengeBond}(bookingId);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.disputedAt) + uint256(disputeTimeout));

        uint256 guestBefore = guest.balance;
        escrow.finalizeDisputeByTimeout(bookingId);

        assertEq(guest.balance, guestBefore + challengeBond);
        b = escrow.getBooking(bookingId);
        assertEq(uint8(b.status), uint8(SessionEscrowV1.SessionBookingStatus.Resolved));
        assertEq(uint8(b.oracleOutcome), uint8(SessionEscrowV1.Outcome.Completed));

        uint256 hostBefore = host.balance;
        escrow.finalize(bookingId);
        uint256 fee = (1 ether * 300) / 10000;
        assertEq(host.balance, hostBefore + 1 ether - fee);
        assertEq(escrow.totalHeld(), 0);
    }

    function test_finalizeDisputeByTimeout_tooEarly_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        _attestCompleted(bookingId);

        vm.prank(guest);
        escrow.challenge{value: challengeBond}(bookingId);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.disputedAt) + uint256(disputeTimeout) - 1);

        vm.expectRevert("TOO_EARLY");
        escrow.finalizeDisputeByTimeout(bookingId);
    }

    // ================================================================
    // Finalize timing
    // ================================================================

    function test_finalize_tooEarly_reverts() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        _attestCompleted(bookingId);

        vm.expectRevert("TOO_EARLY");
        escrow.finalize(bookingId);
    }

    // ================================================================
    // Constructor validation
    // ================================================================

    function test_constructor_zeroBond_reverts() public {
        vm.expectRevert("ZERO_BOND");
        new SessionEscrowV1(oracle, treasury, feeBps, challengeWindow, 0, lateCancelPenaltyBps, noAttestBuffer, disputeTimeout);
    }

    function test_setChallengeBond_zero_reverts() public {
        vm.expectRevert("ZERO_BOND");
        escrow.setChallengeBond(0);
    }

    // ================================================================
    // Sweep
    // ================================================================

    function test_sweep_excessOnly() public {
        uint256 slotId = _createDefaultSlot();
        _bookSlot(slotId);

        vm.deal(address(this), 1 ether);
        (bool ok,) = address(escrow).call{value: 0.5 ether}("");
        assertTrue(ok);

        uint256 treasuryBefore = treasury.balance;
        escrow.sweep();
        assertEq(treasury.balance, treasuryBefore + 0.5 ether);
        assertEq(address(escrow).balance, 1 ether);
        assertEq(escrow.totalHeld(), 1 ether);
    }

    function test_sweep_noExcess() public {
        uint256 slotId = _createDefaultSlot();
        _bookSlot(slotId);

        uint256 treasuryBefore = treasury.balance;
        escrow.sweep();
        assertEq(treasury.balance, treasuryBefore);
    }

    // ================================================================
    // totalHeld invariant
    // ================================================================

    function test_totalHeld_zeroAfterFullLifecycle() public {
        uint256 slotId = _createDefaultSlot();
        uint256 bookingId = _bookSlot(slotId);
        assertEq(escrow.totalHeld(), 1 ether);

        _attestCompleted(bookingId);
        assertEq(escrow.totalHeld(), 1 ether);

        vm.prank(guest);
        escrow.challenge{value: challengeBond}(bookingId);
        assertEq(escrow.totalHeld(), 1 ether + challengeBond);

        escrow.resolveDispute(bookingId, SessionEscrowV1.Outcome.Completed);
        assertEq(escrow.totalHeld(), 1 ether);

        escrow.finalize(bookingId);
        assertEq(escrow.totalHeld(), 0);
    }

    // ================================================================
    // Host base price
    // ================================================================

    function test_setHostBasePrice() public {
        address newHost = makeAddr("newHost");
        vm.prank(newHost);
        escrow.setHostBasePrice(2 ether);
        assertEq(escrow.hostBasePrice(newHost), 2 ether);
    }

    function test_setHostBasePrice_zero_reverts() public {
        vm.prank(host);
        vm.expectRevert("BAD_PRICE");
        escrow.setHostBasePrice(0);
    }

    // ================================================================
    // Requests — create
    // ================================================================

    function test_createRequest_targeted() public {
        uint256 requestId = _createTargetedRequest(2 ether);
        assertEq(requestId, 1);

        SessionEscrowV1.SessionRequest memory r = escrow.getRequest(requestId);
        assertEq(r.hostTarget, host);
        assertEq(r.guest, guest);
        assertEq(r.amount, 2 ether);
        assertEq(r.durationMins, 30);
        assertEq(uint8(r.status), uint8(SessionEscrowV1.SessionRequestStatus.Open));
        assertEq(escrow.totalHeld(), 2 ether);
    }

    function test_createRequest_open() public {
        vm.prank(guest);
        uint256 requestId = escrow.createRequest{value: 1.5 ether}(
            address(0), // any host
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );
        SessionEscrowV1.SessionRequest memory r = escrow.getRequest(requestId);
        assertEq(r.hostTarget, address(0));
        assertEq(r.amount, 1.5 ether);
    }

    function test_createRequest_lowOffer_reverts() public {
        vm.prank(guest);
        vm.expectRevert("LOW_OFFER");
        escrow.createRequest{value: 0.5 ether}(
            host,
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );
    }

    function test_createRequest_zeroAmount_reverts() public {
        vm.prank(guest);
        vm.expectRevert("BAD_AMOUNT");
        escrow.createRequest{value: 0}(
            address(0),
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );
    }

    function test_createRequest_badWindow_reverts() public {
        vm.prank(guest);
        vm.expectRevert("BAD_WINDOW");
        escrow.createRequest{value: 1 ether}(
            address(0),
            uint48(block.timestamp + 6 hours), // start > end
            uint48(block.timestamp + 2 hours),
            30,
            uint48(block.timestamp + 1 hours)
        );
    }

    function test_createRequest_expiryAfterWindow_reverts() public {
        vm.prank(guest);
        vm.expectRevert("BAD_EXPIRY");
        escrow.createRequest{value: 1 ether}(
            address(0),
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 7 hours) // expiry > windowEnd
        );
    }

    function test_createRequest_startTooSoon_reverts() public {
        vm.prank(guest);
        vm.expectRevert("START_TOO_SOON");
        escrow.createRequest{value: 1 ether}(
            address(0),
            uint48(block.timestamp + 30), // < 60s
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );
    }

    // ================================================================
    // Requests — cancel
    // ================================================================

    function test_cancelRequest() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        uint256 balBefore = guest.balance;
        vm.prank(guest);
        escrow.cancelRequest(requestId);

        assertEq(guest.balance, balBefore + 2 ether);
        assertEq(uint8(escrow.getRequest(requestId).status), uint8(SessionEscrowV1.SessionRequestStatus.Cancelled));
        assertEq(escrow.totalHeld(), 0);
    }

    function test_cancelRequest_afterExpiry() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        // Warp past expiry
        SessionEscrowV1.SessionRequest memory r = escrow.getRequest(requestId);
        vm.warp(uint256(r.expiry) + 1);

        uint256 balBefore = guest.balance;
        vm.prank(guest);
        escrow.cancelRequest(requestId);
        assertEq(guest.balance, balBefore + 2 ether);
    }

    function test_cancelRequest_notGuest_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        vm.prank(host);
        vm.expectRevert("NOT_GUEST");
        escrow.cancelRequest(requestId);
    }

    function test_cancelRequest_alreadyCancelled_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        vm.prank(guest);
        escrow.cancelRequest(requestId);

        vm.prank(guest);
        vm.expectRevert("NOT_OPEN");
        escrow.cancelRequest(requestId);
    }

    // ================================================================
    // Requests — accept
    // ================================================================

    function test_acceptRequest_targeted() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        uint48 startTime = uint48(block.timestamp + 3 hours);
        vm.prank(host);
        (uint256 slotId, uint256 bookingId) = escrow.acceptRequest(requestId, startTime, 10, 25, 60);

        // Request updated
        SessionEscrowV1.SessionRequest memory r = escrow.getRequest(requestId);
        assertEq(uint8(r.status), uint8(SessionEscrowV1.SessionRequestStatus.Accepted));
        assertEq(r.slotId, slotId);
        assertEq(r.bookingId, bookingId);
        assertEq(r.host, host);

        // Slot created with host's base price snapshot
        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        assertEq(s.host, host);
        assertEq(s.startTime, startTime);
        assertEq(s.durationMins, 30);
        assertEq(s.price, 1 ether); // host base price, not request amount
        assertEq(uint8(s.status), uint8(SessionEscrowV1.SessionSlotStatus.Booked));

        // Booking uses request amount (the full 2 ETH offer)
        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        assertEq(b.guest, guest);
        assertEq(b.amount, 2 ether);
        assertEq(uint8(b.status), uint8(SessionEscrowV1.SessionBookingStatus.Booked));

        // totalHeld unchanged (funds already tracked from createRequest)
        assertEq(escrow.totalHeld(), 2 ether);
    }

    function test_acceptRequest_open_anyHost() public {
        // Open request (any host)
        vm.prank(guest);
        uint256 requestId = escrow.createRequest{value: 1.5 ether}(
            address(0),
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );

        // A different host with base price set accepts
        address host2 = makeAddr("host2");
        vm.prank(host2);
        escrow.setHostBasePrice(1 ether);

        uint48 startTime = uint48(block.timestamp + 3 hours);
        vm.prank(host2);
        (uint256 slotId, uint256 bookingId) = escrow.acceptRequest(requestId, startTime, 5, 20, 30);

        SessionEscrowV1.SessionRequest memory r = escrow.getRequest(requestId);
        assertEq(r.host, host2);
        assertEq(escrow.getSlot(slotId).host, host2);
        assertEq(escrow.getBooking(bookingId).amount, 1.5 ether);
    }

    function test_acceptRequest_wrongHost_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        address host2 = makeAddr("host2");
        vm.prank(host2);
        escrow.setHostBasePrice(1 ether);

        vm.prank(host2);
        vm.expectRevert("NOT_HOST");
        escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);
    }

    function test_acceptRequest_expired_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        SessionEscrowV1.SessionRequest memory r = escrow.getRequest(requestId);
        vm.warp(uint256(r.expiry) + 1);

        vm.prank(host);
        vm.expectRevert("EXPIRED");
        escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);
    }

    function test_acceptRequest_badTime_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        // Start time outside window
        vm.prank(host);
        vm.expectRevert("BAD_TIME");
        escrow.acceptRequest(requestId, uint48(block.timestamp + 10 hours), 10, 25, 60);
    }

    function test_acceptRequest_startTooSoon_reverts() public {
        // Create request with window starting soon
        vm.prank(guest);
        uint256 requestId = escrow.createRequest{value: 2 ether}(
            host,
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );

        // Warp so the window start is now in the past
        vm.warp(block.timestamp + 3 hours);

        vm.prank(host);
        vm.expectRevert("START_TOO_SOON");
        // Try to accept with a start time that's only 30s from now
        escrow.acceptRequest(requestId, uint48(block.timestamp + 30), 10, 25, 60);
    }

    function test_acceptRequest_alreadyAccepted_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        vm.prank(host);
        escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);

        vm.prank(host);
        vm.expectRevert("NOT_OPEN");
        escrow.acceptRequest(requestId, uint48(block.timestamp + 4 hours), 10, 25, 60);
    }

    function test_acceptRequest_cancelled_reverts() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        vm.prank(guest);
        escrow.cancelRequest(requestId);

        vm.prank(host);
        vm.expectRevert("NOT_OPEN");
        escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);
    }

    // ================================================================
    // Requests — full lifecycle (accept → attest → finalize)
    // ================================================================

    function test_request_fullLifecycle_completed() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        uint48 startTime = uint48(block.timestamp + 3 hours);
        vm.prank(host);
        (uint256 slotId, uint256 bookingId) = escrow.acceptRequest(requestId, startTime, 10, 25, 60);

        // Attest completed
        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        vm.warp(uint256(s.startTime) + uint256(s.minOverlapMins) * 60);
        vm.prank(oracle);
        escrow.attest(bookingId, SessionEscrowV1.Outcome.Completed, bytes32("metrics"));

        // Finalize
        vm.warp(escrow.getBooking(bookingId).finalizableAt);
        uint256 hostBefore = host.balance;
        uint256 treasuryBefore = treasury.balance;
        escrow.finalize(bookingId);

        uint256 fee = (2 ether * 300) / 10000;
        assertEq(host.balance, hostBefore + 2 ether - fee);
        assertEq(treasury.balance, treasuryBefore + fee);
        assertEq(escrow.totalHeld(), 0);
    }

    function test_request_hostCancelAfterAccept_fullRefund() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        vm.prank(host);
        (, uint256 bookingId) = escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);

        uint256 guestBefore = guest.balance;
        vm.prank(host);
        escrow.cancelBookingAsHost(bookingId);

        assertEq(guest.balance, guestBefore + 2 ether);
        assertEq(escrow.totalHeld(), 0);
    }

    function test_request_guestEarlyCancelAfterAccept() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        vm.prank(host);
        (uint256 slotId, uint256 bookingId) = escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);

        uint256 guestBefore = guest.balance;
        vm.prank(guest);
        escrow.cancelBookingAsGuest(bookingId);

        // Early cancel = full refund, slot reopens
        assertEq(guest.balance, guestBefore + 2 ether);
        assertEq(uint8(escrow.getSlot(slotId).status), uint8(SessionEscrowV1.SessionSlotStatus.Open));
        assertEq(escrow.totalHeld(), 0);
    }

    function test_request_noShowHost_refund() public {
        uint256 requestId = _createTargetedRequest(2 ether);

        uint48 startTime = uint48(block.timestamp + 3 hours);
        vm.prank(host);
        (uint256 slotId, uint256 bookingId) = escrow.acceptRequest(requestId, startTime, 10, 25, 60);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        vm.warp(uint256(s.startTime) + uint256(s.graceMins) * 60);
        vm.prank(oracle);
        escrow.attest(bookingId, SessionEscrowV1.Outcome.NoShowHost, bytes32(0));

        vm.warp(escrow.getBooking(bookingId).finalizableAt);
        uint256 guestBefore = guest.balance;
        escrow.finalize(bookingId);
        assertEq(guest.balance, guestBefore + 2 ether);
        assertEq(escrow.totalHeld(), 0);
    }

    // ================================================================
    // Requests — totalHeld accounting
    // ================================================================

    function test_request_totalHeld_lifecycle() public {
        // Create request: totalHeld += 2 ETH
        uint256 requestId = _createTargetedRequest(2 ether);
        assertEq(escrow.totalHeld(), 2 ether);

        // Accept: totalHeld unchanged (funds already tracked)
        vm.prank(host);
        (, uint256 bookingId) = escrow.acceptRequest(requestId, uint48(block.timestamp + 3 hours), 10, 25, 60);
        assertEq(escrow.totalHeld(), 2 ether);

        // Attest
        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(b.slotId);
        vm.warp(uint256(s.startTime) + uint256(s.minOverlapMins) * 60);
        vm.prank(oracle);
        escrow.attest(bookingId, SessionEscrowV1.Outcome.Completed, bytes32(0));
        assertEq(escrow.totalHeld(), 2 ether);

        // Finalize: totalHeld → 0
        vm.warp(escrow.getBooking(bookingId).finalizableAt);
        escrow.finalize(bookingId);
        assertEq(escrow.totalHeld(), 0);
    }

    function test_request_cancel_totalHeld() public {
        uint256 requestId = _createTargetedRequest(2 ether);
        assertEq(escrow.totalHeld(), 2 ether);

        vm.prank(guest);
        escrow.cancelRequest(requestId);
        assertEq(escrow.totalHeld(), 0);
    }

    // ---- Request helpers ----

    function _createTargetedRequest(uint256 amount) internal returns (uint256 requestId) {
        vm.prank(guest);
        requestId = escrow.createRequest{value: amount}(
            host,
            uint48(block.timestamp + 2 hours),
            uint48(block.timestamp + 6 hours),
            30,
            uint48(block.timestamp + 5 hours)
        );
    }
}
