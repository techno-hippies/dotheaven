// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRegistryV2Policy {
    function operatorRegister(bytes32 parentNode, string calldata label, address to, uint256 duration)
        external
        returns (uint256 tokenId);

    function isReserved(bytes32 parentNode, string calldata label) external view returns (bool);

    function premiumPriceForLabel(bytes32 parentNode, string calldata label) external view returns (uint256);

    function price(bytes32 parentNode, string calldata label, uint256 duration) external view returns (uint256);
}

/// @title PremiumNameStoreV2
/// @notice Permit-gated name storefront for Tempo.
/// @dev Requires this contract to be authorized as operator for each TLD in RegistryV2.
contract PremiumNameStoreV2 is Ownable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum PolicyType {
        SHORT_SELF,
        LONG_POW
    }

    struct Listing {
        uint256 price;
        uint256 duration;
        bool enabled;
    }

    struct NamePermit {
        address buyer;
        address recipient;
        bytes32 parentNode;
        bytes32 labelHash;
        uint256 duration;
        uint256 maxPrice;
        uint8 policyType;
        bytes32 nullifierHash;
        uint256 nonce;
        uint256 deadline;
    }

    error InvalidAddress();
    error InvalidLabel();
    error InvalidArrayLength();
    error InvalidDuration();
    error InvalidPolicyType();
    error InvalidPermitSigner();
    error PermitExpired();
    error PermitAlreadyUsed();
    error CallerNotBuyer();
    error LabelHashMismatch();
    error InvalidPolicyForLength();
    error NullifierRequired();
    error NullifierNotAllowed();
    error ShortNameCapExceeded();
    error ShortNameMustBePaid();
    error MaxPriceExceeded();
    error ListingRequired();
    error StorePaused();

    event TreasuryUpdated(address indexed treasury);
    event PolicySignerUpdated(address indexed signer);
    event PauseUpdated(bool paused);
    event ListingUpdated(
        bytes32 indexed parentNode,
        bytes32 indexed labelHash,
        uint256 price,
        uint256 duration,
        bool enabled
    );
    event PermitNonceUsed(address indexed buyer, uint256 indexed nonce);
    event PurchasedWithPermit(
        bytes32 indexed parentNode,
        bytes32 indexed labelHash,
        string label,
        address buyer,
        address recipient,
        uint256 price,
        uint256 duration,
        uint8 policyType,
        bytes32 nullifierHash,
        uint256 nonce,
        uint256 tokenId
    );

    uint16 public constant SHORT_NAME_LIFETIME_CAP = 3;
    uint8 public constant SHORT_NAME_MAX_LEN = 5;
    bytes32 private constant NAME_PERMIT_TYPEHASH = keccak256(
        "NamePermit(address buyer,address recipient,bytes32 parentNode,bytes32 labelHash,uint256 duration,uint256 maxPrice,uint8 policyType,bytes32 nullifierHash,uint256 nonce,uint256 deadline)"
    );

    IRegistryV2Policy public immutable registry;
    IERC20 public immutable paymentToken;
    address public treasury;
    address public policySigner;
    bool public paused;

    // parentNode => labelHash => listing
    mapping(bytes32 => mapping(bytes32 => Listing)) public listings;

    // buyer => nonce => used
    mapping(address => mapping(uint256 => bool)) public usedPermitNonces;

    // app-scoped identity nullifier hash => lifetime short-name purchases count
    mapping(bytes32 => uint16) public shortPurchasesByNullifier;

    constructor(address registry_, address paymentToken_, address treasury_, address owner_, address policySigner_)
        Ownable(owner_)
        EIP712("PremiumNameStoreV2", "2")
    {
        if (registry_ == address(0) || paymentToken_ == address(0) || treasury_ == address(0) || policySigner_ == address(0))
        {
            revert InvalidAddress();
        }

        registry = IRegistryV2Policy(registry_);
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
        policySigner = policySigner_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setPolicySigner(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidAddress();
        policySigner = signer;
        emit PolicySignerUpdated(signer);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseUpdated(value);
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

    function buyWithPermit(string calldata label, NamePermit calldata permit, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        if (paused) revert StorePaused();
        if (msg.sender != permit.buyer) revert CallerNotBuyer();
        if (permit.deadline < block.timestamp) revert PermitExpired();
        if (permit.recipient == address(0)) revert InvalidAddress();
        if (permit.duration == 0) revert InvalidDuration();
        if (permit.policyType > uint8(PolicyType.LONG_POW)) revert InvalidPolicyType();
        if (usedPermitNonces[permit.buyer][permit.nonce]) revert PermitAlreadyUsed();
        if (!_isValidLabelChars(label)) revert InvalidLabel();

        bytes32 labelHash = keccak256(bytes(label));
        if (labelHash != permit.labelHash) revert LabelHashMismatch();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    NAME_PERMIT_TYPEHASH,
                    permit.buyer,
                    permit.recipient,
                    permit.parentNode,
                    permit.labelHash,
                    permit.duration,
                    permit.maxPrice,
                    permit.policyType,
                    permit.nullifierHash,
                    permit.nonce,
                    permit.deadline
                )
            )
        );
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != policySigner) revert InvalidPermitSigner();

        usedPermitNonces[permit.buyer][permit.nonce] = true;
        emit PermitNonceUsed(permit.buyer, permit.nonce);

        (uint256 requiredPrice, uint256 requiredDuration) =
            _resolvePriceAndDuration(permit.parentNode, label, labelHash, permit.duration);
        if (requiredPrice > permit.maxPrice) revert MaxPriceExceeded();

        uint256 len = bytes(label).length;
        PolicyType policy = PolicyType(permit.policyType);
        if (len <= SHORT_NAME_MAX_LEN) {
            if (policy != PolicyType.SHORT_SELF) revert InvalidPolicyForLength();
            if (permit.nullifierHash == bytes32(0)) revert NullifierRequired();
            uint16 current = shortPurchasesByNullifier[permit.nullifierHash];
            if (current >= SHORT_NAME_LIFETIME_CAP) revert ShortNameCapExceeded();
            if (requiredPrice == 0) revert ShortNameMustBePaid();
            shortPurchasesByNullifier[permit.nullifierHash] = current + 1;
        } else {
            if (policy != PolicyType.LONG_POW) revert InvalidPolicyForLength();
            if (permit.nullifierHash != bytes32(0)) revert NullifierNotAllowed();
        }

        if (requiredPrice > 0) {
            paymentToken.safeTransferFrom(permit.buyer, treasury, requiredPrice);
        }

        tokenId = registry.operatorRegister(permit.parentNode, label, permit.recipient, requiredDuration);
        emit PurchasedWithPermit(
            permit.parentNode,
            labelHash,
            label,
            permit.buyer,
            permit.recipient,
            requiredPrice,
            requiredDuration,
            permit.policyType,
            permit.nullifierHash,
            permit.nonce,
            tokenId
        );
    }

    function _resolvePriceAndDuration(bytes32 parentNode, string calldata label, bytes32 labelHash, uint256 duration)
        internal
        view
        returns (uint256 requiredPrice, uint256 requiredDuration)
    {
        Listing memory listing = listings[parentNode][labelHash];
        if (listing.enabled) {
            if (listing.duration == 0 || listing.duration != duration) revert InvalidDuration();
            return (listing.price, listing.duration);
        }

        // Reserved/premium labels must be explicit listings to avoid bypassing curated pricing.
        if (registry.isReserved(parentNode, label) || registry.premiumPriceForLabel(parentNode, label) > 0) {
            revert ListingRequired();
        }

        return (registry.price(parentNode, label, duration), duration);
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
