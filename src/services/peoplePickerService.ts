import { searchPeoplePicker, type PeoplePickerRow } from "../models/peoplePicker.js";
import { toEssDate, toEssGuid } from "../utils/essFormat.js";
import type { PagedResult } from "../utils/essResponse.js";

// Port of ESS EmployeeDetailService.GetListAsync: the proc returns every match and paging
// happens in memory.

export type EmployeeDetailListItemDto = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  unitSection: string;
  position: string;
  positionCode: string;
  joinedDate: string | null;
  duty: string;
  manager: string;
};

function toDbString(value: string | undefined | null) {
  return value && value.trim() ? value.trim() : null;
}

function toListItem(row: PeoplePickerRow): EmployeeDetailListItemDto {
  return {
    employeeId: toEssGuid(row.EmployeeID)!,
    employeeNo: row.EmployeeCode ?? "",
    employeeName: row.EmployeeName ?? "",
    department: row.AreaName ?? "",
    unitSection: row.SubAreaName ?? "",
    position: row.PositionName ?? "",
    positionCode: row.PositionCode ?? "",
    joinedDate: toEssDate(row.JoinDate),
    duty: row.JobKeyName ?? "",
    manager: row.ManagerName ?? "",
  };
}

export async function getList(params: {
  empCode?: string;
  empName?: string;
  searchType?: string | null;
  currEmpId?: string | null;
  page: number;
  pageSize: number;
}): Promise<PagedResult<EmployeeDetailListItemDto>> {
  const rows = await searchPeoplePicker({
    employeeCode: toDbString(params.empCode),
    employeeName: toDbString(params.empName),
    searchType: toDbString(params.searchType),
    currEmployeeId: toDbString(params.currEmpId),
  });

  const start = (params.page - 1) * params.pageSize;
  return {
    items: rows.slice(start, start + params.pageSize).map(toListItem),
    page: params.page,
    pageSize: params.pageSize,
    totalCount: rows.length,
  };
}
