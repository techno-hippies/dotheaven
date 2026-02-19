// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/SessionEscrowV1.sol";

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

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
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

contract SessionEscrowV1Test is Test {
    SessionEscrowV1 escrow;
    MockTip20 token;

    address oracle = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address host = makeAddr("host");
    address guest = makeAddr("guest");
    address newOwner = makeAddr("newOwner");

    uint16 feeBps = 300;
    uint48 challengeWindow = 6 hours;
    uint256 challengeBond = 10_000_000; // 10 aUSD (6 decimals)
    uint16 lateCancelPenaltyBps = 2000;
    uint48 noAttestBuffer = 24 hours;
    uint48 disputeTimeout = 7 days;

    uint256 constant PRICE = 25_000_000; // 25 aUSD (6 decimals)

    function setUp() public {
        token = new MockTip20();

        escrow = new SessionEscrowV1(
            address(token),
            oracle,
            treasury,
            feeBps,
            challengeWindow,
            challengeBond,
            lateCancelPenaltyBps,
            noAttestBuffer,
            disputeTimeout
        );

        // Mint tokens
        token.mint(guest, 1_000_000_000); // 1000 aUSD
        token.mint(host, 100_000_000);    // 100 aUSD

        // Guest approves escrow for all
        vm.prank(guest);
        token.approve(address(escrow), type(uint256).max);

        // Host approves escrow for challenges
        vm.prank(host);
        token.approve(address(escrow), type(uint256).max);

        // Host sets base price
        vm.prank(host);
        escrow.setHostBasePrice(PRICE);
    }

    function _createDefaultSlot(uint256 offset) internal returns (uint256 slotId) {
        vm.prank(host);
        slotId = escrow.createSlot(
            uint48(block.timestamp + offset),
            30,
            10,
            25,
            60
        );
    }

    function _bookDefault(uint256 slotId) internal returns (uint256 bookingId) {
        vm.prank(guest);
        bookingId = escrow.book(slotId);
    }

    function _attestCompleted(uint256 bookingId) internal {
        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(b.slotId);
        vm.warp(uint256(s.startTime) + uint256(s.minOverlapMins) * 60);
        vm.prank(oracle);
        escrow.attest(bookingId, SessionEscrowV1.Outcome.Completed, bytes32(0));
    }

    // ---- Core flow: book → attest → finalize → withdraw ----

    function test_fullFlow_bookAttestFinalizeWithdraw() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);

        // Tokens pulled from guest into escrow
        assertEq(token.balanceOf(address(escrow)), PRICE);
        assertEq(escrow.totalHeld(), PRICE);

        _attestCompleted(bookingId);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.finalizableAt));
        escrow.finalize(bookingId);

        // After finalize: host and treasury have owed balances
        uint256 fee = (PRICE * 300) / 10000;
        uint256 hostPaid = PRICE - fee;
        assertEq(escrow.owed(host), hostPaid);
        assertEq(escrow.owed(treasury), fee);

        // totalHeld still tracks owed tokens until withdrawn
        assertEq(escrow.totalHeld(), PRICE);

        // Host withdraws
        uint256 hostBefore = token.balanceOf(host);
        vm.prank(host);
        escrow.withdrawOwed();
        assertEq(token.balanceOf(host), hostBefore + hostPaid);
        assertEq(escrow.owed(host), 0);

        // Treasury withdraws
        uint256 treasuryBefore = token.balanceOf(treasury);
        vm.prank(treasury);
        escrow.withdrawOwed();
        assertEq(token.balanceOf(treasury), treasuryBefore + fee);

        // Now totalHeld is 0
        assertEq(escrow.totalHeld(), 0);
    }

    // ---- Self-booking guard ----

    function test_book_revertsForSelfBooking() public {
        // Host tries to book their own slot
        vm.prank(host);
        token.approve(address(escrow), type(uint256).max);

        uint256 slotId = _createDefaultSlot(3 hours);

        vm.prank(host);
        vm.expectRevert("HOST_CANNOT_BOOK");
        escrow.book(slotId);
    }

    function test_acceptRequest_revertsForSelfAccept() public {
        uint48 windowStart = uint48(block.timestamp + 3 hours);
        uint48 windowEnd = uint48(block.timestamp + 6 hours);

        vm.prank(guest);
        uint256 requestId = escrow.createRequest(
            address(0), // any host
            windowStart,
            windowEnd,
            30,
            PRICE,
            windowEnd
        );

        // Guest tries to accept their own request
        vm.prank(guest);
        escrow.setHostBasePrice(PRICE);

        vm.prank(guest);
        vm.expectRevert("GUEST_CANNOT_ACCEPT");
        escrow.acceptRequest(requestId, windowStart, 10, 25, 60);
    }

    // ---- Late cancel penalty split ----

    function test_lateCancel_penaltySplitFromPenaltyPot() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 cutoff = uint256(s.startTime) - uint256(s.cancelCutoffMins) * 60;
        vm.warp(cutoff + 1);

        vm.prank(guest);
        escrow.cancelBookingAsGuest(bookingId);

        uint256 penalty = (PRICE * 2000) / 10000;
        uint256 fee = (penalty * 300) / 10000;
        uint256 hostNet = penalty - fee;
        uint256 refund = PRICE - penalty;

        assertEq(escrow.owed(guest), refund);
        assertEq(escrow.owed(host), hostNet);
        assertEq(escrow.owed(treasury), fee);
        assertEq(escrow.totalHeld(), PRICE);

        // Withdraw and verify
        vm.prank(guest);
        escrow.withdrawOwed();
        assertEq(escrow.owed(guest), 0);
    }

    // ---- Snapshot tests ----

    function test_bookingTerms_snapshotted() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);

        SessionEscrowV1.BookingTerms memory terms = escrow.getBookingTerms(bookingId);
        assertEq(terms.feeBps, 300);
        assertEq(terms.lateCancelPenaltyBps, 2000);
        assertEq(terms.challengeBond, challengeBond);
        assertEq(terms.challengeWindow, 6 hours);
        assertEq(terms.noAttestBuffer, 24 hours);
        assertEq(terms.disputeTimeout, 7 days);

        escrow.setFeeBps(1000);
        escrow.setLateCancelPenaltyBps(5000);
        escrow.setChallengeBond(20_000_000);
        escrow.setChallengeWindow(1 hours);
        escrow.setNoAttestBuffer(1 hours);
        escrow.setDisputeTimeout(1 days);

        terms = escrow.getBookingTerms(bookingId);
        assertEq(terms.feeBps, 300);
        assertEq(terms.lateCancelPenaltyBps, 2000);
        assertEq(terms.challengeBond, challengeBond);
        assertEq(terms.challengeWindow, 6 hours);
        assertEq(terms.noAttestBuffer, 24 hours);
        assertEq(terms.disputeTimeout, 7 days);
    }

    function test_challenge_usesSnapshottedBond() public {
        uint256 slotId1 = _createDefaultSlot(3 hours);
        uint256 bookingId1 = _bookDefault(slotId1);

        // Change global bond after booking1
        escrow.setChallengeBond(20_000_000);

        _attestCompleted(bookingId1);

        // Challenge booking1: should pull 10M (snapshotted), not 20M (current)
        uint256 guestBefore = token.balanceOf(guest);
        vm.prank(guest);
        escrow.challenge(bookingId1);
        uint256 pulled1 = guestBefore - token.balanceOf(guest);
        assertEq(pulled1, 10_000_000); // original bond

        // New booking snapshotted the new 20M bond
        uint256 slotId2 = _createDefaultSlot(6 hours);
        uint256 bookingId2 = _bookDefault(slotId2);
        SessionEscrowV1.BookingTerms memory terms2 = escrow.getBookingTerms(bookingId2);
        assertEq(terms2.challengeBond, 20_000_000);

        _attestCompleted(bookingId2);

        // Challenge booking2: should pull 20M
        guestBefore = token.balanceOf(guest);
        vm.prank(guest);
        escrow.challenge(bookingId2);
        uint256 pulled2 = guestBefore - token.balanceOf(guest);
        assertEq(pulled2, 20_000_000);
    }

    function test_finalize_usesSnapshottedFeeBps() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);
        _attestCompleted(bookingId);

        escrow.setFeeBps(1000);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.finalizableAt));

        escrow.finalize(bookingId);

        // Should use snapshotted 300 bps, not new 1000
        uint256 fee = (PRICE * 300) / 10000;
        assertEq(escrow.owed(host), PRICE - fee);
        assertEq(escrow.owed(treasury), fee);
        assertEq(escrow.totalHeld(), PRICE);
    }

    function test_claimIfUnattested_usesSnapshottedNoAttestBuffer() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);

        escrow.setNoAttestBuffer(1);

        SessionEscrowV1.SessionSlot memory s = escrow.getSlot(slotId);
        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;

        vm.warp(end + 1);
        vm.prank(guest);
        vm.expectRevert("TOO_EARLY");
        escrow.claimIfUnattested(bookingId);

        vm.warp(end + 24 hours);
        vm.prank(guest);
        escrow.claimIfUnattested(bookingId);

        assertEq(uint8(escrow.getBooking(bookingId).status), uint8(SessionEscrowV1.SessionBookingStatus.Finalized));
        assertEq(escrow.owed(guest), PRICE);
    }

    function test_finalizeDisputeByTimeout_usesSnapshottedTimeout() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);
        _attestCompleted(bookingId);

        vm.prank(guest);
        escrow.challenge(bookingId);

        escrow.setDisputeTimeout(1 days);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.disputedAt) + 1 days);
        vm.expectRevert("TOO_EARLY");
        escrow.finalizeDisputeByTimeout(bookingId);

        vm.warp(uint256(b.disputedAt) + 7 days);
        escrow.finalizeDisputeByTimeout(bookingId);

        assertEq(uint8(escrow.getBooking(bookingId).status), uint8(SessionEscrowV1.SessionBookingStatus.Resolved));
    }

    // ---- Sweep ----

    function test_sweepTokenExcess_doesNotDrainOwedBalances() public {
        // Regression: sweep must not steal tokens owed to users
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);
        _attestCompleted(bookingId);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.finalizableAt));
        escrow.finalize(bookingId);

        uint256 fee = (PRICE * 300) / 10000;
        uint256 hostPaid = PRICE - fee;

        // Sweep should find 0 excess (all tokens are owed)
        uint256 treasuryBefore = token.balanceOf(treasury);
        escrow.sweepTokenExcess();
        assertEq(token.balanceOf(treasury), treasuryBefore); // nothing swept

        // Users can still withdraw full amounts
        vm.prank(host);
        escrow.withdrawOwed();
        assertEq(token.balanceOf(host), 100_000_000 + hostPaid); // initial + earned

        vm.prank(treasury);
        escrow.withdrawOwed();
        assertEq(token.balanceOf(treasury), treasuryBefore + fee);

        assertEq(escrow.totalHeld(), 0);
    }

    function test_sweepTokenExcess() public {
        // Send extra tokens directly to contract (not via book)
        token.mint(address(escrow), 50_000_000);

        uint256 treasuryBefore = token.balanceOf(treasury);
        escrow.sweepTokenExcess();
        assertEq(token.balanceOf(treasury), treasuryBefore + 50_000_000);
    }

    function test_sweepNative() public {
        // Force ETH onto contract via selfdestruct-equivalent
        vm.deal(address(escrow), 1 ether);

        uint256 treasuryBefore = treasury.balance;
        escrow.sweepNative();
        assertEq(treasury.balance, treasuryBefore + 1 ether);
    }

    // ---- Receive revert ----

    function test_receive_revertsByDefault() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert();
        payable(address(escrow)).transfer(1 ether);
    }

    // ---- Ownership ----

    function test_ownership_twoStep() public {
        escrow.transferOwnership(newOwner);
        assertEq(escrow.owner(), address(this));
        assertEq(escrow.pendingOwner(), newOwner);

        vm.prank(newOwner);
        escrow.acceptOwnership();

        assertEq(escrow.owner(), newOwner);
        assertEq(escrow.pendingOwner(), address(0));

        vm.expectRevert("NOT_OWNER");
        escrow.setFeeBps(100);
    }

    // ---- Request flow ----

    function test_requestFlow_createAcceptFinalizeWithdraw() public {
        uint48 windowStart = uint48(block.timestamp + 3 hours);
        uint48 windowEnd = uint48(block.timestamp + 6 hours);

        uint256 guestBefore = token.balanceOf(guest);

        vm.prank(guest);
        uint256 requestId = escrow.createRequest(
            host,
            windowStart,
            windowEnd,
            30,
            PRICE,
            windowEnd
        );

        // Tokens pulled from guest
        assertEq(token.balanceOf(guest), guestBefore - PRICE);
        assertEq(escrow.totalHeld(), PRICE);

        // Host accepts
        vm.prank(host);
        (uint256 slotId, uint256 bookingId) = escrow.acceptRequest(
            requestId, windowStart, 10, 25, 60
        );

        assertTrue(slotId > 0);
        assertTrue(bookingId > 0);

        // Attest + finalize
        _attestCompleted(bookingId);
        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.finalizableAt));
        escrow.finalize(bookingId);

        uint256 fee = (PRICE * 300) / 10000;
        assertEq(escrow.owed(host), PRICE - fee);
        assertEq(escrow.owed(treasury), fee);
    }

    function test_requestFlow_cancelRefunds() public {
        uint48 windowStart = uint48(block.timestamp + 3 hours);
        uint48 windowEnd = uint48(block.timestamp + 6 hours);

        vm.prank(guest);
        uint256 requestId = escrow.createRequest(
            address(0),
            windowStart,
            windowEnd,
            30,
            PRICE,
            windowEnd
        );

        assertEq(escrow.totalHeld(), PRICE);

        vm.prank(guest);
        escrow.cancelRequest(requestId);

        assertEq(escrow.owed(guest), PRICE);
        assertEq(escrow.totalHeld(), PRICE);

        // Withdraw
        uint256 guestBefore = token.balanceOf(guest);
        vm.prank(guest);
        escrow.withdrawOwed();
        assertEq(token.balanceOf(guest), guestBefore + PRICE);
    }

    // ---- Pull-only: no push payouts ----

    function test_pullOnly_noPushOnFinalize() public {
        uint256 slotId = _createDefaultSlot(3 hours);
        uint256 bookingId = _bookDefault(slotId);
        _attestCompleted(bookingId);

        SessionEscrowV1.SessionBooking memory b = escrow.getBooking(bookingId);
        vm.warp(uint256(b.finalizableAt));

        uint256 hostBefore = token.balanceOf(host);
        uint256 treasuryBefore = token.balanceOf(treasury);

        escrow.finalize(bookingId);

        // Tokens NOT pushed — still in escrow
        assertEq(token.balanceOf(host), hostBefore);
        assertEq(token.balanceOf(treasury), treasuryBefore);

        // Owed balances set
        assertTrue(escrow.owed(host) > 0);
        assertTrue(escrow.owed(treasury) > 0);
    }

    // ---- BPS constant ----

    function test_bpsConstant() public view {
        assertEq(escrow.BPS(), 10_000);
    }
}
