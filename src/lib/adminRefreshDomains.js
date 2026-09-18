// A refresh should update the page the admin is using, not every page visited
// during this session. Explicit mutation refreshes can still name their domains.
export function adminRefreshDomains(tabDomains, activeTab) {
  return [...new Set(tabDomains[activeTab] || ['core'])];
}
