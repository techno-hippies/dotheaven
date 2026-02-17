// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRecords {
    function registerNode(bytes32 node, uint256 tokenId) external;
    function clearRecords(bytes32 node) external;
}

/// @title RegistryV1
/// @notice Lean ERC721 registry for names under hnsbridge.eth
contract RegistryV1 is ERC721, Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/
    error UnknownTld();
    error AlreadyRegistered();
    error InvalidLabel();
    error LabelTooShort();
    error InsufficientPayment();
    error Expired();
    error Reserved();
    error DurationTooLong();
    error RegistrationsClosed();
    error NotAuthorized();
    error InvalidAddress();
    error TransferFailed();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    event TldConfigured(bytes32 indexed parentNode);
    event SubnameRegistered(
        bytes32 indexed parentNode,
        uint256 indexed tokenId,
        string label,
        address indexed owner,
        uint256 expiry
    );
    event SubnameRenewed(uint256 indexed tokenId, uint256 newExpiry);

    event RecordsContractUpdated(address newRecords);
    event PriceUpdated(bytes32 indexed parentNode, uint256 newPrice);
    event MinLabelLengthUpdated(bytes32 indexed parentNode, uint8 newMinLength);
    event MaxDurationUpdated(bytes32 indexed parentNode, uint256 newMaxDuration);
    event ReservedUpdated(bytes32 indexed parentNode, bytes32 indexed labelHash, bool isReserved);
    event RegistrationsOpenUpdated(bytes32 indexed parentNode, bool open);

    event PaymentConfigUpdated(address indexed token, address indexed treasury);
    event PrimaryNameSet(address indexed addr, uint256 indexed tokenId);
    event PrimaryNameCleared(address indexed addr);

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/
    uint256 public constant MIN_DURATION = 365 days;
    uint256 public constant GRACE_PERIOD = 90 days;

    /*//////////////////////////////////////////////////////////////
                                 PAYMENT
    //////////////////////////////////////////////////////////////*/
    address public treasury;

    /*//////////////////////////////////////////////////////////////
                                 TLD CONFIG
    //////////////////////////////////////////////////////////////*/
    struct TldConfig {
        uint256 pricePerYear;
        uint8 minLabelLength;
        uint256 maxDuration; // 0 = unlimited
        bool registrationsOpen;
    }

    mapping(bytes32 => TldConfig) public tlds;
    mapping(bytes32 => bool) public tldExists;

    // parentNode => labelHash => reserved?
    mapping(bytes32 => mapping(bytes32 => bool)) public reserved;

    /*//////////////////////////////////////////////////////////////
                                 NAME STATE
    //////////////////////////////////////////////////////////////*/
    mapping(uint256 => bytes32) public tokenIdToParentNode;
    mapping(uint256 => string) public tokenIdToLabel;
    mapping(uint256 => uint256) public expiries;

    /*//////////////////////////////////////////////////////////////
                             REVERSE MAPPING
    //////////////////////////////////////////////////////////////*/
    mapping(address => uint256) public primaryTokenId;

    /*//////////////////////////////////////////////////////////////
                                 INTEGRATIONS
    //////////////////////////////////////////////////////////////*/
    address public records;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(address _treasury, address _owner)
        ERC721("Heaven Names", "HEAVEN")
        Ownable(_owner)
    {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        emit PaymentConfigUpdated(address(0), _treasury);
    }

    /*//////////////////////////////////////////////////////////////
                              CONFIG (GLOBAL)
    //////////////////////////////////////////////////////////////*/
    function setRecords(address _records) external onlyOwner {
        records = _records;
        emit RecordsContractUpdated(_records);
    }

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
        uint256 pricePerYear,
        uint8 minLabelLength,
        uint256 maxDuration,
        bool registrationsOpen
    ) external onlyOwner {
        TldConfig storage cfg = tlds[parentNode];
        cfg.pricePerYear = pricePerYear;
        cfg.minLabelLength = minLabelLength;
        cfg.maxDuration = maxDuration;
        cfg.registrationsOpen = registrationsOpen;

        tldExists[parentNode] = true;
        emit TldConfigured(parentNode);
    }

    function setPrice(bytes32 parentNode, uint256 pricePerYear) external onlyOwner {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].pricePerYear = pricePerYear;
        emit PriceUpdated(parentNode, pricePerYear);
    }

    function setMinLabelLength(bytes32 parentNode, uint8 minLen) external onlyOwner {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].minLabelLength = minLen;
        emit MinLabelLengthUpdated(parentNode, minLen);
    }

    function setMaxDuration(bytes32 parentNode, uint256 maxDur) external onlyOwner {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].maxDuration = maxDur;
        emit MaxDurationUpdated(parentNode, maxDur);
    }

    function setRegistrationsOpen(bytes32 parentNode, bool open) external onlyOwner {
        if (!tldExists[parentNode]) revert UnknownTld();
        tlds[parentNode].registrationsOpen = open;
        emit RegistrationsOpenUpdated(parentNode, open);
    }

    function setReservedHashes(bytes32 parentNode, bytes32[] calldata hashes, bool status)
        external
        onlyOwner
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
        if (!tldExists[parentNode]) revert UnknownTld();
        TldConfig storage cfg = tlds[parentNode];

        bytes32 labelHash = keccak256(bytes(label));
        _enforcePublicPolicy(cfg, parentNode, label, labelHash, duration);

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

        uint256 cost = _calculatePrice(cfg, duration);
        _collect(cost);

        tokenIdToParentNode[tokenId] = parentNode;
        tokenIdToLabel[tokenId] = label;
        uint256 expiry = block.timestamp + duration;
        expiries[tokenId] = expiry;

        _safeMint(to, tokenId);

        if (records != address(0)) IRecords(records).registerNode(node, tokenId);

        _autoSetPrimary(to, tokenId);

        emit SubnameRegistered(parentNode, tokenId, label, to, expiry);
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

        uint256 cost = _calculatePrice(cfg, duration);
        _collect(cost);

        uint256 startFrom = currentExpiry > block.timestamp ? currentExpiry : block.timestamp;
        uint256 newExpiry = startFrom + duration;
        expiries[tokenId] = newExpiry;

        emit SubnameRenewed(tokenId, newExpiry);
    }

    /*//////////////////////////////////////////////////////////////
                           PRIMARY NAME
    //////////////////////////////////////////////////////////////*/
    function setPrimaryName(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotAuthorized();
        if (block.timestamp > expiries[tokenId]) revert Expired();
        primaryTokenId[msg.sender] = tokenId;
        emit PrimaryNameSet(msg.sender, tokenId);
    }

    function clearPrimaryName() external {
        delete primaryTokenId[msg.sender];
        emit PrimaryNameCleared(msg.sender);
    }

    function primaryNode(address addr) external view returns (bytes32) {
        uint256 tid = primaryTokenId[addr];
        if (tid == 0) return bytes32(0);
        if (_ownerOf(tid) != addr) return bytes32(0);
        if (block.timestamp > expiries[tid]) return bytes32(0);
        return bytes32(tid);
    }

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

    function isReserved(bytes32 parentNode, string calldata label) external view returns (bool) {
        return reserved[parentNode][keccak256(bytes(label))];
    }

    function price(bytes32 parentNode, string calldata label, uint256 duration) external view returns (uint256) {
        if (!tldExists[parentNode]) revert UnknownTld();
        TldConfig storage cfg = tlds[parentNode];
        if (!_isValidLabelChars(label)) revert InvalidLabel();
        if (duration < MIN_DURATION) revert InvalidLabel();
        if (cfg.maxDuration != 0 && duration > cfg.maxDuration) revert DurationTooLong();
        return _calculatePrice(cfg, duration);
    }

    function nodeOf(uint256 tokenId) external pure returns (bytes32) {
        return bytes32(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL
    //////////////////////////////////////////////////////////////*/
    function _collect(uint256 amount) internal {
        if (amount == 0) {
            if (msg.value > 0) revert InsufficientPayment();
            return;
        }
        if (msg.value != amount) revert InsufficientPayment();

        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _autoSetPrimary(address to, uint256 tokenId) internal {
        uint256 current = primaryTokenId[to];
        if (current != 0 && _ownerOf(current) == to && block.timestamp <= expiries[current]) {
            return;
        }
        primaryTokenId[to] = tokenId;
        emit PrimaryNameSet(to, tokenId);
    }

    function _clearToken(uint256 tokenId) internal {
        delete tokenIdToParentNode[tokenId];
        delete tokenIdToLabel[tokenId];
        delete expiries[tokenId];
    }

    function _calculatePrice(TldConfig storage cfg, uint256 duration) internal view returns (uint256) {
        return (cfg.pricePerYear * duration) / 365 days;
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

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            if (block.timestamp > expiries[tokenId]) revert Expired();
        }

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
        if (!ok) revert TransferFailed();
    }

    receive() external payable {}
}
