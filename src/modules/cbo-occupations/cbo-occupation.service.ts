import { count, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { cboOccupations } from "@/db/schema/cbo-occupations";
import type { CboOccupationListData } from "./cbo-occupation.model";
import { CboOccupationNotFoundError } from "./errors";

const columns = {
  id: cboOccupations.id,
  code: cboOccupations.code,
  title: cboOccupations.title,
  familyCode: cboOccupations.familyCode,
  familyTitle: cboOccupations.familyTitle,
};

export abstract class CboOccupationService {
  static async search(
    search: string,
    page: number,
    limit: number
  ): Promise<CboOccupationListData> {
    const escapedSearch = search.replace(/[%_\\]/g, "\\$&");
    const searchPattern = `%${escapedSearch}%`;
    const whereCondition = or(
      ilike(cboOccupations.code, searchPattern),
      ilike(cboOccupations.title, searchPattern)
    );

    const offset = (page - 1) * limit;

    const [totalResult, items] = await Promise.all([
      db.select({ count: count() }).from(cboOccupations).where(whereCondition),
      db
        .select(columns)
        .from(cboOccupations)
        .where(whereCondition)
        .orderBy(cboOccupations.code)
        .limit(limit)
        .offset(offset),
    ]);

    return {
      items,
      total: totalResult[0]?.count ?? 0,
      page,
      limit,
    };
  }

  static async findByIdOrThrow(id: string) {
    const [cboOccupation] = await db
      .select(columns)
      .from(cboOccupations)
      .where(eq(cboOccupations.id, id))
      .limit(1);

    if (!cboOccupation) {
      throw new CboOccupationNotFoundError(id);
    }

    return cboOccupation;
  }
}
