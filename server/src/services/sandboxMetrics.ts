export const SandboxMetrics = (() => {
  const counters = {
    sessionsStarted: 0,
    sessionsEnded: 0,
    blockedExternalWrites: 0,
    pdfsGenerated: 0,
  };
  return {
    incSessionStarted: () => { counters.sessionsStarted++; },
    incSessionEnded: () => { counters.sessionsEnded++; },
    incBlockedExternalWrite: () => { counters.blockedExternalWrites++; },
    incPdfGenerated: () => { counters.pdfsGenerated++; },
    snapshot: () => ({ ...counters })
  };
})();

