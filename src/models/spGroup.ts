import { sharepointPrisma } from "./sharepointPrisma.js";

// ESS CurrentUserService.CanActAsAnotherEmployee: SPGroupUser ⋈ SPUser ⋈ SPGroup.
export async function isSharePointGroupMember(groupName: string, employeeId: string | null, loginName: string | null) {
  const userMatch = [
    ...(employeeId ? [{ employeeId }] : []),
    ...(loginName ? [{ loginName }] : []),
  ];
  if (userMatch.length === 0) {
    return false;
  }

  const count = await sharepointPrisma.sPGroupUser.count({
    where: { group: { name: groupName }, user: { OR: userMatch } },
  });
  return count > 0;
}
