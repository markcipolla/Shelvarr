/**
 * Migrate the comic library off Kapowarr.
 *
 *   pnpm comics:migrate                    # show what would happen
 *   pnpm comics:migrate -- --apply         # do it
 *   pnpm comics:migrate -- --root /comics  # register a root folder first
 *
 * Adoption uses the volume data Shelvarr already mirrors from Kapowarr — the
 * ComicVine id and the full issue list are cached — so it needs no ComicVine
 * calls and works with Kapowarr already switched off. Files are never moved;
 * each volume keeps the folder it is in.
 *
 * Run `--refresh` afterwards (or use Refresh metadata in the UI) to pull fresh
 * ComicVine data for the adopted volumes.
 */

import { initDatabase } from '@shelvarr/db';
import {
  comicAdopt,
  comicLibrary,
  initServiceConfig,
  queue,
} from '@shelvarr/services';
import type { AppConfig } from '@shelvarr/types';
import { join } from 'path';

interface Options {
  apply: boolean;
  root: string | null;
  refresh: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, root: null, refresh: false, help: false };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    // pnpm forwards the `--` separator itself; ignore it.
    if (arg === '--') continue;
    if (arg === '--apply' || arg === '-a') options.apply = true;
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--root' || arg === '-r') options.root = argv[++index] ?? null;
    else if (arg?.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else if (arg) {
      console.error(`Unknown argument: ${arg}`);
      options.help = true;
    }
  }

  return options;
}

const USAGE = `
Migrate the comic library off Kapowarr.

Usage:
  pnpm comics:migrate [-- options]

Options:
  -r, --root <path>   Register <path> as a comic root folder before migrating.
                      Required at least once: adoption needs a root folder that
                      contains each volume's directory.
  -a, --apply         Actually migrate. Without this, nothing is written.
      --refresh       After migrating, queue a ComicVine refresh for every
                      adopted volume. Needs a ComicVine API key.
  -h, --help          Show this.

Environment:
  DATA_DIR / DB_PATH      Where Shelvarr's database lives.
  COMIC_PATH_MAP          "from:to" prefix remap, when the library's recorded
                          paths differ from where this process sees them.
                          KAPOWARR_PATH_MAP is accepted as the old name.
`.trim();

/** Build the app config the services layer expects, from the environment. */
function buildConfig(): AppConfig {
  const dataDir = process.env['DATA_DIR'] || join(process.cwd(), 'data');

  return {
    env: process.env['NODE_ENV'] || 'production',
    port: parseInt(process.env['PORT'] || '3000', 10),
    dataDir,
    libraryRoot: process.env['LIBRARY_ROOT'] || '/libraries',
    dbPath: process.env['DB_PATH'] || join(dataDir, 'shelvarr.db'),
    comicMigration: {
      pathMap: process.env['COMIC_PATH_MAP'] || process.env['KAPOWARR_PATH_MAP'] || null,
    },
    getcomics: {
      baseUrl: process.env['GETCOMICS_URL'] || 'https://getcomics.org',
      downloadDir: process.env['GETCOMICS_DOWNLOAD_DIR'] || join(dataDir, 'downloads'),
      libraryRoot: process.env['COMIC_LIBRARY_ROOT'] || null,
      hostPreference: ['getcomics', 'pixeldrain'],
      renameDownloadedFiles: true,
    },
    supportedExtensions: ['.epub', '.pdf', '.cbz', '.cbr', '.mobi', '.azw3'],
    rateLimits: { hardcover: 60 },
    hardcoverToken: null,
  };
}

function padEnd(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const config = buildConfig();
  initDatabase(config.dbPath);
  initServiceConfig(config);

  if (options.root) {
    const folder = await comicLibrary.addRootFolder(options.root);
    console.log(`Root folder: ${folder.path}`);
  }

  const roots = comicLibrary.listRootFolders();
  if (roots.length === 0) {
    console.error(
      'No comic root folders configured.\n' +
        'Run again with --root <path>, or add one under Settings → Comics.'
    );
    return 1;
  }

  const candidates = comicAdopt.listAdoptionCandidates();
  if (candidates.length === 0) {
    console.log('Nothing to migrate: no Kapowarr-mirrored volumes left.');
    return 0;
  }

  const ready = candidates.filter((candidate) => !candidate.blocker);
  const blocked = candidates.filter((candidate) => candidate.blocker);

  console.log(`\n${candidates.length} mirrored volume(s): ${ready.length} ready, ${blocked.length} blocked\n`);

  for (const candidate of ready) {
    console.log(
      `  ready    ${padEnd(candidate.title, 40)} ${candidate.issueCount} issues  ${candidate.localFolder}`
    );
  }
  for (const candidate of blocked) {
    console.log(`  blocked  ${padEnd(candidate.title, 40)} ${candidate.blocker}`);
  }

  if (!options.apply) {
    console.log('\nDry run. Re-run with --apply to migrate.');
    return 0;
  }

  if (ready.length === 0) {
    console.error('\nNothing is ready to migrate. Resolve the blockers above first.');
    return 1;
  }

  console.log('\nMigrating…');
  const result = await comicAdopt.adoptAllVolumes({
    onProgress: (done, total) => {
      if (done % 10 === 0 || done === total) console.log(`  ${done}/${total}`);
    },
  });

  console.log(`\nAdopted ${result.adopted.length} volume(s).`);

  const withUnmatched = result.adopted.filter((entry) => entry.unmatchedFiles > 0);
  if (withUnmatched.length > 0) {
    console.log(
      `\n${withUnmatched.length} volume(s) had files that could not be matched to an issue:`
    );
    for (const entry of withUnmatched) {
      console.log(`  ${padEnd(entry.title, 40)} ${entry.unmatchedFiles} file(s)`);
    }
    console.log('  These are usually extras or oddly named files; nothing was deleted.');
  }

  if (result.skipped.length > 0) {
    console.log(`\nSkipped ${result.skipped.length} volume(s):`);
    for (const entry of result.skipped) {
      console.log(`  ${padEnd(entry.title, 40)} ${entry.reason}`);
    }
  }

  if (options.refresh) {
    if (!(await comicLibrary.isComicVineConfigured())) {
      console.error('\n--refresh needs a ComicVine API key; skipping.');
    } else {
      const task = queue.enqueueTask('comic_update_all', {
        maxAgeHours: 0,
        limit: result.adopted.length,
      });
      console.log(`\nQueued ComicVine refresh (task ${task.id}). Watch it on the Tasks page.`);
    }
  }

  console.log(
    '\nDone. Shelvarr owns these volumes now. Run --refresh, or use Refresh metadata\n' +
      'on a volume, to pull fresh ComicVine data for them.'
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('\nMigration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
