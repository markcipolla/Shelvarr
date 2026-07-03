jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-document-dir/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useNextUpStore } from '../../src/stores/useNextUpStore';

const fsMock = jest.requireMock('expo-file-system/legacy');
const mockedGetInfo = fsMock.getInfoAsync as jest.Mock;
const mockedRead = fsMock.readAsStringAsync as jest.Mock;
const mockedWrite = fsMock.writeAsStringAsync as jest.Mock;

const initialState = useNextUpStore.getState();

beforeEach(() => {
  useNextUpStore.setState({ dismissedBooks: {}, dismissedComics: {}, hydrated: false });
  mockedGetInfo.mockClear();
  mockedGetInfo.mockResolvedValue({ exists: false });
  mockedRead.mockClear();
  mockedRead.mockResolvedValue('');
  mockedWrite.mockClear();
});

afterAll(() => {
  useNextUpStore.setState(initialState);
});

describe('useNextUpStore', () => {
  it('dismisses a book and persists it', () => {
    useNextUpStore.getState().dismissBook('b1');
    expect(useNextUpStore.getState().dismissedBooks['b1']).toBe(true);
    expect(mockedWrite).toHaveBeenCalledTimes(1);
    const [, payload] = mockedWrite.mock.calls[0];
    expect(JSON.parse(payload)).toEqual({ books: ['b1'], comics: [] });
  });

  it('dismisses a comic by volume id and persists it', () => {
    useNextUpStore.getState().dismissComic(42);
    expect(useNextUpStore.getState().dismissedComics[42]).toBe(true);
    const [, payload] = mockedWrite.mock.calls[0];
    expect(JSON.parse(payload)).toEqual({ books: [], comics: [42] });
  });

  it('keeps earlier dismissals when adding more', () => {
    useNextUpStore.getState().dismissBook('b1');
    useNextUpStore.getState().dismissComic(7);
    const state = useNextUpStore.getState();
    expect(state.dismissedBooks['b1']).toBe(true);
    expect(state.dismissedComics[7]).toBe(true);
  });

  it('loads persisted dismissals from disk', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedRead.mockResolvedValue(JSON.stringify({ books: ['b9'], comics: [3, 5] }));
    await useNextUpStore.getState().loadDismissed();
    const state = useNextUpStore.getState();
    expect(state.dismissedBooks['b9']).toBe(true);
    expect(state.dismissedComics[3]).toBe(true);
    expect(state.dismissedComics[5]).toBe(true);
    expect(state.hydrated).toBe(true);
  });

  it('marks hydrated when no manifest exists', async () => {
    await useNextUpStore.getState().loadDismissed();
    expect(useNextUpStore.getState().hydrated).toBe(true);
    expect(useNextUpStore.getState().dismissedBooks).toEqual({});
  });

  it('does not re-read once hydrated', async () => {
    useNextUpStore.setState({ hydrated: true });
    await useNextUpStore.getState().loadDismissed();
    expect(mockedGetInfo).not.toHaveBeenCalled();
  });

  it('recovers gracefully from a corrupt manifest', async () => {
    mockedGetInfo.mockResolvedValue({ exists: true });
    mockedRead.mockResolvedValue('not json');
    await useNextUpStore.getState().loadDismissed();
    expect(useNextUpStore.getState().hydrated).toBe(true);
    expect(useNextUpStore.getState().dismissedBooks).toEqual({});
  });
});
