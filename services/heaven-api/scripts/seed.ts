/**
 * Seed Script - Populate D1 with test shadow profiles
 *
 * Usage:
 *   bun run seed          # Seed local D1
 *   bun run seed:remote   # Seed remote D1
 *
 * This creates fake shadow profiles for testing the claim flow.
 */

// Hash helper (same as in claim.ts)
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Test shadow profiles
const SEED_PROFILES = [
  {
    id: 'shadow-alex-sf',
    source: 'dateme',
    source_url: 'https://dateme.directory/alex',
    display_name: 'Alex',
    bio: 'Software engineer who loves hiking and craft coffee. Looking for someone to explore the city with.',
    age_bucket: 2, // 25-29
    gender_identity: 1, // Man
    location: 'San Francisco',
    featured_rank: 1,
  },
  {
    id: 'shadow-jordan-bk',
    source: 'dateme',
    source_url: 'https://dateme.directory/jordan',
    display_name: 'Jordan',
    bio: 'Artist and yoga instructor. I believe in good vibes and great conversations.',
    age_bucket: 3, // 30-34
    gender_identity: 5, // Non-binary
    location: 'Brooklyn',
    featured_rank: 2,
  },
  {
    id: 'shadow-sam-atx',
    source: 'dateme',
    source_url: 'https://dateme.directory/sam',
    display_name: 'Sam',
    bio: 'Product designer by day, amateur chef by night. Always down for a food adventure.',
    age_bucket: 2, // 25-29
    gender_identity: 2, // Woman
    location: 'Austin',
    featured_rank: 3,
  },
  {
    id: 'shadow-riley-la',
    source: 'dateme',
    source_url: 'https://dateme.directory/riley',
    display_name: 'Riley',
    bio: null, // No bio
    age_bucket: 4, // 35-39
    gender_identity: 1, // Man
    location: 'Los Angeles',
    featured_rank: 4,
  },
  {
    id: 'shadow-morgan-sea',
    source: 'dateme',
    source_url: 'https://dateme.directory/morgan',
    display_name: 'Morgan',
    bio: 'Musician and dog parent. Looking for my duet partner.',
    age_bucket: 1, // 18-24
    gender_identity: 4, // Trans woman
    location: 'Seattle',
    featured_rank: 5,
  },
]

// Generate SQL for seeding
async function generateSeedSQL(): Promise<string> {
  const now = Date.now()
  const lines: string[] = [
    '-- Auto-generated seed data',
    '-- Run with: wrangler d1 execute heaven-api --local --file=./scripts/seed.sql',
    '',
    '-- Clear existing seed data (keeps any real data)',
    '-- Delete in correct order due to foreign keys',
    `DELETE FROM likes WHERE target_type = 'shadow' AND target_id LIKE 'shadow-%';`,
    `DELETE FROM claim_tokens WHERE shadow_profile_id LIKE 'shadow-%';`,
    `DELETE FROM shadow_profiles WHERE id LIKE 'shadow-%';`,
    '',
    '-- Insert seed profiles',
  ]

  for (const profile of SEED_PROFILES) {
    const bio = profile.bio ? `'${profile.bio.replace(/'/g, "''")}'` : 'NULL'
    lines.push(`INSERT INTO shadow_profiles (id, source, source_url, display_name, bio, age_bucket, gender_identity, location, featured_rank, created_at, updated_at)
VALUES ('${profile.id}', '${profile.source}', '${profile.source_url}', '${profile.display_name}', ${bio}, ${profile.age_bucket}, ${profile.gender_identity}, '${profile.location}', ${profile.featured_rank}, ${now}, ${now});`)
  }

  // Add some test claim tokens
  lines.push('')
  lines.push('-- Insert test claim tokens')

  // Generate tokens for first 3 profiles
  const testTokens = [
    { profileId: 'shadow-alex-sf', token: 'test-alex', humanCode: 'HVN-ALEX01' },
    { profileId: 'shadow-jordan-bk', token: 'test-jordan', humanCode: 'HVN-JRDN02' },
    { profileId: 'shadow-sam-atx', token: 'test-sam', humanCode: 'HVN-SAM003' },
  ]

  for (const t of testTokens) {
    // Use real SHA-256 hashes so token lookup works
    const tokenHash = await sha256(t.token)
    const humanCodeHash = await sha256(t.humanCode)
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000

    lines.push(`INSERT INTO claim_tokens (id, shadow_profile_id, token_hash, human_code_hash, method, issued_at, expires_at)
VALUES ('claim-${t.profileId}', '${t.profileId}', '${tokenHash}', '${humanCodeHash}', 'bio_edit', ${now}, ${expiresAt});`)
  }

  // Print test URLs for convenience (hash router format)
  console.log('\nTest claim URLs:')
  for (const t of testTokens) {
    console.log(`  ${t.profileId}: http://localhost:3000/#/c/${t.token}`)
  }

  // Add some test likes to make it interesting
  lines.push('')
  lines.push('-- Insert test likes (to show "Someone likes you!")')
  lines.push(`INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x1234567890123456789012345678901234567890', 'shadow', 'shadow-alex-sf', ${now});`)
  lines.push(`INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x2345678901234567890123456789012345678901', 'shadow', 'shadow-alex-sf', ${now - 1000});`)
  lines.push(`INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x3456789012345678901234567890123456789012', 'shadow', 'shadow-alex-sf', ${now - 2000});`)
  lines.push(`INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x1234567890123456789012345678901234567890', 'shadow', 'shadow-jordan-bk', ${now});`)

  return lines.join('\n')
}

// Write SQL file
const sql = await generateSeedSQL()
const outputPath = new URL('./seed.sql', import.meta.url).pathname
await Bun.write(outputPath, sql)

console.log(`Seed SQL written to ${outputPath}`)
console.log('')
console.log('To apply locally:')
console.log('  cd workers/api && wrangler d1 execute heaven-api --local --file=./scripts/seed.sql')
console.log('')
console.log('To apply remotely:')
console.log('  cd workers/api && wrangler d1 execute heaven-api --remote --file=./scripts/seed.sql')
