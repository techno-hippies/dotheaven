// Chat - Messaging components
export * from './chat'

// Community - Member discovery
export * from './community'

// Media - Music/audio playback
export * from './media'

// Onboarding - User onboarding flow
export * from './onboarding'

// Profile - User profile editing
export * from './profile'

// Scheduler - Booking calendar (external-facing)
export * from './scheduler'

// Scheduling - Dashboard & management (host-side)
export * from './scheduling'

// Shared - Generic reusable components
export * from './shared'

// Data exports (re-exported for convenience)
export {
  HOBBY_TAGS, SKILL_TAGS, HOBBY_BY_ID, SKILL_BY_ID,
  getTagLabel, packTagIds, unpackTagIds,
  tagIdsToString, stringToTagIds, tagIdsToValues, valuesToTagIds, tagsToOptions,
  type Tag,
} from '../data/tags'
export {
  type LanguageEntry, type ProficiencyLevel,
  PROFICIENCY, PROFICIENCY_LEVELS, PROFICIENCY_OPTIONS, LANG_TO_FLAG,
  proficiencyLabel, packLanguages, packLanguagesHex, unpackLanguages,
  getNativeLanguages, getLearningLanguages,
} from '../data/languages'
