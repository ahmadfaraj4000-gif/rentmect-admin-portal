// Same PNG format as drawn signatures, so agreement snapshots and downloads
// continue through the existing signing and hash validation path.
export function typedSignatureImage(name, createCanvas = () => document.createElement('canvas')) {
  const legalName = String(name || '').trim();
  if (legalName.length < 2) throw new Error('Enter the customer’s full legal name first.');
  const canvas = createCanvas();
  canvas.width = 900;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The signature could not be prepared. Please try again.');
  context.fillStyle = '#172033';
  context.font = 'italic 52px Georgia, serif';
  context.fillText(legalName, 24, 140, 852);
  return canvas.toDataURL('image/png');
}
