// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title CanonicalLyricsRegistryV1
/// @notice Operator-managed canonical lyrics refs for track IDs.
/// @dev trackId is the ScrobbleV4 trackId. lyricsHash is SHA-256 over raw UTF-8 bytes fetched from lyricsRef.
contract CanonicalLyricsRegistryV1 {
    // ── Auth ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isOperator;

    error Unauthorized();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert Unauthorized();
        _;
    }

    event OwnerUpdated(address indexed newOwner);
    event OperatorUpdated(address indexed operator, bool active);

    constructor(address operator_) {
        if (operator_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        isOperator[operator_] = true;
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

    struct LyricsEntry {
        string lyricsRef;
        bytes32 lyricsHash;
        uint32 version;
        address submitter;
        uint64 timestamp;
    }

    mapping(bytes32 => LyricsEntry) public lyricsEntries;

    uint256 public constant MAX_LYRICS_REF = 160;

    event LyricsSet(
        bytes32 indexed trackId,
        string lyricsRef,
        bytes32 lyricsHash,
        uint32 version,
        address submitter,
        uint64 timestamp
    );

    event LyricsOverwritten(
        bytes32 indexed trackId,
        string lyricsRef,
        bytes32 lyricsHash,
        uint32 version,
        address submitter,
        uint64 timestamp
    );

    function setLyrics(
        bytes32 trackId,
        string calldata lyricsRef,
        bytes32 lyricsHash
    ) external onlyOperator {
        require(trackId != bytes32(0), "zero trackId");
        require(bytes(lyricsRef).length > 0, "empty ref");
        require(bytes(lyricsRef).length <= MAX_LYRICS_REF, "ref too long");
        require(_isArRef(lyricsRef), "ref must ar://");
        require(lyricsHash != bytes32(0), "zero hash");

        LyricsEntry storage entry = lyricsEntries[trackId];
        require(entry.version == 0, "lyrics already set");

        entry.lyricsRef = lyricsRef;
        entry.lyricsHash = lyricsHash;
        entry.version = 1;
        entry.submitter = msg.sender;
        entry.timestamp = uint64(block.timestamp);

        emit LyricsSet(trackId, lyricsRef, lyricsHash, entry.version, entry.submitter, entry.timestamp);
    }

    function overwriteLyrics(
        bytes32 trackId,
        string calldata lyricsRef,
        bytes32 lyricsHash
    ) external onlyOperator {
        require(trackId != bytes32(0), "zero trackId");
        require(bytes(lyricsRef).length > 0, "empty ref");
        require(bytes(lyricsRef).length <= MAX_LYRICS_REF, "ref too long");
        require(_isArRef(lyricsRef), "ref must ar://");
        require(lyricsHash != bytes32(0), "zero hash");

        LyricsEntry storage entry = lyricsEntries[trackId];
        require(entry.version > 0, "lyrics not set");
        require(entry.version < type(uint32).max, "version overflow");

        entry.lyricsRef = lyricsRef;
        entry.lyricsHash = lyricsHash;
        entry.version = entry.version + 1;
        entry.submitter = msg.sender;
        entry.timestamp = uint64(block.timestamp);

        emit LyricsOverwritten(trackId, lyricsRef, lyricsHash, entry.version, entry.submitter, entry.timestamp);
    }

    function hasLyrics(bytes32 trackId) external view returns (bool) {
        return lyricsEntries[trackId].version > 0;
    }

    function getLyrics(bytes32 trackId)
        external
        view
        returns (string memory lyricsRef, bytes32 lyricsHash, uint32 version, address submitter, uint64 timestamp)
    {
        LyricsEntry storage entry = lyricsEntries[trackId];
        return (entry.lyricsRef, entry.lyricsHash, entry.version, entry.submitter, entry.timestamp);
    }

    function _isArRef(string calldata ref) internal pure returns (bool) {
        bytes memory b = bytes(ref);
        if (b.length < 5) return false;
        return b[0] == "a" && b[1] == "r" && b[2] == ":" && b[3] == "/" && b[4] == "/";
    }
}
