// Browser stub for simple-git (Node.js only library)
// simple-git cannot run in the browser — all git ops go through the backend API
const stub = () => ({
  checkIsRepo: async () => false,
  clone: async () => {},
  init: async () => {},
  status: async () => ({ current: '', tracking: '', ahead: 0, behind: 0, staged: [], modified: [], not_added: [] }),
  log: async () => ({ all: [] }),
  branch: async () => ({ branches: {} }),
  checkout: async () => {},
  checkoutLocalBranch: async () => {},
  deleteLocalBranch: async () => {},
  add: async () => {},
  commit: async () => {},
  push: async () => {},
  pull: async () => {},
  fetch: async () => {},
  addRemote: async () => {},
  getRemotes: async () => [],
  reset: async () => {},
  stash: async () => {},
});

export default stub;
export { stub as simpleGit };
