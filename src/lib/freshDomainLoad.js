// A forced refresh during a read must run again after that read finishes.
// All callers await the drained queue, including updates committed mid-request.
export function freshDomainLoad(loads, key, force, load) {
  const existing = loads.get(key);
  if (existing) {
    if (force) existing.rerun = true;
    return existing.promise;
  }
  const entry = { rerun: false, promise: null };
  loads.set(key, entry);
  entry.promise = Promise.resolve().then(async () => {
    do {
      entry.rerun = false;
      await load();
    } while (entry.rerun);
  }).finally(() => loads.delete(key));
  return entry.promise;
}
