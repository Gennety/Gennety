export const NETWORK_MEMBERS_BASELINE = 231;

export function getDisplayedNetworkMembers(actualMembers: number) {
  return NETWORK_MEMBERS_BASELINE + Math.max(0, actualMembers);
}
