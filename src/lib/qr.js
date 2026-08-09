import QRCode from 'qrcode';
import { config } from './config';

// LINK-4: every campaign link gets a QR. SVG is the print-quality format the
// venue posters need; the 1024px PNG covers slides and chat apps.

export async function qrPng(url, size = 1024) {
  return QRCode.toBuffer(url, {
    type: 'png',
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#202122ff', light: '#ffffffff' },
  });
}

export async function qrSvg(url) {
  return Buffer.from(
    await QRCode.toString(url, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#202122', light: '#ffffff' },
    })
  );
}

export async function qrDataUrl(url, size = 320) {
  return QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: 'M' });
}

export function campaignUrl(slug, token) {
  return `${config.baseUrl}/c/${slug}-${token}`;
}
