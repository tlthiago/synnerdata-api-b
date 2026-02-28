import { AppError } from "@/lib/errors/base-error";

export class AdminOrganizationError extends AppError {
  status = 404 as const;
  code = "ADMIN_ORGANIZATION_ERROR";
}

export class OrganizationNotFoundError extends AdminOrganizationError {
  status = 404 as const;
  code = "ORGANIZATION_NOT_FOUND";

  constructor(organizationId: string) {
    super(`Organization with id '${organizationId}' not found`);
  }
}
