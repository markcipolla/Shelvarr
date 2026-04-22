import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ComicsScreen from '../../src/screens/ComicsScreen';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/stores/useSettingsStore');

const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
} as any;

const mockRoute = { params: {} } as any;

describe('ComicsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows configure prompt when kapowarrUrl is empty', () => {
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ kapowarrUrl: '' })
    );
    const { getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    expect(getByText(/Kapowarr is not configured/)).toBeTruthy();
    expect(getByText('Open Settings')).toBeTruthy();
  });

  it('navigates to Settings when configure button pressed', () => {
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ kapowarrUrl: '' })
    );
    const { getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    fireEvent.press(getByText('Open Settings'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Settings');
  });

  it('shows connected message when kapowarrUrl is set', () => {
    mockUseSettingsStore.mockImplementation((selector: any) =>
      selector({ kapowarrUrl: 'http://kapowarr:5656' })
    );
    const { getByText } = render(
      <ComicsScreen navigation={mockNavigation} route={mockRoute} />
    );
    expect(getByText(/Connected to Kapowarr at http:\/\/kapowarr:5656/)).toBeTruthy();
  });
});
