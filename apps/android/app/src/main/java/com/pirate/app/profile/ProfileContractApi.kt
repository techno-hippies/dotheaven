package com.pirate.app.profile

import com.pirate.app.BuildConfig
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.tempo.TempoClient
import com.pirate.app.onboarding.steps.LANGUAGE_OPTIONS
import java.math.BigInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class ProfileLanguageEntry(
  val code: String,
  val proficiency: Int,
)

data class ProfileEnumOption(
  val value: Int,
  val label: String,
)

data class ContractProfileData(
  val profileVersion: Int = 2,
  val displayName: String = "",
  val nameHash: String = "",
  val age: Int = 0,
  val heightCm: Int = 0,
  val nationality: String = "",
  val languages: List<ProfileLanguageEntry> = emptyList(),
  val friendsOpenToMask: Int = 0,
  val locationCityId: String = "",
  val locationLatE6: Int = 0,
  val locationLngE6: Int = 0,
  val schoolId: String = "",
  val skillsCommit: String = "",
  val hobbiesCommit: String = "",
  val photoUri: String = "",
  val gender: Int = 0,
  val relocate: Int = 0,
  val degree: Int = 0,
  val fieldBucket: Int = 0,
  val profession: Int = 0,
  val industry: Int = 0,
  val relationshipStatus: Int = 0,
  val sexuality: Int = 0,
  val ethnicity: Int = 0,
  val datingStyle: Int = 0,
  val children: Int = 0,
  val wantsChildren: Int = 0,
  val drinking: Int = 0,
  val smoking: Int = 0,
  val drugs: Int = 0,
  val lookingFor: Int = 0,
  val religion: Int = 0,
  val pets: Int = 0,
  val diet: Int = 0,
)

object ProfileContractApi {
  private const val DEFAULT_TEMPO_SUBGRAPH_PROFILES =
    "https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo"
  private const val LEGACY_SUBGRAPH_PROFILES =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn"
  const val ZERO_HASH =
    "0x0000000000000000000000000000000000000000000000000000000000000000"

  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
  private val client = OkHttpClient()
  private val languageLabels = LANGUAGE_OPTIONS.associate { it.code.lowercase() to it.label }

