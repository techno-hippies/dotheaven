# Study Set Examples (exercise-pack-v2)

Reference examples for all exercise types, per-language. These examples inform prompt design and UI rendering.

`exercise-pack-v2` requires stable line identity:
- `lineTags[]` entries include `lineId`, `lineIndex`, and `allPositions`.
- Every question includes `sourceLineId`, referencing `lineTags[].lineId`.

## Exercise Types

| Type | Requires LLM? | Requires Genius? | Free / Paid | Notes |
|------|---------------|-----------------|-------------|-------|
| `say_it_back` | No | No | Free for curated catalog; included after unlock for on-demand songs | Line-by-line repeat. Uses STT grading. |
| `translation_mcq` | Yes | No | Free for curated catalog; included after unlock for on-demand songs | Translate lyric line → target language. 4-6 distractors. |
| `trivia_mcq` | Yes | Yes (referents) | Free for curated catalog; included after unlock for on-demand songs | Jeopardy-style factual/interpretive questions from Genius annotations. |

### UI ordering

1. **Say-it-back** exercises shown first (no generation cost, instant).
2. **Translation MCQ** shown next (LLM-generated, per-language).
3. **Trivia MCQ** shown last (LLM + Genius, language-agnostic but localized).

Rationale: say-it-back gives immediate value with no LLM generation dependency. For free-catalog songs it is free with soft STT caps; for on-demand songs it is included in the same unlock credit as MCQ/trivia.

---

## Type 1: Say It Back

No LLM needed. Extract lines from lyrics, present one at a time.

### Example (Despacito — Spanish learner)

```json
{
  "id": "sib-001",
  "type": "say_it_back",
  "prompt": "Listen and repeat:",
  "excerpt": "Quiero desnudarte a besos despacito",
  "sourceLineId": "L-012",
  "choices": [],
  "explanation": "Focus on the rolled 'r' in 'Quiero' and the soft 't' in 'despacito'.",
  "difficulty": "medium",
  "excerptLang": "es"
}
```

### Example (Bohemian Rhapsody — English learner)

```json
{
  "id": "sib-002",
  "type": "say_it_back",
  "prompt": "Listen and repeat:",
  "excerpt": "Is this the real life? Is this just fantasy?",
  "sourceLineId": "L-021",
  "choices": [],
  "explanation": "Pay attention to the rising intonation on each question.",
  "difficulty": "easy",
  "excerptLang": "en"
}
```

### Generation rules

- One exercise per non-empty lyric line (skip section markers like `[Verse 1]`).
- Strip trailing ad libs: `"poor boy (Ooh)"` → `"poor boy"`.
- Skip lines < 3 words.
- Skip duplicate lines for question generation (chorus repeats → one question), but preserve duplicate raw positions in `lineTags[].allPositions`.
- Optional: word-level timing from alignment data for karaoke-style highlighting.

---

## Type 2: Translation MCQ

LLM generates translation + plausible distractors. **Jeopardy-style**: the prompt is in the target language, the answer is the original lyric meaning.

### Example (Despacito — English speaker learning Spanish)

```json
{
  "id": "tr-001",
  "type": "translation_mcq",
  "prompt": "Which lyric translates to: 'I want to undress you with kisses, slowly'?",
  "excerpt": "Quiero desnudarte a besos despacito",
  "sourceLineId": "L-012",
  "choices": [
    "Quiero desnudarte a besos despacito",
    "Quiero besarte despacio en silencio",
    "Quiero abrazarte con besos rápido",
    "Quiero encontrarte a pasos despacito"
  ],
  "correctIndex": 0,
  "explanation": "'Desnudarte a besos' literally means 'undress you with kisses' — a metaphor for intimate affection. 'Despacito' means 'slowly'.",
  "difficulty": "medium"
}
```

### Example (Bohemian Rhapsody — Chinese speaker learning English)

