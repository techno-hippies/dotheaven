// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {OnchainProfilesV2} from "../src/ProfileV2.sol";

interface IRegistryV1 {
    function registerFor(bytes32 parentNode, string calldata label, address to, uint256 duration)
        external payable returns (uint256 tokenId);
}

interface IRecordsV1 {
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

/**
 * Seed 50 fake profiles on MegaETH testnet.
 *
 * For each profile:
 *  1. Derive a deterministic wallet from seed + index
 *  2. Register a .heaven name to that wallet
 *  3. Write a fully-filled ProfileV2 via upsertProfileFor (EIP-191 sig)
 *  4. Set avatar + bio text records (deployer must be RecordsV1 owner or sponsor)
 *
 * Usage:
 *   source .env && forge script script/SeedProfiles.s.sol \
 *     --rpc-url https://carrot.megaeth.com/rpc --broadcast --legacy \
 *     --gas-price 1000000 --skip-simulation --gas-limit 200000000
 */
contract SeedProfilesScript is Script {
    OnchainProfilesV2 constant profile = OnchainProfilesV2(0xa31545D33f6d656E62De67fd020A26608d4601E5);
    IRegistryV1 constant registry = IRegistryV1(0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2);
    IRecordsV1 constant records = IRecordsV1(0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3);

    bytes32 constant HEAVEN_NODE = 0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27;

    uint256 constant SEED_BASE = 0xDEAD0000BEEF0000CAFE0000FACE0000;
    uint256 constant NUM_PROFILES = 50;

    // ── Name pools ──────────────────────────────────────────────────
    // First names (25 female, 25 male)
    string[25] femaleNames = [
        "alice","bella","chloe","diana","emma",
        "fiona","grace","hana","iris","jade",
        "kira","luna","mia","nora","olivia",
        "penny","quinn","ruby","sara","tara",
        "una","violet","willow","xena","yuki"
    ];
    string[25] maleNames = [
        "alex","ben","cole","dan","ethan",
        "finn","gray","hugo","ivan","jake",
        "kai","leo","max","noah","oscar",
        "paul","remy","sam","theo","tyler",
        "uri","vic","wade","xander","zach"
    ];

    // Cities with country codes
    struct City {
        string label;     // "San Francisco|US-CA|US"
        bytes2 country;   // "US"
    }

    // Language codes
    bytes2[12] langCodes = [
        bytes2("EN"), bytes2("ES"), bytes2("FR"), bytes2("DE"),
        bytes2("JA"), bytes2("KO"), bytes2("ZH"), bytes2("PT"),
        bytes2("IT"), bytes2("RU"), bytes2("AR"), bytes2("HI")
    ];

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        console2.log("========================================");
        console2.log("Seeding", NUM_PROFILES, "fake profiles");
        console2.log("========================================");

        vm.startBroadcast(deployerPk);

        for (uint256 i = 0; i < NUM_PROFILES; i++) {
            uint256 userPk = SEED_BASE + i + 1;
            address userAddr = vm.addr(userPk);
            bool isFemale = i < 25;

            string memory name = isFemale ? femaleNames[i] : maleNames[i - 25];
            // Append a number suffix to avoid collisions: alice1, alice2 etc
            string memory label = string.concat(name, _uintToStr(i + 1));

            console2.log("");
            console2.log("--- Profile", i + 1, "---");
            console2.log("  user:", userAddr);
            console2.log("  name:", label);

            // 1. Register .heaven name
            bytes32 node = keccak256(abi.encodePacked(HEAVEN_NODE, keccak256(bytes(label))));
            try registry.registerFor(HEAVEN_NODE, label, userAddr, 365 days) returns (uint256 tokenId) {
                console2.log("  registered:", tokenId);
            } catch {
                console2.log("  name already registered, skipping");
            }

            // 2. Build profile input
            OnchainProfilesV2.ProfileInput memory in_ = _buildProfile(i, isFemale, name);

            // 3. Sign + submit via upsertProfileFor
            uint256 currentNonce = profile.nonces(userAddr);
            bytes32 profileHash = keccak256(abi.encode(in_));

            string memory message = string.concat(
                "heaven:profile:",
                _toHexString(userAddr),
                ":",
                _toHexString(profileHash),
                ":",
                _uintToStr(currentNonce)
            );

            bytes32 digest = keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n",
                    _uintToStr(bytes(message).length),
                    message
                )
            );

