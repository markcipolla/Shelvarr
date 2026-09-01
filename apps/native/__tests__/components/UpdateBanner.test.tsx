import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import UpdateBanner from '../../src/components/UpdateBanner';
import { useUpdateStore, UpdateStatus } from '../../src/stores/useUpdateStore';
import { AvailableUpdate } from '../../src/services/updates';

const available: AvailableUpdate = {
  version: '1.2.0',
  notes: 'Adds an auto-updater',
  apkUrl: 'https://x/app.apk',
  apkSize: 52428800,
  releaseUrl: 'https://x/release',
};

const startUpdate = jest.fn();
const dismiss = jest.fn();

function setStore(overrides: {
  status?: UpdateStatus;
  update?: AvailableUpdate | null;
  progress?: number;
  error?: string | null;
}) {
  useUpdateStore.setState({
    status: 'idle',
    update: null,
    progress: 0,
    error: null,
    startUpdate,
    dismiss,
    ...overrides,
  });
}

describe('UpdateBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing while idle', () => {
    setStore({ status: 'idle', update: available });

    expect(render(<UpdateBanner />).toJSON()).toBeNull();
  });

  it('renders nothing when a status has no update attached', () => {
    setStore({ status: 'available', update: null });

    expect(render(<UpdateBanner />).toJSON()).toBeNull();
  });

  it('offers the release notes and both actions', () => {
    setStore({ status: 'available', update: available });

    const { getByText } = render(<UpdateBanner />);

    expect(getByText('Version 1.2.0 available')).toBeTruthy();
    expect(getByText('Adds an auto-updater')).toBeTruthy();

    fireEvent.press(getByText('Update'));
    expect(startUpdate).toHaveBeenCalled();

    fireEvent.press(getByText('Later'));
    expect(dismiss).toHaveBeenCalled();
  });

  it('falls back to a size summary when the release has no notes', () => {
    setStore({ status: 'available', update: { ...available, notes: '' } });

    const { getByText } = render(<UpdateBanner />);

    expect(getByText('A newer build of Stackarr is ready to install · 50.0 MB.')).toBeTruthy();
  });

  it('omits the size when GitHub did not report one', () => {
    setStore({ status: 'available', update: { ...available, notes: '', apkSize: 0 } });

    const { getByText } = render(<UpdateBanner />);

    expect(getByText('A newer build of Stackarr is ready to install.')).toBeTruthy();
  });

  it('shows a progress bar while downloading and disables the button', () => {
    setStore({ status: 'downloading', update: available, progress: 0.42 });

    const { getByText, getByTestId } = render(<UpdateBanner />);

    expect(getByTestId('update-progress-fill').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '42%' })])
    );

    fireEvent.press(getByText('Downloading 42%'));
    expect(startUpdate).not.toHaveBeenCalled();
  });

  it('shows the installer hand-off', () => {
    setStore({ status: 'installing', update: available });

    const { getByText, queryByText } = render(<UpdateBanner />);

    expect(getByText('Opening installer…')).toBeTruthy();
    expect(queryByText('Later')).toBeNull();
  });

  it('reports a failure and offers a retry', () => {
    setStore({ status: 'error', update: available, error: 'Update download failed' });

    const { getByText } = render(<UpdateBanner />);

    expect(getByText('Update failed')).toBeTruthy();
    expect(getByText('Update download failed')).toBeTruthy();

    fireEvent.press(getByText('Try again'));
    expect(startUpdate).toHaveBeenCalled();
  });

  it('falls back to a generic failure message', () => {
    setStore({ status: 'error', update: available, error: null });

    const { getByText } = render(<UpdateBanner />);

    expect(getByText('Something went wrong.')).toBeTruthy();
  });
});
