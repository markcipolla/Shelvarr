/**
 * Unit tests for ComicIssueRow, the volume detail page's per-issue row.
 *
 * Before this component existed, the issues list on `/comics/[slug]` was
 * entirely static: badges and a Mark read button, but nothing to actually
 * open and read an issue. This covers that an issue with a file opens
 * ComicReader when clicked, and an issue without one does not.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

const mockRefresh = mock.fn();

mock.module('next/navigation', {
  namedExports: {
    useRouter: () => ({
      push: () => {},
      refresh: mockRefresh,
      replace: () => {},
      prefetch: () => {},
      back: () => {},
    }),
  },
});

let capturedReaderProps: Record<string, unknown> | null = null;
mock.module('../../../components/comics/ComicReader.js', {
  namedExports: {
    ComicReader: (props: any) => {
      capturedReaderProps = props;
      return <div data-testid="comic-reader" />;
    },
  },
});

const { ComicIssueRow } = await import('../../../components/comics/ComicIssueRow.js');

const originalFetch = globalThis.fetch;

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    volume_id: 3,
    comicvine_id: 1000,
    issue_number: '4',
    calculated_issue_number: 4,
    title: 'The One About the Dream',
    date: '2026-01-01',
    description: '',
    monitored: true,
    files: [{ id: 1, filepath: '/comics/sandman/04.cbz', size: 1024 }],
    ...overrides,
  } as any;
}

describe('ComicIssueRow Component', () => {
  beforeEach(() => {
    capturedReaderProps = null;
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('opens the reader when an issue with a file is clicked', async () => {
    const user = userEvent.setup();
    render(<ComicIssueRow issue={makeIssue()} volumeTitle="Sandman" />);

    assert.strictEqual(screen.queryByTestId('comic-reader'), null);

    await user.click(screen.getByRole('button', { name: /The One About the Dream/ }));

    await waitFor(() => assert.ok(screen.getByTestId('comic-reader')));
    assert.strictEqual(capturedReaderProps?.issueId, 42);
    assert.strictEqual(capturedReaderProps?.volumeTitle, 'Sandman');
    assert.strictEqual(capturedReaderProps?.issueNumber, '4');
  });

  it('does not open the reader for an issue with no files', async () => {
    const user = userEvent.setup();
    render(<ComicIssueRow issue={makeIssue({ files: [] })} volumeTitle="Sandman" />);

    const trigger = screen.getByRole('button', { name: /The One About the Dream/ });
    assert.ok((trigger as HTMLButtonElement).disabled);

    await user.click(trigger);
    assert.strictEqual(screen.queryByTestId('comic-reader'), null);
    assert.ok(screen.getByText('Missing'));
  });

  it('shows the Downloaded badge and a Mark read button for an unread, downloaded issue', () => {
    render(<ComicIssueRow issue={makeIssue()} volumeTitle="Sandman" />);

    assert.ok(screen.getByText('Downloaded'));
    assert.ok(screen.getByRole('button', { name: 'Mark read' }));
  });

  it('shows the Read badge and no Mark read button once completed', () => {
    render(
      <ComicIssueRow
        issue={makeIssue()}
        volumeTitle="Sandman"
        progress={{ issueId: 42, page: 22, completed: true, total: 22, updatedAt: '2026-09-01T00:00:00Z' }}
      />
    );

    assert.ok(screen.getByText('Read'));
    assert.strictEqual(screen.queryByRole('button', { name: 'Mark read' }), null);
  });
});
