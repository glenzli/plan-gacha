// @ts-nocheck
export interface ImageBlobResult {
  blob: Blob;
  extension: 'png' | 'svg';
  mimeType: 'image/png' | 'image/svg+xml';
}

export function sanitizeFileNamePart(value, fallback = 'plan-gacha') {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  return normalized || fallback;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function getReadableStyleText() {
  let cssText = '';
  Array.from(document.styleSheets || []).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules || []).forEach((rule) => {
        cssText += `${rule.cssText}\n`;
      });
    } catch {
      // Cross-origin stylesheets cannot be read; the app's own stylesheet is enough for export.
    }
  });

  const rootStyle = window.getComputedStyle(document.documentElement);
  const cssVariables = Array.from(rootStyle)
    .filter((name) => name.startsWith('--'))
    .map((name) => `${name}: ${rootStyle.getPropertyValue(name)};`)
    .join('\n');

  return `
    :root,
    .screenshot-export-shell {
      ${cssVariables}
      color: ${rootStyle.getPropertyValue('--text') || '#18181b'};
      font-family: ${rootStyle.fontFamily || 'system-ui, sans-serif'};
    }
    * { box-sizing: border-box; }
    [data-screenshot-exclude="true"] { display: none !important; }
    .screenshot-export-shell {
      width: 100%;
      min-height: 100%;
      padding: 24px;
      background: ${rootStyle.getPropertyValue('--canvas') || '#f8f9fa'};
    }
    .screenshot-export-card {
      width: 100% !important;
      margin: 0 !important;
    }
    ${cssText}
  `;
}

function blobFromDataUrl(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(data || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function canvasToPngBlob(canvas) {
  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });

  if (blob) return blob;
  return blobFromDataUrl(canvas.toDataURL('image/png'));
}

export async function renderElementToImageBlob(element): Promise<ImageBlobResult> {
  if (!element) throw new Error('missing_element');

  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  if (!width) throw new Error('empty_element');

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const clone = element.cloneNode(true);
  clone.querySelectorAll('[data-screenshot-exclude="true"], .stop-location-actions').forEach((node) => node.remove());
  clone.classList.add('screenshot-export-card');
  clone.style.width = `${width}px`;

  const measureHost = document.createElement('div');
  measureHost.style.position = 'fixed';
  measureHost.style.left = '-10000px';
  measureHost.style.top = '0';
  measureHost.style.width = `${width}px`;
  measureHost.style.pointerEvents = 'none';
  measureHost.appendChild(clone);
  document.body.appendChild(measureHost);

  const height = Math.ceil(clone.getBoundingClientRect().height);
  const cloneMarkup = clone.outerHTML;
  measureHost.remove();
  if (!height) throw new Error('empty_element');

  const padding = 24;
  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;
  const shell = document.createElement('div');
  shell.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  shell.className = 'screenshot-export-shell';
  shell.innerHTML = `<style>${getReadableStyleText()}</style>${cloneMarkup}`;
  const xhtml = new XMLSerializer().serializeToString(shell);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <foreignObject x="0" y="0" width="${svgWidth}" height="${svgHeight}">
        ${xhtml}
      </foreignObject>
    </svg>
  `;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('svg_image_load_failed'));
      image.src = url;
    });

    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svgWidth * scale);
    canvas.height = Math.round(svgHeight * scale);
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, svgWidth, svgHeight);

    const pngBlob = await canvasToPngBlob(canvas);
    return { blob: pngBlob, extension: 'png', mimeType: 'image/png' };
  } catch (error) {
    console.warn('[plan-gacha] PNG export failed, falling back to SVG image.', error);
    return { blob: svgBlob, extension: 'svg', mimeType: 'image/svg+xml' };
  }
}

export function shouldUseNativeImageShare() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const isTouchPrimary = window.matchMedia?.('(pointer: coarse)').matches;
  return Boolean(navigator.share && (navigator.maxTouchPoints > 0 || isTouchPrimary));
}

export async function copyImageBlobToClipboard(blob) {
  if (
    blob?.type !== 'image/png'
    || typeof ClipboardItem !== 'function'
    || !navigator.clipboard?.write
  ) {
    return false;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return true;
  } catch (error) {
    console.warn('[plan-gacha] Image clipboard write failed, falling back to download/share.', error);
    return false;
  }
}
