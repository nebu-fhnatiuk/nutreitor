import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { FoodsController } from "./foods.controller.js";
import { FoodsService } from "./foods.service.js";
import { RecipesController } from "./recipes.controller.js";
import { RecipesService } from "./recipes.service.js";

/** Base de alimentos (catálogo global + alimentos propios del consultorio). */
@Module({
  imports: [AuthModule],
  controllers: [FoodsController, RecipesController],
  providers: [FoodsService, RecipesService],
})
export class FoodsModule {}
