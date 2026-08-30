export type TrialScreenShareTransition = {
  stablePresenterId: string
  newShare: boolean
}

export function resolveTrialScreenShareTransition(
  previousActive: boolean,
  stablePresenterId: string,
  nextActive: boolean,
  participantIds: string[],
): TrialScreenShareTransition {
  if (!nextActive) return { stablePresenterId: '', newShare: false }

  const reportedPresenterId = participantIds.find(Boolean) || ''
  const presenterChanged = previousActive
    && Boolean(stablePresenterId)
    && Boolean(reportedPresenterId)
    && stablePresenterId !== reportedPresenterId

  return {
    stablePresenterId: reportedPresenterId || stablePresenterId,
    newShare: !previousActive || presenterChanged,
  }
}

export function isTrialScreenCaptureCurrent(
  captureEpoch: number,
  currentEpoch: number,
  screenShareActive: boolean,
): boolean {
  return screenShareActive && captureEpoch === currentEpoch
}

export function nextTrialScreenHistoryVersion(
  currentVersion: number,
  currentGeneration: number,
  targetGeneration: number,
): { version: number; generation: number } {
  return {
    version: Math.max(0, Math.floor(currentVersion)) + 1,
    generation: Math.max(
      0,
      Math.floor(currentGeneration),
      Math.floor(targetGeneration),
    ),
  }
}
