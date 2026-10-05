import assert from "node:assert/strict";
import { test } from "node:test";
import { scopesFor, type AuthenticatedActor, type RoleGrant } from "../../../src/core/security/actor.js";
import { capabilitiesFor, CAPABILITIES } from "../../../src/core/security/capabilities.js";
import { employeeScopeWhere, isOrgWide, scopeOf } from "../../../src/core/security/scope.js";
import {
  assertAccessChangeAllowed,
  grantableRoles,
  type AccessChange,
} from "../../../src/modules/identity/access.rules.js";

function actor(employeeId: string, grants: RoleGrant[], mfaVerified = true): AuthenticatedActor {
  const roles = grants.map((grant) => grant.role);
  return { employeeId, roles, capabilities: capabilitiesFor(roles), scopes: scopesFor(grants), grants, mfaVerified };
}

const ENG = "dep_engineering";
const DESIGN = "dep_design";
const superAdmin = actor("emp_0001", [
  { role: "employee", departmentIds: [] },
  { role: "super_admin", departmentIds: [] },
]);
const orgHr = actor("emp_0005", [
  { role: "employee", departmentIds: [] },
  { role: "manager", departmentIds: [] },
  { role: "hr_operator", departmentIds: [] },
]);
const engHr = actor("emp_0013", [
  { role: "employee", departmentIds: [] },
  { role: "manager", departmentIds: [] },
  { role: "hr_operator", departmentIds: [ENG] },
]);
const employee = actor("emp_0007", [{ role: "employee", departmentIds: [] }]);

const change = (overrides: Partial<AccessChange>): AccessChange => ({
  op: "grant",
  role: "hr_operator",
  departmentIds: [],
  target: { employeeId: "emp_0014", departmentId: ENG },
  mfaEnforced: true,
  ...overrides,
});

test("super admin holds every capability organization-wide", () => {
  assert.deepEqual(new Set(superAdmin.capabilities), new Set(CAPABILITIES));
  for (const capability of CAPABILITIES) assert.equal(scopeOf(superAdmin, capability), "all");
});

test("a department-scoped HR grant limits HR capabilities to that department", () => {
  assert.deepEqual(scopeOf(engHr, "employee.read"), [ENG]);
  assert.deepEqual(employeeScopeWhere(engHr, "employee.read"), { departmentId: { in: [ENG] } });
  assert.equal(isOrgWide(engHr, "employee.update"), false);
});

test("the manager role never widens a scoped HR grant", () => {
  // approval.decide comes from both manager (team) and hr_operator (Engineering): reach stays Engineering only.
  assert.deepEqual(scopeOf(engHr, "approval.decide"), [ENG]);
  assert.deepEqual(scopeOf(engHr, "roster.manage"), [ENG]);
});

test("self-service and team capabilities give no administrative reach", () => {
  assert.deepEqual(scopeOf(employee, "leave.request.self"), []);
  assert.deepEqual(employeeScopeWhere(employee, "employee.read"), { departmentId: { in: [] } });
  const pureManager = actor("emp_0006", [
    { role: "employee", departmentIds: [] },
    { role: "manager", departmentIds: [] },
  ]);
  assert.deepEqual(scopeOf(pureManager, "approval.decide"), []);
});

test("an organization-wide grant wins over a scoped one", () => {
  const both = actor("emp_0020", [
    { role: "hr_operator", departmentIds: [ENG] },
    { role: "super_admin", departmentIds: [] },
  ]);
  assert.equal(scopeOf(both, "employee.read"), "all");
});

test("nobody has access until a role is granted", () => {
  const nobody = actor("emp_0044", []);
  assert.deepEqual(nobody.capabilities, []);
  assert.deepEqual(grantableRoles(nobody), []);
});

test("only a super admin can grant or revoke super admin", () => {
  assert.doesNotThrow(() => assertAccessChangeAllowed(superAdmin, change({ role: "super_admin" })));
  assert.throws(() => assertAccessChangeAllowed(orgHr, change({ role: "super_admin" })), /Only a super admin/);
  assert.throws(
    () => assertAccessChangeAllowed(orgHr, change({ op: "revoke", role: "super_admin" })),
    /Only a super admin/,
  );
});

test("administrators can only hand out roles they hold", () => {
  assert.doesNotThrow(() => assertAccessChangeAllowed(orgHr, change({ role: "manager" })));
  assert.throws(() => assertAccessChangeAllowed(orgHr, change({ role: "payroll_approver" })), /roles you hold/);
});

test("nobody can change their own access", () => {
  assert.throws(
    () => assertAccessChangeAllowed(superAdmin, change({ target: { employeeId: "emp_0001", departmentId: ENG } })),
    /Another administrator/,
  );
});

test("a scoped administrator stays inside their departments", () => {
  assert.doesNotThrow(() => assertAccessChangeAllowed(engHr, change({ departmentIds: [ENG] })));
  assert.throws(() => assertAccessChangeAllowed(engHr, change({ departmentIds: [] })), /choose departments/);
  assert.throws(() => assertAccessChangeAllowed(engHr, change({ departmentIds: [ENG, DESIGN] })), /own departments/);
  assert.throws(
    () => assertAccessChangeAllowed(engHr, change({ target: { employeeId: "emp_0009", departmentId: DESIGN } })),
    /outside the departments/,
  );
});

test("only HR and payroll roles can be limited to departments", () => {
  assert.throws(
    () => assertAccessChangeAllowed(superAdmin, change({ role: "manager", departmentIds: [ENG] })),
    /Only HR and payroll roles/,
  );
});

test("privileged changes need a verified MFA session", () => {
  const unverified = { ...superAdmin, mfaVerified: false };
  assert.throws(() => assertAccessChangeAllowed(unverified, change({})), /authenticator/);
  assert.doesNotThrow(() => assertAccessChangeAllowed(unverified, change({ role: "employee" })));
  assert.doesNotThrow(() => assertAccessChangeAllowed(unverified, change({ mfaEnforced: false })));
});

test("employees without access.manage cannot change anyone's access", () => {
  assert.throws(() => assertAccessChangeAllowed(employee, change({ role: "employee" })), /don't have access/);
});