            (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPk, digest);
            bytes memory sig = abi.encodePacked(r, s, v);

            profile.upsertProfileFor(userAddr, in_, sig);
            console2.log("  profile written");
        }

        vm.stopBroadcast();
        console2.log("");
        console2.log("=== Done! Seeded", NUM_PROFILES, "profiles ===");
    }

    // ── Profile builder ────────────────────────────────────────────

    function _buildProfile(uint256 i, bool isFemale, string memory displayName)
        internal view returns (OnchainProfilesV2.ProfileInput memory in_)
    {
        // Pseudo-random from index
        uint256 seed = uint256(keccak256(abi.encode("seed-profile", i)));

        in_.profileVersion = 2;
        in_.displayName = displayName;
        in_.nameHash = keccak256(bytes(displayName));

        // Age: 22-38 (realistic dating range)
        in_.age = uint8(22 + (seed % 17));

        // Height: 155-195 cm
        in_.heightCm = uint16(155 + (seed >> 8) % 41);

        // Nationality from pool
        bytes2[10] memory countries = [
            bytes2("US"), bytes2("GB"), bytes2("DE"), bytes2("FR"), bytes2("JP"),
            bytes2("KR"), bytes2("BR"), bytes2("AU"), bytes2("CA"), bytes2("ES")
        ];
        in_.nationality = countries[(seed >> 16) % 10];

        // Languages: 1-3 random
        uint256 numLangs = 1 + (seed >> 24) % 3;
        uint256 langPacked = 0;
        // First language = native
        uint256 nativeLangIdx = (seed >> 32) % 12;
        uint256 slot0 = (uint256(uint16(langCodes[nativeLangIdx])) << 16) | (uint256(7) << 8); // Native
        langPacked |= (slot0 << 224);

        if (numLangs >= 2) {
            uint256 lang2Idx = (nativeLangIdx + 1 + (seed >> 40) % 11) % 12;
            uint8 prof2 = uint8(2 + (seed >> 48) % 5); // A2-C2
            uint256 slot1 = (uint256(uint16(langCodes[lang2Idx])) << 16) | (uint256(prof2) << 8);
            langPacked |= (slot1 << 192);
        }
        if (numLangs >= 3) {
            uint256 lang3Idx = (nativeLangIdx + 3 + (seed >> 56) % 9) % 12;
            uint8 prof3 = uint8(1 + (seed >> 64) % 4); // A1-B2
            uint256 slot2 = (uint256(uint16(langCodes[lang3Idx])) << 16) | (uint256(prof3) << 8);
            langPacked |= (slot2 << 160);
        }
        in_.languagesPacked = langPacked;

        // Friends open to: random mask 1-7
        in_.friendsOpenToMask = uint8(1 + (seed >> 72) % 7);

        // Location
        string[10] memory cities = [
            "San Francisco|US-CA|US",
            "London|GB-ENG|GB",
            "Berlin|DE-BE|DE",
            "Paris|FR-IDF|FR",
            "Tokyo|JP-13|JP",
            "Seoul|KR-11|KR",
            "New York|US-NY|US",
            "Sydney|AU-NSW|AU",
            "Toronto|CA-ON|CA",
            "Barcelona|ES-CT|ES"
        ];
        in_.locationCityId = keccak256(bytes(cities[(seed >> 80) % 10]));

        // School
        string[8] memory schools = [
            "MIT", "Stanford", "Oxford", "Cambridge",
            "ETH Zurich", "Tokyo University", "Harvard", "Caltech"
        ];
        in_.schoolId = keccak256(bytes(schools[(seed >> 88) % 8]));

        // Hobbies: pack 4-8 random hobby IDs
        uint256 numHobbies = 4 + (seed >> 96) % 5;
        uint16[16] memory hobbyIds;
        uint16[20] memory hobbyPool = [
            uint16(1),2,3,4,5,6,7,8,9,10,
            50,51,52,53,100,101,102,103,104,200
        ];
        for (uint256 h = 0; h < numHobbies && h < 16; h++) {
            hobbyIds[h] = hobbyPool[(seed >> (104 + h * 4)) % 20];
        }
        in_.hobbiesCommit = _packTagIds(hobbyIds);

        // Skills: pack 2-5 random skill IDs
        uint256 numSkills = 2 + (seed >> 170) % 4;
        uint16[16] memory skillIds;
        uint16[10] memory skillPool = [
            uint16(1000),1001,1002,1003,1004,1005,1006,1007,1008,1009
        ];
        for (uint256 sk = 0; sk < numSkills && sk < 16; sk++) {
            skillIds[sk] = skillPool[(seed >> (180 + sk * 4)) % 10];
        }
        in_.skillsCommit = _packTagIds(skillIds);

        in_.photoURI = ""; // Will be set separately via avatar upload

        // ── Enums (pseudo-random) ──

        in_.gender = isFemale
            ? OnchainProfilesV2.Gender.Woman
            : OnchainProfilesV2.Gender.Man;

        in_.relocate = OnchainProfilesV2.Relocate(1 + (seed >> 190) % 3);
        in_.degree = OnchainProfilesV2.Degree(1 + (seed >> 194) % 9);
        in_.fieldBucket = OnchainProfilesV2.FieldBucket(1 + (seed >> 198) % 16);
        in_.profession = OnchainProfilesV2.Profession(1 + (seed >> 202) % 10);
        in_.industry = OnchainProfilesV2.Industry(1 + (seed >> 206) % 10);

        in_.relationshipStatus = OnchainProfilesV2.RelationshipStatus.Single; // All "available"
        in_.sexuality = OnchainProfilesV2.Sexuality(1 + (seed >> 210) % 9);
        in_.ethnicity = OnchainProfilesV2.Ethnicity(1 + (seed >> 214) % 11);
        in_.datingStyle = OnchainProfilesV2.DatingStyle(1 + (seed >> 218) % 4);

        in_.children = OnchainProfilesV2.Children(1 + (seed >> 222) % 2);
        in_.wantsChildren = OnchainProfilesV2.WantsChildren(1 + (seed >> 226) % 4);

        in_.drinking = OnchainProfilesV2.Drinking(1 + (seed >> 230) % 4);
        in_.smoking = OnchainProfilesV2.Smoking(1 + (seed >> 234) % 4);
        in_.drugs = OnchainProfilesV2.Drugs(1 + (seed >> 238) % 3);

        in_.lookingFor = OnchainProfilesV2.LookingFor(1 + (seed >> 242) % 7);
        in_.religion = OnchainProfilesV2.Religion(1 + (seed >> 246) % 10);
        in_.pets = OnchainProfilesV2.Pets(1 + (seed >> 250) % 4);
        in_.diet = OnchainProfilesV2.Diet(1 + (seed >> 254) % 7);
    }

    // ── Pack up to 16 uint16 tag IDs into bytes32 (big-endian) ──

    function _packTagIds(uint16[16] memory ids) internal pure returns (bytes32) {
        uint256 packed = 0;
        for (uint256 i = 0; i < 16; i++) {
            if (ids[i] == 0) continue;
            packed |= (uint256(ids[i]) << ((15 - i) * 16));
        }
        return bytes32(packed);
    }

    // ── String helpers ──────────────────────────────────────────────

    function _toHexString(address a) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0"; s[1] = "x";
        bytes memory hex_ = "0123456789abcdef";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) { s[i] = hex_[v & 0xf]; v >>= 4; }
        return string(s);
    }

    function _toHexString(bytes32 b) internal pure returns (string memory) {
        bytes memory s = new bytes(66);
        s[0] = "0"; s[1] = "x";
        bytes memory hex_ = "0123456789abcdef";
        uint256 v = uint256(b);
        for (uint256 i = 65; i > 1; i--) { s[i] = hex_[v & 0xf]; v >>= 4; }
        return string(s);
    }

    function _uintToStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }
}
