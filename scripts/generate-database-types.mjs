import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { format } from 'prettier'

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
writeFileSync(
  'src/types/database.types.ts',
  await format(generated, {
    parser: 'typescript',
    semi: false,
    singleQuote: true,
    printWidth: 95,
    trailingComma: 'all',
  }),
)