```json
{
  "id": "tr-002",
  "type": "translation_mcq",
  "prompt": "哪句歌词的意思是：'妈妈，我刚刚杀了一个人'？",
  "excerpt": "Mama, just killed a man",
  "sourceLineId": "L-021",
  "choices": [
    "Mama, just killed a man",
    "Mama, just kissed a man",
    "Mama, just called a man",
    "Mama, just held a man"
  ],
  "correctIndex": 0,
  "explanation": "'killed' 意思是 '杀死'。注意发音：killed /kɪld/ 和 kissed /kɪst/ 很容易混淆。",
  "difficulty": "easy"
}
```

### Example (Despacito — Japanese speaker learning Spanish)

```json
{
  "id": "tr-003",
  "type": "translation_mcq",
  "prompt": "「ゆっくりキスで君を脱がしたい」という意味の歌詞はどれですか？",
  "excerpt": "Quiero desnudarte a besos despacito",
  "sourceLineId": "L-012",
  "choices": [
    "Quiero desnudarte a besos despacito",
    "Quiero cantarte a gritos despacito",
    "Quiero mirarte a solas despacio",
    "Quiero olvidarte a pasos despacito"
  ],
  "correctIndex": 0,
  "explanation": "「desnudarte a besos」は「キスで脱がす」という意味の比喩表現です。「despacito」は「ゆっくり」。",
  "difficulty": "medium"
}
```

### Generation rules

- Jeopardy inversion: prompt gives the meaning in the learner's native language, choices are original lyric lines (or plausible alternatives).
- One correct lyric line + 3-5 plausible distractor lines (same language as the song, similar structure, wrong meaning).
- Explanation in the learner's native language.
- Max one lyric line per question (copyright guardrail).

---

## Type 3: Trivia MCQ

LLM generates questions from Genius annotations (referents). **Jeopardy-style**: answer reveals the fact, question tests knowledge.

### Source: Genius referents

Genius API returns per-song annotations:

```
fragment: "Quiero desnudarte a besos despacito / Firmar las paredes de tu laberinto / Y hacer de tu cuerpo todo un manuscrito"
annotation: "These are just kind of metaphors to just saying a lot of things. And a lot of things about this lyric, it's almost better not to over-explain them, because everybody interprets these lyrics in a different way..."
classification: "verified"  (artist-verified)
```

```
fragment: "Is this the real life? Is this just fantasy?"
annotation: "The protagonist appears to be stuck in a sort-of limbo or purgatory, trapped between two worlds. He's unsure about his current situation..."
classification: "unreviewed"  (community)
```

### Example (Despacito — factual, any language)

```json
{
  "id": "tv-001",
  "type": "trivia_mcq",
  "prompt": "In 'Despacito', Luis Fonsi describes the lyrics as being like what kind of experience?",
  "excerpt": "Quiero ver bailar tu pelo, quiero ser tu ritmo",
  "sourceLineId": "L-018",
  "choices": [
    "Slow dancing with someone",
    "Running through a rainstorm",
    "Driving down a highway at night",
    "Walking through a garden"
  ],
  "correctIndex": 0,
  "explanation": "Luis Fonsi said: 'The whole song is kinda like if I were singing it to her while we're slow dancing. The way that the lyrics fall with the rhythm, it's all very rhythmic, sensual.'",
  "difficulty": "medium",
  "source": "genius",
  "sourceClassification": "verified"
}
```

### Example (Bohemian Rhapsody — interpretive, any language)

```json
{
  "id": "tv-002",
  "type": "trivia_mcq",
  "prompt": "What emotional stage does the protagonist reach in the outro of 'Bohemian Rhapsody'?",
  "excerpt": "Any way the wind blows...",
  "sourceLineId": "L-039",
  "choices": [
    "Acceptance",
    "Denial",
    "Bargaining",
    "Anger"
  ],
  "correctIndex": 0,
  "explanation": "The outro represents the fifth stage of grief: acceptance. The protagonist stops resisting and decides to go wherever fate takes him.",
  "difficulty": "hard",
  "source": "genius",
  "sourceClassification": "unreviewed"
}
```

