import { z } from "zod";

/** Documento del plan: comidas (con items) + notas generales. */
const mealItemSchema = z.object({
  text: z.string().min(1).max(500),
  note: z.string().max(300).optional(),
});
const planMealSchema = z.object({
  name: z.string().min(1).max(120),
  time: z.string().max(20).optional(),
  items: z.array(mealItemSchema).max(50),
});
export const mealPlanBodySchema = z.object({
  meals: z.array(planMealSchema).max(20),
  generalNotes: z.string().max(4000).optional(),
});
export type MealItem = z.infer<typeof mealItemSchema>;
export type PlanMeal = z.infer<typeof planMealSchema>;
export type MealPlanBody = z.infer<typeof mealPlanBodySchema>;

/** Guardar un plan: crea una NUEVA versión activa (supersede la anterior). */
export const savePlanSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD")
    .nullish(),
  body: mealPlanBodySchema,
});
export type SavePlanDto = z.infer<typeof savePlanSchema>;

export type MealPlanStatus = "active" | "superseded" | "archived";

export interface MealPlanDto {
  id: string;
  version: number;
  status: MealPlanStatus;
  title: string;
  startDate: string | null;
  body: MealPlanBody;
  authorMembershipId: string;
  authorName: string;
  createdAt: string;
}
