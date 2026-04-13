const mockFile = {
  async: jest.fn().mockResolvedValue(''),
};

const mockZip = {
  file: jest.fn().mockReturnValue(mockFile),
  loadAsync: jest.fn(),
};

const JSZip = {
  loadAsync: jest.fn().mockResolvedValue(mockZip),
};

export default JSZip;
