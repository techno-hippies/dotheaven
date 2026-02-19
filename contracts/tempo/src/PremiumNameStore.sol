// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRegistryV2Operator {
    function operatorRegister(bytes32 parentNode, string calldata label, address to, uint256 duration)
        external
        returns (uint256 tokenId);
}

interface IERC20Like {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title PremiumNameStore
/// @notice Fixed-price storefront for premium names paid in TIP-20 tokens (e.g. AlphaUSD).
/// @dev Requires this contract to be set as operator on RegistryV2 for each TLD it should sell.
contract PremiumNameStore is Ownable, ReentrancyGuard {
    error InvalidAddress();
    error InvalidLabel();
    error InvalidArrayLength();
    error ListingNotActive();
    error InvalidDuration();
    error PaymentFailed();

    struct Listing {
        uint256 price;
        uint256 duration;
        bool enabled;
    }

    IRegistryV2Operator public immutable registry;
    IERC20Like public immutable paymentToken;
    address public treasury;

    // parentNode => labelHash => listing
    mapping(bytes32 => mapping(bytes32 => Listing)) public listings;

    event TreasuryUpdated(address indexed treasury);
    event ListingUpdated(
        bytes32 indexed parentNode,
        bytes32 indexed labelHash,
        uint256 price,
        uint256 duration,
        bool enabled
    );
    event Purchased(
        bytes32 indexed parentNode,
        bytes32 indexed labelHash,
        string label,
        address buyer,
        address recipient,
        uint256 price,
        uint256 duration,
        uint256 tokenId
    );

    constructor(address registry_, address paymentToken_, address treasury_, address owner_) Ownable(owner_) {
        if (registry_ == address(0) || paymentToken_ == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }
        registry = IRegistryV2Operator(registry_);
        paymentToken = IERC20Like(paymentToken_);
        treasury = treasury_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setListing(bytes32 parentNode, string calldata label, uint256 price, uint256 duration, bool enabled)
        external
        onlyOwner
    {
        if (!_isValidLabelChars(label)) revert InvalidLabel();
        _setListing(parentNode, keccak256(bytes(label)), price, duration, enabled);
    }

    function setListingHash(bytes32 parentNode, bytes32 labelHash, uint256 price, uint256 duration, bool enabled)
        external
        onlyOwner
    {
        _setListing(parentNode, labelHash, price, duration, enabled);
    }

    function setListingsBatch(
        bytes32 parentNode,
        bytes32[] calldata labelHashes,
        uint256[] calldata prices,
        uint256[] calldata durations,
        bool[] calldata enabled
    ) external onlyOwner {
        if (
            labelHashes.length != prices.length || labelHashes.length != durations.length
                || labelHashes.length != enabled.length
        ) revert InvalidArrayLength();

        for (uint256 i; i < labelHashes.length; i++) {
            _setListing(parentNode, labelHashes[i], prices[i], durations[i], enabled[i]);
        }
    }

    function quote(bytes32 parentNode, string calldata label) external view returns (Listing memory) {
        return listings[parentNode][keccak256(bytes(label))];
    }

    function buy(bytes32 parentNode, string calldata label, address recipient)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        bytes32 labelHash = keccak256(bytes(label));
        Listing memory listing = listings[parentNode][labelHash];
        if (!listing.enabled) revert ListingNotActive();
        if (listing.duration == 0) revert InvalidDuration();

        address to = recipient == address(0) ? msg.sender : recipient;

        if (listing.price > 0) {
            bool ok = paymentToken.transferFrom(msg.sender, treasury, listing.price);
            if (!ok) revert PaymentFailed();
        }

        tokenId = registry.operatorRegister(parentNode, label, to, listing.duration);
        emit Purchased(parentNode, labelHash, label, msg.sender, to, listing.price, listing.duration, tokenId);
    }

    function _setListing(bytes32 parentNode, bytes32 labelHash, uint256 price, uint256 duration, bool enabled)
        internal
    {
        listings[parentNode][labelHash] = Listing({price: price, duration: duration, enabled: enabled});
        emit ListingUpdated(parentNode, labelHash, price, duration, enabled);
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
}
