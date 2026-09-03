/**
 * Unit tests for the FolderPicker / FolderBrowser components used to pick
 * comics and ebook folder paths.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FolderPicker, FolderBrowser } from '../../../components/ui/FolderPicker.js';

interface BrowseResponse {
  current: string;
  parent: string | null;
  directories: Array<{ name: string; path: string }>;
}

const TREE: Record<string, BrowseResponse> = {
  '': {
    current: '/libraries',
    parent: '/',
    directories: [
      { name: 'comics', path: '/libraries/comics' },
      { name: 'ebooks', path: '/libraries/ebooks' },
    ],
  },
  '/libraries': {
    current: '/libraries',
    parent: '/',
    directories: [
      { name: 'comics', path: '/libraries/comics' },
      { name: 'ebooks', path: '/libraries/ebooks' },
    ],
  },
  '/libraries/comics': {
    current: '/libraries/comics',
    parent: '/libraries',
    directories: [{ name: 'Saga', path: '/libraries/comics/Saga' }],
  },
  '/libraries/comics/Saga': {
    current: '/libraries/comics/Saga',
    parent: '/libraries/comics',
    directories: [],
  },
};

/** Records every path /api/browse was asked for, newest last. */
let requestedPaths: string[] = [];

function stubFetch(handler?: (path: string) => Promise<Response>) {
  requestedPaths = [];
  global.fetch = mock.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost:3000');
    const path = url.searchParams.get('path') ?? '';
    requestedPaths.push(path);

    if (handler) return handler(path);

    const body = TREE[path];
    if (!body) {
      return new Response(JSON.stringify({ error: 'Path not found' }), { status: 404 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('FolderBrowser', () => {
  beforeEach(() => stubFetch());
  afterEach(() => cleanup());

  it('lists the directories under the starting path', async () => {
    render(<FolderBrowser onSelect={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('comics')));
    assert.ok(screen.getByText('ebooks'));
    assert.ok(screen.getByText('/libraries'));
  });

  it('starts from the path it was given', async () => {
    render(<FolderBrowser initialPath="/libraries/comics" onSelect={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('Saga')));
    assert.deepStrictEqual(requestedPaths, ['/libraries/comics']);
  });

  it('navigates into a subdirectory and back up via ..', async () => {
    const user = userEvent.setup({ document });
    render(<FolderBrowser onSelect={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('comics')));
    await user.click(screen.getByText('comics'));

    await waitFor(() => assert.ok(screen.getByText('Saga')));
    await user.click(screen.getByText('..'));

    await waitFor(() => assert.ok(screen.getByText('ebooks')));
    assert.deepStrictEqual(requestedPaths, ['', '/libraries/comics', '/libraries']);
  });

  it('reports the current directory when "Use this folder" is pressed', async () => {
    const user = userEvent.setup({ document });
    const selected: string[] = [];
    render(<FolderBrowser onSelect={(path) => selected.push(path)} />);

    await waitFor(() => assert.ok(screen.getByText('comics')));
    await user.click(screen.getByText('comics'));
    await waitFor(() => assert.ok(screen.getByText('Saga')));
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));

    assert.deepStrictEqual(selected, ['/libraries/comics']);
  });

  it('says so when a directory has no subdirectories', async () => {
    render(<FolderBrowser initialPath="/libraries/comics/Saga" onSelect={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('No subdirectories')));
  });

  it('shows the error from a failed browse', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: 'Permission denied' }), { status: 500 })
    );
    render(<FolderBrowser onSelect={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('Permission denied')));
  });
});

describe('FolderPicker', () => {
  beforeEach(() => stubFetch());
  afterEach(() => cleanup());

  it('does not browse until Browse is pressed', async () => {
    render(<FolderPicker value="" onChange={() => {}} placeholder="/libraries/comics" />);

    assert.strictEqual(requestedPaths.length, 0);
    assert.ok(screen.getByPlaceholderText('/libraries/comics'));
  });

  it('reports typed input as a path change', async () => {
    const user = userEvent.setup({ document });
    const changes: string[] = [];
    render(<FolderPicker value="" onChange={(path) => changes.push(path)} placeholder="/libraries/comics" />);

    // The field is controlled and pinned to '', so each keystroke reports on its own.
    await user.type(screen.getByPlaceholderText('/libraries/comics'), '/a');

    assert.deepStrictEqual(changes, ['/', 'a']);
  });

  it('fills the field with the folder chosen in the browser and closes it', async () => {
    const user = userEvent.setup({ document });
    const changes: string[] = [];
    render(<FolderPicker value="" onChange={(path) => changes.push(path)} />);

    await user.click(screen.getByRole('button', { name: /Browse/ }));
    await waitFor(() => assert.ok(screen.getByText('comics')));
    await user.click(screen.getByText('comics'));
    await waitFor(() => assert.ok(screen.getByText('Saga')));
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));

    assert.deepStrictEqual(changes, ['/libraries/comics']);
    assert.strictEqual(screen.queryByText('Saga'), null);
  });

  it('browses from the path already in the field', async () => {
    const user = userEvent.setup({ document });
    render(<FolderPicker value=" /libraries/comics " onChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /Browse/ }));

    await waitFor(() => assert.ok(screen.getByText('Saga')));
    assert.deepStrictEqual(requestedPaths, ['/libraries/comics']);
  });

  it('closes the browser again when Browse is toggled off', async () => {
    const user = userEvent.setup({ document });
    render(<FolderPicker value="" onChange={() => {}} />);

    const browse = screen.getByRole('button', { name: /Browse/ });
    await user.click(browse);
    await waitFor(() => assert.ok(screen.getByText('comics')));

    await user.click(browse);
    assert.strictEqual(screen.queryByText('comics'), null);
  });

  it('disables both the field and the Browse button when disabled', () => {
    render(<FolderPicker value="" onChange={() => {}} disabled placeholder="/libraries/comics" />);

    assert.ok((screen.getByPlaceholderText('/libraries/comics') as HTMLInputElement).disabled);
    assert.ok((screen.getByRole('button', { name: /Browse/ }) as HTMLButtonElement).disabled);
  });
});
