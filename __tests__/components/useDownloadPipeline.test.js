import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import useDownloadPipeline from '../../src/hooks/useDownloadPipeline';
import { DownloadContext } from '../../src/context/DownloadContext';

jest.mock('../../src/storage/localState', () => ({
  readDownloads: jest.fn().mockResolvedValue([]),
  writeDownloads: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/utils/downloadInnovation', () => ({
  downloadInnovationToFile: jest.fn().mockResolvedValue({ success: true }),
}));

const downloadContext = {
  downloadJustCompleted: false,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

function wrapper({ children }) {
  return (
    <DownloadContext.Provider value={downloadContext}>{children}</DownloadContext.Provider>
  );
}

const innovation = (id) => ({ id, title: `Innovation ${id}` });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useDownloadPipeline', () => {
  it('announces the start of a download', () => {
    const { result } = renderHook(() => useDownloadPipeline(), { wrapper });
    act(() => { result.current.addDownload(innovation(1)); });

    expect(downloadContext.triggerDownloadStart).toHaveBeenCalledWith(1);
    expect(result.current.downloadToast).toMatchObject({ id: 1, progress: 0 });
  });

  it('refuses to start a second download while one is running', () => {
    const { result } = renderHook(() => useDownloadPipeline(), { wrapper });
    act(() => { result.current.addDownload(innovation(1)); });
    act(() => { result.current.addDownload(innovation(2)); });

    expect(downloadContext.triggerDownloadStart).toHaveBeenCalledTimes(1);
    expect(result.current.downloadToast.id).toBe(1);
  });

  it('ignores a missing innovation', () => {
    const { result } = renderHook(() => useDownloadPipeline(), { wrapper });
    act(() => { result.current.addDownload(null); });
    expect(result.current.downloadToast).toBeNull();
  });
});
