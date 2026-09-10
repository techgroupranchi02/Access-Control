/**
 * ModuleGate Component
 * Renders children ONLY if the specified module is enabled for the active edition.
 * 
 * Usage:
 *   <ModuleGate module="jury">
 *     <JuryPage />
 *   </ModuleGate>
 */

import { useFestivalConfig } from '../hooks/useFestivalConfig';

export default function ModuleGate({ module, feature, fallback = null, children }) {
  const { isModuleEnabled, isFeatureEnabled } = useFestivalConfig();
  const targetModule = module || feature;

  const enabled = isModuleEnabled ? isModuleEnabled(targetModule) : isFeatureEnabled(targetModule);

  return enabled ? children : fallback;
}
