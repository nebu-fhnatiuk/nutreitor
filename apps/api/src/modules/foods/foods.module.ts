import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { FoodsController } from "./foods.controller.js";
import { FoodsService } from "./foods.service.js";

/** Base de alimentos (catálogo global + alimentos propios del consultorio). */
@Module({
  imports: [AuthModule],
  controllers: [FoodsController],
  providers: [FoodsService],
})
export class FoodsModule {}
