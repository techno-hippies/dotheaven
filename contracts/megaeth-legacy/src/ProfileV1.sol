// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OnchainProfilesV1 {
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
    // learningLanguagesPacked: 5 x bytes2 in uint80, left->right:
    // [0]=bits 79..64, [1]=63..48, [2]=47..32, [3]=31..16, [4]=15..0; 0x0000 = empty

    struct Profile {
        uint8  profileVersion;
        bool   exists;

        uint8  age;              // 0 = Unset
        uint16 heightCm;         // 0 = Unset

        bytes2 nationality;      // ISO-3166-1 alpha-2 (ASCII)
        bytes2 nativeLanguage;   // ISO-639-1 (ASCII)

        uint8  friendsOpenToMask;

        uint80 learningLanguagesPacked;

        bytes32 locationCityId;  // keccak256("San Francisco|US-CA|US") etc
        bytes32 schoolId;        // keccak256("Stanford University")
        bytes32 skillsCommit;    // keccak256(abi.encode(sortedTagHashes...)) OR Merkle root
        bytes32 hobbiesCommit;   // same

        bytes32 nameHash;        // optional: keccak256("Alice") (still public, just not plaintext)

        uint256 packed;          // packed enums (see offsets below)

        string displayName;      // optional public display name ("")
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

    // Pack 5 ISO language codes into uint80
    function packLearningLanguages(bytes2[5] calldata langs) public pure returns (uint80 out) {
        out =
            (uint80(uint16(langs[0])) << 64) |
            (uint80(uint16(langs[1])) << 48) |
            (uint80(uint16(langs[2])) << 32) |
            (uint80(uint16(langs[3])) << 16) |
            (uint80(uint16(langs[4])) << 0);
    }

    function unpackLearningLanguages(uint80 packedLangs) public pure returns (bytes2[5] memory out) {
        out[0] = bytes2(uint16(packedLangs >> 64));
        out[1] = bytes2(uint16(packedLangs >> 48));
        out[2] = bytes2(uint16(packedLangs >> 32));
        out[3] = bytes2(uint16(packedLangs >> 16));
        out[4] = bytes2(uint16(packedLangs >> 0));
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
        bytes2 nativeLanguage;

        // learning languages
        uint80 learningLanguagesPacked;

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
        pr.nativeLanguage = in_.nativeLanguage;

        pr.learningLanguagesPacked = in_.learningLanguagesPacked;

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

    // Convenience decoded getters (examples)
    function getReligion(address user) external view returns (Religion) {
        return Religion(_getByte(profiles[user].packed, 16));
    }

    function getPets(address user) external view returns (Pets) {
        return Pets(_getByte(profiles[user].packed, 17));
    }

    function getDiet(address user) external view returns (Diet) {
        return Diet(_getByte(profiles[user].packed, 18));
    }

    function getLearningLanguages(address user) external view returns (bytes2[5] memory) {
        return unpackLearningLanguages(profiles[user].learningLanguagesPacked);
    }
}
