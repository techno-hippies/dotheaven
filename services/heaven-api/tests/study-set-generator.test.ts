import { describe, expect, it } from 'bun:test'
import type { StudySetPack } from '../src/lib/study-set-generator'
import { validateStudySetPack } from '../src/lib/study-set-generator'

function basePack(): StudySetPack {
  return {
    specVersion: 'exercise-pack-v1',
    trackId: '0xabc123',
    language: 'en',
    sourceRefs: {
      lyricsRef: 'ar://lyrics-id',
      geniusRef: 'genius:123',
    },
    generator: {
      model: 'google/gemini-3-flash-preview',
      promptHash: `0x${'a'.repeat(64)}`,
      generatedAt: 1_739_980_800,
    },
    lineTags: [
      { text: 'Is this the real life?', lang: 'en' },
    ],
    questions: [
      {
        id: 'sib-001',
        type: 'say_it_back',
        prompt: 'Listen and repeat:',
        excerpt: 'Is this the real life?',
        choices: [],
        correctIndex: 0,
        explanation: 'Repeat clearly.',
        difficulty: 'easy',
      },
      {
        id: 'tr-001',
        type: 'translation_mcq',
        prompt: 'Which line means: Is this the real life?',
        excerpt: 'Is this the real life?',
        choices: [
          'Is this the real life?',
          'Is this the real dream?',
          'Is this your fantasy?',
          'Is this our memory?',
        ],
        correctIndex: 0,
        explanation: 'The exact line is the first option.',
        difficulty: 'easy',
      },
    ],
    compliance: {
      excerptPolicy: 'max-one-line-per-question',
      attribution: {
        track: 'Bohemian Rhapsody',
        artist: 'Queen',
        geniusSongId: 75243,
      },
    },
  }
}

describe('validateStudySetPack', () => {
  it('accepts a valid pack', () => {
    const issues = validateStudySetPack(basePack())
    expect(issues).toEqual([])
  })

  it('rejects duplicate ids and malformed MCQ shape', () => {
    const pack = basePack()
    pack.questions[1].id = 'sib-001'
    pack.questions[1].choices = ['only one']
    pack.questions[1].correctIndex = 4

    const issues = validateStudySetPack(pack)
    expect(issues.some((issue) => issue.includes('duplicate id'))).toBe(true)
    expect(issues.some((issue) => issue.includes('mcq choices must be 4'))).toBe(true)
    expect(issues.some((issue) => issue.includes('correctIndex out of range'))).toBe(true)
  })

  it('rejects invalid metadata fields', () => {
    const pack = basePack()
    pack.specVersion = 'exercise-pack-v0' as StudySetPack['specVersion']
    pack.generator.promptHash = '0x1234'
    pack.generator.generatedAt = 0

    const issues = validateStudySetPack(pack)
    expect(issues).toContain('specVersion must be exercise-pack-v1')
    expect(issues).toContain('generator.promptHash must be 0x + 64 hex chars')
    expect(issues).toContain('generator.generatedAt must be a unix timestamp')
  })
})
