// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SessionEscrowV1
/// @notice ETH-native escrow for scheduled 1:1 sessions on MegaETH.
///   Hosts publish session slots → guests book (payable) → oracle attests outcome
///   → challenge window → finalize payout.
///
/// Pricing model (v1):
///  - Host sets ONE base price (hostBasePrice) used when creating *new* public slots.
///  - Each slot snapshots its price at creation time (slot.price) to avoid “price rug”
///    between listing and booking.
///  - Guests can offer an override via Requests (pay more for a time the host didn’t list).
///
/// Requests:
///  - Guest escrows ETH with a desired time window + duration (+ optional target host).
///  - Host accepts by selecting a start time within the window; contract creates slot + booking atomically.
///  - If not accepted, guest can cancel and refund (any time).
///
/// Safety:
///  - Oracle-deadlock timeout refunds guest
///  - Dispute timeout: oracle outcome stands, bond returned to challenger (mercy)
///  - Sweep only excess ETH (tracked via totalHeld)
contract SessionEscrowV1 {
    // ---- Reentrancy guard ----
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ---- Config ----
    address public owner;
    address public oracle;
    address public treasury;

    uint16  public feeBps;               // e.g. 300 = 3%
    uint48  public challengeWindow;      // seconds
    uint256 public challengeBond;        // wei (must be >0)
    uint16  public lateCancelPenaltyBps; // e.g. 2000 = 20%
    uint48  public noAttestBuffer;       // seconds, e.g. 24 hours
    uint48  public disputeTimeout;       // seconds, e.g. 7 days

    // ---- Pricing ----
    mapping(address => uint256) public hostBasePrice; // host => wei

    // ---- Accounting ----
    // Tracks ETH owed to participants (escrowed deposits + challenge bonds + open request funds).
    // Any ETH held above totalHeld is "excess" and can be swept.
    uint256 public totalHeld;

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
        uint256 price;            // SNAPSHOTTED at slot creation time
        uint32  graceMins;        // allowed late join
        uint32  minOverlapMins;   // required overlap for Completed
        uint32  cancelCutoffMins; // guest can cancel free before (start - cutoff)
        SessionSlotStatus status;
    }

    struct SessionBooking {
        uint256 slotId;
        address guest;
        uint256 amount;           // paid/escrowed wei (base or override)

        SessionBookingStatus status;
        Outcome  oracleOutcome;
        bytes32  metricsHash;
        uint48   attestedAt;
        uint48   finalizableAt;

        // dispute
        address challenger;
        uint256 bondAmount;
        uint48   disputedAt;
    }

    struct SessionSlotInput {
        uint48  startTime;
        uint32  durationMins;
        uint32  graceMins;
        uint32  minOverlapMins;
        uint32  cancelCutoffMins;
    }

    struct SessionRequest {
        address hostTarget;   // address(0) = any host (optional mode)
        address guest;
        uint48  windowStart;  // allowed start-time range
        uint48  windowEnd;    // inclusive end of allowed start-time range
        uint32  durationMins;
        uint256 amount;       // escrowed wei (offer)
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

    event Attested(uint256 indexed bookingId, Outcome outcome, bytes32 metricsHash, uint48 finalizableAt);
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

    event Swept(uint256 amount);

    // ---- Auth ----
    modifier onlyOwner()  { require(msg.sender == owner, "NOT_OWNER");  _; }
    modifier onlyOracle() { require(msg.sender == oracle, "NOT_ORACLE"); _; }

    constructor(
        address oracle_,
        address treasury_,
        uint16  feeBps_,
        uint48  challengeWindowSeconds_,
        uint256 challengeBond_,
        uint16  lateCancelPenaltyBps_,
        uint48  noAttestBufferSeconds_,
        uint48  disputeTimeoutSeconds_
    ) {
        require(oracle_ != address(0) && treasury_ != address(0), "BAD_ADDR");
        require(feeBps_ <= 2000, "FEE_TOO_HIGH");
        require(lateCancelPenaltyBps_ <= 10000, "PENALTY_TOO_HIGH");
        require(challengeBond_ > 0, "ZERO_BOND");

        owner    = msg.sender;
        oracle   = oracle_;
        treasury = treasury_;
        feeBps   = feeBps_;
        challengeWindow = challengeWindowSeconds_;
        challengeBond   = challengeBond_;
        lateCancelPenaltyBps = lateCancelPenaltyBps_;
        noAttestBuffer = noAttestBufferSeconds_;
        disputeTimeout = disputeTimeoutSeconds_;
    }

    // ---- Admin ----
    function setOracle(address o) external onlyOwner { require(o != address(0), "BAD_ADDR"); oracle = o; }
    function setTreasury(address t) external onlyOwner { require(t != address(0), "BAD_ADDR"); treasury = t; }
    function setFeeBps(uint16 bps) external onlyOwner { require(bps <= 2000, "FEE_TOO_HIGH"); feeBps = bps; }
    function setChallengeWindow(uint48 s) external onlyOwner { challengeWindow = s; }

    function setChallengeBond(uint256 a) external onlyOwner {
        require(a > 0, "ZERO_BOND");
        challengeBond = a;
    }

    function setLateCancelPenaltyBps(uint16 bps) external onlyOwner { require(bps <= 10000, "PENALTY_TOO_HIGH"); lateCancelPenaltyBps = bps; }
    function setNoAttestBuffer(uint48 s) external onlyOwner { noAttestBuffer = s; }
    function setDisputeTimeout(uint48 s) external onlyOwner { disputeTimeout = s; }
    function transferOwnership(address n) external onlyOwner { require(n != address(0), "BAD_ADDR"); owner = n; }

    // ---- Host pricing ----
    function setHostBasePrice(uint256 priceWei) external {
        require(priceWei > 0, "BAD_PRICE");
        hostBasePrice[msg.sender] = priceWei;
        emit HostBasePriceSet(msg.sender, priceWei);
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

    /// @notice Batch create slots (max 200 per call)
    function createSlots(SessionSlotInput[] calldata inputs) external returns (uint256 firstSlotId) {
        uint256 price = hostBasePrice[msg.sender];
        require(price > 0, "NO_BASE_PRICE");

        uint256 len = inputs.length;
        require(len > 0 && len <= 200, "BAD_BATCH_SIZE");
        firstSlotId = nextSlotId;

        for (uint256 i; i < len; ++i) {
            SessionSlotInput calldata inp = inputs[i];
            _createSlot(msg.sender, inp.startTime, inp.durationMins, price, inp.graceMins, inp.minOverlapMins, inp.cancelCutoffMins);
        }
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

    // ---- Guest: book (at slot snapshotted price) ----
    function book(uint256 slotId) external payable nonReentrant returns (uint256 bookingId) {
        SessionSlot storage s = slots[slotId];
        require(s.status == SessionSlotStatus.Open, "NOT_AVAILABLE");
        require(s.startTime > block.timestamp + 60, "TOO_LATE");
        require(slotToBooking[slotId] == 0, "ALREADY_BOOKED");
        require(msg.value == s.price, "WRONG_AMOUNT");

        bookingId = _bookFromEscrow(slotId, msg.sender, msg.value);

        totalHeld += msg.value;
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

        s.status = SessionSlotStatus.Booked;

        emit SessionBooked(bookingId, slotId, guest, amount);
    }

    // ---- Requests (override offers) ----

    /// @notice Guest creates a paid request for a time window.
    /// @param hostTarget address(0) = any host (optional). If non-zero, only that host can accept.
    /// @dev windowStart/windowEnd define allowed START times. expiry must be <= windowEnd.
    function createRequest(
        address hostTarget,
        uint48 windowStart,
        uint48 windowEnd,
        uint32 durationMins,
        uint48 expiry
    ) external payable nonReentrant returns (uint256 requestId) {
        require(msg.value > 0, "BAD_AMOUNT");
        require(durationMins > 0 && durationMins <= 240, "BAD_DURATION");
        require(windowStart > block.timestamp + 60, "START_TOO_SOON");
        require(windowEnd >= windowStart, "BAD_WINDOW");
        require(expiry > block.timestamp, "EXPIRED");
        require(expiry <= windowEnd, "BAD_EXPIRY");

        // Targeted: if host has a base price set, require offer meets it; if not set, allow (deposit still costs real ETH).
        if (hostTarget != address(0)) {
            uint256 base = hostBasePrice[hostTarget];
            if (base > 0) require(msg.value >= base, "LOW_OFFER");
        }

        requestId = nextRequestId++;
        requests[requestId] = SessionRequest({
            hostTarget: hostTarget,
            guest: msg.sender,
            windowStart: windowStart,
            windowEnd: windowEnd,
            durationMins: durationMins,
            amount: msg.value,
            expiry: expiry,
            status: SessionRequestStatus.Open,
            slotId: 0,
            bookingId: 0,
            host: address(0)
        });

        totalHeld += msg.value;

        emit SessionRequestCreated(
            requestId,
            hostTarget,
            msg.sender,
            windowStart,
            windowEnd,
            durationMins,
            msg.value,
            expiry
        );
    }

    /// @notice Guest cancels an open request (refundable), including after expiry if it was never accepted.
    function cancelRequest(uint256 requestId) external nonReentrant {
        SessionRequest storage r = requests[requestId];
        require(r.status == SessionRequestStatus.Open, "NOT_OPEN");
        require(r.guest == msg.sender, "NOT_GUEST");

        r.status = SessionRequestStatus.Cancelled;

        _sendObligation(r.guest, r.amount);
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

        if (r.hostTarget != address(0)) {
            require(msg.sender == r.hostTarget, "NOT_HOST");
        }

        uint256 base = hostBasePrice[msg.sender];
        if (base > 0) require(r.amount >= base, "LOW_OFFER");

        require(startTime >= r.windowStart && startTime <= r.windowEnd, "BAD_TIME");
        require(startTime > block.timestamp + 60, "START_TOO_SOON");

        // Slot price snapshot:
        // - If host has a base price set, snapshot that (keeps listings consistent with host pricing model).
        // - Otherwise snapshot the request amount (host hasn’t configured a base yet).
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
            s.status = SessionSlotStatus.Open;
            slotToBooking[b.slotId] = 0;

            _sendObligation(b.guest, b.amount);
            emit SessionBookingCancelled(bookingId, Outcome.CancelledByGuest, b.amount, 0, 0, 0);
        } else {
            s.status = SessionSlotStatus.Settled;

            uint256 penalty = (b.amount * lateCancelPenaltyBps) / 10000;
            uint256 hostGross = b.amount - penalty;
            uint256 fee = (hostGross * feeBps) / 10000;
            uint256 hostNet = hostGross - fee;

            if (penalty > 0) _sendObligation(treasury, penalty);
            if (fee > 0)     _sendObligation(treasury, fee);
            if (hostNet > 0) _sendObligation(s.host, hostNet);

            emit SessionBookingCancelled(bookingId, Outcome.CancelledByGuest, 0, penalty, hostNet, fee);
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

        _sendObligation(b.guest, b.amount);
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
        b.attestedAt    = uint48(block.timestamp);
        b.finalizableAt = uint48(block.timestamp + challengeWindow);

        emit Attested(bookingId, outcome, metricsHash, b.finalizableAt);
    }

    // ---- Oracle deadlock escape hatch ----

    /// @notice If oracle never attests, either party can claim refund after end + noAttestBuffer.
    /// Policy: refund guest. Slot -> Cancelled. Booking -> Finalized.
    function claimIfUnattested(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Booked, "NOT_BOOKED");

        SessionSlot storage s = slots[b.slotId];
        require(msg.sender == b.guest || msg.sender == s.host, "NOT_PARTY");

        uint256 end = uint256(s.startTime) + uint256(s.durationMins) * 60;
        require(block.timestamp >= end + uint256(noAttestBuffer), "TOO_EARLY");

        b.status = SessionBookingStatus.Finalized;
        s.status = SessionSlotStatus.Cancelled;

        _sendObligation(b.guest, b.amount);
        emit UnattestedRefunded(bookingId, b.amount);
    }

    // ---- Challenge + dispute ----

    function challenge(uint256 bookingId) external payable nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Attested, "NOT_ATTESTED");
        require(block.timestamp < b.finalizableAt, "WINDOW_OVER");
        require(msg.value == challengeBond, "WRONG_BOND");

        SessionSlot storage s = slots[b.slotId];
        require(msg.sender == b.guest || msg.sender == s.host, "NOT_PARTY");

        b.status     = SessionBookingStatus.Disputed;
        b.challenger = msg.sender;
        b.bondAmount = challengeBond;
        b.disputedAt = uint48(block.timestamp);

        totalHeld += msg.value;

        emit Challenged(bookingId, msg.sender, challengeBond);
    }

    function resolveDispute(uint256 bookingId, Outcome finalOutcome) external onlyOwner nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Disputed, "NOT_DISPUTED");
        require(finalOutcome != Outcome.None, "BAD_OUTCOME");

        bool challengerWins = (finalOutcome != b.oracleOutcome);

        SessionSlot storage s = slots[b.slotId];
        address host = s.host;
        address guest = b.guest;

        if (b.bondAmount > 0) {
            if (challengerWins) {
                _sendObligation(b.challenger, b.bondAmount);
            } else {
                address counterparty = (b.challenger == guest) ? host : guest;
                _sendObligation(counterparty, b.bondAmount);
            }
        }

        b.status        = SessionBookingStatus.Resolved;
        b.oracleOutcome = finalOutcome;
        b.finalizableAt = uint48(block.timestamp);
        b.challenger    = address(0);
        b.bondAmount    = 0;
        b.disputedAt    = 0;

        emit Resolved(bookingId, finalOutcome);
    }

    function finalizeDisputeByTimeout(uint256 bookingId) external nonReentrant {
        SessionBooking storage b = bookings[bookingId];
        require(b.status == SessionBookingStatus.Disputed, "NOT_DISPUTED");
        require(b.disputedAt != 0, "NO_DISPUTE_TIME");
        require(block.timestamp >= uint256(b.disputedAt) + uint256(disputeTimeout), "TOO_EARLY");

        if (b.bondAmount > 0) {
            _sendObligation(b.challenger, b.bondAmount);
        }

        b.status        = SessionBookingStatus.Resolved;
        b.finalizableAt = uint48(block.timestamp);
        b.challenger    = address(0);
        b.bondAmount    = 0;
        b.disputedAt    = 0;

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

        (uint256 hostPaid, uint256 guestRefund, uint256 feePaid) =
            _settle(b.oracleOutcome, s.host, b.guest, b.amount);

        b.status = SessionBookingStatus.Finalized;
        s.status = SessionSlotStatus.Settled;

        emit Finalized(bookingId, b.oracleOutcome, hostPaid, guestRefund, feePaid);
    }

    // ---- Sweep (excess only) ----

    function sweep() external nonReentrant {
        uint256 bal = address(this).balance;
        if (bal <= totalHeld) {
            emit Swept(0);
            return;
        }
        uint256 excess = bal - totalHeld;
        _sendExcess(treasury, excess);
        emit Swept(excess);
    }

    // ---- Internal ----

    function _settle(Outcome o, address host, address guest, uint256 amount)
        internal
        returns (uint256 hostPaid, uint256 guestRefund, uint256 feePaid)
    {
        if (o == Outcome.Completed || o == Outcome.NoShowGuest) {
            feePaid  = (amount * feeBps) / 10000;
            hostPaid = amount - feePaid;

            if (feePaid > 0)  _sendObligation(treasury, feePaid);
            if (hostPaid > 0) _sendObligation(host, hostPaid);
        } else if (o == Outcome.NoShowHost || o == Outcome.CancelledByHost) {
            guestRefund = amount;
            _sendObligation(guest, guestRefund);
        } else if (o == Outcome.CancelledByGuest) {
            feePaid  = (amount * feeBps) / 10000;
            hostPaid = amount - feePaid;

            if (feePaid > 0)  _sendObligation(treasury, feePaid);
            if (hostPaid > 0) _sendObligation(host, hostPaid);
        } else {
            revert("UNKNOWN_OUTCOME");
        }
    }

    /// @dev Sends owed ETH and decrements totalHeld
    function _sendObligation(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAILED");
        totalHeld -= amount;
    }

    /// @dev Sends excess ETH (does not affect totalHeld)
    function _sendExcess(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAILED");
    }

    // ---- Views ----
    function getSlot(uint256 slotId) external view returns (SessionSlot memory) { return slots[slotId]; }
    function getBooking(uint256 bookingId) external view returns (SessionBooking memory) { return bookings[bookingId]; }
    function getRequest(uint256 requestId) external view returns (SessionRequest memory) { return requests[requestId]; }

    receive() external payable {}
}