### Example (Bohemian Rhapsody — origin trivia)

```json
{
  "id": "tv-003",
  "type": "trivia_mcq",
  "prompt": "What was the working title of 'Bohemian Rhapsody' when Freddie Mercury first wrote 'Mama, just killed a man' in 1968?",
  "excerpt": "Mama, just killed a man",
  "sourceLineId": "L-021",
  "choices": [
    "The Cowboy Song",
    "The Opera Song",
    "The Ballad of Freddie",
    "Galileo"
  ],
  "correctIndex": 0,
  "explanation": "Mercury reportedly wrote the lyric 'Mama, just killed a man' as early as 1968. At the time, the song's working title was 'The Cowboy Song'.",
  "difficulty": "hard",
  "source": "genius",
  "sourceClassification": "unreviewed"
}
```

### Generation rules

- One question per high-quality Genius referent (skip annotations < 50 chars).
- Prefer `verified` > `accepted` > `unreviewed` annotations.
- Jeopardy inversion: question asks about the fact, answer is the specific detail.
- Max one lyric line as `excerpt` context (copyright guardrail).
- Trivia questions are language-agnostic in content but prompt/explanation should be localized to the learner's language.
- Difficulty tagged: easy (basic facts), medium (specific details), hard (obscure origin stories).

---

## Pack structure (full example)

A complete study set for one track + one language:

```json
{
  "specVersion": "exercise-pack-v2",
  "trackId": "0x...",
  "language": "en",
  "sourceRefs": {
    "lyricsRef": "ar://lyrics-tx-id",
    "geniusRef": "genius:2955220"
  },
  "generator": {
    "model": "google/gemini-3-flash-preview",
    "promptHash": "0xabc...",
    "generatedAt": 1739980800
  },
  "lineTags": [
    {
      "lineId": "L-001",
      "lineIndex": 0,
      "allPositions": [12, 34],
      "text": "Quiero desnudarte a besos despacito",
      "lang": "es"
    },
    {
      "lineId": "L-002",
      "lineIndex": 1,
      "allPositions": [56],
      "text": "Mama, just killed a man",
      "lang": "en"
    }
  ],
  "questions": [
    { "id": "sib-001", "type": "say_it_back", "sourceLineId": "L-001", "..." : "..." },
    { "id": "sib-002", "type": "say_it_back", "sourceLineId": "L-002", "..." : "..." },
    { "id": "tr-001", "type": "translation_mcq", "sourceLineId": "L-001", "..." : "..." },
    { "id": "tr-002", "type": "translation_mcq", "sourceLineId": "L-002", "..." : "..." },
    { "id": "tv-001", "type": "trivia_mcq", "sourceLineId": "L-001", "..." : "..." },
    { "id": "tv-002", "type": "trivia_mcq", "sourceLineId": "L-002", "..." : "..." }
  ],
  "compliance": {
    "excerptPolicy": "max-one-line-per-question",
    "attribution": {
      "track": "Despacito",
      "artist": "Luis Fonsi ft. Daddy Yankee",
      "geniusSongId": 2955220
    }
  }
}
```

---

## Pricing model

| Scenario | Cost to user |
|----------|-------------|
| Curated free-catalog song (all exercise types) | Free |
| On-demand song unlock (all exercise types) | 1 credit ($0.10) |
| Re-open previously unlocked song | Free |

STT policy:

1. `say_it_back` grading runs server-side STT.
2. Free-catalog songs use a soft per-wallet daily grading cap (for example `50` attempts/day).
3. On-demand unlocked songs include STT grading in the same song unlock.

---

## Locked policy

1. Some songs are curated as completely free (all exercise types).
2. Non-catalog songs require one credit to unlock the full study set bundle.
3. `say_it_back`, `translation_mcq`, and `trivia_mcq` are all part of the same unlock for on-demand songs.
