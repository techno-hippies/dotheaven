import { beforeEach, describe, expect, it } from 'bun:test'
import {
  generateStudySetWithOpenRouter,
  type TaggedLyricLine,
} from '../src/lib/study-set-generator'

function makeBaseLineTags(): TaggedLyricLine[] {
  const lines = [
    'First lyric line for testing',
    'Second lyric line for testing',
    'Third lyric line for testing',
    'Fourth lyric line for testing',
    'Fifth lyric line for testing',
    'Sixth lyric line for testing',
  ]

  return lines.map((text, index) => ({
    text,
    lang: 'en',
    lineId: `L-${String(index + 1).padStart(3, '0')}`,
    lineIndex: index,
    allPositions: [index],
    difficulty: index < 2 ? 1.8 : index < 4 ? 3.2 : 4.4,
    difficultyLlm: index < 2 ? 2 : index < 4 ? 3 : 4,
    difficultyLexical: index < 2 ? 1.8 : index < 4 ? 3.2 : 4.4,
    top1kRatio: 0.8,
    top10kRatio: 1,
    fleschKincaid: 2.2,
  }))
}

beforeEach(() => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url === 'https://openrouter.ai/api/v1/chat/completions' && method === 'POST') {
      const payload = {
        translation_mcq: [
          {
            prompt: '¿Qué línea significa: primera línea?',
            excerpt: 'First lyric line for testing',
            sourceLineId: 'L-001',
            choices: [
              'First lyric line for testing',
              'Second lyric line for testing',
              'Third lyric line for testing',
              'Fourth lyric line for testing',
            ],
            correctIndex: 0,
            explanation: 'La primera opción coincide con el significado solicitado.',
            choiceRationales: [
              'Correcto: Coincide con el significado del prompt.',
              'Incorrecto: Esta línea habla de otro contenido.',
              'Incorrecto: No corresponde al significado pedido.',
              'Incorrecto: Es una línea distinta.',
            ],
            difficulty: 'easy',
          },
          {
            prompt: '¿Qué línea significa: tercera línea?',
            excerpt: 'Third lyric line for testing',
            sourceLineId: 'L-003',
            choices: [
              'Second lyric line for testing',
              'Third lyric line for testing',
              'Fifth lyric line for testing',
              'Sixth lyric line for testing',
            ],
            correctIndex: 1,
            explanation: 'La tercera línea es la opción correcta.',
            choiceRationales: [
              'Incorrecto: Es una línea diferente.',
              'Correcto: Esta línea coincide con el significado.',
              'Incorrecto: No expresa la tercera línea.',
              'Incorrecto: No corresponde al prompt.',
            ],
            difficulty: 'medium',
          },
        ],
        trivia_mcq: [
          {
            prompt: '¿Qué hecho aparece en la anotación?',
            excerpt: 'Fifth lyric line for testing',
            sourceLineId: 'L-005',
            choices: [
              'Dato A',
              'Dato B',
              'Dato C',
              'Dato D',
            ],
            correctIndex: 2,
            explanation: 'El hecho correcto es el dato C según la anotación.',
            choiceRationales: [
              'Incorrecto: No coincide con la anotación.',
              'Incorrecto: No aparece en la anotación.',
              'Correcto: Este dato está sustentado por la anotación.',
              'Incorrecto: Es un distractor plausible pero falso.',
            ],
            difficulty: 'medium',
            sourceClassification: 'accepted',
          },
        ],
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    throw new Error(`Unhandled fetch ${method} ${url}`)
  }) as typeof fetch
})

