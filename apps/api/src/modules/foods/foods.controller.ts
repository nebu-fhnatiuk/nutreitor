import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  foodSearchSchema,
  foodSources,
  tenantFoodSchema,
  type FoodDto,
  type FoodSearchQuery,
  type FoodSource,
  type TenantFoodDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { FoodsService } from "./foods.service.js";

/** Base de alimentos para el editor del plan (ADR 0018). */
@Controller("foods")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  @RequireCapability("food:read")
  search(@Query(new ZodValidationPipe(foodSearchSchema)) query: FoodSearchQuery): Promise<FoodDto[]> {
    return this.foods.search(query);
  }

  @Get(":source/:id")
  @RequireCapability("food:read")
  get(
    @Param("source") source: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<FoodDto> {
    if (!foodSources.includes(source as FoodSource)) {
      throw new BadRequestException("Origen inválido (catalog | tenant).");
    }
    return this.foods.get(source as FoodSource, id);
  }

  /** Alimento propio del consultorio. El catálogo global no se edita por API. */
  @Post()
  @RequireCapability("food:manage")
  create(@Body(new ZodValidationPipe(tenantFoodSchema)) dto: TenantFoodDto): Promise<FoodDto> {
    return this.foods.create(dto);
  }

  @Put("tenant/:id")
  @RequireCapability("food:manage")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(tenantFoodSchema)) dto: TenantFoodDto,
  ): Promise<FoodDto> {
    return this.foods.update(id, dto);
  }

  @Post("tenant/:id/archive")
  @RequireCapability("food:manage")
  async archive(@Param("id", new ParseUUIDPipe()) id: string): Promise<{ ok: true }> {
    await this.foods.archive(id);
    return { ok: true };
  }
}
