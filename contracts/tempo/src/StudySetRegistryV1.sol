// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IERC20Like {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title StudySetRegistryV1
/// @notice First-write-wins registry for per-track study sets with prepaid onchain credits.
/// @dev studySetKey = keccak256(abi.encode(trackId, langHash, version))
contract StudySetRegistryV1 {
    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isOperator;

    error Unauthorized();
    error ZeroAddress();
    error Reentrancy();

    uint256 private unlocked = 1;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    IERC20Like public immutable paymentToken;
    address public immutable treasury;

    /// @dev USD 0.10 with 6 decimals (USDC-style base units).
    uint256 public constant CREDIT_PRICE = 100_000;
    uint256 public constant CREDITS_PER_FULFILL = 1;

    mapping(address => uint256) public credits;

    event OwnerUpdated(address indexed newOwner);
    event OperatorUpdated(address indexed operator, bool active);
    event CreditsPurchased(address indexed user, uint256 creditsAdded, uint256 totalCost, uint256 newBalance);
    event CreditsConsumed(
        address indexed user, bytes32 indexed studySetKey, uint256 creditsUsed, uint256 newBalance
    );

    constructor(address operator_, address paymentToken_, address treasury_) {
        if (operator_ == address(0)) revert ZeroAddress();
        if (paymentToken_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        isOperator[operator_] = true;
        paymentToken = IERC20Like(paymentToken_);
        treasury = treasury_;
        emit OwnerUpdated(msg.sender);
        emit OperatorUpdated(operator_, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function setOperator(address operator_, bool active) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        isOperator[operator_] = active;
        emit OperatorUpdated(operator_, active);
    }

    // ── Registry ─────────────────────────────────────────────────────────

    struct StudySetEntry {
        string studySetRef;
        bytes32 studySetHash;
        address submitter;
        uint64 createdAt;
        bool exists;
    }

    mapping(bytes32 => StudySetEntry) public studySets;
    mapping(bytes32 => address) public studySetPaidBy;

    uint256 public constant MAX_STUDY_SET_REF = 160;

    event StudySetRegistered(
        bytes32 indexed studySetKey,
        bytes32 indexed trackId,
        bytes32 indexed langHash,
        uint8 version,
        string studySetRef,
        bytes32 studySetHash,
        address submitter,
        address paidBy
    );

    function hashLang(string calldata lang) public pure returns (bytes32) {
        return keccak256(bytes(lang));
    }

    function computeStudySetKey(bytes32 trackId, bytes32 langHash, uint8 version) public pure returns (bytes32) {
        return keccak256(abi.encode(trackId, langHash, version));
    }

    /// @notice Buy prepaid study credits. One fulfilled study set consumes one credit.
    function buyCredits(uint256 creditCount) external nonReentrant {
        require(creditCount > 0, "zero credits");

        uint256 totalCost = creditCount * CREDIT_PRICE;
        require(totalCost / CREDIT_PRICE == creditCount, "overflow");

        bool ok = paymentToken.transferFrom(msg.sender, treasury, totalCost);
        require(ok, "payment failed");

        uint256 newBalance = credits[msg.sender] + creditCount;
        require(newBalance >= credits[msg.sender], "overflow");
        credits[msg.sender] = newBalance;

        emit CreditsPurchased(msg.sender, creditCount, totalCost, newBalance);
    }

    /// @notice Atomically consume one prepaid credit and register the canonical study set.
    function fulfillFromCredit(
        address user,
        bytes32 trackId,
        string calldata lang,
        uint8 version,
        string calldata studySetRef,
        bytes32 studySetHash
    ) external onlyOperator returns (bytes32 studySetKey) {
        require(user != address(0), "zero user");
        require(trackId != bytes32(0), "zero trackId");
        require(bytes(lang).length > 0, "empty lang");
        require(version > 0, "zero version");
        require(bytes(studySetRef).length > 0, "empty ref");
        require(bytes(studySetRef).length <= MAX_STUDY_SET_REF, "ref too long");
        require(studySetHash != bytes32(0), "zero hash");
        require(credits[user] >= CREDITS_PER_FULFILL, "insufficient credits");

        bytes32 langHash = hashLang(lang);
        studySetKey = computeStudySetKey(trackId, langHash, version);

        StudySetEntry storage entry = studySets[studySetKey];
        require(!entry.exists, "study set already set");

        unchecked {
            credits[user] = credits[user] - CREDITS_PER_FULFILL;
        }

        entry.studySetRef = studySetRef;
        entry.studySetHash = studySetHash;
        entry.submitter = msg.sender;
        studySetPaidBy[studySetKey] = user;
        entry.createdAt = uint64(block.timestamp);
        entry.exists = true;

        emit CreditsConsumed(user, studySetKey, CREDITS_PER_FULFILL, credits[user]);
        emit StudySetRegistered(studySetKey, trackId, langHash, version, studySetRef, studySetHash, msg.sender, user);
    }

    function getStudySet(
        bytes32 trackId,
        string calldata lang,
        uint8 version
    )
        external
        view
        returns (
            string memory studySetRef,
            bytes32 studySetHash,
            address submitter,
            uint64 createdAt,
            bool exists
        )
    {
        bytes32 key = computeStudySetKey(trackId, hashLang(lang), version);
        StudySetEntry storage entry = studySets[key];
        return (entry.studySetRef, entry.studySetHash, entry.submitter, entry.createdAt, entry.exists);
    }
}
