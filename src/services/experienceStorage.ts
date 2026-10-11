/**
 * experienceStorage.ts — Deprecated / Backwards-Compatibility Layer
 *
 * Forwards legacy calls to whatsNewService.
 */

import {
  shouldShowWhatsNew,
  acknowledgeReleaseVersion,
  getInstalledApplicationVersion,
} from './whatsNewService';

export async function shouldShowExperienceModal(): Promise<boolean> {
  const decision = await shouldShowWhatsNew();
  return decision.shouldShow;
}

export async function markExperienceModalSeen(): Promise<void> {
  const version = getInstalledApplicationVersion();
  await acknowledgeReleaseVersion(version);
}
