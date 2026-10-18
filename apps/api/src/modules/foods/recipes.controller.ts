import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { tenantRecipeSchema, type RecipeDto, type TenantRecipeDto } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { RecipesService } from "./recipes.service.js";

/** Recetas (ADR 0019): biblioteca global + recetas del consultorio. */
@Controller("recipes")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @RequireCapability("food:read")
  list(): Promise<RecipeDto[]> {
    return this.recipes.list();
  }

  @Get("library/:id")
  @RequireCapability("food:read")
  getLibrary(@Param("id", new ParseUUIDPipe()) id: string): Promise<RecipeDto> {
    return this.recipes.get("library", id);
  }

  @Get("tenant/:id")
  @RequireCapability("food:read")
  getOwn(@Param("id", new ParseUUIDPipe()) id: string): Promise<RecipeDto> {
    return this.recipes.get("recipe", id);
  }

  @Post()
  @RequireCapability("food:manage")
  create(@Body(new ZodValidationPipe(tenantRecipeSchema)) dto: TenantRecipeDto): Promise<RecipeDto> {
    return this.recipes.create(dto);
  }

  @Put("tenant/:id")
  @RequireCapability("food:manage")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(tenantRecipeSchema)) dto: TenantRecipeDto,
  ): Promise<RecipeDto> {
    return this.recipes.update(id, dto);
  }

  @Post("tenant/:id/archive")
  @RequireCapability("food:manage")
  async archive(@Param("id", new ParseUUIDPipe()) id: string): Promise<{ ok: true }> {
    await this.recipes.archive(id);
    return { ok: true };
  }

  /** Copia una receta de la biblioteca a las del consultorio. */
  @Post("library/:id/copy")
  @RequireCapability("food:manage")
  copy(@Param("id", new ParseUUIDPipe()) id: string): Promise<RecipeDto> {
    return this.recipes.copyFromLibrary(id);
  }
}
