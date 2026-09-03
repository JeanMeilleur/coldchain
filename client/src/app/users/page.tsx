"use client";

import { useGetUsersQuery } from "@/state/api";
import Header from "@/app/(components)/Header";
import { DataGrid, GridColDef } from "@mui/x-data-grid";

const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-800",
  MANAGER: "bg-blue-100 text-blue-800",
  STAFF: "bg-gray-100 text-gray-700",
};

const columns: GridColDef[] = [
  { field: "name", headerName: "Name", width: 220 },
  { field: "email", headerName: "Email", width: 280 },
  {
    field: "role", headerName: "Role", width: 130,
    renderCell: (params) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          ROLE_STYLE[params.value as string] ?? ""
        }`}
      >
        {params.value as string}
      </span>
    ),
  },
  {
    field: "isActive", headerName: "Status", width: 110,
    renderCell: (params) => (
      <span className={params.value ? "text-green-700" : "text-gray-400"}>
        {params.value ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const Users = () => {
  const { data: users, isError, isLoading } = useGetUsersQuery();

  if (isLoading) return <div className="py-4">Loading...</div>;
  if (isError || !users)
    return <div className="text-center text-red-500 py-4">Failed to fetch users</div>;

  return (
    <div className="flex flex-col">
      <Header name="Staff" />
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Password hashes are never returned by the API.
      </p>
      <DataGrid
        rows={users}
        columns={columns}
        getRowId={(row) => row.userId}
        density="compact"
        className="bg-white shadow rounded-lg border border-gray-200 !text-gray-700"
      />
    </div>
  );
};

export default Users;
