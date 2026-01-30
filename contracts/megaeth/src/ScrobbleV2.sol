// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ScrobbleV2
/// @notice Fully on-chain scrobble storage on MegaETH.
///   Two identifier paths + metadata fallback:
///   1. MBID (MusicBrainz recording UUID, 16 bytes) — most tracks
///   2. ipId (Story Protocol IP Account address, 20 bytes) — Heaven-minted tracks
///   3. Metadata fallback (title/artist/album strings) — unidentified tracks
///   Sponsor-gated: only the authorized sponsor PKP can submit.
contract ScrobbleV2 {
    // ── Types ────────────────────────────────────────────────────────────

    uint8 public constant KIND_MBID = 1;
    uint8 public constant KIND_IPID = 2;

    /// @notice Packed identifier scrobble (1 slot: 20 + 8 + 1 = 29 bytes)
    struct IdScrobble {
        bytes20   id;        // MBID (bytes16 left-aligned) or ipId (address cast)
        uint64    timestamp;
        uint8     kind;      // KIND_MBID or KIND_IPID
    }

    /// @notice Metadata scrobble for unidentified tracks
    struct MetaScrobble {
        string  title;
        string  artist;
        string  album;
        uint64  timestamp;
    }

    // ── Storage ──────────────────────────────────────────────────────────

    address public owner;
    address public sponsor;

    mapping(address => IdScrobble[])   public idScrobbles;
    mapping(address => MetaScrobble[]) public metaScrobbles;

    // ── Events ───────────────────────────────────────────────────────────

    event SponsorUpdated(address indexed newSponsor);
    event OwnerUpdated(address indexed newOwner);

    event ScrobbleId(
        address indexed user,
        uint256 indexed scrobbleId,
        bytes20 id,
        uint8   kind,
        uint64  timestamp
    );

    event ScrobbleMeta(
        address indexed user,
        uint256 indexed scrobbleId,
        bytes32 metaHash,
        uint64  timestamp
    );

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlySponsor() {
        require(msg.sender == sponsor, "unauthorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address _sponsor) {
        require(_sponsor != address(0), "zero sponsor");
        owner = msg.sender;
        sponsor = _sponsor;
        emit OwnerUpdated(msg.sender);
        emit SponsorUpdated(_sponsor);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    function setSponsor(address _sponsor) external onlyOwner {
        require(_sponsor != address(0), "zero sponsor");
        sponsor = _sponsor;
        emit SponsorUpdated(_sponsor);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    // ── MBID Batch ───────────────────────────────────────────────────────

    /// @notice Submit a batch of MusicBrainz recording scrobbles
    /// @param user       User's wallet address
    /// @param mbids      Array of MusicBrainz recording UUIDs (16 bytes each)
    /// @param timestamps Array of play timestamps
    function submitBatchMBID(
        address    user,
        bytes16[]  calldata mbids,
        uint64[]   calldata timestamps
    ) external onlySponsor {
        uint256 len = mbids.length;
        require(len == timestamps.length, "length mismatch");
        require(len <= 200, "batch too large");
        require(user != address(0), "zero user");

        IdScrobble[] storage arr = idScrobbles[user];
        uint256 baseId = arr.length;

        for (uint256 i; i < len; ) {
            require(mbids[i] != bytes16(0), "zero mbid");

            bytes20 packed = bytes20(mbids[i]);
            arr.push(IdScrobble({
                id:        packed,
                timestamp: timestamps[i],
                kind:      KIND_MBID
            }));

            emit ScrobbleId(user, baseId + i, packed, KIND_MBID, timestamps[i]);
            unchecked { ++i; }
        }
    }

    // ── ipId Batch ───────────────────────────────────────────────────────

    /// @notice Submit a batch of Story Protocol IP scrobbles
    /// @param user       User's wallet address
    /// @param ipIds      Array of Story Protocol IP Account addresses
    /// @param timestamps Array of play timestamps
    function submitBatchIPId(
        address    user,
        address[]  calldata ipIds,
        uint64[]   calldata timestamps
    ) external onlySponsor {
        uint256 len = ipIds.length;
        require(len == timestamps.length, "length mismatch");
        require(len <= 200, "batch too large");
        require(user != address(0), "zero user");

        IdScrobble[] storage arr = idScrobbles[user];
        uint256 baseId = arr.length;

        for (uint256 i; i < len; ) {
            require(ipIds[i] != address(0), "zero ipId");

            bytes20 packed = bytes20(ipIds[i]);
            arr.push(IdScrobble({
                id:        packed,
                timestamp: timestamps[i],
                kind:      KIND_IPID
            }));

            emit ScrobbleId(user, baseId + i, packed, KIND_IPID, timestamps[i]);
            unchecked { ++i; }
        }
    }

    // ── Metadata Batch (fallback) ────────────────────────────────────────

    /// @notice Submit a batch of metadata-based scrobbles (no MBID/ipId)
    /// @param user       User's wallet address
    /// @param titles     Array of track titles (max 128 bytes each)
    /// @param artists    Array of artist names (max 128 bytes each)
    /// @param albums     Array of album names (max 128 bytes each)
    /// @param timestamps Array of play timestamps
    function submitBatchMeta(
        address  user,
        string[] calldata titles,
        string[] calldata artists,
        string[] calldata albums,
        uint64[] calldata timestamps
    ) external onlySponsor {
        uint256 len = titles.length;
        require(
            len == artists.length &&
            len == albums.length &&
            len == timestamps.length,
            "length mismatch"
        );
        require(len <= 50, "batch too large");
        require(user != address(0), "zero user");

        MetaScrobble[] storage arr = metaScrobbles[user];
        uint256 baseId = arr.length;

        for (uint256 i; i < len; ) {
            require(bytes(titles[i]).length <= 128, "title too long");
            require(bytes(artists[i]).length <= 128, "artist too long");
            require(bytes(albums[i]).length <= 128, "album too long");

            arr.push(MetaScrobble({
                title:     titles[i],
                artist:    artists[i],
                album:     albums[i],
                timestamp: timestamps[i]
            }));

            bytes32 metaHash = keccak256(abi.encode(titles[i], artists[i], albums[i]));
            emit ScrobbleMeta(user, baseId + i, metaHash, timestamps[i]);
            unchecked { ++i; }
        }
    }

    // ── Encoding Helpers ──────────────────────────────────────────────────

    function packMBID(bytes16 mbid) external pure returns (bytes20) {
        return bytes20(mbid);
    }

    function packIPId(address ipId) external pure returns (bytes20) {
        return bytes20(ipId);
    }

    function unpackMBID(bytes20 id) external pure returns (bytes16) {
        return bytes16(id);
    }

    function unpackIPId(bytes20 id) external pure returns (address) {
        return address(uint160(uint256(bytes32(id)) >> 96));
    }

    // ── Queries ──────────────────────────────────────────────────────────

    function idScrobbleCount(address user) external view returns (uint256) {
        return idScrobbles[user].length;
    }

    function metaScrobbleCount(address user) external view returns (uint256) {
        return metaScrobbles[user].length;
    }

    function getIdScrobbles(address user, uint256 offset, uint256 limit)
        external view returns (IdScrobble[] memory)
    {
        uint256 total = idScrobbles[user].length;
        if (offset >= total) return new IdScrobble[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;
        IdScrobble[] memory result = new IdScrobble[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = idScrobbles[user][offset + i];
        }
        return result;
    }

    function getMetaScrobbles(address user, uint256 offset, uint256 limit)
        external view returns (MetaScrobble[] memory)
    {
        uint256 total = metaScrobbles[user].length;
        if (offset >= total) return new MetaScrobble[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;
        MetaScrobble[] memory result = new MetaScrobble[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = metaScrobbles[user][offset + i];
        }
        return result;
    }
}
