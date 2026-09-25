export function appendReturnFiles(current, incoming) {
  const files = [...current];
  for (const file of incoming) {
    if (!files.some((item) => item.name === file.name && item.size === file.size
      && item.lastModified === file.lastModified && item.type === file.type)) files.push(file);
  }
  return files;
}

export function needsReturnEvidenceReport(inspection) {
  return Boolean(inspection.damageFound || (inspection.depositDecision === 'hold' && inspection.files?.length));
}
