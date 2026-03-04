import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  addPpeItemResponseSchema,
  addPpeItemSchema,
  createPpeDeliveryResponseSchema,
  createPpeDeliverySchema,
  deletePpeDeliveryResponseSchema,
  getPpeDeliveryResponseSchema,
  idParamSchema,
  listPpeDeliveriesQuerySchema,
  listPpeDeliveriesResponseSchema,
  listPpeItemsResponseSchema,
  ppeItemIdParamsSchema,
  removePpeItemResponseSchema,
  updatePpeDeliveryResponseSchema,
  updatePpeDeliverySchema,
} from "./ppe-delivery.model";
import { PpeDeliveryService } from "./ppe-delivery.service";

export const ppeDeliveryController = new Elysia({
  name: "ppe-deliveries",
  prefix: "/v1/ppe-deliveries",
  detail: { tags: ["Occurrences - PPE Deliveries"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ session, body, user }) =>
      wrapSuccess(
        await PpeDeliveryService.create({
          ...body,
          organizationId: session.activeOrganizationId as string,
          userId: user.id,
        })
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["create"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      body: createPpeDeliverySchema,
      response: {
        200: createPpeDeliveryResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create PPE delivery",
        description:
          "Creates a new PPE delivery record for an employee in the active organization",
      },
    }
  )
  .get(
    "/",
    async ({ session, query }) =>
      wrapSuccess(
        await PpeDeliveryService.findAll(
          session.activeOrganizationId as string,
          query.employeeId
        )
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["read"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      query: listPpeDeliveriesQuerySchema,
      response: {
        200: listPpeDeliveriesResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List PPE deliveries",
        description:
          "Lists all PPE deliveries for the active organization, optionally filtered by employee",
      },
    }
  )
  .get(
    "/:id",
    async ({ session, params }) =>
      wrapSuccess(
        await PpeDeliveryService.findByIdOrThrow(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["read"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      params: idParamSchema,
      response: {
        200: getPpeDeliveryResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get PPE delivery",
        description: "Gets a specific PPE delivery by ID",
      },
    }
  )
  .put(
    "/:id",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await PpeDeliveryService.update(
          params.id,
          session.activeOrganizationId as string,
          {
            ...body,
            userId: user.id,
          }
        )
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["update"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      params: idParamSchema,
      body: updatePpeDeliverySchema,
      response: {
        200: updatePpeDeliveryResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update PPE delivery",
        description: "Updates a specific PPE delivery by ID",
      },
    }
  )
  .delete(
    "/:id",
    async ({ session, params, user }) =>
      wrapSuccess(
        await PpeDeliveryService.delete(
          params.id,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["delete"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      params: idParamSchema,
      response: {
        200: deletePpeDeliveryResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete PPE delivery",
        description: "Soft deletes a specific PPE delivery by ID",
      },
    }
  )
  // M2M PPE Item endpoints
  .post(
    "/:id/items",
    async ({ session, params, body, user }) =>
      wrapSuccess(
        await PpeDeliveryService.addPpeItem(
          params.id,
          body.ppeItemId,
          session.activeOrganizationId as string,
          user.id
        )
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["update"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      params: idParamSchema,
      body: addPpeItemSchema,
      response: {
        200: addPpeItemResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: validationErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Add PPE item to delivery",
        description: "Associates a PPE item with a delivery",
      },
    }
  )
  .get(
    "/:id/items",
    async ({ session, params }) =>
      wrapSuccess(
        await PpeDeliveryService.getItemsForDelivery(
          params.id,
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { ppeDelivery: ["read"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      params: idParamSchema,
      response: {
        200: listPpeItemsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List PPE items for delivery",
        description: "Lists all PPE items associated with a delivery",
      },
    }
  )
  .delete(
    "/:id/items/:ppeItemId",
    async ({ session, params, user }) => {
      await PpeDeliveryService.removePpeItem(
        params.id,
        params.ppeItemId,
        session.activeOrganizationId as string,
        user.id
      );
      return wrapSuccess({ success: true });
    },
    {
      auth: {
        permissions: { ppeDelivery: ["update"] },
        requireOrganization: true,
        requireFeature: "ppe",
      },
      params: ppeItemIdParamsSchema,
      response: {
        200: removePpeItemResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Remove PPE item from delivery",
        description: "Removes a PPE item association from a delivery",
      },
    }
  );
