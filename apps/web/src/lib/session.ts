export type Role = "admin" | "employee";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  department: string;
  phone: string;
};

export const identity: SessionUser = {
  id: "",
  name: "",
  username: "",
  role: "employee",
  department: "",
  phone: "",
};

export function setIdentity(user: SessionUser | null) {
  if (!user) {
    identity.id = "";
    identity.name = "";
    identity.username = "";
    identity.role = "employee";
    identity.department = "";
    identity.phone = "";
    return;
  }
  Object.assign(identity, user);
}
