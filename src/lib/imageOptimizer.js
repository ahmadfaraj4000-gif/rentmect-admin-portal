const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 60_000_000;
const MAX_IMAGE_WIDTH = 1200;
const MAX_IMAGE_HEIGHT = 900;
const TARGET_BYTES = 300 * 1024;
const HARD_LIMIT_BYTES = 450 * 1024;

export async function optimizeVehicleImage(file) {
  if (!file?.size || !file.type?.startsWith('image/')) {
    throw new Error('Choose a valid JPG, PNG, or WebP vehicle photo.');
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Vehicle photos must be JPG, PNG, or WebP files.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Vehicle photos must be 15 MB or smaller before optimization.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
      throw new Error('This photo is too large to process safely. Choose a smaller image.');
    }

    let scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width, MAX_IMAGE_HEIGHT / bitmap.height);
    let bestBlob = null;

    for (let sizeAttempt = 0; sizeAttempt < 4; sizeAttempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.74, 0.66, 0.58]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) continue;
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= TARGET_BYTES) break;
      }

      if (bestBlob?.size <= TARGET_BYTES) break;
      scale *= 0.82;
    }

    if (!bestBlob || bestBlob.size > HARD_LIMIT_BYTES) {
      throw new Error('This image could not be compressed below 450 KB. Choose a different photo.');
    }

    const safeBaseName = (file.name.replace(/\.[^.]+$/, '') || 'vehicle-photo')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'vehicle-photo';
    return new File([bestBlob], `${safeBaseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
