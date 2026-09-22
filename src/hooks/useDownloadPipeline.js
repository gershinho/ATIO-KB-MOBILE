import { useCallback, useContext, useEffect, useState } from 'react';
import { readDownloads, writeDownloads } from '../storage/localState';
import { downloadInnovationToFile } from '../utils/downloadInnovation';
import { notify } from '../utils/dialogs';
import { DownloadContext, DRAIN_DURATION_MS } from '../context/DownloadContext';

/** How often the progress bar advances, and by how much. */
const PROGRESS_TICK_MS = 80;
const PROGRESS_STEP = 4;

/** A beat between the bar filling and the share sheet, so they do not collide. */
const HANDOFF_PAUSE_MS = 500;

/**
 * Downloading an innovation, end to end.
 *
 * This lived inside useInnovationInteractions, which is about acting on a
 * record — bookmark, like, open the drawer, open the comments. None of the
 * download machinery touched any of that state, and the other half of the same
 * state machine already lived in DownloadContext, so tracing one download meant
 * reading two files that were not the two you would guess.
 *
 * The sequence: show a progress bar, persist to the Downloads list while the
 * drain animation plays, then export a shareable file. The bar is presentational
 * — the work behind it is fast — but the two persistence steps are real, and
 * each reports its own failure, because an item can be saved to Downloads and
 * still fail to export.
 *
 * @returns {{addDownload: (innovation: object) => void, downloadToast: object|null}}
 */
export default function useDownloadPipeline() {
  const { triggerDownloadStart, triggerDrainStart, triggerDownloadComplete } =
    useContext(DownloadContext);
  const [downloadToast, setDownloadToast] = useState(null);

  const addDownload = useCallback(
    (innovation) => {
      if (!innovation) return;
      if (downloadToast) return; // one at a time
      triggerDownloadStart(innovation.id);
      setDownloadToast({ id: innovation.id, title: innovation.title, progress: 0, innovation });
    },
    [downloadToast, triggerDownloadStart]
  );

  // The toast's fields are read out here so the two effects below can depend on
  // exactly what they use. Depending on the whole object would restart both on
  // every progress tick; depending on `downloadToast?.id` while *referencing*
  // `downloadToast` is what the exhaustive-deps warning was pointing at.
  const toastId = downloadToast?.id;
  const toastProgress = downloadToast?.progress;
  const toastInnovation = downloadToast?.innovation;

  // Advance the progress bar. Keyed on id so restarting a download for a
  // different innovation restarts the timer rather than inheriting it.
  useEffect(() => {
    if (toastId == null) return undefined;
    const interval = setInterval(() => {
      setDownloadToast((prev) => {
        if (!prev || prev.progress >= 100) return prev;
        const next = prev.progress + PROGRESS_STEP;
        return { ...prev, progress: next >= 100 ? 100 : next };
      });
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [toastId]);

  useEffect(() => {
    if (!toastInnovation || toastProgress < 100) return undefined;
    const innovation = toastInnovation;
    let cancelled = false;
    triggerDrainStart(innovation.id);

    (async () => {
      try {
        // Persist and drain in parallel so the drain starts immediately.
        await Promise.all([
          (async () => {
            const saved = await readDownloads();
            if (!saved.some((i) => i.id === innovation.id)) {
              const stored = await writeDownloads([
                { ...innovation, downloadedAt: Date.now() },
                ...saved,
              ]);
              // The boolean used to be discarded, so a failed write still told
              // the user the download had completed and the item was simply
              // absent from Downloads on next launch.
              if (!stored) {
                notify(
                  'Could not save this download',
                  'It will not appear in your Downloads. Please try again.'
                );
              }
            }
          })(),
          new Promise((r) => setTimeout(r, DRAIN_DURATION_MS)),
        ]);
        if (cancelled) return;
        triggerDownloadComplete(innovation.id);

        await new Promise((r) => setTimeout(r, HANDOFF_PAUSE_MS));
        // Best-effort export to a shareable file (PDF/text). If this fails, the
        // innovation remains available in the Downloads tab for offline viewing.
        if (cancelled) return;
        const result = await downloadInnovationToFile(innovation);
        if (!cancelled && !result.success) {
          notify(
            'Export failed',
            result.error || 'Saved in the Downloads tab, but the file could not be exported.'
          );
        }
      } catch (e) {
        if (!cancelled) {
          notify(
            'Export failed',
            e?.message || 'Solution is saved in the Downloads tab, but the file export failed.'
          );
        }
      } finally {
        if (!cancelled) setDownloadToast(null);
      }
    })();

    return () => { cancelled = true; };
  }, [toastId, toastProgress, toastInnovation, triggerDrainStart, triggerDownloadComplete]);

  return { addDownload, downloadToast };
}