describe('study set generation flow', () => {
  it('interleaves say_it_back, translation_mcq, and trivia_mcq', async () => {
    const lineTags = makeBaseLineTags()
    const result = await generateStudySetWithOpenRouter('test-key', {
      trackId: '0xabc',
      language: 'es',
      title: 'Test Song',
      artist: 'Test Artist',
      lyrics: lineTags.map((line) => line.text).join('\n'),
      geniusSongId: '123',
      geniusReferents: [{ fragment: lineTags[4].text, annotation: 'Test annotation', classification: 'accepted' }],
      precomputedLineTags: lineTags,
      sayItBackCount: 3,
      translationCount: 2,
      triviaCount: 1,
      model: 'google/gemini-3-flash-preview',
    })

    const types = result.pack.questions.map((question) => question.type)
    expect(types).toEqual([
      'say_it_back',
      'translation_mcq',
      'say_it_back',
      'translation_mcq',
      'say_it_back',
      'trivia_mcq',
    ])

    const firstMcq = result.pack.questions.find((question) => question.type === 'translation_mcq')
    expect(firstMcq).toBeDefined()
    expect(firstMcq?.choiceRationales?.some((rationale) => /^(correcto|incorrecto)\s*[:.\-]/i.test(rationale))).toBe(false)

    result.pack.questions.forEach((question) => {
      expect(Number.isFinite(question.difficultyScore)).toBe(true)
      expect(question.difficultyScore).toBeGreaterThanOrEqual(1)
      expect(question.difficultyScore).toBeLessThanOrEqual(5)
    })
  })

  it('balances say_it_back difficulty spread when enough lines exist', async () => {
    const lineTags = makeBaseLineTags()
    const result = await generateStudySetWithOpenRouter('test-key', {
      trackId: '0xdef',
      language: 'en',
      title: 'Difficulty Song',
      artist: 'Test Artist',
      lyrics: lineTags.map((line) => line.text).join('\n'),
      precomputedLineTags: lineTags,
      sayItBackCount: 6,
      model: 'google/gemini-3-flash-preview',
    })

    const sayItBack = result.pack.questions.filter((question) => question.type === 'say_it_back')
    expect(sayItBack.length).toBe(6)

    const counts = sayItBack.reduce(
      (acc, question) => {
        acc[question.difficulty] += 1
        return acc
      },
      { easy: 0, medium: 0, hard: 0 } as Record<'easy' | 'medium' | 'hard', number>,
    )
    expect(counts).toEqual({ easy: 2, medium: 2, hard: 2 })
  })

  it('avoids adjacent same-type questions with 6/4/3 mix', async () => {
    const lineTags = makeBaseLineTags()

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url !== 'https://openrouter.ai/api/v1/chat/completions' || method !== 'POST') {
        throw new Error(`Unhandled fetch ${method} ${url}`)
      }

      const payload = {
        translation_mcq: [
          {
            prompt: '¿Qué línea significa: primera línea?',
            excerpt: lineTags[0].text,
            sourceLineId: lineTags[0].lineId,
            choices: [lineTags[0].text, lineTags[1].text, lineTags[2].text, lineTags[3].text],
            correctIndex: 0,
            explanation: 'Coincide con la primera línea.',
            choiceRationales: [
              'Coincide exactamente con el significado del prompt.',
              'Describe una línea distinta.',
              'No corresponde al significado pedido.',
              'No es la línea correcta.',
            ],
            difficulty: 'easy',
          },
          {
            prompt: '¿Qué línea significa: tercera línea?',
            excerpt: lineTags[2].text,
            sourceLineId: lineTags[2].lineId,
            choices: [lineTags[1].text, lineTags[2].text, lineTags[4].text, lineTags[5].text],
            correctIndex: 1,
            explanation: 'La tercera línea es la correcta.',
            choiceRationales: [
              'No corresponde a la tercera línea.',
              'Esta coincide con el significado solicitado.',
              'Es una línea distinta.',
              'No coincide con el prompt.',
            ],
            difficulty: 'medium',
          },
          {
            prompt: '¿Qué línea significa: quinta línea?',
            excerpt: lineTags[4].text,
            sourceLineId: lineTags[4].lineId,
            choices: [lineTags[0].text, lineTags[3].text, lineTags[4].text, lineTags[5].text],
            correctIndex: 2,
            explanation: 'La quinta línea es la correcta.',
            choiceRationales: [
              'No corresponde a la quinta línea.',
              'Es una línea diferente.',
              'Coincide con el significado solicitado.',
              'No expresa la quinta línea.',
            ],
            difficulty: 'medium',
          },
          {
            prompt: '¿Qué línea significa: sexta línea?',
            excerpt: lineTags[5].text,
            sourceLineId: lineTags[5].lineId,
            choices: [lineTags[0].text, lineTags[2].text, lineTags[3].text, lineTags[5].text],
            correctIndex: 3,
            explanation: 'La sexta línea es la correcta.',
            choiceRationales: [
              'No coincide con la sexta línea.',
              'Es una línea distinta.',
              'No corresponde al significado pedido.',
              'Coincide exactamente con el prompt.',
            ],
            difficulty: 'hard',
          },
        ],
        trivia_mcq: [
          {
            prompt: '¿Qué hecho aparece en la anotación 1?',
            excerpt: lineTags[1].text,
            sourceLineId: lineTags[1].lineId,
            choices: ['Dato A', 'Dato B', 'Dato C', 'Dato D'],
            correctIndex: 0,
            explanation: 'Dato A es el hecho correcto.',
            choiceRationales: [
              'Es el único dato respaldado por la anotación.',
              'No aparece en la anotación.',
              'Es un distractor plausible pero falso.',
              'No coincide con la evidencia.',
            ],
            difficulty: 'easy',
            sourceClassification: 'accepted',
          },
          {
            prompt: '¿Qué hecho aparece en la anotación 2?',
            excerpt: lineTags[3].text,
            sourceLineId: lineTags[3].lineId,
            choices: ['Hecho X', 'Hecho Y', 'Hecho Z', 'Hecho W'],
            correctIndex: 2,
            explanation: 'Hecho Z es correcto.',
            choiceRationales: [
              'No está sustentado por la anotación.',
              'No coincide con el hecho señalado.',
              'Este sí está indicado en la anotación.',
              'Es un distractor incorrecto.',
            ],
            difficulty: 'medium',
            sourceClassification: 'accepted',
          },
          {
            prompt: '¿Qué hecho aparece en la anotación 3?',
            excerpt: lineTags[4].text,
            sourceLineId: lineTags[4].lineId,
            choices: ['Afirmación 1', 'Afirmación 2', 'Afirmación 3', 'Afirmación 4'],
            correctIndex: 1,
            explanation: 'Afirmación 2 es correcta.',
            choiceRationales: [
              'No corresponde con la anotación.',
              'Está respaldada por la anotación.',
              'No coincide con los hechos.',
              'Es un distractor sin soporte.',
            ],
            difficulty: 'hard',
            sourceClassification: 'accepted',
          },
        ],
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }) as typeof fetch

    const result = await generateStudySetWithOpenRouter('test-key', {
      trackId: '0xaaa',
      language: 'es',
      title: 'Interleave Song',
      artist: 'Test Artist',
      lyrics: lineTags.map((line) => line.text).join('\n'),
      geniusSongId: '123',
      geniusReferents: [
        { fragment: lineTags[1].text, annotation: 'Fact 1', classification: 'accepted' },
        { fragment: lineTags[3].text, annotation: 'Fact 2', classification: 'accepted' },
        { fragment: lineTags[4].text, annotation: 'Fact 3', classification: 'accepted' },
      ],
      precomputedLineTags: lineTags,
      sayItBackCount: 6,
      translationCount: 4,
      triviaCount: 3,
      model: 'google/gemini-3-flash-preview',
    })

    const types = result.pack.questions.map((question) => question.type)
    expect(types.length).toBe(13)
    for (let i = 1; i < types.length; i += 1) {
      expect(types[i]).not.toBe(types[i - 1])
    }
  })
})