  val GENDER_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Woman"),
    ProfileEnumOption(2, "Man"),
    ProfileEnumOption(3, "Non-binary"),
    ProfileEnumOption(4, "Trans woman"),
    ProfileEnumOption(5, "Trans man"),
    ProfileEnumOption(6, "Intersex"),
    ProfileEnumOption(7, "Other"),
  )
  val RELOCATE_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "No"),
    ProfileEnumOption(2, "Maybe"),
    ProfileEnumOption(3, "Yes"),
  )
  val DEGREE_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "No degree"),
    ProfileEnumOption(2, "High school"),
    ProfileEnumOption(3, "Associate"),
    ProfileEnumOption(4, "Bachelor"),
    ProfileEnumOption(5, "Master"),
    ProfileEnumOption(6, "Doctorate"),
    ProfileEnumOption(7, "Professional"),
    ProfileEnumOption(8, "Bootcamp"),
    ProfileEnumOption(9, "Other"),
  )
  val FIELD_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Computer science"),
    ProfileEnumOption(2, "Engineering"),
    ProfileEnumOption(3, "Math / Stats"),
    ProfileEnumOption(4, "Physical sciences"),
    ProfileEnumOption(5, "Biology"),
    ProfileEnumOption(6, "Medicine / Health"),
    ProfileEnumOption(7, "Business"),
    ProfileEnumOption(8, "Economics"),
    ProfileEnumOption(9, "Law"),
    ProfileEnumOption(10, "Social sciences"),
    ProfileEnumOption(11, "Psychology"),
    ProfileEnumOption(12, "Arts / Design"),
    ProfileEnumOption(13, "Humanities"),
    ProfileEnumOption(14, "Education"),
    ProfileEnumOption(15, "Communications"),
    ProfileEnumOption(16, "Other"),
  )
  val PROFESSION_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Software engineer"),
    ProfileEnumOption(2, "Product"),
    ProfileEnumOption(3, "Design"),
    ProfileEnumOption(4, "Data"),
    ProfileEnumOption(5, "Sales"),
    ProfileEnumOption(6, "Marketing"),
    ProfileEnumOption(7, "Operations"),
    ProfileEnumOption(8, "Founder"),
    ProfileEnumOption(9, "Student"),
    ProfileEnumOption(10, "Other"),
  )
  val INDUSTRY_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Technology"),
    ProfileEnumOption(2, "Finance"),
    ProfileEnumOption(3, "Healthcare"),
    ProfileEnumOption(4, "Education"),
    ProfileEnumOption(5, "Manufacturing"),
    ProfileEnumOption(6, "Retail"),
    ProfileEnumOption(7, "Media"),
    ProfileEnumOption(8, "Government"),
    ProfileEnumOption(9, "Nonprofit"),
    ProfileEnumOption(10, "Other"),
  )
  val RELATIONSHIP_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Single"),
    ProfileEnumOption(2, "In a relationship"),
    ProfileEnumOption(3, "Married"),
    ProfileEnumOption(4, "Divorced"),
    ProfileEnumOption(5, "Separated"),
    ProfileEnumOption(6, "Widowed"),
    ProfileEnumOption(7, "It's complicated"),
  )
  val SEXUALITY_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Straight"),
    ProfileEnumOption(2, "Gay"),
    ProfileEnumOption(3, "Lesbian"),
    ProfileEnumOption(4, "Bisexual"),
    ProfileEnumOption(5, "Pansexual"),
    ProfileEnumOption(6, "Asexual"),
    ProfileEnumOption(7, "Queer"),
    ProfileEnumOption(8, "Questioning"),
    ProfileEnumOption(9, "Other"),
  )
  val ETHNICITY_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "White"),
    ProfileEnumOption(2, "Black"),
    ProfileEnumOption(3, "East Asian"),
    ProfileEnumOption(4, "South Asian"),
    ProfileEnumOption(5, "Southeast Asian"),
    ProfileEnumOption(6, "Middle Eastern / North African"),
    ProfileEnumOption(7, "Hispanic / Latino/a"),
    ProfileEnumOption(8, "Native American / Indigenous"),
    ProfileEnumOption(9, "Pacific Islander"),
    ProfileEnumOption(10, "Mixed"),
    ProfileEnumOption(11, "Other"),
  )
  val DATING_STYLE_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Monogamous"),
    ProfileEnumOption(2, "Non-monogamous"),
    ProfileEnumOption(3, "Open relationship"),
    ProfileEnumOption(4, "Polyamorous"),
    ProfileEnumOption(5, "Other"),
  )
  val CHILDREN_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "None"),
    ProfileEnumOption(2, "Has children"),
  )
  val WANTS_CHILDREN_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "No"),
    ProfileEnumOption(2, "Yes"),
    ProfileEnumOption(3, "Open to it"),
    ProfileEnumOption(4, "Unsure"),
  )
  val DRINKING_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Never"),
    ProfileEnumOption(2, "Rarely"),
    ProfileEnumOption(3, "Socially"),
    ProfileEnumOption(4, "Often"),
  )
  val SMOKING_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "No"),
    ProfileEnumOption(2, "Socially"),
    ProfileEnumOption(3, "Yes"),
    ProfileEnumOption(4, "Vape"),
  )
  val DRUGS_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Never"),
    ProfileEnumOption(2, "Sometimes"),
    ProfileEnumOption(3, "Often"),
  )
  val LOOKING_FOR_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Friendship"),
    ProfileEnumOption(2, "Casual"),
    ProfileEnumOption(3, "Serious"),
    ProfileEnumOption(4, "Long-term"),
    ProfileEnumOption(5, "Marriage"),
    ProfileEnumOption(6, "Not sure"),
    ProfileEnumOption(7, "Other"),
  )
  val RELIGION_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Agnostic"),
    ProfileEnumOption(2, "Atheist"),
    ProfileEnumOption(3, "Buddhist"),
    ProfileEnumOption(4, "Christian"),
    ProfileEnumOption(5, "Hindu"),
    ProfileEnumOption(6, "Jewish"),
    ProfileEnumOption(7, "Muslim"),
    ProfileEnumOption(8, "Sikh"),
    ProfileEnumOption(9, "Spiritual"),
    ProfileEnumOption(10, "Other"),
  )
  val PETS_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "No pets"),
    ProfileEnumOption(2, "Has pets"),
    ProfileEnumOption(3, "Wants pets"),
    ProfileEnumOption(4, "Allergic"),
  )
  val DIET_OPTIONS = listOf(
    ProfileEnumOption(0, "Not specified"),
    ProfileEnumOption(1, "Omnivore"),
    ProfileEnumOption(2, "Vegetarian"),
    ProfileEnumOption(3, "Vegan"),
    ProfileEnumOption(4, "Pescatarian"),
    ProfileEnumOption(5, "Halal"),
    ProfileEnumOption(6, "Kosher"),
    ProfileEnumOption(7, "Other"),
  )

  fun emptyProfile(): ContractProfileData = ContractProfileData()

  suspend fun fetchProfile(address: String): ContractProfileData? = withContext(Dispatchers.IO) {
    val addr = normalizeAddress(address) ?: return@withContext null
    runCatching { fetchProfileFromRpc(addr) }.getOrNull() ?: fetchProfileFromSubgraph(addr)
  }

  private fun fetchProfileFromSubgraph(addr: String): ContractProfileData? {
    val query = """
      {
        profile(id: "$addr") {
          profileVersion
          displayName
          nameHash
          age
          heightCm
          nationality
          languagesPacked
          friendsOpenToMask
          locationCityId
          locationLatE6
          locationLngE6
          schoolId
          skillsCommit
          hobbiesCommit
          photoURI
          gender
          relocate
          degree
          fieldBucket
          profession
          industry
          relationshipStatus
          sexuality
          ethnicity
          datingStyle
          children
          wantsChildren
          drinking
          smoking
          drugs
          lookingFor
          religion
          pets
          diet
        }
      }
    """.trimIndent()

    val json = runCatching { postQuery(query) }.getOrNull() ?: return null
    val profile = json.optJSONObject("data")?.optJSONObject("profile") ?: return null
    return ContractProfileData(
      profileVersion = profile.optInt("profileVersion", 2),
      displayName = profile.optString("displayName", ""),
      nameHash = normalizeHash(profile.optString("nameHash", "")),
      age = profile.optInt("age", 0),
      heightCm = profile.optInt("heightCm", 0),
      nationality = bytes2ToCode(profile.optString("nationality", "")) ?: "",
      languages = unpackLanguages(profile.optString("languagesPacked", "0")),
      friendsOpenToMask = profile.optInt("friendsOpenToMask", 0),
      locationCityId = normalizeHash(profile.optString("locationCityId", "")),
      locationLatE6 = profile.optInt("locationLatE6", 0),
      locationLngE6 = profile.optInt("locationLngE6", 0),
      schoolId = normalizeHash(profile.optString("schoolId", "")),
      skillsCommit = unpackTagIds(profile.optString("skillsCommit", "")).joinToString(","),
      hobbiesCommit = unpackTagIds(profile.optString("hobbiesCommit", "")).joinToString(","),
      photoUri = profile.optString("photoURI", ""),
      gender = profile.optInt("gender", 0),
      relocate = profile.optInt("relocate", 0),
      degree = profile.optInt("degree", 0),
      fieldBucket = profile.optInt("fieldBucket", 0),
      profession = profile.optInt("profession", 0),
      industry = profile.optInt("industry", 0),
      relationshipStatus = profile.optInt("relationshipStatus", 0),
      sexuality = profile.optInt("sexuality", 0),
      ethnicity = profile.optInt("ethnicity", 0),
      datingStyle = profile.optInt("datingStyle", 0),
      children = profile.optInt("children", 0),
      wantsChildren = profile.optInt("wantsChildren", 0),
      drinking = profile.optInt("drinking", 0),
      smoking = profile.optInt("smoking", 0),
      drugs = profile.optInt("drugs", 0),
      lookingFor = profile.optInt("lookingFor", 0),
      religion = profile.optInt("religion", 0),
      pets = profile.optInt("pets", 0),
      diet = profile.optInt("diet", 0),
    )
  }

  private fun fetchProfileFromRpc(addr: String): ContractProfileData? {
    val addrWord = addr.removePrefix("0x").padStart(64, '0')
    val selector = functionSelector("getProfile(address)")
    val data = "0x$selector$addrWord"
    val result = ethCall(TempoProfileContractApi.PROFILE_V2, data).removePrefix("0x")
    return decodeProfileTuple(result)
  }

  fun buildProfileInput(data: ContractProfileData): JSONObject {
    val cityId = toBytes32(data.locationCityId)
    val hasCity = cityId != ZERO_HASH
    val schoolId = toBytes32(data.schoolId)
    val nameHash = toBytes32(data.nameHash)

    return JSONObject()
      .put("profileVersion", data.profileVersion.coerceAtLeast(2))
      .put("displayName", data.displayName.trim())
      .put("nameHash", nameHash)
      .put("age", data.age.coerceAtLeast(0))
      .put("heightCm", data.heightCm.coerceAtLeast(0))
      .put("nationality", codeToBytes2(data.nationality))
      .put("languagesPacked", packLanguages(data.languages))
      .put("friendsOpenToMask", data.friendsOpenToMask and 0x07)
      .put("locationCityId", cityId)
      .put("locationLatE6", if (hasCity) data.locationLatE6.coerceIn(-90_000_000, 90_000_000) else 0)
      .put("locationLngE6", if (hasCity) data.locationLngE6.coerceIn(-180_000_000, 180_000_000) else 0)
      .put("schoolId", schoolId)
      .put("skillsCommit", toTagCommit(data.skillsCommit))
      .put("hobbiesCommit", toTagCommit(data.hobbiesCommit))
      .put("photoURI", data.photoUri.trim())
      .put("gender", data.gender.coerceIn(0, 7))
      .put("relocate", data.relocate.coerceIn(0, 3))
      .put("degree", data.degree.coerceIn(0, 9))
      .put("fieldBucket", data.fieldBucket.coerceIn(0, 16))
      .put("profession", data.profession.coerceIn(0, 10))
      .put("industry", data.industry.coerceIn(0, 10))
      .put("relationshipStatus", data.relationshipStatus.coerceIn(0, 7))
      .put("sexuality", data.sexuality.coerceIn(0, 9))
      .put("ethnicity", data.ethnicity.coerceIn(0, 11))
      .put("datingStyle", data.datingStyle.coerceIn(0, 5))
      .put("children", data.children.coerceIn(0, 2))
      .put("wantsChildren", data.wantsChildren.coerceIn(0, 4))
      .put("drinking", data.drinking.coerceIn(0, 4))
      .put("smoking", data.smoking.coerceIn(0, 4))
      .put("drugs", data.drugs.coerceIn(0, 3))
      .put("lookingFor", data.lookingFor.coerceIn(0, 7))
      .put("religion", data.religion.coerceIn(0, 10))
      .put("pets", data.pets.coerceIn(0, 4))
      .put("diet", data.diet.coerceIn(0, 7))
  }

  fun languageLabel(code: String): String {
    return languageLabels[code.trim().lowercase()] ?: code.uppercase()
  }

  fun proficiencyLabel(level: Int): String = when (level) {
    7 -> "Native"
    6 -> "C2"
    5 -> "C1"
    4 -> "B2"
    3 -> "B1"
    2 -> "A2"
    1 -> "A1"
    else -> "Not specified"
  }

  fun selectedFriendsLabels(mask: Int): List<String> {
    val out = mutableListOf<String>()
    if ((mask and 0x1) != 0) out.add("Men")
    if ((mask and 0x2) != 0) out.add("Women")
    if ((mask and 0x4) != 0) out.add("Non-binary")
    return out
  }

  fun enumLabel(options: List<ProfileEnumOption>, value: Int): String? {
    if (value <= 0) return null
    return options.firstOrNull { it.value == value }?.label
  }

  fun hasCoords(latE6: Int, lngE6: Int): Boolean {
    if (latE6 == 0 && lngE6 == 0) return false
    return latE6 in -90_000_000..90_000_000 && lngE6 in -180_000_000..180_000_000
  }

  fun bytes2ToCode(hex: String): String? {
    val raw = hex.removePrefix("0x")
    if (raw.length < 4) return null
    val value = raw.take(4).toIntOrNull(16) ?: return null
    if (value == 0) return null
    val c1 = ((value ushr 8) and 0xff).toChar()
    val c2 = (value and 0xff).toChar()
    if (!c1.isLetter() || !c2.isLetter()) return null
    return "$c1$c2".uppercase()
  }

  private fun codeToBytes2(code: String): String {
    val trimmed = code.trim().uppercase()
    if (trimmed.length < 2) return "0x0000"
    val c1 = trimmed[0].code
    val c2 = trimmed[1].code
    return "0x${c1.toString(16).padStart(2, '0')}${c2.toString(16).padStart(2, '0')}"
  }

  private fun normalizeAddress(address: String?): String? {
    val value = address?.trim()?.lowercase().orEmpty()
    if (!value.startsWith("0x") || value.length != 42) return null
    return value
  }

  private fun normalizeHash(raw: String?): String {
    val value = raw?.trim()?.lowercase().orEmpty()
    if (value.isBlank() || value == ZERO_HASH) return ""
    return value
  }

  private fun toBytes32(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return ZERO_HASH
    if (trimmed.startsWith("0x") && trimmed.length == 66 && trimmed.drop(2).all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
      return trimmed.lowercase()
    }
    val hash = OnboardingRpcHelpers.keccak256(trimmed.toByteArray(Charsets.UTF_8))
    return "0x${OnboardingRpcHelpers.bytesToHex(hash)}"
  }

  private fun packLanguages(entries: List<ProfileLanguageEntry>): String {
    var packed = BigInteger.ZERO
    val slots = entries.take(8)
    for ((index, entry) in slots.withIndex()) {
      val code = entry.code.trim().lowercase()
      if (code.length != 2 || !code.all { it.isLetter() }) continue
      val upper = code.uppercase()
      val langVal = (upper[0].code shl 8) or upper[1].code
      val slotVal = ((langVal and 0xFFFF) shl 16) or ((entry.proficiency and 0xFF) shl 8)
      val shift = (7 - index) * 32
      packed = packed.or(BigInteger.valueOf(slotVal.toLong()).shiftLeft(shift))
    }
    return packed.toString(10)
  }

  private fun unpackLanguages(packedDec: String): List<ProfileLanguageEntry> {
    val packed = packedDec.trim().ifBlank { "0" }.toBigIntegerOrNull() ?: BigInteger.ZERO
    if (packed == BigInteger.ZERO) return emptyList()

    val mask = BigInteger("ffffffff", 16)
    val out = ArrayList<ProfileLanguageEntry>(8)
    for (i in 0 until 8) {
      val shift = (7 - i) * 32
      val slot = packed.shiftRight(shift).and(mask).toLong()
      if (slot == 0L) continue
      val langVal = ((slot ushr 16) and 0xFFFF).toInt()
      val proficiency = ((slot ushr 8) and 0xFF).toInt()
      if (langVal == 0 || proficiency !in 1..7) continue

      val c1 = ((langVal ushr 8) and 0xFF).toChar()
      val c2 = (langVal and 0xFF).toChar()
      val code = "$c1$c2".lowercase()
      if (!code.all { it.isLetter() }) continue

      out.add(ProfileLanguageEntry(code, proficiency))
    }
    return out
  }

  private fun toTagCommit(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isBlank()) return ZERO_HASH
    if (trimmed.startsWith("0x") && trimmed.length == 66 && trimmed.drop(2).all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
      return trimmed.lowercase()
    }
    return packTagIds(parseTagCsv(trimmed))
  }

  private fun parseTagCsv(csv: String): List<Int> {
    return csv
      .split(",")
      .map { it.trim() }
      .filter { it.isNotEmpty() }
      .mapNotNull { it.toIntOrNull() }
      .filter { it in 1..0xFFFF }
      .distinct()
      .sorted()
      .take(16)
  }

  private fun packTagIds(ids: List<Int>): String {
    if (ids.isEmpty()) return ZERO_HASH
    val slots = ids.toMutableList()
    while (slots.size < 16) slots.add(0)
    val hex = buildString {
      append("0x")
      for (id in slots.take(16)) {
        append(id.toString(16).padStart(4, '0'))
      }
    }
    return hex
  }

  private fun unpackTagIds(hex: String): List<Int> {
    val raw = hex.removePrefix("0x")
    if (raw.length != 64) return emptyList()
    return buildList {
      var index = 0
      while (index < raw.length) {
        val id = raw.substring(index, index + 4).toIntOrNull(16) ?: 0
        if (id > 0) add(id)
        index += 4
      }
    }
  }

  private fun postQuery(query: String): JSONObject {
    val bodyStr = JSONObject().put("query", query).toString()
    for (url in profileSubgraphUrls()) {
      try {
        val body = bodyStr.toRequestBody(jsonMediaType)
        val request = Request.Builder().url(url).post(body).build()
        client.newCall(request).execute().use { response ->
          if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}")
          return JSONObject(response.body?.string().orEmpty())
        }
      } catch (_: Exception) {
        continue
      }
    }
    throw IllegalStateException("Profiles query failed: all subgraph endpoints unreachable")
  }

  private fun profileSubgraphUrls(): List<String> {
    val fromBuildConfig = BuildConfig.TEMPO_PROFILES_SUBGRAPH_URL.trim().removeSuffix("/")
    val urls = ArrayList<String>(3)
    if (fromBuildConfig.isNotBlank()) urls.add(fromBuildConfig)
    urls.add(DEFAULT_TEMPO_SUBGRAPH_PROFILES)
    urls.add(LEGACY_SUBGRAPH_PROFILES)
    return urls.distinct()
  }

  private fun decodeProfileTuple(hex: String): ContractProfileData? {
    if (hex.length < 64) return null
    val tupleOffsetBytes = hexWordToBigInt(wordAt(hex, 0)).toInt()
    val tupleBase = tupleOffsetBytes * 2
    val requiredHeadWords = 17
    if (tupleBase < 0 || tupleBase + (requiredHeadWords * 64) > hex.length) return null

    fun tupleWord(index: Int): String = hex.substring(tupleBase + (index * 64), tupleBase + ((index + 1) * 64))

    val exists = hexWordToBigInt(tupleWord(1)) != BigInteger.ZERO
    if (!exists) return null

    val profileVersion = hexWordToBigInt(tupleWord(0)).toInt()
    val age = hexWordToBigInt(tupleWord(2)).toInt()
    val heightCm = hexWordToBigInt(tupleWord(3)).toInt()
    val nationality = bytes2ToCode("0x${tupleWord(4).take(4)}") ?: ""
    val friendsOpenToMask = hexWordToBigInt(tupleWord(5)).toInt()
    val languagesPacked = hexWordToBigInt(tupleWord(6))
    val locationCityId = normalizeHash("0x${tupleWord(7)}")
    val locationLatE6 = decodeInt32Word(tupleWord(8))
    val locationLngE6 = decodeInt32Word(tupleWord(9))
    val schoolId = normalizeHash("0x${tupleWord(10)}")
    val skillsCommit = unpackTagIds("0x${tupleWord(11)}").joinToString(",")
    val hobbiesCommit = unpackTagIds("0x${tupleWord(12)}").joinToString(",")
    val nameHash = normalizeHash("0x${tupleWord(13)}")
    val packedEnums = hexWordToBigInt(tupleWord(14))

    val displayNameOffset = hexWordToBigInt(tupleWord(15)).toInt()
    val photoUriOffset = hexWordToBigInt(tupleWord(16)).toInt()
    val displayName = decodeDynamicString(hex, tupleBase, displayNameOffset)
    val photoUri = decodeDynamicString(hex, tupleBase, photoUriOffset)

    fun enumAt(index: Int): Int = packedEnums.shiftRight(index * 8).and(BigInteger.valueOf(0xFF)).toInt()

    return ContractProfileData(
      profileVersion = profileVersion,
      displayName = displayName,
      nameHash = nameHash,
      age = age,
      heightCm = heightCm,
      nationality = nationality,
      languages = unpackLanguages(languagesPacked.toString(10)),
      friendsOpenToMask = friendsOpenToMask,
      locationCityId = locationCityId,
      locationLatE6 = locationLatE6,
      locationLngE6 = locationLngE6,
      schoolId = schoolId,
      skillsCommit = skillsCommit,
      hobbiesCommit = hobbiesCommit,
      photoUri = photoUri,
      gender = enumAt(0),
      relocate = enumAt(1),
      degree = enumAt(2),
      fieldBucket = enumAt(3),
      profession = enumAt(4),
      industry = enumAt(5),
      relationshipStatus = enumAt(6),
      sexuality = enumAt(7),
      ethnicity = enumAt(8),
      datingStyle = enumAt(9),
      children = enumAt(10),
      wantsChildren = enumAt(11),
      drinking = enumAt(12),
      smoking = enumAt(13),
      drugs = enumAt(14),
      lookingFor = enumAt(15),
      religion = enumAt(16),
      pets = enumAt(17),
      diet = enumAt(18),
    )
  }

  private fun decodeDynamicString(
    hex: String,
    tupleBase: Int,
    offsetBytes: Int,
  ): String {
    if (offsetBytes < 0) return ""
    val start = tupleBase + (offsetBytes * 2)
    if (start + 64 > hex.length) return ""
    val len = hexWordToBigInt(hex.substring(start, start + 64)).toInt()
    if (len <= 0) return ""
    val dataStart = start + 64
    val dataEnd = dataStart + (len * 2)
    if (dataEnd > hex.length) return ""
    val raw = hex.substring(dataStart, dataEnd)
    return String(OnboardingRpcHelpers.hexToBytes(raw), Charsets.UTF_8)
  }

  private fun decodeInt32Word(word: String): Int {
    val low32 = hexWordToBigInt(word).and(BigInteger("ffffffff", 16)).toLong()
    return if (low32 >= 0x80000000L) (low32 - 0x1_0000_0000L).toInt() else low32.toInt()
  }

  private fun wordAt(hex: String, index: Int): String {
    val start = index * 64
    val end = start + 64
    if (start < 0 || end > hex.length) return "0".repeat(64)
    return hex.substring(start, end)
  }

  private fun hexWordToBigInt(word: String): BigInteger {
    if (word.isBlank()) return BigInteger.ZERO
    return word.toBigIntegerOrNull(16) ?: BigInteger.ZERO
  }

  private fun functionSelector(sig: String): String {
    val hash = OnboardingRpcHelpers.keccak256(sig.toByteArray(Charsets.UTF_8))
    return OnboardingRpcHelpers.bytesToHex(hash.copyOfRange(0, 4))
  }

  private fun ethCall(to: String, data: String): String {
    val payload =
      JSONObject()
        .put("jsonrpc", "2.0")
        .put("id", 1)
        .put("method", "eth_call")
        .put(
          "params",
          JSONArray()
            .put(JSONObject().put("to", to).put("data", data))
            .put("latest"),
        )

    val req =
      Request.Builder()
        .url(TempoClient.RPC_URL)
        .post(payload.toString().toRequestBody(jsonMediaType))
        .build()

    client.newCall(req).execute().use { response ->
      if (!response.isSuccessful) throw IllegalStateException("RPC failed: ${response.code}")
      val body = JSONObject(response.body?.string().orEmpty())
      val error = body.optJSONObject("error")
      if (error != null) throw IllegalStateException(error.optString("message", error.toString()))
      return body.optString("result", "0x")
    }
  }
}
