import { useCallback, useRef, useState } from 'react';
import {
  copyImageBlobToClipboard,
  downloadBlob,
  renderElementToImageBlob,
  sanitizeFileNamePart,
  shouldUseNativeImageShare,
} from '../domain/browserExport';
import type { TranslateFn } from '../types/ui';

interface ShareableDate {
  display: string;
}

interface ShareablePlan {
  name: string;
}

interface UsePlanImageShareOptions {
  notify: (message: string) => void;
  selectedDate?: ShareableDate | null;
  selectedPlan?: ShareablePlan | null;
  t: TranslateFn;
  tripName: string;
}

export function usePlanImageShare({
  notify,
  selectedDate,
  selectedPlan,
  t,
  tripName,
}: UsePlanImageShareOptions) {
  const [planImageBusy, setPlanImageBusy] = useState(false);
  const planImageBusyRef = useRef(false);

  const shareCurrentPlanImage = useCallback(async (cardElement: HTMLElement | null) => {
    if (!selectedDate || !selectedPlan || !cardElement || planImageBusyRef.current) return;

    planImageBusyRef.current = true;
    setPlanImageBusy(true);
    try {
      const imageResult = await renderElementToImageBlob(cardElement);
      const fileName = `${sanitizeFileNamePart(tripName)}-${sanitizeFileNamePart(selectedDate.display)}-${sanitizeFileNamePart(selectedPlan.name)}.${imageResult.extension}`;
      let file: File | null = null;
      let canShareFile = false;
      const canCopyImage = await copyImageBlobToClipboard(imageResult.blob);

      if (canCopyImage) {
        notify(t('planImageCopied'));
        return;
      }

      if (shouldUseNativeImageShare() && typeof File === 'function') {
        file = new File([imageResult.blob], fileName, { type: imageResult.mimeType });
        try {
          canShareFile = !navigator.canShare || navigator.canShare({ files: [file] });
        } catch {
          canShareFile = false;
        }
      }

      if (canShareFile && file) {
        await navigator.share({
          files: [file],
          title: selectedPlan.name,
          text: `${tripName || t('unnamedTrip')} · ${selectedDate.display}`,
        });
        notify(t('planImageShared'));
      } else {
        downloadBlob(imageResult.blob, fileName);
        notify(t('planImageDownloaded'));
      }
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        console.error('[plan-gacha] plan image export failed', error);
        notify(t('planImageFailed'));
      }
    } finally {
      planImageBusyRef.current = false;
      setPlanImageBusy(false);
    }
  }, [notify, selectedDate, selectedPlan, t, tripName]);

  return {
    planImageBusy,
    shareCurrentPlanImage,
  };
}
