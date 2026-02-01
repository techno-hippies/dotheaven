// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


interface IRecords {
    function registerNode(bytes32 node, uint256 tokenId) external;
    function clearRecords(bytes32 node) external;
}

/// Minimal ENS registry interface (optional but needed for *.eth.limo resolution)
interface IENS {
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external;
}

/// @title RegistryV1
/// @notice Single ERC721 contract managing multiple TLDs under hnsbridge.eth
/// @dev Pattern inspired by hns.id - deterministic tokenId = uint256(node)
///      Payments in native ETH (MegaETH L2)
contract RegistryV1 is ERC721, Ownable, ReentrancyGuard {

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/
    error UnknownTld();
    error AlreadyRegistered();
    error InvalidLabel();
    error LabelTooShort();
    error InsufficientPayment(); // also covers insufficient allowance/balance
    error Expired();
    error Reserved();
    error DurationTooLong();
    error RegistrationsClosed();
    error InvalidMultiplier();
    error NotAuthorized();
    error InvalidAddress();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    event TldConfigured(bytes32 indexed parentNode, string parentName);
    event SubnameRegistered(bytes32 indexed parentNode, uint256 indexed tokenId, string label, address indexed owner, uint256 expiry);
    event SubnameRenewed(uint256 indexed tokenId, uint256 newExpiry);

    event RecordsContractUpdated(address newRecords);
    event EnsConfigUpdated(address ens, address resolver);

    event PriceUpdated(bytes32 indexed parentNode, uint256 newPrice);
    event MinLabelLengthUpdated(bytes32 indexed parentNode, uint8 newMinLength);
    event MaxDurationUpdated(bytes32 indexed parentNode, uint256 newMaxDuration);
    event ReservedUpdated(bytes32 indexed parentNode, bytes32 indexed labelHash, bool isReserved);
    event LengthPricingUpdated(bytes32 indexed parentNode, bool enabled, uint16 mult1, uint16 mult2, uint16 mult3, uint16 mult4);
    event RegistrationsOpenUpdated(bytes32 indexed parentNode, bool open);
    event OperatorUpdated(bytes32 indexed parentNode, address indexed operator, bool allowed);
    event TldAdminUpdated(bytes32 indexed parentNode, address indexed admin);

    event PaymentConfigUpdated(address indexed token, address indexed treasury);
    event PrimaryNameSet(address indexed addr, uint256 indexed tokenId);
    event PrimaryNameCleared(address indexed addr);

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/
    uint256 public constant MIN_DURATION = 365 days;
    uint256 public constant GRACE_PERIOD = 90 days;

    // Angel wing helpers
    string public constant ANGEL_WING_EMOJI = unicode"🪽";
    string public constant ANGEL_WING_PUNYCODE = "xn--119h";

    /*//////////////////////////////////////////////////////////////
                                 PAYMENT (NATIVE ETH)
    //////////////////////////////////////////////////////////////*/
    address public treasury;    // recipient of ETH fees

    /*//////////////////////////////////////////////////////////////
                                 TLD CONFIG
    //////////////////////////////////////////////////////////////*/
    struct TldConfig {
        // Display-only label for the TLD (can be emoji: "🪽", or punycode: "xn--119h")
        string parentName;

        // Price per year in wei
        uint256 pricePerYear;

        // Public policy
        uint8 minLabelLength;
        uint256 maxDuration; // 0 = unlimited
        bool registrationsOpen;

        // Length pricing
        bool lengthPricingEnabled;
        uint16 lengthMult1;
        uint16 lengthMult2;
        uint16 lengthMult3;
        uint16 lengthMult4;

        // Names with length >= freeMinLength are free (0 = disabled, all names use pricePerYear)
        uint8 freeMinLength;

        // Optional per-TLD admin (in addition to contract owner)
        address admin;
    }

    // parentNode (namehash(parentName.rootTld)) => config
    mapping(bytes32 => TldConfig) public tlds;
    mapping(bytes32 => bool) public tldExists;

    // parentNode => labelHash => reserved?
    mapping(bytes32 => mapping(bytes32 => bool)) public reserved;

    // parentNode => operator => allowed?
    mapping(bytes32 => mapping(address => bool)) public operators;

    /*//////////////////////////////////////////////////////////////
                                 NAME STATE
    //////////////////////////////////////////////////////////////*/
    // tokenId = uint256(node)
    mapping(uint256 => bytes32) public tokenIdToParentNode;
    mapping(uint256 => bytes32) public tokenIdToLabelHash;
    mapping(uint256 => string)  public tokenIdToLabel;
    mapping(uint256 => uint256) public expiries;

    /*//////////////////////////////////////////////////////////////
                             REVERSE MAPPING
    //////////////////////////////////////////////////////////////*/
    /// @notice Primary name tokenId for an address. 0 = no primary name.
    mapping(address => uint256) public primaryTokenId;

    /*//////////////////////////////////////////////////////////////
                                 INTEGRATIONS
    //////////////////////////////////////////////////////////////*/
    string public rootTld;      // e.g. "hnsbridge.eth"
    address public records;     // your resolver/records contract (authorizes by NFT ownership)

    // Optional ENS integration so names resolve via *.eth.limo
    IENS public ens;
    address public ensResolver; // typically = records (if it implements ENS resolver interfaces)

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(
        string memory _rootTld,
        address _treasury,
        address _owner
    )
        ERC721("Heaven Names", "HEAVEN")
        Ownable(_owner)
    {
        if (_treasury == address(0)) revert InvalidAddress();
        rootTld = _rootTld;
        treasury = _treasury;
        emit PaymentConfigUpdated(address(0), _treasury);
    }

    /*//////////////////////////////////////////////////////////////
                              ADMIN HELPERS
    //////////////////////////////////////////////////////////////*/
    modifier onlyOwnerOrTldAdmin(bytes32 parentNode) {
        if (msg.sender != owner() && msg.sender != tlds[parentNode].admin) revert NotAuthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONFIG (GLOBAL)
    //////////////////////////////////////////////////////////////*/
    function setRecords(address _records) external onlyOwner {
        records = _records;
        emit RecordsContractUpdated(_records);
    }

    /// Optional: set ENS registry + resolver to make subnames work on ENS gateways (limo).
    function setEns(address _ens, address _ensResolver) external onlyOwner {
        ens = IENS(_ens);
        ensResolver = _ensResolver;
        emit EnsConfigUpdated(_ens, _ensResolver);
    }

    /// Update treasury address
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        emit PaymentConfigUpdated(address(0), _treasury);
    }

    /*//////////////////////////////////////////////////////////////
                              CONFIG (PER-TLD)
    //////////////////////////////////////////////////////////////*/
    function configureTld(
        bytes32 parentNode,
        string calldata parentName,
        uint256 pricePerYear, // wei per year (applies to names shorter than freeMinLength)
        uint8 minLabelLength,
        uint256 maxDuration,
        bool registrationsOpen,
        bool lengthPricingEnabled,
        uint16 mult1,
        uint16 mult2,
        uint16 mult3,
        uint16 mult4,
        uint8 freeMinLength, // names >= this length are free (0 = disabled)
        address admin
    ) external onlyOwner {
        if (lengthPricingEnabled) {
            if (mult1 == 0 || mult2 == 0 || mult3 == 0 || mult4 == 0) revert InvalidMultiplier();
        }

        TldConfig storage cfg = tlds[parentNode];
        cfg.parentName = parentName;
        cfg.pricePerYear = pricePerYear;
        cfg.minLabelLength = minLabelLength;
        cfg.maxDuration = maxDuration;
        cfg.registrationsOpen = registrationsOpen;
        cfg.lengthPricingEnabled = lengthPricingEnabled;
        cfg.lengthMult1 = mult1;
        cfg.lengthMult2 = mult2;
        cfg.lengthMult3 = mult3;
        cfg.lengthMult4 = mult4;
        cfg.freeMinLength = freeMinLength;
        cfg.admin = admin;

        tldExists[parentNode] = true;

        emit TldConfigured(parentNode, parentName);
        emit TldAdminUpdated(parentNode, admin);
    }

    function setTldAdmin(bytes32 parentNode, address admin) external onlyOwner {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].admin = admin;
        emit TldAdminUpdated(parentNode, admin);
    }

    function setPrice(bytes32 parentNode, uint256 pricePerYear) external onlyOwnerOrTldAdmin(parentNode) {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].pricePerYear = pricePerYear;
        emit PriceUpdated(parentNode, pricePerYear);
    }

    function setMinLabelLength(bytes32 parentNode, uint8 minLen) external onlyOwnerOrTldAdmin(parentNode) {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].minLabelLength = minLen;
        emit MinLabelLengthUpdated(parentNode, minLen);
    }

    function setMaxDuration(bytes32 parentNode, uint256 maxDur) external onlyOwnerOrTldAdmin(parentNode) {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].maxDuration = maxDur;
        emit MaxDurationUpdated(parentNode, maxDur);
    }

    function setRegistrationsOpen(bytes32 parentNode, bool open) external onlyOwnerOrTldAdmin(parentNode) {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].registrationsOpen = open;
        emit RegistrationsOpenUpdated(parentNode, open);
    }

    function setLengthPricing(
        bytes32 parentNode,
        bool enabled,
        uint16 mult1,
        uint16 mult2,
        uint16 mult3,
        uint16 mult4
    ) external onlyOwnerOrTldAdmin(parentNode) {
        if (!tldExists[parentNode]) revert UnknownTld();
        if (enabled) {
            if (mult1 == 0 || mult2 == 0 || mult3 == 0 || mult4 == 0) revert InvalidMultiplier();
        }
        TldConfig storage cfg = tlds[parentNode];
        cfg.lengthPricingEnabled = enabled;
        cfg.lengthMult1 = mult1;
        cfg.lengthMult2 = mult2;
        cfg.lengthMult3 = mult3;
        cfg.lengthMult4 = mult4;

        emit LengthPricingUpdated(parentNode, enabled, mult1, mult2, mult3, mult4);
    }

    function setFreeMinLength(bytes32 parentNode, uint8 freeMinLen) external onlyOwnerOrTldAdmin(parentNode) {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].freeMinLength = freeMinLen;
    }

    function setOperator(bytes32 parentNode, address operator, bool allowed)
        external
        onlyOwnerOrTldAdmin(parentNode)
    {
        if (!tldExists[parentNode]) revert UnknownTld();
        operators[parentNode][operator] = allowed;
        emit OperatorUpdated(parentNode, operator, allowed);
    }

    function setReservedHashes(bytes32 parentNode, bytes32[] calldata hashes, bool status)
        external
        onlyOwnerOrTldAdmin(parentNode)
    {
        if (!tldExists[parentNode]) revert UnknownTld();
        for (uint256 i; i < hashes.length; i++) {
            reserved[parentNode][hashes[i]] = status;
            emit ReservedUpdated(parentNode, hashes[i], status);
        }
    }

    /*//////////////////////////////////////////////////////////////
                              REGISTRATION
    //////////////////////////////////////////////////////////////*/
    function register(bytes32 parentNode, string calldata label, uint256 duration)
        external
        payable
        returns (uint256 tokenId)
    {
        return registerFor(parentNode, label, msg.sender, duration);
    }

    function registerFor(bytes32 parentNode, string calldata label, address to, uint256 duration)
        public
        payable
        nonReentrant
        returns (uint256 tokenId)
    {
        TldConfig storage cfg = tlds[parentNode];
        if (!tldExists[parentNode]) revert UnknownTld();

        bytes32 labelHash = keccak256(bytes(label));
        _enforcePublicPolicy(cfg, parentNode, label, labelHash, duration);

        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        tokenId = uint256(node);

        // If exists, require expired + grace, then burn + cleanup
        address curOwner = _ownerOf(tokenId);
        if (curOwner != address(0)) {
            uint256 existingExpiry = expiries[tokenId];
            if (block.timestamp < existingExpiry + GRACE_PERIOD) revert AlreadyRegistered();

            _burn(tokenId);
            _clearToken(tokenId);

            if (records != address(0)) IRecords(records).clearRecords(node);
        }

        uint256 cost = _calculatePrice(cfg, label, duration);
        _collect(cost);

        tokenIdToParentNode[tokenId] = parentNode;
        tokenIdToLabelHash[tokenId] = labelHash;
        tokenIdToLabel[tokenId] = label;
        uint256 expiry = block.timestamp + duration;
        expiries[tokenId] = expiry;

        _safeMint(to, tokenId);

        // Make it resolvable via ENS gateways (optional)
        if (address(ens) != address(0) && ensResolver != address(0)) {
            // Keep ENS owner as this contract (so expiry policy remains enforceable)
            ens.setSubnodeRecord(parentNode, labelHash, address(this), ensResolver, 0);
        }

        if (records != address(0)) IRecords(records).registerNode(node, tokenId);

        _autoSetPrimary(to, tokenId);

        emit SubnameRegistered(parentNode, tokenId, label, to, expiry);
    }

    /// Owner/admin bypass (can mint reserved/short)
    function adminRegister(bytes32 parentNode, string calldata label, address to, uint256 duration)
        external
        nonReentrant
        onlyOwnerOrTldAdmin(parentNode)
        returns (uint256 tokenId)
    {
        if (!tldExists[parentNode]) revert UnknownTld();
        if (!_isValidLabelChars(label)) revert InvalidLabel();
        if (duration < MIN_DURATION) revert InvalidLabel();
        TldConfig storage cfg = tlds[parentNode];
        if (cfg.maxDuration != 0 && duration > cfg.maxDuration) revert DurationTooLong();

        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        tokenId = uint256(node);

        address curOwner = _ownerOf(tokenId);
        if (curOwner != address(0)) {
            uint256 existingExpiry = expiries[tokenId];
            if (block.timestamp < existingExpiry + GRACE_PERIOD) revert AlreadyRegistered();
            _burn(tokenId);
            _clearToken(tokenId);
            if (records != address(0)) IRecords(records).clearRecords(node);
        }

        tokenIdToParentNode[tokenId] = parentNode;
        tokenIdToLabelHash[tokenId] = labelHash;
        tokenIdToLabel[tokenId] = label;
        expiries[tokenId] = block.timestamp + duration;

        _safeMint(to, tokenId);

        if (address(ens) != address(0) && ensResolver != address(0)) {
            ens.setSubnodeRecord(parentNode, labelHash, address(this), ensResolver, 0);
        }
        if (records != address(0)) IRecords(records).registerNode(node, tokenId);

        _autoSetPrimary(to, tokenId);

        emit SubnameRegistered(parentNode, tokenId, label, to, expiries[tokenId]);
    }

    /// Operator path (auction house etc). Operator pays base fee (same as public pricing).
    function operatorRegister(bytes32 parentNode, string calldata label, address to, uint256 duration)
        external
        payable
        nonReentrant
        returns (uint256 tokenId)
    {
        if (!tldExists[parentNode]) revert UnknownTld();
        if (!operators[parentNode][msg.sender]) revert NotAuthorized();
        if (!_isValidLabelChars(label)) revert InvalidLabel();
        if (duration < MIN_DURATION) revert InvalidLabel();

        TldConfig storage cfg = tlds[parentNode];
        if (cfg.maxDuration != 0 && duration > cfg.maxDuration) revert DurationTooLong();

        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        tokenId = uint256(node);

        address curOwner = _ownerOf(tokenId);
        if (curOwner != address(0)) {
            uint256 existingExpiry = expiries[tokenId];
            if (block.timestamp < existingExpiry + GRACE_PERIOD) revert AlreadyRegistered();
            _burn(tokenId);
            _clearToken(tokenId);
            if (records != address(0)) IRecords(records).clearRecords(node);
        }

        uint256 cost = _calculatePrice(cfg, label, duration);
        _collect(cost);

        tokenIdToParentNode[tokenId] = parentNode;
        tokenIdToLabelHash[tokenId] = labelHash;
        tokenIdToLabel[tokenId] = label;
        expiries[tokenId] = block.timestamp + duration;

        _safeMint(to, tokenId);

        if (address(ens) != address(0) && ensResolver != address(0)) {
            ens.setSubnodeRecord(parentNode, labelHash, address(this), ensResolver, 0);
        }
        if (records != address(0)) IRecords(records).registerNode(node, tokenId);

        _autoSetPrimary(to, tokenId);

        emit SubnameRegistered(parentNode, tokenId, label, to, expiries[tokenId]);
    }

    function renew(uint256 tokenId, uint256 duration) external payable nonReentrant {
        bytes32 parentNode = tokenIdToParentNode[tokenId];
        if (!tldExists[parentNode]) revert UnknownTld();

        TldConfig storage cfg = tlds[parentNode];

        if (duration < MIN_DURATION) revert InvalidLabel();
        if (cfg.maxDuration != 0 && duration > cfg.maxDuration) revert DurationTooLong();

        uint256 currentExpiry = expiries[tokenId];
        if (currentExpiry == 0) revert InvalidLabel();
        if (block.timestamp > currentExpiry + GRACE_PERIOD) revert Expired();

        uint256 cost = _calculatePrice(cfg, tokenIdToLabel[tokenId], duration);
        _collect(cost);

        uint256 startFrom = currentExpiry > block.timestamp ? currentExpiry : block.timestamp;
        uint256 newExpiry = startFrom + duration;
        expiries[tokenId] = newExpiry;

        emit SubnameRenewed(tokenId, newExpiry);
    }

    /*//////////////////////////////////////////////////////////////
                           PRIMARY NAME
    //////////////////////////////////////////////////////////////*/
    /// @notice Set your primary name (must own the NFT and it must not be expired)
    function setPrimaryName(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotAuthorized();
        if (block.timestamp > expiries[tokenId]) revert Expired();
        primaryTokenId[msg.sender] = tokenId;
        emit PrimaryNameSet(msg.sender, tokenId);
    }

    /// @notice Clear your primary name
    function clearPrimaryName() external {
        delete primaryTokenId[msg.sender];
        emit PrimaryNameCleared(msg.sender);
    }

    /// @notice Resolve an address to its primary name's node (convenience view)
    /// @return node The namehash node (bytes32(tokenId)), or bytes32(0) if none/expired
    function primaryNode(address addr) external view returns (bytes32) {
        uint256 tid = primaryTokenId[addr];
        if (tid == 0) return bytes32(0);
        // Validate: still owned by addr and not expired
        if (_ownerOf(tid) != addr) return bytes32(0);
        if (block.timestamp > expiries[tid]) return bytes32(0);
        return bytes32(tid);
    }

    /// @notice Resolve an address to its primary name label + parentNode (convenience view)
    function primaryName(address addr) external view returns (string memory label, bytes32 parentNode) {
        uint256 tid = primaryTokenId[addr];
        if (tid == 0) return ("", bytes32(0));
        if (_ownerOf(tid) != addr) return ("", bytes32(0));
        if (block.timestamp > expiries[tid]) return ("", bytes32(0));
        return (tokenIdToLabel[tid], tokenIdToParentNode[tid]);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/
    function fullName(uint256 tokenId) external view returns (string memory) {
        string memory label = tokenIdToLabel[tokenId];
        if (bytes(label).length == 0) return "";
        bytes32 parentNode = tokenIdToParentNode[tokenId];
        return string.concat(label, ".", tlds[parentNode].parentName, ".", rootTld);
    }

    function available(bytes32 parentNode, string calldata label) external view returns (bool) {
        if (!tldExists[parentNode]) return false;
        TldConfig storage cfg = tlds[parentNode];

        if (!cfg.registrationsOpen) return false;
        if (!_isValidLabelChars(label)) return false;
        if (bytes(label).length < cfg.minLabelLength) return false;
        if (reserved[parentNode][keccak256(bytes(label))]) return false;

        bytes32 labelHash = keccak256(bytes(label));
        uint256 tokenId = uint256(keccak256(abi.encodePacked(parentNode, labelHash)));

        address curOwner = _ownerOf(tokenId);
        if (curOwner == address(0)) return true;
        return block.timestamp >= expiries[tokenId] + GRACE_PERIOD;
    }

    /// @notice Check if a label is reserved for a TLD
    function isReserved(bytes32 parentNode, string calldata label) external view returns (bool) {
        return reserved[parentNode][keccak256(bytes(label))];
    }

    /// @notice Get registration price for a label under a TLD (wei)
    function price(bytes32 parentNode, string calldata label, uint256 duration) external view returns (uint256) {
        if (!tldExists[parentNode]) revert UnknownTld();
        TldConfig storage cfg = tlds[parentNode];
        if (!_isValidLabelChars(label)) revert InvalidLabel();
        if (duration < MIN_DURATION) revert InvalidLabel();
        if (cfg.maxDuration != 0 && duration > cfg.maxDuration) revert DurationTooLong();
        return _calculatePrice(cfg, label, duration);
    }

    function nodeOf(uint256 tokenId) external pure returns (bytes32) {
        return bytes32(tokenId);
    }

    /// @notice Get TLD config (for UI)
    function getTldConfig(bytes32 parentNode) external view returns (
        string memory parentName,
        uint256 pricePerYear,
        uint8 minLabelLength,
        uint256 maxDuration,
        bool registrationsOpen,
        bool lengthPricingEnabled,
        uint16 lengthMult1,
        uint16 lengthMult2,
        uint16 lengthMult3,
        uint16 lengthMult4,
        uint8 freeMinLength
    ) {
        TldConfig storage cfg = tlds[parentNode];
        return (
            cfg.parentName,
            cfg.pricePerYear,
            cfg.minLabelLength,
            cfg.maxDuration,
            cfg.registrationsOpen,
            cfg.lengthPricingEnabled,
            cfg.lengthMult1,
            cfg.lengthMult2,
            cfg.lengthMult3,
            cfg.lengthMult4,
            cfg.freeMinLength
        );
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL
    //////////////////////////////////////////////////////////////*/
    function _collect(uint256 amount) internal {
        if (amount == 0) {
            if (msg.value > 0) revert InsufficientPayment(); // reject accidental ETH on free registrations
            return;
        }
        if (msg.value < amount) revert InsufficientPayment();
        (bool ok,) = treasury.call{value: amount}("");
        require(ok, "ETH transfer failed");
        // Refund excess
        uint256 excess = msg.value - amount;
        if (excess > 0) {
            (bool refundOk,) = msg.sender.call{value: excess}("");
            require(refundOk, "Refund failed");
        }
    }

    /// @dev Auto-set primary if current primary is unset or invalid (expired/not owned)
    function _autoSetPrimary(address to, uint256 tokenId) internal {
        uint256 current = primaryTokenId[to];
        if (current != 0 && _ownerOf(current) == to && block.timestamp <= expiries[current]) {
            return; // current primary is still valid
        }
        primaryTokenId[to] = tokenId;
        emit PrimaryNameSet(to, tokenId);
    }

    function _clearToken(uint256 tokenId) internal {
        // Clear primary name if this was the owner's primary
        address prevOwner = _ownerOf(tokenId);
        if (prevOwner != address(0) && primaryTokenId[prevOwner] == tokenId) {
            delete primaryTokenId[prevOwner];
            emit PrimaryNameCleared(prevOwner);
        }

        delete tokenIdToParentNode[tokenId];
        delete tokenIdToLabelHash[tokenId];
        delete tokenIdToLabel[tokenId];
        delete expiries[tokenId];
    }

    function _multForLength(TldConfig storage cfg, uint256 len) internal view returns (uint256) {
        if (!cfg.lengthPricingEnabled) return 1;
        if (len == 1) return cfg.lengthMult1;
        if (len == 2) return cfg.lengthMult2;
        if (len == 3) return cfg.lengthMult3;
        if (len == 4) return cfg.lengthMult4;
        // 5+ chars: standard pricing (multiplier = 1)
        return 1;
    }

    function _calculatePrice(TldConfig storage cfg, string memory label, uint256 duration) internal view returns (uint256) {
        uint256 len = bytes(label).length;
        // Names at or above freeMinLength are free
        if (cfg.freeMinLength > 0 && len >= cfg.freeMinLength) return 0;
        uint256 mult = _multForLength(cfg, len);
        return (cfg.pricePerYear * mult * duration) / 365 days;
    }

    function _enforcePublicPolicy(
        TldConfig storage cfg,
        bytes32 parentNode,
        string calldata label,
        bytes32 labelHash,
        uint256 duration
    ) internal view {
        if (!cfg.registrationsOpen) revert RegistrationsClosed();
        if (!_isValidLabelChars(label)) revert InvalidLabel();

        uint256 len = bytes(label).length;
        if (len < cfg.minLabelLength) revert LabelTooShort();

        if (duration < MIN_DURATION) revert InvalidLabel();
        if (cfg.maxDuration != 0 && duration > cfg.maxDuration) revert DurationTooLong();

        if (reserved[parentNode][labelHash]) revert Reserved();
    }

    // Keep ASCII-only for SLD labels (same as your V2). Emoji complexity stays out of SLDs.
    function _isValidLabelChars(string calldata label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        if (b.length == 0 || b.length > 63) return false;

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isLower = c >= 0x61 && c <= 0x7a;
            bool isDigit = c >= 0x30 && c <= 0x39;
            bool isHyphen = c == 0x2d;

            if (!isLower && !isDigit && !isHyphen) return false;
            if (isHyphen && (i == 0 || i == b.length - 1)) return false;
        }
        return true;
    }

    // Block transfers when expired + clear primary name on transfer
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            if (block.timestamp > expiries[tokenId]) revert Expired();
        }

        // Clear sender's primary name if they're transferring it away
        if (from != address(0) && primaryTokenId[from] == tokenId) {
            delete primaryTokenId[from];
            emit PrimaryNameCleared(from);
        }

        return super._update(to, tokenId, auth);
    }

    /*//////////////////////////////////////////////////////////////
                              RECOVERY / WITHDRAW
    //////////////////////////////////////////////////////////////*/
    function withdrawETH() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }


    receive() external payable {}
}
