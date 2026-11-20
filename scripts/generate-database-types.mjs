import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { format, resolveConfig } from 'prettier'

// CLI v3 targets the local stack unless --remote=<ref> is explicitly supplied.
// Write only after successful generation, so a missing login cannot erase the existing types.
const generated = execFileSync(
  process.execPath,
  [
    'node_modules/supabase/dist/supabase.js',
    'gen',
    'types',
    '--lang=typescript',
    '--schema',
    'public',
    ...process.argv.slice(2),
  ],
  { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] },
)
if (!generated.includes('export type Database ='))
  throw new Error('Supabase did not return database types.')
const outputPath = 'src/types/database.types.ts'
const prettierConfig = (await resolveConfig(outputPath)) ?? {}
writeFileSync(
  outputPath,
  await format(generated, {
    ...prettierConfig,
    parser: 'typescript',
  }),
)
