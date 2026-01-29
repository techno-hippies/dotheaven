// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IRecords {
    function addr(bytes32 node) external view returns (address);
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory);
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function contenthash(bytes32 node) external view returns (bytes memory);
}

/// @title Resolver
/// @notice L1-native ENS resolver for subnames
/// @dev Set as resolver for your parent ENS name (e.g., heaven.hnsbridge.eth)
///      Resolves subnames by reading directly from Records contract
///      Only answers for names under the configured parent domain
contract Resolver is Ownable {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotFound();
    error WrongDomain();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event RecordsUpdated(address indexed records);

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Records contract address
    IRecords public records;

    /// @notice Pre-computed labelhashes for domain validation
    /// @dev For "*.heaven.hnsbridge.eth":
    ///      parentLabelHash = keccak256("heaven")
    ///      rootLabelHash0  = keccak256("hnsbridge")
    ///      rootLabelHash1  = keccak256("eth")
    bytes32 public parentLabelHash;
    bytes32 public rootLabelHash0;
    bytes32 public rootLabelHash1;

    /// @notice ETH coinType (per SLIP-44)
    uint256 public constant COIN_TYPE_ETH = 60;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param _records Address of RecordsV1 contract
    /// @param _parentLabel Parent TLD label (e.g., "heaven")
    /// @param _rootLabel0 First root label (e.g., "hnsbridge")
    /// @param _rootLabel1 Second root label (e.g., "eth")
    /// @param _owner Contract owner
    constructor(
        address _records,
        string memory _parentLabel,
        string memory _rootLabel0,
        string memory _rootLabel1,
        address _owner
    ) Ownable(_owner) {
        records = IRecords(_records);
        parentLabelHash = keccak256(bytes(_parentLabel));
        rootLabelHash0 = keccak256(bytes(_rootLabel0));
        rootLabelHash1 = keccak256(bytes(_rootLabel1));
    }

    /*//////////////////////////////////////////////////////////////
                          ENS RESOLVER INTERFACE
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolve ETH address for a name
    /// @param node The namehash of the full name (e.g., namehash("jordan.heaven.eth"))
    function addr(bytes32 node) external view returns (address) {
        return records.addr(node);
    }

    /// @notice Resolve address for a specific coin type
    /// @param node The namehash of the full name
    /// @param coinType SLIP-44 coin type
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory) {
        return records.addr(node, coinType);
    }

    /// @notice Resolve text record
    /// @param node The namehash of the full name
    /// @param key The text record key
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return records.text(node, key);
    }

    /// @notice Resolve contenthash
    /// @param node The namehash of the full name
    function contenthash(bytes32 node) external view returns (bytes memory) {
        return records.contenthash(node);
    }

    /*//////////////////////////////////////////////////////////////
                    ENSIP-10 WILDCARD RESOLUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolve arbitrary calls via ENSIP-10 wildcard
    /// @dev Called by ENS universal resolver for wildcard subdomains
    /// @param name DNS-encoded name (e.g., "\x06jordan\x06heaven\x09hnsbridge\x03eth\x00")
    /// @param data ABI-encoded resolver call (e.g., addr(bytes32), text(bytes32,string))
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory) {
        // Validate domain and compute namehash
        bytes32 node = _validateAndHash(name);

        // Extract function selector
        bytes4 selector = bytes4(data[:4]);

        // Route to appropriate function
        if (selector == bytes4(keccak256("addr(bytes32)"))) {
            address result = records.addr(node);
            return abi.encode(result);
        }

        if (selector == bytes4(keccak256("addr(bytes32,uint256)"))) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            bytes memory result = records.addr(node, coinType);
            return abi.encode(result);
        }

        if (selector == bytes4(keccak256("text(bytes32,string)"))) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            string memory result = records.text(node, key);
            return abi.encode(result);
        }

        if (selector == bytes4(keccak256("contenthash(bytes32)"))) {
            bytes memory result = records.contenthash(node);
            return abi.encode(result);
        }

        revert NotFound();
    }

    /*//////////////////////////////////////////////////////////////
                          INTERFACE SUPPORT
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if this resolver supports an interface
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x3b3b57de || // addr(bytes32)
            interfaceId == 0xf1cb7e06 || // addr(bytes32,uint256)
            interfaceId == 0x59d1d43c || // text(bytes32,string)
            interfaceId == 0xbc1c58d1 || // contenthash(bytes32)
            interfaceId == 0x9061b923 || // resolve(bytes,bytes) - ENSIP-10
            interfaceId == 0x01ffc9a7;   // supportsInterface
    }

    /*//////////////////////////////////////////////////////////////
                              ADMIN
    //////////////////////////////////////////////////////////////*/

    function setRecords(address _records) external onlyOwner {
        records = IRecords(_records);
        emit RecordsUpdated(_records);
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @notice Validate domain and compute namehash
    /// @dev Ensures name is under our parent domain (e.g., *.heaven.hnsbridge.eth)
    ///      Requires exactly: sublabel.parent.root0.root1
    ///      Example: jordan.heaven.hnsbridge.eth
    function _validateAndHash(bytes calldata name) internal view returns (bytes32) {
        // First pass: count labels
        uint256 labelCount = 0;
        uint256 idx = 0;

        while (idx < name.length) {
            uint8 len = uint8(name[idx]);
            if (len == 0) break;
            labelCount++;
            idx += 1 + len;
        }

        // Need at least 4 labels: sublabel.parent.root0.root1
        if (labelCount < 4) revert WrongDomain();

        // Second pass: collect labelhashes
        bytes32[] memory labelhashes = new bytes32[](labelCount);
        idx = 0;
        for (uint256 k = 0; k < labelCount; k++) {
            uint8 len = uint8(name[idx]);
            bytes calldata label = name[idx + 1 : idx + 1 + len];
            labelhashes[k] = keccak256(label);
            idx += 1 + len;
        }

        // Validate full suffix: parent.root0.root1
        // For "jordan.heaven.hnsbridge.eth":
        //   labelhashes[0] = "jordan"
        //   labelhashes[1] = "heaven"    <- must match parentLabelHash
        //   labelhashes[2] = "hnsbridge" <- must match rootLabelHash0
        //   labelhashes[3] = "eth"       <- must match rootLabelHash1
        if (labelhashes[labelCount - 3] != parentLabelHash) revert WrongDomain();
        if (labelhashes[labelCount - 2] != rootLabelHash0) revert WrongDomain();
        if (labelhashes[labelCount - 1] != rootLabelHash1) revert WrongDomain();

        // Fold right-to-left to compute namehash
        bytes32 node = bytes32(0);
        for (uint256 k = labelCount; k > 0; k--) {
            node = keccak256(abi.encodePacked(node, labelhashes[k - 1]));
        }

        return node;
    }
}
