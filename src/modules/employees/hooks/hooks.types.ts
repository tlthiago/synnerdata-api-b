export type EmployeeEvents = {
  "employee.created": {
    employeeId: string;
    organizationId: string;
    hireDate: string;
  };
  "employee.hireDateUpdated": {
    employeeId: string;
    organizationId: string;
    oldHireDate: string;
    newHireDate: string;
  };
};

export type EmployeeEventName = keyof EmployeeEvents;
export type EmployeeEventPayload<T extends EmployeeEventName> =
  EmployeeEvents[T];
