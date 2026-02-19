// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {RegistryV2} from "../src/RegistryV2.sol";
import {PremiumNameStoreV2} from "../src/PremiumNameStoreV2.sol";

contract MockTip20V2 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PremiumNameStoreV2Test is Test {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_PERMIT_TYPEHASH = keccak256(
        "NamePermit(address buyer,address recipient,bytes32 parentNode,bytes32 labelHash,uint256 duration,uint256 maxPrice,uint8 policyType,bytes32 nullifierHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant NAME_HASH = keccak256(bytes("PremiumNameStoreV2"));
    bytes32 private constant VERSION_HASH = keccak256(bytes("2"));

    RegistryV2 registry;
    PremiumNameStoreV2 store;
    MockTip20V2 alphaUsd;

    address owner = address(0xBEEF);
    address treasury = address(0xFEE);
    address buyer = address(0xA11CE);
    address attacker = address(0xBADCAFE);

    uint256 policySignerPk = 0xA11CE55;
    address policySigner;

    bytes32 pirateNode;
    uint256 oneYear = 365 days;
    uint256 kingPrice = 50_000_000; // 50 AlphaUSD (6 decimals)
    uint256 buyerStartingBalance = 10_000_000_000;

    function setUp() public {
        policySigner = vm.addr(policySignerPk);

        alphaUsd = new MockTip20V2();
        alphaUsd.mint(buyer, buyerStartingBalance);

        vm.prank(owner);
        registry = new RegistryV2(treasury, owner);

        pirateNode = _namehash("pirate", _namehash("hnsbridge", _namehash("eth", bytes32(0))));

        vm.prank(owner);
        registry.configureTld(
            pirateNode,
            1_000_000, // 1 token (6 decimals) base yearly quote before multipliers
            3,
            oneYear,
            true
        );

        // Short names remain paid. 6+ names are free on public quote schedule.
        vm.prank(owner);
        registry.setLengthPricing(pirateNode, true, 100, 50, 10, 2, 6);

        vm.prank(owner);
        store = new PremiumNameStoreV2(address(registry), address(alphaUsd), treasury, owner, policySigner);

        vm.prank(owner);
        registry.setOperator(pirateNode, address(store), true);

        _reserve("king");
        vm.prank(owner);
        store.setListing(pirateNode, "king", kingPrice, oneYear, true);

        vm.prank(buyer);
        alphaUsd.approve(address(store), type(uint256).max);
    }

    function test_buyWithPermit_shortListedReserved_success() public {
        bytes32 nullifier = bytes32(uint256(111));
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "king",
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: nullifier,
            nonce: 1,
            maxPrice: kingPrice
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        uint256 tokenId = store.buyWithPermit("king", permit, sig);

        assertEq(registry.ownerOf(tokenId), buyer);
        assertEq(alphaUsd.balanceOf(treasury), kingPrice);
        assertEq(store.shortPurchasesByNullifier(nullifier), 1);
    }

    function test_buyWithPermit_revertsWhenCallerNotBuyer() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "king",
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: bytes32(uint256(1)),
            nonce: 11,
            maxPrice: kingPrice
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(attacker);
        vm.expectRevert(PremiumNameStoreV2.CallerNotBuyer.selector);
        store.buyWithPermit("king", permit, sig);
    }

    function test_buyWithPermit_revertsOnReplayNonce() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "sailor",
            policyType: uint8(PremiumNameStoreV2.PolicyType.LONG_POW),
            nullifierHash: bytes32(0),
            nonce: 2,
            maxPrice: 0
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        store.buyWithPermit("sailor", permit, sig);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.PermitAlreadyUsed.selector);
        store.buyWithPermit("sailor", permit, sig);
    }

    function test_buyWithPermit_enforcesShortCap() public {
        bytes32 nullifier = bytes32(uint256(0xA55));
        string[4] memory labels = ["axel", "bale", "coda", "dune"];

        for (uint256 i = 0; i < 3; i++) {
            PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
                label: labels[i],
                policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
                nullifierHash: nullifier,
                nonce: 100 + i,
                maxPrice: 10_000_000
            });
            bytes memory sig = _signPermit(permit);

            vm.prank(buyer);
            store.buyWithPermit(labels[i], permit, sig);
        }

        PremiumNameStoreV2.NamePermit memory blocked = _buildPermit({
            label: labels[3],
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: nullifier,
            nonce: 104,
            maxPrice: 10_000_000
        });
        bytes memory blockedSig = _signPermit(blocked);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.ShortNameCapExceeded.selector);
        store.buyWithPermit(labels[3], blocked, blockedSig);
    }

    function test_buyWithPermit_longPow_nonListedFree_success() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "sailor",
            policyType: uint8(PremiumNameStoreV2.PolicyType.LONG_POW),
            nullifierHash: bytes32(0),
            nonce: 9,
            maxPrice: 0
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        uint256 tokenId = store.buyWithPermit("sailor", permit, sig);

        assertEq(registry.ownerOf(tokenId), buyer);
        assertEq(alphaUsd.balanceOf(treasury), 0);
    }

    function test_buyWithPermit_revertsWhenLongHasNullifier() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "mariner",
            policyType: uint8(PremiumNameStoreV2.PolicyType.LONG_POW),
            nullifierHash: bytes32(uint256(1)),
            nonce: 18,
            maxPrice: 0
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.NullifierNotAllowed.selector);
        store.buyWithPermit("mariner", permit, sig);
    }

    function test_buyWithPermit_revertsWhenShortMissingNullifier() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "ruby",
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: bytes32(0),
            nonce: 27,
            maxPrice: 10_000_000
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.NullifierRequired.selector);
        store.buyWithPermit("ruby", permit, sig);
    }

    function test_buyWithPermit_revertsWhenMaxPriceTooLow() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "king",
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: bytes32(uint256(33)),
            nonce: 39,
            maxPrice: kingPrice - 1
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.MaxPriceExceeded.selector);
        store.buyWithPermit("king", permit, sig);
    }

    function test_buyWithPermit_revertsWhenReservedNotListed() public {
        _reserve("queen");

        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "queen",
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: bytes32(uint256(44)),
            nonce: 48,
            maxPrice: 100_000_000
        });
        bytes memory sig = _signPermit(permit);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.ListingRequired.selector);
        store.buyWithPermit("queen", permit, sig);
    }

    function test_buyWithPermit_revertsOnInvalidSigner() public {
        PremiumNameStoreV2.NamePermit memory permit = _buildPermit({
            label: "king",
            policyType: uint8(PremiumNameStoreV2.PolicyType.SHORT_SELF),
            nullifierHash: bytes32(uint256(99)),
            nonce: 59,
            maxPrice: kingPrice
        });
        bytes memory sig = _signPermitWithKey(permit, 0xB0B);

        vm.prank(buyer);
        vm.expectRevert(PremiumNameStoreV2.InvalidPermitSigner.selector);
        store.buyWithPermit("king", permit, sig);
    }

    function _buildPermit(string memory label, uint8 policyType, bytes32 nullifierHash, uint256 nonce, uint256 maxPrice)
        internal
        view
        returns (PremiumNameStoreV2.NamePermit memory permit)
    {
        permit = PremiumNameStoreV2.NamePermit({
            buyer: buyer,
            recipient: buyer,
            parentNode: pirateNode,
            labelHash: keccak256(bytes(label)),
            duration: oneYear,
            maxPrice: maxPrice,
            policyType: policyType,
            nullifierHash: nullifierHash,
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
    }

    function _signPermit(PremiumNameStoreV2.NamePermit memory permit) internal view returns (bytes memory) {
        return _signPermitWithKey(permit, policySignerPk);
    }

    function _signPermitWithKey(PremiumNameStoreV2.NamePermit memory permit, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = _digest(permit);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _digest(PremiumNameStoreV2.NamePermit memory permit) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
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
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(store))
        );
    }

    function _reserve(string memory label) internal {
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = keccak256(bytes(label));
        vm.prank(owner);
        registry.setReservedHashes(pirateNode, hashes, true);
    }

    function _namehash(string memory label, bytes32 parent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }
}
