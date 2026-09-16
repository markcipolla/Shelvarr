/**
 * Unit tests for ComicCard.
 *
 * A finished comic wears a green tick. The tick is the only thing on the card
 * that says "you have read this", so it has to be readable to a screen reader
 * too, and it must not appear on a volume with an issue still unread.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, cleanup } from '@testing-library/react';
import { mock } from 'node:test';
import type { ComicVolumeSummary } from '@shelvarr/types';

mock.module('next/image', {
  namedExports: {},
  defaultExport: (props: any) => {
    const { fill, sizes, ...rest } = props;
    return <img {...rest} />;
  },
});

mock.module('next/link', {
  namedExports: {},
  defaultExport: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
});

const { ComicCard } = await import('../../../components/comics/ComicGrid.js');

const volume: ComicVolumeSummary = {
  id: 7,
  slug: 'saga-2012',
  comicvine_id: 4050,
  title: 'Saga',
  year: 2012,
  publisher: 'Image',
  volume_number: 1,
  description: '',
  monitored: true,
  monitor_new_issues: false,
  folder: '/comics/saga',
  issue_count: 12,
  issue_count_monitored: 12,
  issues_downloaded: 12,
  issues_downloaded_monitored: 12,
  total_size: 1024,
};

describe('ComicCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('marks a comic whose every issue has been read', () => {
    render(<ComicCard volume={{ ...volume, read: true }} />);
    assert.ok(screen.getByText('Read'));
  });

  it('shows no tick while an issue is still unread', () => {
    render(<ComicCard volume={{ ...volume, read: false }} />);
    assert.strictEqual(screen.queryByText('Read'), null);
  });

  it('shows no tick when read state was never worked out', () => {
    render(<ComicCard volume={volume} />);
    assert.strictEqual(screen.queryByText('Read'), null);
  });
});
