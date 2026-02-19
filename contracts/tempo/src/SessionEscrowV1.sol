// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SessionEscrowV1
/// @notice TIP-20 token escrow for scheduled 1:1 sessions on Tempo.
///   Hosts publish session slots → guests book (token pull) → oracle attests outcome
///   → challenge window → finalize → pull-based withdrawal.
///
/// Pricing model (v1):
///  - Host sets ONE base price (hostBasePrice) used when creating *new* public slots.
///  - Each slot snapshots its price at creation time (slot.price) to avoid "price rug"
///    between listing and booking.
///  - Guests can offer an override via Requests (pay more for a time the host didn't list).
///
/// Requests:
///  - Guest approves + contract pulls tokens with a desired time window + duration (+ optional target host).
///  - Host accepts by selecting a start time within the window; contract creates slot + booking atomically.
///  - If not accepted, guest can cancel and withdraw (any time).
///
/// Settlement:
///  - All payouts credit owed[address] balances (pull-only).
///  - Users call withdrawOwed() to claim tokens.
///  - No push payouts — eliminates gas-grief and payout-DoS vectors.
///
/// Safety:
///  - Oracle-deadlock timeout refunds guest
///  - Dispute timeout: oracle outcome stands, bond goes to counterparty
///  - sweepTokenExcess: only excess tokens (tracked via totalHeld)
///  - sweepNative: rescue any forced native ETH
contract SessionEscrowV1 {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint48  public constant MAX_CHALLENGE_WINDOW = 30 days;
    uint48  public constant MAX_NO_ATTEST_BUFFER = 30 days;
    uint48  public constant MAX_DISPUTE_TIMEOUT = 180 days;

    // ---- Reentrancy guard ----
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ---- Config ----
    IERC20  public immutable paymentToken;
    address public owner;
    address public pendingOwner;
    address public oracle;
    address public treasury;

    uint16  public feeBps;               // e.g. 300 = 3%
    uint48  public challengeWindow;      // seconds
    uint256 public challengeBond;        // token units (must be >0)
    uint16  public lateCancelPenaltyBps; // e.g. 2000 = 20%
    uint48  public noAttestBuffer;       // seconds, e.g. 24 hours
    uint48  public disputeTimeout;       // seconds, e.g. 7 days

    // ---- Pricing ----
    mapping(address => uint256) public hostBasePrice; // host => token units

    // ---- Accounting ----
    // Tracks tokens owed to participants (escrowed deposits + challenge bonds + open request funds).
    // Any token balance above totalHeld is "excess" and can be swept.
    uint256 public totalHeld;
    mapping(address => uint256) public owed; // pull-only balances

    // ---- Enums ----
    enum SessionSlotStatus    { Open, Booked, Cancelled, Settled }
    enum SessionBookingStatus { None, Booked, Cancelled, Attested, Disputed, Resolved, Finalized }
    enum SessionRequestStatus { None, Open, Cancelled, Accepted }
    enum Outcome {
        None,
        Completed,          // 1
        NoShowHost,         // 2
        NoShowGuest,        // 3
        CancelledByHost,    // 4
        CancelledByGuest    // 5 (pre-session cancel before cutoff)
    }

    // ---- Models ----
    struct SessionSlot {
        address host;
        uint48  startTime;        // unix seconds
        uint32  durationMins;
        uint256 price;            // SNAPSHOTTED at slot creation time (token units)
        uint32  graceMins;        // allowed late join
        uint32  minOverlapMins;   // required overlap for Completed
        uint32  cancelCutoffMins; // guest can cancel free before (start - cutoff)
        SessionSlotStatus status;
    }

    struct SessionBooking {
        uint256 slotId;
        address guest;
        uint256 amount;           // escrowed token units

        SessionBookingStatus status;
        Outcome  oracleOutcome;
        bytes32  metricsHash;
        uint64   attestedAt;
        uint64   finalizableAt;

        // dispute
        address challenger;
        uint256 bondAmount;
        uint64   disputedAt;
    }

    struct BookingTerms {
        uint16  feeBps;
        uint16  lateCancelPenaltyBps;
        uint48  challengeWindow;
        uint48  noAttestBuffer;
        uint48  disputeTimeout;
        uint256 challengeBond;
    }

    struct SessionRequest {
        address hostTarget;   // address(0) = any host (optional mode)
        address guest;
        uint48  windowStart;  // allowed start-time range
        uint48  windowEnd;    // inclusive end of allowed start-time range
        uint32  durationMins;
        uint256 amount;       // escrowed token units (offer)
        uint48  expiry;       // must be <= windowEnd
        SessionRequestStatus status;

        // Filled on accept
        uint256 slotId;
        uint256 bookingId;
        address host;         // accepting host
    }

    // ---- Storage ----
    uint256 public nextSlotId = 1;
    uint256 public nextBookingId = 1;
    uint256 public nextRequestId = 1;

    mapping(uint256 => SessionSlot)    public slots;
    mapping(uint256 => SessionBooking) public bookings;
    mapping(uint256 => BookingTerms)   public bookingTerms;
    mapping(uint256 => SessionRequest) public requests;

    // slotId -> last bookingId (0 = none). Cleared only when slot reopens (early guest cancel) or host cancels pre-booking.
    mapping(uint256 => uint256) public slotToBooking;

    // ---- Events ----
    event HostBasePriceSet(address indexed host, uint256 price);

    event SessionSlotCreated(uint256 indexed slotId, address indexed host, uint48 startTime, uint32 durationMins, uint256 price);
    event SessionSlotCancelled(uint256 indexed slotId);

    event SessionBooked(uint256 indexed bookingId, uint256 indexed slotId, address indexed guest, uint256 amount);

    event SessionBookingCancelled(
        uint256 indexed bookingId,
        Outcome reason,
        uint256 refund,
        uint256 penalty,
        uint256 hostPaid,
        uint256 feePaid
    );

    event UnattestedRefunded(uint256 indexed bookingId, uint256 refund);

    event Attested(uint256 indexed bookingId, Outcome outcome, bytes32 metricsHash, uint64 finalizableAt);
    event Challenged(uint256 indexed bookingId, address indexed challenger, uint256 bondAmount);
    event Resolved(uint256 indexed bookingId, Outcome finalOutcome);
    event Finalized(uint256 indexed bookingId, Outcome finalOutcome, uint256 hostPaid, uint256 guestRefund, uint256 feePaid);

    event SessionRequestCreated(
        uint256 indexed requestId,
        address indexed hostTarget,
        address indexed guest,
        uint48 windowStart,
        uint48 windowEnd,
        uint32 durationMins,
        uint256 amount,
        uint48 expiry
    );

    event SessionRequestCancelled(uint256 indexed requestId, uint256 refund);
    event SessionRequestAccepted(uint256 indexed requestId, address indexed host, uint256 slotId, uint256 bookingId, uint48 startTime);

    event TokenSwept(uint256 amount);
    event NativeSwept(uint256 amount);
    event OwedWithdrawn(address indexed from, address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeBpsUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event ChallengeWindowUpdated(uint48 oldChallengeWindow, uint48 newChallengeWindow);
    event ChallengeBondUpdated(uint256 oldChallengeBond, uint256 newChallengeBond);
    event LateCancelPenaltyBpsUpdated(uint16 oldPenaltyBps, uint16 newPenaltyBps);
    event NoAttestBufferUpdated(uint48 oldNoAttestBuffer, uint48 newNoAttestBuffer);
    event DisputeTimeoutUpdated(uint48 oldDisputeTimeout, uint48 newDisputeTimeout);

    // ---- Auth ----
    modifier onlyOwner()  { require(msg.sender == owner, "NOT_OWNER");  _; }
    modifier onlyOracle() { require(msg.sender == oracle, "NOT_ORACLE"); _; }

    constructor(
        address paymentToken_,
        address oracle_,
        address treasury_,
        uint16  feeBps_,
        uint48  challengeWindowSeconds_,
        uint256 challengeBond_,
        uint16  lateCancelPenaltyBps_,
        uint48  noAttestBufferSeconds_,
        uint48  disputeTimeoutSeconds_
    ) {
        require(paymentToken_ != address(0), "BAD_TOKEN");
        require(oracle_ != address(0) && treasury_ != address(0), "BAD_ADDR");
        require(feeBps_ <= 2000, "FEE_TOO_HIGH");
        require(lateCancelPenaltyBps_ <= 10000, "PENALTY_TOO_HIGH");
        require(challengeBond_ > 0, "ZERO_BOND");
        require(challengeWindowSeconds_ <= MAX_CHALLENGE_WINDOW, "WINDOW_TOO_LARGE");
        require(noAttestBufferSeconds_ <= MAX_NO_ATTEST_BUFFER, "BUFFER_TOO_LARGE");
        require(disputeTimeoutSeconds_ <= MAX_DISPUTE_TIMEOUT, "TIMEOUT_TOO_LARGE");

        paymentToken = IERC20(paymentToken_);
        owner    = msg.sender;
        oracle   = oracle_;
        treasury = treasury_;
        feeBps   = feeBps_;
        challengeWindow = challengeWindowSeconds_;
        challengeBond   = challengeBond_;
        lateCancelPenaltyBps = lateCancelPenaltyBps_;
        noAttestBuffer = noAttestBufferSeconds_;
        disputeTimeout = disputeTimeoutSeconds_;

        emit OwnershipTransferred(address(0), owner);
    }

    // ---- Admin ----
    function setOracle(address o) external onlyOwner {
        require(o != address(0), "BAD_ADDR");
        address oldOracle = oracle;
        oracle = o;
        emit OracleUpdated(oldOracle, o);
    }

    function setTreasury(address t) external onlyOwner {
        require(t != address(0), "BAD_ADDR");
        address oldTreasury = treasury;
        treasury = t;
        emit TreasuryUpdated(oldTreasury, t);
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 2000, "FEE_TOO_HIGH");
        uint16 oldFeeBps = feeBps;
        feeBps = bps;
        emit FeeBpsUpdated(oldFeeBps, bps);
    }

    function setChallengeWindow(uint48 s) external onlyOwner {
        require(s <= MAX_CHALLENGE_WINDOW, "WINDOW_TOO_LARGE");
        uint48 oldChallengeWindow = challengeWindow;
        challengeWindow = s;
        emit ChallengeWindowUpdated(oldChallengeWindow, s);
    }

    function setChallengeBond(uint256 a) external onlyOwner {
        require(a > 0, "ZERO_BOND");
        uint256 oldChallengeBond = challengeBond;
        challengeBond = a;
        emit ChallengeBondUpdated(oldChallengeBond, a);
    }

    function setLateCancelPenaltyBps(uint16 bps) external onlyOwner {
        require(bps <= 10000, "PENALTY_TOO_HIGH");
        uint16 oldPenaltyBps = lateCancelPenaltyBps;
        lateCancelPenaltyBps = bps;
        emit LateCancelPenaltyBpsUpdated(oldPenaltyBps, bps);
    }

    function setNoAttestBuffer(uint48 s) external onlyOwner {
        require(s <= MAX_NO_ATTEST_BUFFER, "BUFFER_TOO_LARGE");
        uint48 oldNoAttestBuffer = noAttestBuffer;
        noAttestBuffer = s;
        emit NoAttestBufferUpdated(oldNoAttestBuffer, s);
    }

    function setDisputeTimeout(uint48 s) external onlyOwner {
        require(s <= MAX_DISPUTE_TIMEOUT, "TIMEOUT_TOO_LARGE");
        uint48 oldDisputeTimeout = disputeTimeout;
        disputeTimeout = s;
        emit DisputeTimeoutUpdated(oldDisputeTimeout, s);
    }

    function transferOwnership(address n) external onlyOwner {
        require(n != address(0), "BAD_ADDR");
        pendingOwner = n;
        emit OwnershipTransferStarted(owner, n);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "NOT_PENDING_OWNER");
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, owner);
    }

    // ---- Host pricing ----
    function setHostBasePrice(uint256 price) external {
        require(price > 0, "BAD_PRICE");
        hostBasePrice[msg.sender] = price;
        emit HostBasePriceSet(msg.sender, price);
    }

    // ---- Host: create session slots ----
    function createSlot(
        uint48  startTime,
        uint32  durationMins,
        uint32  graceMins,
        uint32  minOverlapMins,
        uint32  cancelCutoffMins
    ) external returns (uint256 slotId) {
        uint256 price = hostBasePrice[msg.sender];
        require(price > 0, "NO_BASE_PRICE");
        slotId = _createSlot(msg.sender, startTime, durationMins, price, graceMins, minOverlapMins, cancelCutoffMins);
    }

    function _createSlot(
        address host,
        uint48  startTime,
        uint32  durationMins,
        uint256 price,
        uint32  graceMins,
        uint32  minOverlapMins,
        uint32  cancelCutoffMins
    ) internal returns (uint256 slotId) {
        require(price > 0, "BAD_PRICE");
        require(startTime > block.timestamp + 60, "START_TOO_SOON");
        require(durationMins > 0 && durationMins <= 240, "BAD_DURATION");
        require(minOverlapMins <= durationMins, "BAD_OVERLAP");
        require(cancelCutoffMins <= 10080, "BAD_CUTOFF"); // <= 7 days

        slotId = nextSlotId++;
        slots[slotId] = SessionSlot({
            host: host,
            startTime: startTime,
            durationMins: durationMins,
            price: price,
            graceMins: graceMins,
            minOverlapMins: minOverlapMins,
            cancelCutoffMins: cancelCutoffMins,
            status: SessionSlotStatus.Open
        });

        emit SessionSlotCreated(slotId, host, startTime, durationMins, price);
    }

    /// @notice Host cancels an unbooked slot
    function cancelSlot(uint256 slotId) external {
        SessionSlot storage s = slots[slotId];
        require(s.host == msg.sender, "NOT_HOST");
        require(s.status == SessionSlotStatus.Open, "NOT_OPEN");
        s.status = SessionSlotStatus.Cancelled;
        emit SessionSlotCancelled(slotId);
    }

    // ---- Guest: book (token pull at slot snapshotted price) ----
    /// @notice Guest must approve paymentToken for slot.price before calling.
    function book(uint256 slotId) external nonReentrant returns (uint256 bookingId) {
        SessionSlot storage s = slots[slotId];
        require(s.status == SessionSlotStatus.Open, "NOT_AVAILABLE");
        require(s.startTime > block.timestamp + 60, "TOO_LATE");
        require(slotToBooking[slotId] == 0, "ALREADY_BOOKED");
        require(msg.sender != s.host, "HOST_CANNOT_BOOK");

        uint256 price = s.price;

        // CEI: state first, then external call
        bookingId = _bookFromEscrow(slotId, msg.sender, price);
        totalHeld += price;

        paymentToken.safeTransferFrom(msg.sender, address(this), price);
    }

    function _bookFromEscrow(uint256 slotId, address guest, uint256 amount) internal returns (uint256 bookingId) {
        SessionSlot storage s = slots[slotId];
        require(s.status == SessionSlotStatus.Open, "NOT_AVAILABLE");
        require(slotToBooking[slotId] == 0, "ALREADY_BOOKED");

        bookingId = nextBookingId++;
        slotToBooking[slotId] = bookingId;

        bookings[bookingId] = SessionBooking({
            slotId: slotId,
            guest: guest,
            amount: amount,

            status: SessionBookingStatus.Booked,
            oracleOutcome: Outcome.None,
            metricsHash: bytes32(0),
            attestedAt: 0,
            finalizableAt: 0,

            challenger: address(0),
            bondAmount: 0,
            disputedAt: 0
        });

        bookingTerms[bookingId] = BookingTerms({
            feeBps: feeBps,
            lateCancelPenaltyBps: lateCancelPenaltyBps,
            challengeWindow: challengeWindow,
            noAttestBuffer: noAttestBuffer,
            disputeTimeout: disputeTimeout,
            challengeBond: challengeBond
        });

        s.status = SessionSlotStatus.Booked;

        emit SessionBooked(bookingId, slotId, guest, amount);
    }

    // ---- Requests (override offers) ----

    /// @notice Guest creates a token-escrowed request for a time window.
    /// @param hostTarget address(0) = any host (optional). If non-zero, only that host can accept.
    /// @param amount Token units to escrow (guest must approve first).
    /// @dev windowStart/windowEnd define allowed START times. expiry must be <= windowEnd.
    ///      Booking terms are snapshotted at acceptance time, not request creation.
    function createRequest(
        address hostTarget,
        uint48 windowStart,
        uint48 windowEnd,
        uint32 durationMins,
        uint256 amount,
        uint48 expiry
    ) external nonReentrant returns (uint256 requestId) {
        require(amount > 0, "BAD_AMOUNT");
        require(durationMins > 0 && durationMins <= 240, "BAD_DURATION");
        require(windowStart > block.timestamp + 60, "START_TOO_SOON");
        require(windowEnd >= windowStart, "BAD_WINDOW");
        require(expiry > block.timestamp, "EXPIRED");
        require(expiry <= windowEnd, "BAD_EXPIRY");

        if (hostTarget != address(0)) {
            uint256 base = hostBasePrice[hostTarget];
            if (base > 0) require(amount >= base, "LOW_OFFER");
        }

        requestId = nextRequestId++;
        requests[requestId] = SessionRequest({
            hostTarget: hostTarget,
            guest: msg.sender,
            windowStart: windowStart,
            windowEnd: windowEnd,
            durationMins: durationMins,
            amount: amount,
            expiry: expiry,
            status: SessionRequestStatus.Open,
            slotId: 0,
            bookingId: 0,
            host: address(0)
        });

        totalHeld += amount;

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        emit SessionRequestCreated(
            requestId,
            hostTarget,
            msg.sender,
            windowStart,
            windowEnd,
            durationMins,
            amount,
            expiry
        );
    }

    /// @notice Guest cancels an open request. Credits owed balance for withdrawal.
    function cancelRequest(uint256 requestId) external nonReentrant {
        SessionRequest storage r = requests[requestId];
        require(r.status == SessionRequestStatus.Open, "NOT_OPEN");
        require(r.guest == msg.sender, "NOT_GUEST");

        r.status = SessionRequestStatus.Cancelled;

        _credit(r.guest, r.amount);
        emit SessionRequestCancelled(requestId, r.amount);
    }

    /// @notice Host accepts a request by choosing a concrete start time within the window.
    /// Creates the slot + booking atomically using the request funds.
    ///
    /// Window constrains START time only (intentional).
    function acceptRequest(
        uint256 requestId,
        uint48  startTime,
        uint32  graceMins,
        uint32  minOverlapMins,
        uint32  cancelCutoffMins
    ) external nonReentrant returns (uint256 slotId, uint256 bookingId) {
        SessionRequest storage r = requests[requestId];
        require(r.status == SessionRequestStatus.Open, "NOT_OPEN");
        require(block.timestamp <= r.expiry, "EXPIRED");
        require(msg.sender != r.guest, "GUEST_CANNOT_ACCEPT");

        if (r.hostTarget != address(0)) {
            require(msg.sender == r.hostTarget, "NOT_HOST");
        }

        uint256 base = hostBasePrice[msg.sender];
        if (base > 0) require(r.amount >= base, "LOW_OFFER");

        require(startTime >= r.windowStart && startTime <= r.windowEnd, "BAD_TIME");
        require(startTime > block.timestamp + 60, "START_TOO_SOON");

        // Slot price snapshot:
        // - If host has a base price set, snapshot that (keeps listings consistent with host pricing model).
        // - Otherwise snapshot the request amount (host hasn't configured a base yet).
        uint256 slotPrice = (base > 0) ? base : r.amount;

        slotId = _createSlot(msg.sender, startTime, r.durationMins, slotPrice, graceMins, minOverlapMins, cancelCutoffMins);
        bookingId = _bookFromEscrow(slotId, r.guest, r.amount);

        r.status = SessionRequestStatus.Accepted;
        r.slotId = slotId;
        r.bookingId = bookingId;
        r.host = msg.sender;

        emit SessionRequestAccepted(requestId, msg.sender, slotId, bookingId, startTime);
    }

    // ---- Cancellations (pre-session) ----

    function cancelBookingAsGuest(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Booked, "NOT_BOOKED");
        require(b.guest == msg.sender, "NOT_GUEST");

        SessionSlot storage s = slots[b.slotId];
        require(block.timestamp < s.startTime, "ALREADY_STARTED");

        uint256 cutoff = uint256(s.startTime) - uint256(s.cancelCutoffMins) * 60;

        b.status = SessionBookingStatus.Cancelled;

        if (block.timestamp <= cutoff) {
            // Early cancel: full refund, slot reopens
            s.status = SessionSlotStatus.Open;
            slotToBooking[b.slotId] = 0;

            _credit(b.guest, b.amount);
            emit SessionBookingCancelled(bookingId, Outcome.CancelledByGuest, b.amount, 0, 0, 0);
        } else {
            // Late cancel: penalty from booking amount
            s.status = SessionSlotStatus.Settled;

            BookingTerms memory terms = bookingTerms[bookingId];

            uint256 penalty = (b.amount * terms.lateCancelPenaltyBps) / BPS;
            uint256 fee = (penalty * terms.feeBps) / BPS;
            uint256 hostNet = penalty - fee;
            uint256 refund = b.amount - penalty;

            require(refund + hostNet + fee == b.amount, "BAD_SPLIT");

            if (refund > 0)  _credit(b.guest, refund);
            if (fee > 0)     _credit(treasury, fee);
            if (hostNet > 0) _credit(s.host, hostNet);

            emit SessionBookingCancelled(bookingId, Outcome.CancelledByGuest, refund, penalty, hostNet, fee);
        }
    }

    function cancelBookingAsHost(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Booked, "NOT_BOOKED");

        SessionSlot storage s = slots[b.slotId];
        require(s.host == msg.sender, "NOT_HOST");
        require(block.timestamp < s.startTime, "ALREADY_STARTED");

        b.status = SessionBookingStatus.Cancelled;
        s.status = SessionSlotStatus.Cancelled;
        slotToBooking[b.slotId] = 0;

        _credit(b.guest, b.amount);
        emit SessionBookingCancelled(bookingId, Outcome.CancelledByHost, b.amount, 0, 0, 0);
    }

    // ---- Oracle attestation ----

    /// @notice Oracle attests outcome with timing guards per outcome type.
    ///   - NoShow*: attestable in [start+grace, start+grace+duration]
    ///   - Completed: attestable in [start+minOverlap, end+2h]
    function attest(uint256 bookingId, Outcome outcome, bytes32 metricsHash) external onlyOracle {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Booked, "NOT_BOOKED");
        require(outcome != Outcome.None, "BAD_OUTCOME");
        require(
            outcome == Outcome.Completed ||
            outcome == Outcome.NoShowHost ||
            outcome == Outcome.NoShowGuest,
            "BAD_ATTEST_OUTCOME"
        );

        SessionSlot storage s = slots[b.slotId];
        uint256 start = s.startTime;
        uint256 end   = start + uint256(s.durationMins) * 60;
        uint256 graceEnd = start + uint256(s.graceMins) * 60;

        if (outcome == Outcome.NoShowHost || outcome == Outcome.NoShowGuest) {
            require(block.timestamp >= graceEnd, "GRACE_NOT_OVER");
            require(block.timestamp <= graceEnd + uint256(s.durationMins) * 60, "NO_SHOW_TOO_LATE");
        } else {
            require(block.timestamp >= start + uint256(s.minOverlapMins) * 60, "OVERLAP_NOT_MET");
            require(block.timestamp <= end + 2 hours, "TOO_LATE");
        }

        b.status = SessionBookingStatus.Attested;
        b.oracleOutcome = outcome;
        b.metricsHash   = metricsHash;
        b.attestedAt    = _toUint64(block.timestamp);

        BookingTerms memory terms = bookingTerms[bookingId];
        b.finalizableAt = _toUint64(block.timestamp + uint256(terms.challengeWindow));

        emit Attested(bookingId, outcome, metricsHash, b.finalizableAt);
    }

    // ---- Oracle deadlock escape hatch ----

    /// @notice If oracle never attests, either party can claim refund after end + noAttestBuffer.
    /// Policy: credit guest. Slot -> Cancelled. Booking -> Finalized.
    function claimIfUnattested(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Booked, "NOT_BOOKED");

        SessionSlot storage s = slots[b.slotId];
        require(msg.sender == b.guest || msg.sender == s.host, "NOT_PARTY");

        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        BookingTerms memory terms = bookingTerms[bookingId];
        require(block.timestamp >= end + uint256(terms.noAttestBuffer), "TOO_EARLY");

        b.status = SessionBookingStatus.Finalized;
        s.status = SessionSlotStatus.Cancelled;

        _credit(b.guest, b.amount);
        emit UnattestedRefunded(bookingId, b.amount);
    }

    // ---- Challenge + dispute ----

    /// @notice Challenge an oracle attestation. Caller must approve challengeBond tokens first.
    function challenge(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Attested, "NOT_ATTESTED");
        require(block.timestamp < b.finalizableAt, "WINDOW_OVER");
        BookingTerms memory terms = bookingTerms[bookingId];
        uint256 bond = terms.challengeBond;

        SessionSlot storage s = slots[b.slotId];
        require(msg.sender == b.guest || msg.sender == s.host, "NOT_PARTY");

        // CEI: state first, then external call
        b.status     = SessionBookingStatus.Disputed;
        b.challenger = msg.sender;
        b.bondAmount = bond;
        b.disputedAt = _toUint64(block.timestamp);

        totalHeld += bond;

        paymentToken.safeTransferFrom(msg.sender, address(this), bond);

        emit Challenged(bookingId, msg.sender, bond);
    }

    function resolveDispute(uint256 bookingId, Outcome finalOutcome) external onlyOwner nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Disputed, "NOT_DISPUTED");
        require(
            finalOutcome == Outcome.Completed ||
            finalOutcome == Outcome.NoShowHost ||
            finalOutcome == Outcome.NoShowGuest,
            "BAD_OUTCOME"
        );

        bool challengerWins = (finalOutcome != b.oracleOutcome);

        SessionSlot storage s = slots[b.slotId];
        address host = s.host;
        address guest = b.guest;
        address challenger = b.challenger;
        uint256 bondAmount = b.bondAmount;

        // CEI: clear dispute state first
        b.status        = SessionBookingStatus.Resolved;
        b.oracleOutcome = finalOutcome;
        b.finalizableAt = _toUint64(block.timestamp);
        b.challenger    = address(0);
        b.bondAmount    = 0;
        b.disputedAt    = 0;

        if (bondAmount > 0) {
            if (challengerWins) {
                _credit(challenger, bondAmount);
            } else {
                address counterparty = (challenger == guest) ? host : guest;
                _credit(counterparty, bondAmount);
            }
        }

        emit Resolved(bookingId, finalOutcome);
    }

    function finalizeDisputeByTimeout(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Disputed, "NOT_DISPUTED");
        require(b.disputedAt != 0, "NO_DISPUTE_TIME");
        BookingTerms memory terms = bookingTerms[bookingId];
        require(block.timestamp >= uint256(b.disputedAt) + uint256(terms.disputeTimeout), "TOO_EARLY");

        SessionSlot storage s = slots[b.slotId];
        address host = s.host;
        address guest = b.guest;
        address challenger = b.challenger;
        uint256 bondAmount = b.bondAmount;

        // CEI: clear dispute state first
        b.status        = SessionBookingStatus.Resolved;
        b.finalizableAt = _toUint64(block.timestamp);
        b.challenger    = address(0);
        b.bondAmount    = 0;
        b.disputedAt    = 0;

        if (bondAmount > 0) {
            address counterparty = (challenger == guest) ? host : guest;
            _credit(counterparty, bondAmount);
        }

        emit Resolved(bookingId, b.oracleOutcome);
    }

    // ---- Finalization ----

    function finalize(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(
            b.status == SessionBookingStatus.Attested || b.status == SessionBookingStatus.Resolved,
            "NOT_FINALIZABLE"
        );
        require(block.timestamp >= b.finalizableAt, "TOO_EARLY");

        SessionSlot storage s = slots[b.slotId];
        BookingTerms memory terms = bookingTerms[bookingId];

        // CEI: update state first
        b.status = SessionBookingStatus.Finalized;
        s.status = SessionSlotStatus.Settled;

        (uint256 hostPaid, uint256 guestRefund, uint256 feePaid) =
            _settle(b.oracleOutcome, s.host, b.guest, b.amount, terms.feeBps);

        emit Finalized(bookingId, b.oracleOutcome, hostPaid, guestRefund, feePaid);
    }

    // ---- Sweep ----

    /// @notice Sweep excess payment tokens (balance above totalHeld) to treasury.
    function sweepTokenExcess() external nonReentrant {
        uint256 bal = paymentToken.balanceOf(address(this));
        if (bal <= totalHeld) {
            emit TokenSwept(0);
            return;
        }
        uint256 excess = bal - totalHeld;
        paymentToken.safeTransfer(treasury, excess);
        emit TokenSwept(excess);
    }

    /// @notice Rescue any native ETH forced onto contract (e.g. selfdestruct, coinbase).
    function sweepNative() external nonReentrant {
        uint256 bal = address(this).balance;
        if (bal == 0) {
            emit NativeSwept(0);
            return;
        }
        (bool ok, ) = treasury.call{value: bal}("");
        require(ok, "NATIVE_SEND_FAILED");
        emit NativeSwept(bal);
    }

    // ---- Internal ----

    function _settle(Outcome o, address host, address guest, uint256 amount, uint16 feeBps_)
        internal
        returns (uint256 hostPaid, uint256 guestRefund, uint256 feePaid)
    {
        if (o == Outcome.Completed || o == Outcome.NoShowGuest) {
            feePaid  = (amount * feeBps_) / BPS;
            hostPaid = amount - feePaid;

            if (feePaid > 0)  _credit(treasury, feePaid);
            if (hostPaid > 0) _credit(host, hostPaid);
        } else if (o == Outcome.NoShowHost || o == Outcome.CancelledByHost) {
            guestRefund = amount;
            _credit(guest, guestRefund);
        } else if (o == Outcome.CancelledByGuest) {
            // Reserved path: oracle attestation currently disallows CancelledByGuest
            // (pre-session guest cancellation is settled in cancelBookingAsGuest).
            // Kept for forward compatibility if attestation policy expands.
            feePaid  = (amount * feeBps_) / BPS;
            hostPaid = amount - feePaid;

            if (feePaid > 0)  _credit(treasury, feePaid);
            if (hostPaid > 0) _credit(host, hostPaid);
        } else {
            revert("UNKNOWN_OUTCOME");
        }
    }

    /// @dev Credit pull-balance. Tokens stay in contract and remain tracked in totalHeld
    /// until the user calls withdrawOwed().
    function _credit(address to, uint256 amount) internal {
        if (amount == 0) return;
        owed[to] += amount;
    }

    /// @notice Withdraw owed token balance to a chosen address.
    function withdrawOwed(address to) external nonReentrant {
        _withdrawOwed(to);
    }

    /// @notice Convenience: withdraw owed balance to caller.
    function withdrawOwed() external nonReentrant {
        _withdrawOwed(msg.sender);
    }

    function _withdrawOwed(address to) internal {
        require(to != address(0), "BAD_ADDR");
        uint256 amount = owed[msg.sender];
        require(amount > 0, "NOTHING_OWED");

        // CEI: clear balance before external call
        owed[msg.sender] = 0;
        totalHeld -= amount;

        paymentToken.safeTransfer(to, amount);
        emit OwedWithdrawn(msg.sender, to, amount);
    }

    function _toUint64(uint256 value) internal pure returns (uint64) {
        require(value <= type(uint64).max, "TIME_OVERFLOW");
        return uint64(value);
    }

    // ---- Views ----
    function getSlot(uint256 slotId) external view returns (SessionSlot memory) { return slots[slotId]; }
    function getBooking(uint256 bookingId) external view returns (SessionBooking memory) { return bookings[bookingId]; }
    function getBookingTerms(uint256 bookingId) external view returns (BookingTerms memory) { return bookingTerms[bookingId]; }
    function getRequest(uint256 requestId) external view returns (SessionRequest memory) { return requests[requestId]; }

    receive() external payable {
        revert("NO_DIRECT_ETH");
    }
}
