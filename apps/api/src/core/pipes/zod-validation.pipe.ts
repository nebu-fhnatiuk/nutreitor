import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, z } from "zod";

/**
 * Pipe que valida el payload contra un schema de Zod. Compartimos los schemas
 * con el front vía @nutreitor/shared, así el contrato es único.
 */
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Payload inválido",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
