// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal interface for the registry
interface IRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function expiries(uint256 tokenId) external view returns (uint256);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/// @title RecordsV1
/// @notice ENS-compatible record storage with expiry-gated reads and versioned storage
/// @dev Works with RegistryV1 - uses node directly, no label-based lookups
contract RecordsV1 is Ownable {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotAuthorized();
    error InvalidAddress();
    error InvalidSignature();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event AddrChanged(bytes32 indexed node, uint256 coinType, bytes addr);
    event TextChanged(bytes32 indexed node, string key, string value);
    event ContenthashChanged(bytes32 indexed node, bytes contenthash);
    event RegistrarUpdated(address newRegistrar);
    event RecordsCleared(bytes32 indexed node, uint64 newVersion);
    event SponsorUpdated(address newSponsor);

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    IRegistry public registrar;

    /// @notice ETH coinType (per SLIP-44)
    uint256 public constant COIN_TYPE_ETH = 60;

    /// @notice node => tokenId (for authorization lookups)
    mapping(bytes32 => uint256) public nodeToTokenId;

    /// @notice Versioned storage - incremented on clearRecords to invalidate old data
    mapping(bytes32 => uint64) public nodeVersion;

    /// @notice Versioned addresses: node => version => coinType => address bytes
    mapping(bytes32 => mapping(uint64 => mapping(uint256 => bytes))) internal addrsV;

    /// @notice Versioned text records: node => version => key => value
    mapping(bytes32 => mapping(uint64 => mapping(string => string))) internal textsV;

    /// @notice Versioned contenthash: node => version => contenthash
    mapping(bytes32 => mapping(uint64 => bytes)) internal contenthashesV;

    /// @notice Nonces for meta-tx replay protection (per node)
    mapping(bytes32 => uint256) public nonces;

    /// @notice Sponsor address allowed to relay meta-txs
    address public sponsor;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _registrar, address _owner, address _sponsor) Ownable(_owner) {
        registrar = IRegistry(_registrar);
        sponsor = _sponsor;
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier authorized(bytes32 node) {
        if (!isAuthorized(node, msg.sender)) revert NotAuthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                          RECORD SETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Set ETH address for a node
    function setAddr(bytes32 node, address addr_) external authorized(node) {
        uint64 v = nodeVersion[node];
        addrsV[node][v][COIN_TYPE_ETH] = abi.encodePacked(addr_);
        emit AddrChanged(node, COIN_TYPE_ETH, abi.encodePacked(addr_));
    }

    /// @notice Set address for a specific coin type
    function setAddr(bytes32 node, uint256 coinType, bytes calldata addr_) external authorized(node) {
        // Validate ETH addresses are exactly 20 bytes
        if (coinType == COIN_TYPE_ETH && addr_.length != 20) revert InvalidAddress();

        uint64 v = nodeVersion[node];
        addrsV[node][v][coinType] = addr_;
        emit AddrChanged(node, coinType, addr_);
    }

    /// @notice Set a text record
    function setText(bytes32 node, string calldata key, string calldata value) external authorized(node) {
        uint64 v = nodeVersion[node];
        textsV[node][v][key] = value;
        emit TextChanged(node, key, value);
    }

    /// @notice Set contenthash (IPFS, Swarm, etc.)
    function setContenthash(bytes32 node, bytes calldata hash) external authorized(node) {
        uint64 v = nodeVersion[node];
        contenthashesV[node][v] = hash;
        emit ContenthashChanged(node, hash);
    }

    /// @notice Batch set multiple records at once
    function setRecords(
        bytes32 node,
        address ethAddr,
        string[] calldata textKeys,
        string[] calldata textValues,
        bytes calldata contenthash_
    ) external authorized(node) {
        require(textKeys.length == textValues.length, "Length mismatch");

        uint64 v = nodeVersion[node];

        if (ethAddr != address(0)) {
            addrsV[node][v][COIN_TYPE_ETH] = abi.encodePacked(ethAddr);
            emit AddrChanged(node, COIN_TYPE_ETH, abi.encodePacked(ethAddr));
        }

        for (uint256 i = 0; i < textKeys.length; i++) {
            textsV[node][v][textKeys[i]] = textValues[i];
            emit TextChanged(node, textKeys[i], textValues[i]);
        }

        if (contenthash_.length > 0) {
            contenthashesV[node][v] = contenthash_;
            emit ContenthashChanged(node, contenthash_);
        }
    }

    /*//////////////////////////////////////////////////////////////
                    RECORD GETTERS (ENS-compatible, expiry-gated)
    //////////////////////////////////////////////////////////////*/

    /// @notice Get ETH address (ENS-compatible signature)
    /// @dev Returns address(0) if expired or not set
    function addr(bytes32 node) external view returns (address) {
        (uint64 v, bool active) = _activeVersion(node);
        if (!active) return address(0);

        bytes memory a = addrsV[node][v][COIN_TYPE_ETH];
        if (a.length < 20) return address(0);
        return address(uint160(bytes20(a)));
    }

    /// @notice Get address for a specific coin type
    /// @dev Returns empty bytes if expired or not set
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory) {
        (uint64 v, bool active) = _activeVersion(node);
        if (!active) return "";
        return addrsV[node][v][coinType];
    }

    /// @notice Get text record
    /// @dev Returns empty string if expired or not set
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        (uint64 v, bool active) = _activeVersion(node);
        if (!active) return "";
        return textsV[node][v][key];
    }

    /// @notice Get contenthash
    /// @dev Returns empty bytes if expired or not set
    function contenthash(bytes32 node) external view returns (bytes memory) {
        (uint64 v, bool active) = _activeVersion(node);
        if (!active) return "";
        return contenthashesV[node][v];
    }

    /*//////////////////////////////////////////////////////////////
                          AUTHORIZATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if an address is authorized to modify a node's records
    function isAuthorized(bytes32 node, address addr_) public view returns (bool) {
        // Contract owner can always modify
        if (addr_ == owner()) return true;

        // Look up the token ID for this node
        uint256 tokenId = nodeToTokenId[node];
        if (tokenId == 0) return false;

        // Check if not expired
        uint256 exp = registrar.expiries(tokenId);
        if (exp == 0 || block.timestamp > exp) return false;

        return _isAuthorizedForToken(tokenId, addr_);
    }

    /// @dev Check if address is owner or approved operator for a token
    function _isAuthorizedForToken(uint256 tokenId, address addr_) internal view returns (bool) {
        address tokenOwner;
        try registrar.ownerOf(tokenId) returns (address o) {
            tokenOwner = o;
        } catch {
            return false;
        }

        // Direct owner
        if (addr_ == tokenOwner) return true;

        // Approved for this specific token
        try registrar.getApproved(tokenId) returns (address approved) {
            if (approved == addr_) return true;
        } catch {}

        // Approved for all tokens of this owner
        try registrar.isApprovedForAll(tokenOwner, addr_) returns (bool isApproved) {
            if (isApproved) return true;
        } catch {}

        return false;
    }

    /// @notice Check if a node is currently active (registered and not expired)
    function _activeVersion(bytes32 node) internal view returns (uint64 v, bool active) {
        uint256 tokenId = nodeToTokenId[node];
        if (tokenId == 0) return (0, false);

        uint256 exp = registrar.expiries(tokenId);
        if (exp == 0 || block.timestamp > exp) return (nodeVersion[node], false);

        return (nodeVersion[node], true);
    }

    /// @notice Check if a node is currently active (for external queries)
    function isActive(bytes32 node) external view returns (bool) {
        (, bool active) = _activeVersion(node);
        return active;
    }

    /*//////////////////////////////////////////////////////////////
                      META-TX (SPONSORED) SETTERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Set a text record on behalf of the name owner (gasless for user)
    /// @dev Sponsor PKP calls this; signature proves the name owner authorized it
    /// Message format: "heaven:records:{node}:{key}:{valueHash}:{nonce}"
    function setTextFor(
        bytes32 node,
        string calldata key,
        string calldata value,
        bytes calldata signature
    ) external {
        require(msg.sender == sponsor || msg.sender == owner(), "Only sponsor");

        uint256 tokenId = nodeToTokenId[node];
        require(tokenId != 0, "Node not registered");

        uint256 exp = registrar.expiries(tokenId);
        require(exp > 0 && block.timestamp <= exp, "Name expired");

        address nameOwner = registrar.ownerOf(tokenId);
        uint256 currentNonce = nonces[node];

        bytes32 valueHash = keccak256(bytes(value));
        bytes32 messageHash = _hashMessage(
            string.concat(
                "heaven:records:",
                _toHexString(node),
                ":",
                key,
                ":",
                _toHexString(valueHash),
                ":",
                _uintToString(currentNonce)
            )
        );

        address recovered = _recover(messageHash, signature);
        if (recovered != nameOwner) revert InvalidSignature();

        nonces[node] = currentNonce + 1;

        uint64 v = nodeVersion[node];
        textsV[node][v][key] = value;
        emit TextChanged(node, key, value);
    }

    /// @notice Batch set text records on behalf of the name owner (gasless)
    /// Message format: "heaven:records-batch:{node}:{payloadHash}:{nonce}"
    function setRecordsFor(
        bytes32 node,
        string[] calldata keys,
        string[] calldata values,
        bytes calldata signature
    ) external {
        require(msg.sender == sponsor || msg.sender == owner(), "Only sponsor");
        require(keys.length == values.length, "Length mismatch");

        uint256 tokenId = nodeToTokenId[node];
        require(tokenId != 0, "Node not registered");

        uint256 exp = registrar.expiries(tokenId);
        require(exp > 0 && block.timestamp <= exp, "Name expired");

        address nameOwner = registrar.ownerOf(tokenId);
        uint256 currentNonce = nonces[node];

        bytes32 payloadHash = keccak256(abi.encode(keys, values));
        bytes32 messageHash = _hashMessage(
            string.concat(
                "heaven:records-batch:",
                _toHexString(node),
                ":",
                _toHexString(payloadHash),
                ":",
                _uintToString(currentNonce)
            )
        );

        address recovered = _recover(messageHash, signature);
        if (recovered != nameOwner) revert InvalidSignature();

        nonces[node] = currentNonce + 1;

        uint64 v = nodeVersion[node];
        for (uint256 i = 0; i < keys.length; i++) {
            textsV[node][v][keys[i]] = values[i];
            emit TextChanged(node, keys[i], values[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                      SIGNATURE HELPERS
    //////////////////////////////////////////////////////////////*/

    function _hashMessage(string memory message) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n",
                _uintToString(bytes(message).length),
                message
            )
        );
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }

    function _toHexString(bytes32 b) internal pure returns (string memory) {
        bytes memory s = new bytes(66);
        s[0] = "0";
        s[1] = "x";
        bytes memory hexChars = "0123456789abcdef";
        for (uint256 i; i < 32; i++) {
            s[2 + i * 2] = hexChars[uint8(b[i]) >> 4];
            s[3 + i * 2] = hexChars[uint8(b[i]) & 0x0f];
        }
        return string(s);
    }

    function _uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (v != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(v % 10)));
            v /= 10;
        }
        return string(buffer);
    }

    /*//////////////////////////////////////////////////////////////
                          REGISTRAR CALLBACKS
    //////////////////////////////////////////////////////////////*/

    /// @notice Register a node->tokenId mapping (called by registrar on mint)
    function registerNode(bytes32 node, uint256 tokenId) external {
        require(msg.sender == address(registrar), "Only registrar");
        nodeToTokenId[node] = tokenId;
    }

    /// @notice Clear all records for a node by incrementing version
    /// @dev Called by registrar on re-registration - new owner gets fresh slate
    function clearRecords(bytes32 node) external {
        require(msg.sender == address(registrar), "Only registrar");
        nodeVersion[node] += 1;
        emit RecordsCleared(node, nodeVersion[node]);
    }

    /*//////////////////////////////////////////////////////////////
                              ADMIN
    //////////////////////////////////////////////////////////////*/

    function setRegistrar(address _registrar) external onlyOwner {
        registrar = IRegistry(_registrar);
        emit RegistrarUpdated(_registrar);
    }

    function setSponsor(address _sponsor) external onlyOwner {
        sponsor = _sponsor;
        emit SponsorUpdated(_sponsor);
    }

    /*//////////////////////////////////////////////////////////////
                          EIP-165 SUPPORT
    //////////////////////////////////////////////////////////////*/

    /// @notice Check interface support (ENS resolver compatibility)
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // EIP-165
            interfaceId == 0x3b3b57de || // addr(bytes32)
            interfaceId == 0xf1cb7e06 || // addr(bytes32,uint256)
            interfaceId == 0x59d1d43c || // text(bytes32,string)
            interfaceId == 0xbc1c58d1;   // contenthash(bytes32)
    }
}
