// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OnchainProfilesV2 {
    // 0 = Unset/PreferNotSay for all enums
    enum Gender { Unset, Woman, Man, NonBinary, TransWoman, TransMan, Intersex, Other }
    enum Relocate { Unset, No, Maybe, Yes }

    enum Degree { Unset, NoDegree, HighSchool, Associate, Bachelor, Master, Doctorate, Professional, Bootcamp, Other }
    enum FieldBucket {
        Unset, ComputerScience, Engineering, MathStats, PhysicalSciences, Biology, MedicineHealth,
        Business, Economics, Law, SocialSciences, Psychology, ArtsDesign, Humanities, Education,
        Communications, Other
    }
    enum Profession { Unset, SoftwareEngineer, Product, Design, Data, Sales, Marketing, Operations, Founder, Student, Other }
    enum Industry { Unset, Technology, Finance, Healthcare, Education, Manufacturing, Retail, Media, Government, Nonprofit, Other }

    enum RelationshipStatus { Unset, Single, InRelationship, Married, Divorced, Separated, Widowed, ItsComplicated }
    enum Sexuality { Unset, Straight, Gay, Lesbian, Bisexual, Pansexual, Asexual, Queer, Questioning, Other }
    enum Ethnicity {
        Unset, White, Black, EastAsian, SouthAsian, SoutheastAsian, MiddleEasternNorthAfrican,
        HispanicLatinao, NativeAmericanIndigenous, PacificIslander, Mixed, Other
    }
    enum DatingStyle { Unset, Monogamous, NonMonogamous, OpenRelationship, Polyamorous, Other }

    enum Children { Unset, None, HasChildren }
    enum WantsChildren { Unset, No, Yes, OpenToIt, Unsure }

    enum Drinking { Unset, Never, Rarely, Socially, Often }
    enum Smoking { Unset, No, Socially, Yes, Vape }
    enum Drugs { Unset, Never, Sometimes, Often }

    enum LookingFor { Unset, Friendship, Casual, Serious, LongTerm, Marriage, NotSure, Other }

    enum Religion { Unset, Agnostic, Atheist, Buddhist, Christian, Hindu, Jewish, Muslim, Sikh, Spiritual, Other }
    enum Pets { Unset, NoPets, HasPets, WantsPets, Allergic }
    enum Diet { Unset, Omnivore, Vegetarian, Vegan, Pescatarian, Halal, Kosher, Other }

    // friendsOpenToMask bits: 0=Men, 1=Women, 2=NonBinary (0 = Unset/none)
    // ISO country/lang stored as ASCII in bytes2 (e.g. "FR", "EN")
    //
    // languagesPacked: 8 x uint32 entries in uint256
    // Each 32-bit entry: [langCode:16][proficiency:8][reserved:8]
    // Entry[0]=bits 255..224, Entry[1]=bits 223..192, ..., Entry[7]=bits 31..0
    // Proficiency: 0=Unset, 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2, 7=Native

    uint8 public constant MAX_LANGUAGE_SLOTS = 8;
    uint8 public constant PROF_NATIVE = 7;

    struct Profile {
        uint8  profileVersion;
        bool   exists;

        uint8  age;              // 0 = Unset
        uint16 heightCm;         // 0 = Unset

        bytes2 nationality;      // ISO-3166-1 alpha-2 (ASCII)

        uint8  friendsOpenToMask;

        uint256 languagesPacked; // 8 x 32-bit entries: [langCode:16][prof:8][reserved:8]

        bytes32 locationCityId;  // keccak256("San Francisco|US-CA|US") etc
        bytes32 schoolId;        // keccak256("Stanford University")
        bytes32 skillsCommit;    // packed uint16 tag IDs
        bytes32 hobbiesCommit;   // same

        bytes32 nameHash;        // optional: keccak256("Alice")

        uint256 packed;          // packed enums (see offsets below)

        string displayName;      // optional public display name
        string photoURI;         // optional (""), e.g. ipfs://... or https://...
    }

    mapping(address => Profile) private profiles;
    mapping(address => uint256) public nonces;

    event ProfileUpserted(address indexed user, uint8 version);

    // ----- Packed enum byte layout in `packed` -----
    //  0 gender
    //  1 relocate
    //  2 degree
    //  3 fieldBucket
    //  4 profession
    //  5 industry
    //  6 relationshipStatus
    //  7 sexuality
    //  8 ethnicity
    //  9 datingStyle
    // 10 children
    // 11 wantsChildren
    // 12 drinking
    // 13 smoking
    // 14 drugs
    // 15 lookingFor
    // 16 religion
    // 17 pets
    // 18 diet

    function _setByte(uint256 p, uint8 offset, uint8 value) internal pure returns (uint256) {
        uint256 shift = uint256(offset) * 8;
        uint256 mask = uint256(0xFF) << shift;
        return (p & ~mask) | (uint256(value) << shift);
    }

    function _getByte(uint256 p, uint8 offset) internal pure returns (uint8) {
        uint256 shift = uint256(offset) * 8;
        return uint8((p >> shift) & 0xFF);
    }

    // ── Language packing helpers ─────────────────────────────────

    /// @notice Pack a single (language, proficiency) into a 32-bit slot value
    function packLanguageSlot(bytes2 lang, uint8 proficiency) public pure returns (uint32) {
        require(proficiency <= PROF_NATIVE, "Invalid proficiency");
        return (uint32(uint16(lang)) << 16) | (uint32(proficiency) << 8);
    }

    /// @notice Unpack a 32-bit slot value into (language, proficiency)
    function unpackLanguageSlot(uint32 slot) public pure returns (bytes2 lang, uint8 proficiency) {
        lang = bytes2(uint16(slot >> 16));
        proficiency = uint8((slot >> 8) & 0xFF);
    }

    /// @notice Pack up to 8 (language, proficiency) pairs into a uint256
    function packLanguages(
        bytes2[8] calldata langs,
        uint8[8] calldata profs
    ) public pure returns (uint256 packed) {
        for (uint256 i = 0; i < 8; i++) {
            if (uint16(langs[i]) == 0) continue;
            require(profs[i] <= PROF_NATIVE, "Invalid proficiency");
            uint256 slot = (uint256(uint16(langs[i])) << 16) | (uint256(profs[i]) << 8);
            uint256 shift = (7 - i) * 32;
            packed |= (slot << shift);
        }
    }

    /// @notice Unpack a uint256 into arrays of (language, proficiency)
    function unpackLanguages(uint256 packed)
        public
        pure
        returns (bytes2[8] memory langs, uint8[8] memory profs)
    {
        for (uint256 i = 0; i < 8; i++) {
            uint256 shift = (7 - i) * 32;
            uint32 slot = uint32(packed >> shift);
            langs[i] = bytes2(uint16(slot >> 16));
            profs[i] = uint8((slot >> 8) & 0xFF);
        }
    }

    struct ProfileInput {
        uint8  profileVersion;

        // public identifiers
        string  displayName;   // "" if unset
        bytes32 nameHash;      // 0x0 if unset

        // basics
        uint8  age;
        uint16 heightCm;
        bytes2 nationality;

        // unified language entries (replaces nativeLanguage + learningLanguagesPacked)
        uint256 languagesPacked;

        // multi-select small
        uint8  friendsOpenToMask;

        // commitments / pointers
        bytes32 locationCityId;
        bytes32 schoolId;
        bytes32 skillsCommit;
        bytes32 hobbiesCommit;
        string  photoURI;

        // enums
        Gender gender;
        Relocate relocate;
        Degree degree;
        FieldBucket fieldBucket;
        Profession profession;
        Industry industry;

        RelationshipStatus relationshipStatus;
        Sexuality sexuality;
        Ethnicity ethnicity;
        DatingStyle datingStyle;

        Children children;
        WantsChildren wantsChildren;

        Drinking drinking;
        Smoking smoking;
        Drugs drugs;

        LookingFor lookingFor;

        Religion religion;
        Pets pets;
        Diet diet;
    }

    function upsertProfile(ProfileInput calldata in_) external {
        _writeProfile(msg.sender, in_);
    }

    /**
     * Sponsored profile update — anyone can submit on behalf of `user`
     * if they provide the user's EIP-191 signature over the profile data.
     *
     * Message format:
     *   heaven:profile:{user}:{profileHash}:{nonce}
     *
     * where profileHash = keccak256(abi.encode(in_))
     */
    function upsertProfileFor(
        address user,
        ProfileInput calldata in_,
        bytes calldata signature
    ) external {
        uint256 currentNonce = nonces[user];
        bytes32 profileHash = keccak256(abi.encode(in_));
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n",
                _toString(
                    bytes(
                        string.concat(
                            "heaven:profile:",
                            _toHexString(user),
                            ":",
                            _toHexString(profileHash),
                            ":",
                            _uintToString(currentNonce)
                        )
                    ).length
                ),
                "heaven:profile:",
                _toHexString(user),
                ":",
                _toHexString(profileHash),
                ":",
                _uintToString(currentNonce)
            )
        );

        address recovered = _recover(messageHash, signature);
        require(recovered == user, "Invalid signature");

        nonces[user] = currentNonce + 1;
        _writeProfile(user, in_);
    }

    function _writeProfile(address user, ProfileInput calldata in_) internal {
        Profile storage pr = profiles[user];
        pr.exists = true;

        pr.profileVersion = in_.profileVersion;

        pr.displayName = in_.displayName;
        pr.nameHash = in_.nameHash;

        pr.age = in_.age;
        pr.heightCm = in_.heightCm;
        pr.nationality = in_.nationality;

        pr.languagesPacked = in_.languagesPacked;

        pr.friendsOpenToMask = in_.friendsOpenToMask;

        pr.locationCityId = in_.locationCityId;
        pr.schoolId = in_.schoolId;
        pr.skillsCommit = in_.skillsCommit;
        pr.hobbiesCommit = in_.hobbiesCommit;
        pr.photoURI = in_.photoURI;

        uint256 p = 0;
        p = _setByte(p, 0, uint8(in_.gender));
        p = _setByte(p, 1, uint8(in_.relocate));
        p = _setByte(p, 2, uint8(in_.degree));
        p = _setByte(p, 3, uint8(in_.fieldBucket));
        p = _setByte(p, 4, uint8(in_.profession));
        p = _setByte(p, 5, uint8(in_.industry));
        p = _setByte(p, 6, uint8(in_.relationshipStatus));
        p = _setByte(p, 7, uint8(in_.sexuality));
        p = _setByte(p, 8, uint8(in_.ethnicity));
        p = _setByte(p, 9, uint8(in_.datingStyle));
        p = _setByte(p, 10, uint8(in_.children));
        p = _setByte(p, 11, uint8(in_.wantsChildren));
        p = _setByte(p, 12, uint8(in_.drinking));
        p = _setByte(p, 13, uint8(in_.smoking));
        p = _setByte(p, 14, uint8(in_.drugs));
        p = _setByte(p, 15, uint8(in_.lookingFor));
        p = _setByte(p, 16, uint8(in_.religion));
        p = _setByte(p, 17, uint8(in_.pets));
        p = _setByte(p, 18, uint8(in_.diet));

        pr.packed = p;

        emit ProfileUpserted(user, in_.profileVersion);
    }

    // ── Signature helpers ──────────────────────────────

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
        require(v == 27 || v == 28, "Invalid v");
        address recovered = ecrecover(hash, v, r, s);
        require(recovered != address(0), "Invalid signature");
        return recovered;
    }

    function _toHexString(address a) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        bytes memory hexChars = "0123456789abcdef";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            s[i] = hexChars[v & 0xf];
            v >>= 4;
        }
        return string(s);
    }

    function _toHexString(bytes32 b) internal pure returns (string memory) {
        bytes memory s = new bytes(66);
        s[0] = "0";
        s[1] = "x";
        bytes memory hexChars = "0123456789abcdef";
        uint256 v = uint256(b);
        for (uint256 i = 65; i > 1; i--) {
            s[i] = hexChars[v & 0xf];
            v >>= 4;
        }
        return string(s);
    }

    function _uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(buf);
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        return _uintToString(v);
    }

    function getProfile(address user) external view returns (Profile memory) {
        return profiles[user];
    }

    // Convenience decoded getters
    function getReligion(address user) external view returns (Religion) {
        return Religion(_getByte(profiles[user].packed, 16));
    }

    function getPets(address user) external view returns (Pets) {
        return Pets(_getByte(profiles[user].packed, 17));
    }

    function getDiet(address user) external view returns (Diet) {
        return Diet(_getByte(profiles[user].packed, 18));
    }

    function getLanguages(address user) external view returns (bytes2[8] memory langs, uint8[8] memory profs) {
        return unpackLanguages(profiles[user].languagesPacked);
    }
}
